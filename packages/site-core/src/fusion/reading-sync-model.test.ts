import { describe, expect, it, vi } from 'vite-plus/test';
import { parseReaderState, type ReaderState } from './reading-model';
import {
  createFusionReadingSync,
  FUSION_READING_ACK_TIMEOUT_MS,
  type FusionReadingStore,
} from './reading-sync-model';
import type { FusionPayload } from './protocol-model';

function state(progress: number): ReaderState {
  const value = parseReaderState(null);
  value.documents.book = {
    progress,
    anchor: '',
    lastOpened: 1,
    bookmarks: [],
    notes: [],
  };
  return value;
}

function harness(initial: ReaderState) {
  let current = initial;
  let listener: (() => void) | undefined;
  const read = vi.fn<FusionReadingStore['read']>(() => current);
  const merge = vi.fn<FusionReadingStore['merge']>(() => ({ status: 'merged' }));
  const subscribe = vi.fn<FusionReadingStore['subscribe']>((next) => {
    listener = next;
    return () => {
      listener = undefined;
    };
  });
  const store: FusionReadingStore = { read, merge, subscribe };
  const posts: Array<FusionPayload & { request: number }> = [];
  let request = 0;
  const errors: string[] = [];
  const sync = createFusionReadingSync({
    store,
    post: (payload) => {
      const sent = ++request;
      posts.push({ ...payload, request: sent });
      return sent;
    },
    onError: (error) => errors.push(error),
  });
  return {
    store,
    read,
    merge,
    posts,
    errors,
    sync,
    set(next: ReaderState) {
      current = next;
    },
    notify() {
      listener?.();
    },
    get subscribed() {
      return listener !== undefined;
    },
  };
}

function readingPosts(posts: Array<FusionPayload & { request: number }>) {
  return posts.filter((post) => post.type === 'reading');
}

