import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { ReaderModel } from './reading-model';
import {
  changeSharedReading,
  createBrowserReaderStorage,
  mergeSharedReading,
  readSharedReading,
  readSharedReaderState,
  reconcileSharedReading,
  saveReadingProgress,
  subscribeSharedReading,
  subscribeSharedReadingSelector,
  hasSharedReadingState,
} from './browser-reading';
import { READER_STORAGE_KEY, SHARED_READING_STORAGE_KEY } from './reading-storage';
import { sameAnnotations } from './annotation-model';

function harness() {
  const records = new Map<string, string>();
  let writable = true;
  const getItem = vi.fn((key: string) => records.get(key) ?? null);
  const setItem = vi.fn((key: string, value: string) => {
    if (writable) records.set(key, value);
  });
  const window = Object.assign(new EventTarget(), {
    localStorage: { getItem, setItem },
  });
  vi.stubGlobal('window', window);
  return {
    window,
    records,
    getItem,
    setItem,
    deny: () => {
      writable = false;
    },
  };
}
describe('browser reading adapter', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('reads server rendering defaults without acquiring a browser', () => {
    vi.stubGlobal('window', undefined);
    expect(readSharedReading().documents).toEqual({});
    expect(subscribeSharedReading(() => {})).toBeTypeOf('function');
  });
  it('always rereads same-origin updates and notifies owned subscriptions', () => {
    const host = harness();
    let notifications = 0;
    const release = subscribeSharedReading(() => {
      notifications++;
    });
    changeSharedReading((state) => {
      state.preferences.focus = true;
    });
    expect(notifications).toBe(1);
    const remote = readSharedReading();
    remote.preferences.width = 'narrow';
    host.records.set(SHARED_READING_STORAGE_KEY, JSON.stringify(remote));
    expect(readSharedReading().preferences.width).toBe('narrow');
    release();
    changeSharedReading((state) => {
      state.preferences.focus = false;
    });
    expect(notifications).toBe(1);
    expect(host.records.has(READER_STORAGE_KEY)).toBe(false);
    expect(readSharedReaderState().preferences.focus).toBe(false);
  });
  it('keeps corrupt records and makes failed sync visible to the host', () => {
    const host = harness();
    host.records.set(SHARED_READING_STORAGE_KEY, '{broken');
    const errors: string[] = [];
    host.window.addEventListener('mhk-fusion:sync-error', (event) => {
      errors.push((event as CustomEvent<string>).detail);
    });
    expect(
      changeSharedReading((state) => {
        state.preferences.focus = true;
      }),
    ).toBe(false);
    expect(host.records.get(SHARED_READING_STORAGE_KEY)).toBe('{broken');
    expect(errors).toEqual([expect.stringContaining('damaged')]);
  });
  it('rejects same-note conflicts and reports silently blocked persistence', () => {
    const host = harness();
    const model = new ReaderModel();
    model.open('book', 1);
    model.annotate('note', '', 'Original');
    const baseline = model.serialize();
    host.records.set(SHARED_READING_STORAGE_KEY, JSON.stringify(baseline));
    const incoming = structuredClone(baseline);
    const remote = structuredClone(baseline);
    incoming.documents.book.notes[0].text = 'Incoming';
    remote.documents.book.notes[0].text = 'Remote';
    host.records.set(SHARED_READING_STORAGE_KEY, JSON.stringify(remote));
    expect(mergeSharedReading(baseline, incoming)).toBe(false);
    expect(readSharedReading().documents.book.notes[0].text).toBe('Remote');
    host.deny();
    expect(
      changeSharedReading((state) => {
        state.preferences.focus = true;
      }),
    ).toBe(false);
    expect(readSharedReading().preferences.focus).toBe(false);
  });
  it('uses the shared notebook capacity rules when saving progress', () => {
    harness();
    const model = new ReaderModel();
    for (let index = 0; index < 100; index++) model.open(`book-${index}`, index);
    changeSharedReading((state) => {
      state.documents = model.serialize().documents;
    });
    saveReadingProgress('new-book', 0.7, 'chapter', 'New Book');
    const state = readSharedReading();
    expect(Object.keys(state.documents)).toHaveLength(100);
    expect(state.documents['book-0']).toBeUndefined();
    expect(state.documents['new-book']).toMatchObject({
      progress: 0.7,
      anchor: 'chapter',
      title: 'New Book',
    });
  });
  it('reads current selector slices and only notifies changed preferences or notes', () => {
    const host = harness();
    expect(hasSharedReadingState()).toBe(false);
    const model = new ReaderModel();
    model.open('book', 1);
    model.annotate('note', 'Quote', 'Keep');
    host.records.set(SHARED_READING_STORAGE_KEY, JSON.stringify(model.serialize()));
    expect(hasSharedReadingState()).toBe(true);
    const preferences = vi.fn();
    const notes = vi.fn();
    const stopPreferences = subscribeSharedReadingSelector(
      (state) => state.preferences,
      preferences,
      (left, right) => left.width === right.width && left.focus === right.focus,
    );
    const stopNotes = subscribeSharedReadingSelector(
      (state) => state.documents.book?.notes,
      notes,
      sameAnnotations,
    );
    expect(preferences).not.toHaveBeenCalled();
    expect(notes).not.toHaveBeenCalled();
    saveReadingProgress('book', 0.6, 'chapter');
    expect(preferences).not.toHaveBeenCalled();
    expect(notes).not.toHaveBeenCalled();
    changeSharedReading((state) => {
      state.preferences.width = 'narrow';
    });
    expect(preferences).toHaveBeenCalledTimes(1);
    expect(notes).not.toHaveBeenCalled();
    changeSharedReading((state) => {
      state.documents.book.notes[0].text = 'Edited';
    });
    expect(notes).toHaveBeenCalledTimes(1);
    stopPreferences();
    stopNotes();
    changeSharedReading((state) => {
      state.preferences.focus = true;
      state.documents.book.notes = [];
    });
    expect(preferences).toHaveBeenCalledTimes(1);
    expect(notes).toHaveBeenCalledTimes(1);
  });
  it('adopts a repaired notebook without retaining corrupt selector data', () => {
    const host = harness();
    host.records.set(SHARED_READING_STORAGE_KEY, '{broken');
    const listener = vi.fn();
    const stop = subscribeSharedReadingSelector((state) => state.preferences.focus, listener);
    host.records.set(SHARED_READING_STORAGE_KEY, JSON.stringify(new ReaderModel().serialize()));
    host.window.dispatchEvent(new Event('mhk-fusion:reading-state'));
    expect(listener).toHaveBeenCalledExactlyOnceWith(false);
    stop();
  });
  it('merges peer baselines and skips rewriting an already durable copy', () => {
    const host = harness();
    const model = new ReaderModel();
    model.open('book', 1);
    model.annotate('note', '', 'Original');
    const baseline = model.serialize();
    host.records.set(SHARED_READING_STORAGE_KEY, JSON.stringify(baseline));
    const incoming = structuredClone(baseline);
    incoming.preferences.focus = true;
    const remote = structuredClone(baseline);
    remote.preferences.width = 'narrow';
    host.records.set(SHARED_READING_STORAGE_KEY, JSON.stringify(remote));
    expect(reconcileSharedReading(baseline, incoming)).toEqual({
      status: 'merged',
      persisted: true,
    });
    expect(readSharedReading()).toMatchObject({
      preferences: { focus: true, width: 'narrow' },
    });
    const current = host.records.get(SHARED_READING_STORAGE_KEY);
    expect(reconcileSharedReading(baseline, structuredClone(baseline))).toEqual({
      status: 'merged',
      persisted: true,
    });
    expect(host.records.get(SHARED_READING_STORAGE_KEY)).toBe(current);
  });
  it('treats a no-op change as success without rewriting the record', () => {
    const host = harness();
    expect(
      changeSharedReading((state) => {
        state.preferences.focus = true;
      }),
    ).toBe(true);
    const before = host.records.get(SHARED_READING_STORAGE_KEY);
    expect(changeSharedReading(() => {})).toBe(true);
    expect(host.records.get(SHARED_READING_STORAGE_KEY)).toBe(before);
  });
  it('keeps the desktop and general notebooks on independent keys', () => {
    const host = harness();
    expect(
      changeSharedReading((state) => {
        state.preferences.focus = true;
      }),
    ).toBe(true);
    expect(host.records.has(SHARED_READING_STORAGE_KEY)).toBe(true);
    expect(host.records.has(READER_STORAGE_KEY)).toBe(false);
    expect(readSharedReaderState().preferences.focus).toBe(false);
    const desktop = new ReaderModel();
    desktop.open('desktop-book', 1);
    host.records.set(READER_STORAGE_KEY, JSON.stringify(desktop.serialize()));
    expect(readSharedReaderState().documents['desktop-book']).toBeDefined();
    expect(readSharedReading().documents['desktop-book']).toBeUndefined();
  });
  it('parses the notebook once per event for every selector', () => {
    const host = harness();
    const model = new ReaderModel();
    model.open('book', 1);
    model.annotate('note', 'Quote', 'Keep');
    const state = model.serialize();
    host.records.set(SHARED_READING_STORAGE_KEY, JSON.stringify(state));
    const preferences = vi.fn();
    const notes = vi.fn();
    const stopPreferences = subscribeSharedReadingSelector(
      (reading) => reading.preferences.focus,
      preferences,
    );
    const stopNotes = subscribeSharedReadingSelector(
      (reading) => reading.documents.book?.notes,
      notes,
      sameAnnotations,
    );
    const changed = structuredClone(state);
    changed.preferences.focus = true;
    host.records.set(SHARED_READING_STORAGE_KEY, JSON.stringify(changed));
    host.getItem.mockClear();
    host.window.dispatchEvent(new Event('mhk-fusion:reading-state'));
    expect(host.getItem).toHaveBeenCalledTimes(1);
    expect(preferences).toHaveBeenCalledExactlyOnceWith(true);
    expect(notes).not.toHaveBeenCalled();

    changed.documents.book.notes[0].text = 'Edited';
    host.records.set(SHARED_READING_STORAGE_KEY, JSON.stringify(changed));
    host.getItem.mockClear();
    host.window.dispatchEvent(new Event('mhk-fusion:reading-state'));
    expect(host.getItem).toHaveBeenCalledTimes(1);
    expect(preferences).toHaveBeenCalledTimes(1);
    expect(notes).toHaveBeenCalledTimes(1);

    stopPreferences();
    stopNotes();
    host.getItem.mockClear();
    host.window.dispatchEvent(new Event('mhk-fusion:reading-state'));
    expect(host.getItem).not.toHaveBeenCalled();
  });
  it('isolates a throwing selector from the rest of the fan-out', () => {
    const host = harness();
    const model = new ReaderModel();
    model.open('book', 1);
    model.annotate('note', '', 'Original');
    const initial = model.serialize();
    host.records.set(SHARED_READING_STORAGE_KEY, JSON.stringify(initial));
    const brokenListener = vi.fn(() => {
      throw new Error('listener');
    });
    const healthy = vi.fn();
    const stopBroken = subscribeSharedReadingSelector(
      (state) => state.preferences.focus,
      brokenListener,
      () => {
        throw new Error('equals');
      },
    );
    const stopHealthy = subscribeSharedReadingSelector((state) => state.preferences.focus, healthy);
    const changed = structuredClone(initial);
    changed.preferences.focus = true;
    host.records.set(SHARED_READING_STORAGE_KEY, JSON.stringify(changed));
    host.window.dispatchEvent(new Event('mhk-fusion:reading-state'));
    expect(brokenListener).toHaveBeenCalledExactlyOnceWith(true);
    expect(healthy).toHaveBeenCalledExactlyOnceWith(true);

    // Partial unsubscribe: the healthy selector stops while the broken one stays.
    stopHealthy();
    changed.preferences.focus = false;
    host.records.set(SHARED_READING_STORAGE_KEY, JSON.stringify(changed));
    host.window.dispatchEvent(new Event('mhk-fusion:reading-state'));
    expect(healthy).toHaveBeenCalledTimes(1);
    expect(brokenListener).toHaveBeenCalledTimes(2);
    stopBroken();
  });
  it('keeps a browser session damaged guard after an external repair', () => {
    const host = harness();
    host.records.set(READER_STORAGE_KEY, '{broken');
    const session = createBrowserReaderStorage();
    expect(() => session.read()).toThrow('Export a recovery backup');
    host.records.set(READER_STORAGE_KEY, JSON.stringify(new ReaderModel().serialize()));
    expect(() => session.write(new ReaderModel().serialize())).toThrow(
      'damaged or uses a newer format',
    );
    expect(JSON.parse(host.records.get(READER_STORAGE_KEY)!).documents).toEqual({});
  });
});
