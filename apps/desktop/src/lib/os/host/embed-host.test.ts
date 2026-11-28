import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { parseReaderState } from '@mhk/site-core/fusion/reading-model';
import { FUSION_TIMING } from '@mhk/site-core/fusion/fusion-session';
const fixture = vi.hoisted(() => ({
  read: vi.fn(),
  merge: vi.fn(),
  subscribe: vi.fn(),
  stop: vi.fn(),
}));
vi.mock('@mhk/site-core/fusion/browser-reading', () => ({
  readSharedReaderState: fixture.read,
  mergeSharedReaderState: fixture.merge,
  subscribeSharedReaderState: fixture.subscribe,
}));
import { mountEmbedHost, requestClassic } from './embed-host';

describe('authenticated fusion host', () => {
  let view: EventTarget & {
    parent: { postMessage: ReturnType<typeof vi.fn> };
    location: { href: string };
    dispatchEvent(event: Event): boolean;
  };
  let root: { dataset: Record<string, string> };
  let frames: ReturnType<typeof htmlWindow>[];
  let sharedListener: (() => void) | undefined;
  const envelope = { ns: 'mhk-fusion', version: 1, session: 'session-1234', request: 1 };
  const reading = (focus: boolean) => {
    const state = parseReaderState(null);
    state.preferences.focus = focus;
    return state;
  };
  const readingProgress = (progress: number) => {
    const state = parseReaderState(null);
    state.documents.book = { progress, anchor: '', lastOpened: 1, bookmarks: [], notes: [] };
    return state;
  };
  const lastOfType = (type: string) =>
    view.parent.postMessage.mock.calls
      .map(
        ([message]) =>
          message as {
            type?: string;
            request?: number;
            acknowledged?: number;
            session?: string;
          },
      )
      .filter((message) => message.type === type)
      .at(-1);
  const shell = (phase = 'desktop') => ({
    setAudioMuted: vi.fn(),
    setPresentationSuspended: vi.fn(),
    navigateFusionDestination: vi.fn(() => true),
    getFusionDestination: vi.fn(() => ({ kind: 'article' as const, id: 'test-book' })),
    phase,
  });
  /** A same-origin window whose document has finished loading its article client. */
  function htmlWindow(src: string, readyState = 'complete') {
    return {
      src,
      contentDocument: {
        URL: src,
        readyState,
        querySelector: () => null,
      },
    };
  }
  /** Readiness is polled so the parent never reveals a half-loaded desktop. */
  const settle = () => vi.advanceTimersByTime(FUSION_TIMING.readinessPollMs);
  function send(data: unknown, origin = 'https://www.example.com', source: unknown = view.parent) {
    const event = new Event('message');
    Object.assign(event, { data, origin, source });
    view.dispatchEvent(event);
  }
  beforeEach(() => {
    vi.useFakeTimers();
    root = { dataset: {} };
    frames = [htmlWindow('https://mhk10.example.com/blog/test-book/')];
    view = Object.assign(new EventTarget(), {
      parent: { postMessage: vi.fn() },
      location: { href: 'https://mhk10.example.com/' },
      setTimeout,
      clearTimeout,
    });
    vi.stubGlobal('window', view);
    vi.stubGlobal('document', {
      documentElement: root,
      querySelectorAll: () => frames,
    });
    fixture.read.mockReset().mockReturnValue(parseReaderState(null));
    fixture.merge.mockReset().mockReturnValue({ status: 'merged', persisted: true });
    fixture.subscribe.mockReset().mockImplementation((listener: () => void) => {
      sharedListener = listener;
      return fixture.stop;
    });
    fixture.stop.mockReset();
    sharedListener = undefined;
    view.parent.postMessage.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it('requires exact origin, iframe parent identity and handshake before accepting commands', () => {
    const desktop = shell();
    const dispose = mountEmbedHost(desktop);
    send({ ...envelope, type: 'resume' });
    send({ ...envelope, type: 'hello' }, 'https://evil.example');
    send({ ...envelope, type: 'hello' }, undefined, {});
    expect(view.parent.postMessage).not.toHaveBeenCalled();
    send({ ...envelope, type: 'hello' });
    expect(root.dataset.embedFull).toBe('');
    settle();
    expect(view.parent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ready', session: envelope.session }),
      'https://www.example.com',
    );
    send({ ...envelope, request: 2, type: 'resume' });
    expect(desktop.setAudioMuted).toHaveBeenLastCalledWith(false);
    send({ ...envelope, request: 2, type: 'suspend' });
    send({ ...envelope, request: 3, session: 'other-session', type: 'suspend' });
    expect(desktop.setAudioMuted).toHaveBeenLastCalledWith(false);
    dispose();
    dispose();
    expect(fixture.stop).toHaveBeenCalledOnce();
    send({ ...envelope, request: 4, type: 'resume' });
    expect(root.dataset.embedFull).toBeUndefined();
  });
  it('announces the desktop startup before content readiness while booting', () => {
    const desktop = shell('boot');
    const dispose = mountEmbedHost(desktop);
    send({ ...envelope, type: 'hello' });
    expect(lastOfType('startup')).toBeDefined();
    expect(lastOfType('ready')).toBeUndefined();
    settle();
    expect(lastOfType('ready')).toBeUndefined();
    dispose();
  });

  it('does not announce startup for an already warmed desktop', () => {
    const desktop = shell();
    const dispose = mountEmbedHost(desktop);
    send({ ...envelope, type: 'hello' });
    expect(lastOfType('startup')).toBeUndefined();
    settle();
    expect(lastOfType('ready')).toBeDefined();
    dispose();
  });

  it('returns the active content identity and releases all listeners on disposal', () => {
    const desktop = shell();
    const dispose = mountEmbedHost(desktop);
    send({ ...envelope, type: 'hello' });
    settle();
    requestClassic();
    expect(view.parent.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'request-classic',
        destination: { kind: 'article', id: 'test-book' },
      }),
      'https://www.example.com',
    );
    dispose();
    view.parent.postMessage.mockClear();
    view.dispatchEvent(new Event('mhk-fusion:location'));
    expect(view.parent.postMessage).not.toHaveBeenCalled();
  });
  it('reports a storage conflict without sending a rollback snapshot or overwriting data', () => {
    const dispose = mountEmbedHost(shell());
    send({ ...envelope, type: 'hello' });
    fixture.merge.mockReturnValue({ status: 'failed', error: 'Conflict' });
    send({
      ...envelope,
      request: 2,
      type: 'reading',
      baseline: parseReaderState(null),
      state: parseReaderState(null),
    });
    expect(view.parent.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'sync-error', acknowledged: 2, error: 'Conflict' }),
      'https://www.example.com',
    );
    expect(
      view.parent.postMessage.mock.calls.some(([message]) => message.type === 'reading-ack'),
    ).toBe(false);
    dispose();
  });
  it('keeps the handshake usable when local notebook storage is denied', () => {
    fixture.read.mockImplementation(() => {
      throw new Error('denied');
    });
    const dispose = mountEmbedHost(shell());
    send({ ...envelope, type: 'hello' });
    settle();
    expect(view.parent.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'ready' }),
      'https://www.example.com',
    );
    dispose();
  });
  it('wakes a desktop parked mid-startup when the parent retries the handshake', () => {
    const desktop = shell('boot');
    const dispose = mountEmbedHost(desktop);
    send({ ...envelope, type: 'hello' });
    expect(desktop.setPresentationSuspended).toHaveBeenLastCalledWith(false);
    send({ ...envelope, request: 2, type: 'suspend' });
    expect(desktop.setPresentationSuspended).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(FUSION_TIMING.readinessTimeoutMs + 1);
    send({ ...envelope, request: 3, type: 'hello' });
    expect(desktop.setPresentationSuspended).toHaveBeenLastCalledWith(false);
    expect(desktop.setAudioMuted).toHaveBeenLastCalledWith(true);
    desktop.phase = 'desktop';
    settle();
    expect(lastOfType('ready')).toMatchObject({ acknowledged: 3 });
    expect(lastOfType('failed')).toBeUndefined();
    dispose();
  });
  it('reports a failed handshake when the desktop shell never started', () => {
    const dispose = mountEmbedHost(undefined);
    send({ ...envelope, type: 'hello' });
    settle();
    expect(view.parent.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'failed', acknowledged: envelope.request }),
      'https://www.example.com',
    );
    dispose();
  });
  it('cancels a pending readiness poll when the parent suspends', () => {
    const desktop = shell();
    const dispose = mountEmbedHost(desktop);
    send({ ...envelope, type: 'hello' });
    settle();
    expect(lastOfType('ready')).toBeDefined();
    frames = [htmlWindow('https://mhk10.example.com/blog/test-book/', 'loading')];
    send({
      ...envelope,
      request: 2,
      type: 'navigate',
      destination: { kind: 'article', id: 'test-book' },
    });
    settle();
    expect(lastOfType('ready')?.acknowledged).not.toBe(2);
    send({ ...envelope, request: 3, type: 'suspend' });
    expect(lastOfType('suspended')).toMatchObject({ acknowledged: 3 });
    view.parent.postMessage.mockClear();
    frames[0].contentDocument.readyState = 'complete';
    settle();
    settle();
    expect(lastOfType('ready')).toBeUndefined();
    dispose();
  });
  it('releases a rejected reading snapshot so the next local change syncs again', () => {
    fixture.read.mockReturnValue(reading(false));
    const dispose = mountEmbedHost(shell());
    send({ ...envelope, type: 'hello' });
    fixture.read.mockReturnValue(reading(true));
    sharedListener?.();
    const first = lastOfType('reading');
    expect(first).toBeDefined();
    // Coalesced while the first snapshot awaits its acknowledgement.
    fixture.read.mockReturnValue(reading(false));
    sharedListener?.();
    expect(
      view.parent.postMessage.mock.calls.filter(([message]) => message.type === 'reading'),
    ).toHaveLength(1);
    send({ ...envelope, request: 2, type: 'sync-error', acknowledged: first?.request, error: 'x' });
    fixture.read.mockReturnValue(reading(true));
    sharedListener?.();
    expect(
      view.parent.postMessage.mock.calls.filter(([message]) => message.type === 'reading'),
    ).toHaveLength(2);
    dispose();
  });
  it('clears outgoing when an acknowledgement merge fails', () => {
    fixture.read.mockReturnValue(reading(false));
    const dispose = mountEmbedHost(shell());
    send({ ...envelope, type: 'hello' });
    fixture.read.mockReturnValue(reading(true));
    sharedListener?.();
    const first = lastOfType('reading');
    fixture.merge.mockReturnValue({ status: 'failed', error: 'changed elsewhere' });
    send({
      ...envelope,
      request: 2,
      type: 'reading-ack',
      acknowledged: first?.request,
      state: reading(false),
    });
    fixture.read.mockReturnValue(reading(true));
    sharedListener?.();
    expect(
      view.parent.postMessage.mock.calls.filter(([message]) => message.type === 'reading'),
    ).toHaveLength(2);
    dispose();
  });
  it('reports failed readiness at the shared deadline while the shell is still booting', () => {
    const desktop = shell('boot');
    const dispose = mountEmbedHost(desktop);
    send({ ...envelope, type: 'hello' });
    vi.advanceTimersByTime(FUSION_TIMING.readinessTimeoutMs - FUSION_TIMING.readinessPollMs);
    expect(lastOfType('failed')).toBeUndefined();
    vi.advanceTimersByTime(FUSION_TIMING.readinessPollMs);
    expect(lastOfType('failed')).toMatchObject({ acknowledged: envelope.request });
    dispose();
  });
  it('starts parked until an authenticated parent wakes the loaded document', () => {
    const desktop = shell('boot');
    const dispose = mountEmbedHost(desktop);
    expect(desktop.setAudioMuted).toHaveBeenLastCalledWith(true);
    expect(desktop.setPresentationSuspended).toHaveBeenLastCalledWith(true);
    send({ ...envelope, type: 'hello' }, 'https://foreign.example');
    expect(desktop.setPresentationSuspended).toHaveBeenLastCalledWith(true);
    send({ ...envelope, type: 'hello' });
    expect(desktop.setPresentationSuspended).toHaveBeenLastCalledWith(false);
    dispose();
  });
  it('polls readiness at the shared interval', () => {
    const desktop = shell();
    const dispose = mountEmbedHost(desktop);
    send({ ...envelope, type: 'hello' });
    vi.advanceTimersByTime(FUSION_TIMING.readinessPollMs - 1);
    expect(lastOfType('ready')).toBeUndefined();
    vi.advanceTimersByTime(1);
    expect(lastOfType('ready')).toBeDefined();
    dispose();
  });
  it('accepts an interactive document while nonessential resources are still loading', () => {
    frames[0].contentDocument.readyState = 'interactive';
    const dispose = mountEmbedHost(shell());
    send({ ...envelope, type: 'hello' });
    settle();
    expect(lastOfType('ready')).toBeDefined();
    dispose();
  });
  it('does not extend the readiness deadline on repeated hello retries', () => {
    const desktop = shell('boot');
    const dispose = mountEmbedHost(desktop);
    const retries = Math.ceil(FUSION_TIMING.readinessTimeoutMs / FUSION_TIMING.helloIntervalMs);
    for (let request = 1; request <= retries; request += 1) {
      send({ ...envelope, request, type: 'hello' });
      vi.advanceTimersByTime(FUSION_TIMING.helloIntervalMs);
    }
    expect(lastOfType('failed')).toMatchObject({ acknowledged: retries });
    dispose();
  });
  it('adopts a replacement parent session and resets audio and notebook synchronization', () => {
    fixture.read.mockReturnValue(readingProgress(0.1));
    const desktop = shell();
    const dispose = mountEmbedHost(desktop);
    send({ ...envelope, type: 'hello' });
    fixture.read.mockReturnValue(readingProgress(0.5));
    sharedListener?.();
    expect(lastOfType('reading')).toBeDefined();

    send({ ...envelope, session: 'session-5678', request: 1, type: 'hello' });
    expect(desktop.setAudioMuted).toHaveBeenLastCalledWith(true);

    // The new session released the unacknowledged snapshot, so this edit syncs
    // and restarts the outgoing sequence at one.
    fixture.read.mockReturnValue(readingProgress(0.7));
    sharedListener?.();
    const readings = view.parent.postMessage.mock.calls
      .map(
        ([message]) =>
          message as {
            type?: string;
            request?: number;
            session?: string;
          },
      )
      .filter((message) => message.type === 'reading');
    expect(readings).toHaveLength(2);
    expect(readings[1]).toMatchObject({ session: 'session-5678', request: 1 });

    settle();
    expect(lastOfType('ready')).toMatchObject({
      session: 'session-5678',
      request: 2,
      acknowledged: 1,
    });
    dispose();
  });
});