describe('fusion reading sync lane', () => {
  it('publishes the complete notebook against an empty baseline and waits for its ack', () => {
    const host = harness(state(0.2));
    host.sync.start();
    host.sync.connect();
    host.sync.publishAll();
    const [posted] = readingPosts(host.posts);
    expect(posted).toMatchObject({
      type: 'reading',
      baseline: parseReaderState(null),
      state: state(0.2),
    });
    // A local edit while the snapshot is unacknowledged must not race it.
    host.set(state(0.5));
    host.notify();
    expect(readingPosts(host.posts)).toHaveLength(1);
  });

  it('merges incoming notebooks and acknowledges with the persisted result', () => {
    const host = harness(state(0.1));
    host.sync.start();
    host.sync.connect();
    host.merge.mockReturnValue({ status: 'merged' });
    host.set(state(0.4));
    host.sync.receive({
      ns: 'mhk-fusion',
      version: 1,
      session: 'session-1234',
      request: 7,
      type: 'reading',
      baseline: parseReaderState(null),
      state: state(0.4),
    });
    expect(host.merge).toHaveBeenCalledWith(parseReaderState(null), state(0.4));
    expect(host.posts.at(-1)).toMatchObject({
      type: 'reading-ack',
      acknowledged: 7,
      state: state(0.4),
    });
  });

  it('reports a merge failure to the peer without acknowledging it', () => {
    const host = harness(state(0.1));
    host.sync.start();
    host.sync.connect();
    host.merge.mockReturnValue({
      status: 'failed',
      error: 'Conflict',
    });
    host.sync.receive({
      ns: 'mhk-fusion',
      version: 1,
      session: 'session-1234',
      request: 4,
      type: 'reading',
      baseline: parseReaderState(null),
      state: state(0.2),
    });
    expect(host.errors).toEqual(['Conflict']);
    expect(host.posts.at(-1)).toMatchObject({
      type: 'sync-error',
      acknowledged: 4,
      error: 'Conflict',
    });
    expect(host.posts.some((post) => post.type === 'reading-ack')).toBe(false);
  });

  it('rejects instead of going silent when the merged copy cannot be read back', () => {
    const host = harness(state(0.1));
    host.sync.start();
    host.sync.connect();
    host.read.mockImplementation(() => {
      throw new Error('denied');
    });
    host.sync.receive({
      ns: 'mhk-fusion',
      version: 1,
      session: 'session-1234',
      request: 9,
      type: 'reading',
      baseline: parseReaderState(null),
      state: state(0.2),
    });
    expect(host.posts.at(-1)).toMatchObject({
      type: 'sync-error',
      acknowledged: 9,
      error: 'Reading data could not be read after saving.',
    });
  });

  it('does not echo a share triggered synchronously by its own merge', () => {
    const host = harness(state(0.1));
    host.sync.start();
    host.sync.connect();
    host.merge.mockImplementation(() => {
      host.set(state(0.3));
      host.notify();
      return { status: 'merged' };
    });
    host.sync.receive({
      ns: 'mhk-fusion',
      version: 1,
      session: 'session-1234',
      request: 3,
      type: 'reading',
      baseline: parseReaderState(null),
      state: state(0.3),
    });
    expect(host.posts.map((post) => post.type)).toEqual(['reading-ack']);
  });

  it('clears a rejected outgoing snapshot so a later edit can retry', () => {
    const host = harness(state(0.1));
    host.sync.start();
    host.sync.connect();
    host.sync.publishAll();
    const pending = readingPosts(host.posts)[0];
    host.sync.fail({
      ns: 'mhk-fusion',
      version: 1,
      session: 'session-1234',
      request: 2,
      type: 'sync-error',
      acknowledged: pending.request,
      error: 'Conflict',
    });
    expect(host.errors).toEqual(['Conflict']);
    host.set(state(0.6));
    host.sync.share();
    expect(readingPosts(host.posts)).toHaveLength(2);
    expect(readingPosts(host.posts).at(-1)).toMatchObject({ state: state(0.6) });
  });

  it('clears outgoing when the acknowledgement merge fails, then accepts the next edit', () => {
    const host = harness(state(0.1));
    host.sync.start();
    host.sync.connect();
    host.sync.publishAll();
    const pending = readingPosts(host.posts)[0];
    host.merge.mockReturnValue({
      status: 'failed',
      error: 'Notebook changed elsewhere',
    });
    host.sync.acknowledge({
      ns: 'mhk-fusion',
      version: 1,
      session: 'session-1234',
      request: 2,
      type: 'reading-ack',
      acknowledged: pending.request,
      state: state(0.1),
    });
    expect(host.errors).toEqual(['Notebook changed elsewhere']);
    host.set(state(0.7));
    host.sync.share();
    expect(readingPosts(host.posts)).toHaveLength(2);
  });

  it('releases an unanswered snapshot after the ack timeout so the next edit retries', () => {
    vi.useFakeTimers();
    try {
      const host = harness(state(0.1));
      host.sync.start();
      host.sync.connect();
      host.sync.publishAll();
      expect(readingPosts(host.posts)).toHaveLength(1);
      vi.advanceTimersByTime(FUSION_READING_ACK_TIMEOUT_MS - 1);
      host.set(state(0.5));
      host.sync.share();
      // The first snapshot is still pending: later edits must not race it.
      expect(readingPosts(host.posts)).toHaveLength(1);
      vi.advanceTimersByTime(1);
      host.set(state(0.6));
      host.sync.share();
      expect(readingPosts(host.posts)).toHaveLength(2);
      expect(readingPosts(host.posts).at(-1)).toMatchObject({ state: state(0.6) });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the baseline across a new peer session but drops the stale acknowledgement', () => {
    const host = harness(state(0.1));
    host.sync.start();
    host.sync.connect();
    host.sync.publishAll();
    const pending = readingPosts(host.posts)[0];
    host.sync.disconnect();
    host.sync.connect();
    // The old acknowledgement is ignored, but the baseline still describes the
    // snapshot the peer last confirmed so the next edit is a true delta.
    host.sync.acknowledge({
      ns: 'mhk-fusion',
      version: 1,
      session: 'session-1234',
      request: 2,
      type: 'reading-ack',
      acknowledged: pending.request,
      state: state(0.9),
    });
    host.set(state(0.5));
    host.sync.share();
    expect(readingPosts(host.posts).at(-1)).toMatchObject({
      state: state(0.5),
      baseline: state(0.1),
    });
  });

  it('shares only deltas, honors force, and releases its subscription on stop', () => {
    const host = harness(state(0.1));
    host.sync.start();
    host.sync.connect();
    host.sync.share();
    expect(readingPosts(host.posts)).toHaveLength(0);
    host.set(state(0.2));
    host.sync.share(true);
    expect(readingPosts(host.posts)).toHaveLength(1);
    expect(host.subscribed).toBe(true);
    host.sync.stop();
    expect(host.subscribed).toBe(false);
  });

  it.each(['stop', 'disconnect'] as const)('ignores a late acknowledgement after %s', (action) => {
    const host = harness(state(0.1));
    host.sync.start();
    host.sync.connect();
    host.sync.publishAll();
    const pending = readingPosts(host.posts)[0];
    if (action === 'stop') host.sync.stop();
    else host.sync.disconnect();
    host.sync.acknowledge({
      ns: 'mhk-fusion',
      version: 1,
      session: 'session-1234',
      request: 2,
      type: 'reading-ack',
      acknowledged: pending.request,
      state: state(0.9),
    });
    expect(host.merge).not.toHaveBeenCalled();
    expect(host.posts.map((post) => post.type)).toEqual(['reading']);
  });

  it('publishes the complete notebook when the first read fails and later recovers', () => {
    const host = harness(state(0.1));
    host.sync.start();
    host.sync.connect();
    host.read.mockImplementationOnce(() => {
      throw new Error('denied');
    });
    host.sync.publishAll();
    expect(readingPosts(host.posts)).toHaveLength(0);
    host.set(state(0.3));
    host.sync.share();
    expect(readingPosts(host.posts)).toHaveLength(1);
    expect(readingPosts(host.posts)[0]).toMatchObject({
      baseline: parseReaderState(null),
      state: state(0.3),
    });
  });

  it('re-reads the durable merged state before sharing a later local edit', () => {
    const host = harness(state(0.1));
    host.sync.start();
    host.sync.connect();
    host.merge.mockImplementation(() => {
      // The peer's edit is now the durable notebook this session reads.
      host.set(state(0.2));
      return { status: 'merged' };
    });
    host.sync.receive({
      ns: 'mhk-fusion',
      version: 1,
      session: 'session-1234',
      request: 5,
      type: 'reading',
      baseline: parseReaderState(null),
      state: state(0.2),
    });
    expect(host.posts.at(-1)).toMatchObject({ type: 'reading-ack', state: state(0.2) });
    host.set(state(0.5));
    host.sync.share();
    expect(readingPosts(host.posts)).toHaveLength(1);
    // A stale pre-merge baseline would report the peer's edit as a local change.
    expect(readingPosts(host.posts)[0]).toMatchObject({
      baseline: state(0.2),
      state: state(0.5),
    });
  });

  it('replaces a pending snapshot on a forced share and ignores the old acknowledgement', () => {
    vi.useFakeTimers();
    try {
      const host = harness(state(0.1));
      host.sync.start();
      host.sync.connect();
      host.sync.publishAll();
      const first = readingPosts(host.posts)[0];
      host.set(state(0.2));
      const clear = vi.spyOn(globalThis, 'clearTimeout');
      clear.mockClear();
      host.sync.share(true);
      // The replaced lane releases its timeout instead of leaving two snapshots pending.
      expect(clear).toHaveBeenCalled();
      const posts = readingPosts(host.posts);
      expect(posts).toHaveLength(2);
      expect(posts[1]).toMatchObject({ baseline: state(0.1), state: state(0.2) });

      host.sync.acknowledge({
        ns: 'mhk-fusion',
        version: 1,
        session: 'session-1234',
        request: 2,
        type: 'reading-ack',
        acknowledged: first.request,
        state: state(0.9),
      });
      expect(host.merge).not.toHaveBeenCalled();
      host.sync.acknowledge({
        ns: 'mhk-fusion',
        version: 1,
        session: 'session-1234',
        request: 3,
        type: 'reading-ack',
        acknowledged: posts[1].request,
        state: state(0.2),
      });
      expect(host.merge).toHaveBeenCalledTimes(1);
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });
});
