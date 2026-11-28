import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { ReaderSession } from './reader-session';
import {
  createBrowserReaderStorage,
  readSharedReaderState,
  mergeSharedReaderState,
  subscribeSharedReaderState,
} from '@mhk/site-core/fusion/browser-reading';
import { createReaderStorage, READER_STORAGE_KEY } from '@mhk/site-core/fusion/reading-storage';
import { ReaderModel } from '@mhk/site-core/fusion/reading-model';

function harness(initial: string | null = null) {
  let raw = initial;
  let denied = false;
  const storage = {
    getItem: () => raw,
    setItem: (_key: string, value: string) => {
      if (denied) throw new Error('Quota exceeded');
      raw = value;
    },
  };
  const create = () =>
    new ReaderSession({
      storage: createReaderStorage(storage),
      now: () => 10,
      schedule: () => () => {},
    });
  return {
    create,
    storage,
    raw: () => raw,
    deny: (value: boolean) => {
      denied = value;
    },
  };
}
describe('Reader durable storage Interface', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('saves two simultaneously opened articles without replacing the other notebook', () => {
    const host = harness(),
      first = host.create(),
      second = host.create();
    first.open({ id: 'one', title: 'One' });
    second.open({ id: 'two', title: 'Two' });
    first.command({ type: 'annotate', id: 'first', quote: 'one', text: 'First', anchor: '' });
    second.command({ type: 'annotate', id: 'second', quote: 'two', text: 'Second', anchor: '' });
    expect(first.flush().status).toBe('saved');
    expect(second.flush().status).toBe('saved');
    const saved = JSON.parse(host.raw()!);
    expect(saved.documents.one.notes[0].text).toBe('First');
    expect(saved.documents.two.notes[0].text).toBe('Second');
    first.dispose();
    second.dispose();
  });
  it('keeps conflicting edits exportable and leaves the durable edit intact', () => {
    const model = new ReaderModel();
    model.open('book', 1, 'Book');
    model.annotate('note', '', 'Original');
    const host = harness(JSON.stringify(model.serialize())),
      first = host.create(),
      second = host.create();
    first.open({ id: 'book', title: 'Book' });
    second.open({ id: 'book', title: 'Book' });
    first.command({ type: 'edit-note', id: 'note', text: 'First' });
    second.command({ type: 'edit-note', id: 'note', text: 'Second' });
    expect(first.flush().status).toBe('saved');
    expect(second.flush()).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('changed elsewhere'),
    });
    expect(second.snapshot()).toMatchObject({
      pendingSave: true,
      document: { notes: [{ text: 'Second' }] },
    });
    expect(second.snapshot('notebook').notebook.documents.book.notes[0].text).toBe('Second');
    expect(JSON.parse(host.raw()!).documents.book.notes[0].text).toBe('First');
    first.dispose();
    second.dispose();
  });
  it.each(['{broken', '{"version":2,"documents":{}}'])(
    'preserves damaged or future stored data: %s',
    (raw) => {
      const host = harness(raw),
        session = host.create();
      session.open({ id: 'book', title: 'Book' });
      session.command({ type: 'annotate', id: 'mine', quote: '', text: 'Keep me', anchor: '' });
      expect(session.flush().status).toBe('failed');
      expect(host.raw()).toBe(raw);
      expect(session.recovery()).toBe(raw);
      expect(session.snapshot()).toMatchObject({ pendingSave: true, recoveryAvailable: true });
      expect(session.snapshot('notebook').notebook.documents.book.notes[0].text).toBe('Keep me');
      session.dispose();
    },
  );
  it('can retry a failed write without accepting the failed snapshot as durable baseline', () => {
    const host = harness(),
      session = host.create();
    session.open({ id: 'book', title: 'Book' });
    host.deny(true);
    session.command({ type: 'configure', preferences: { width: 'narrow' } });
    expect(session.flush()).toMatchObject({ status: 'failed', error: 'Quota exceeded' });
    host.deny(false);
    expect(session.flush().status).toBe('saved');
    expect(JSON.parse(host.raw()!).preferences.width).toBe('narrow');
    expect(session.snapshot()).toMatchObject({ pendingSave: false, saveError: '' });
    session.dispose();
  });
  it('synchronizes mounted sessions before commands and disposes subscriptions', () => {
    const host = harness();
    const events = new EventTarget();
    vi.stubGlobal('window', Object.assign(events, { localStorage: host.storage }));
    const create = () =>
      new ReaderSession({
        storage: createBrowserReaderStorage(),
        now: () => 20,
        schedule: () => () => {},
      });
    const first = create(),
      second = create();
    first.open({ id: 'book', title: 'Book' });
    second.open({ id: 'book', title: 'Book' });
    first.command({ type: 'annotate', id: 'note', quote: '', text: 'Added elsewhere', anchor: '' });
    first.flush();
    expect(second.snapshot().document?.notes[0].text).toBe('Added elsewhere');
    second.command({ type: 'remove-note', id: 'note' });
    second.flush();
    expect(first.snapshot().document?.notes).toEqual([]);
    first.dispose();
    second.command({ type: 'annotate', id: 'new', quote: '', text: 'After disposal', anchor: '' });
    second.flush();
    expect(first.snapshot().document?.notes).toEqual([]);
    second.dispose();
  });
  it('merges transferred changes using their baseline, including annotation deletion', () => {
    const model = new ReaderModel();
    model.open('book', 1, 'Book');
    model.annotate('note', '', 'Original');
    const baseline = model.serialize();
    const host = harness(JSON.stringify(baseline)),
      events = new EventTarget();
    vi.stubGlobal('window', Object.assign(events, { localStorage: host.storage }));
    let notifications = 0;
    const release = subscribeSharedReaderState(() => {
      notifications++;
    });
    const incoming = structuredClone(baseline);
    incoming.documents.book.notes = [];
    const remote = structuredClone(baseline);
    remote.preferences.focus = true;
    host.storage.setItem(READER_STORAGE_KEY, JSON.stringify(remote));
    expect(mergeSharedReaderState(baseline, incoming)).toEqual({
      status: 'merged',
      persisted: true,
    });
    expect(readSharedReaderState()).toMatchObject({
      preferences: { focus: true },
      documents: { book: { notes: [] } },
    });
    expect(notifications).toBe(1);
    expect(mergeSharedReaderState(baseline, { ...incoming, version: 2 }).status).toBe('failed');
    release();
    mergeSharedReaderState(incoming, incoming);
    expect(notifications).toBe(1);
  });
  it('keeps Reader usable when the browser refuses access to storage', () => {
    const events = new EventTarget();
    Object.defineProperty(events, 'localStorage', {
      get: () => {
        throw new Error('Storage denied');
      },
    });
    vi.stubGlobal('window', events);
    const session = new ReaderSession({
      storage: createBrowserReaderStorage(),
      now: () => 20,
      schedule: () => () => {},
    });
    expect(() => session.open({ id: 'book', title: 'Book' })).not.toThrow();
    session.command({ type: 'annotate', id: 'note', quote: '', text: 'Session copy', anchor: '' });
    expect(session.flush()).toMatchObject({ status: 'failed', error: 'Storage denied' });
    expect(session.snapshot('notebook').notebook.documents.book.notes[0].text).toBe('Session copy');
    session.dispose();
  });
});
