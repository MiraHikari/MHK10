import { parseReaderState, type ReaderState } from './reading-model';
import type { FusionMessage, FusionPayload } from './protocol-model';

export type ReadingMergeResult = { status: 'merged' } | { status: 'failed'; error: string };

/**
 * A notebook snapshot that never gets acknowledged (peer crashed, frame was
 * replaced, or the message was dropped) must not block later edits forever.
 */
export const FUSION_READING_ACK_TIMEOUT_MS = 8000;

export interface FusionReadingTimers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

const defaultTimers: FusionReadingTimers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof globalThis.setTimeout>),
};

/**
 * Storage operations supplied by each presentation's composition root. Reads and
 * merges may throw when browser storage is unavailable; the sync lane then stays
 * quiet instead of dropping or overwriting the visitor's notebook.
 */
export interface FusionReadingStore {
  read(): ReaderState;
  merge(baseline: unknown, incoming: unknown): ReadingMergeResult;
  subscribe(listener: () => void): () => void;
}

export interface FusionReadingSyncOptions {
  store: FusionReadingStore;
  post(payload: FusionPayload): number | undefined;
  onError(error: string): void;
  /** Peer-facing error text; details stay in the presentation that detected them. */
  wireError?: (error: string) => string;
  timeoutMs?: number;
  timers?: FusionReadingTimers;
}

type ReadingMessage = Extract<FusionMessage, { type: 'reading' }>;
type AckMessage = Extract<FusionMessage, { type: 'reading-ack' }>;
type ErrorMessage = Extract<FusionMessage, { type: 'sync-error' }>;

/** At most one snapshot may be waiting for its acknowledgement. */
type Lane =
  | { kind: 'idle' }
  | { kind: 'pending'; request: number; state: ReaderState; timer: unknown };
/** The peer has not yet received a complete notebook for this connection. */
type Connection = 'idle' | 'unpublished';

/**
 * One three-way-merge lane shared by both presentations. Baseline snapshots are
 * compared against the peer's snapshot and the durable remote copy, so unrelated
 * edits merge while a true field conflict is reported without overwriting data.
 *
 * A pending snapshot never blocks later edits after a rejected or unanswered
 * exchange: failures release the lane so the next local change can retry.
 */
export function createFusionReadingSync(options: FusionReadingSyncOptions) {
  const { store, post, onError, wireError = (error) => error } = options;
  const timers = options.timers ?? defaultTimers;
  const timeoutMs = options.timeoutMs ?? FUSION_READING_ACK_TIMEOUT_MS;
  let baseline: ReaderState | undefined;
  let lane: Lane = { kind: 'idle' };
  let connection: Connection = 'idle';
  let sharing = false;
  let connected = false;
  let release: (() => void) | undefined;

  const releaseLane = (): void => {
    if (lane.kind === 'pending') timers.clearTimeout(lane.timer);
    lane = { kind: 'idle' };
  };
  /** Track one snapshot and release the lane if its acknowledgement never arrives. */
  const track = (request: number, state: ReaderState): void => {
    releaseLane();
    const timer = timers.setTimeout(() => {
      // Release only; the next local edit (or a forced flush) sends a fresh snapshot.
      if (lane.kind === 'pending' && lane.request === request) lane = { kind: 'idle' };
    }, timeoutMs);
    lane = { kind: 'pending', request, state, timer };
  };

  const send = (payload: FusionPayload): number | undefined => {
    try {
      return post(payload);
    } catch {
      return undefined;
    }
  };
  const sendSnapshot = (state: ReaderState, against: ReaderState): void => {
    const sent = send({ type: 'reading', baseline: against, state });
    if (sent !== undefined) track(sent, state);
  };
  const read = (): ReaderState | undefined => {
    try {
      return store.read();
    } catch {
      return undefined;
    }
  };
  const merge = (before: unknown, incoming: unknown): ReadingMergeResult => {
    try {
      return store.merge(before, incoming);
    } catch (error) {
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Reading data could not be saved.',
      };
    }
  };

  function share(force = false): void {
    if (!connected || sharing || (lane.kind === 'pending' && !force)) return;
    const state = read();
    if (!state) return;
    if (connection === 'unpublished') {
      // The first complete snapshot could not be read; send it on recovery so the
      // peer still receives data that predates this connection.
      connection = 'idle';
      sendSnapshot(state, parseReaderState(null));
      return;
    }
    if (!baseline) {
      baseline = state;
      return;
    }
    if (JSON.stringify(state) === JSON.stringify(baseline)) return;
    sendSnapshot(state, baseline);
  }

  return {
    /** Capture the durable baseline and start observing local notebook changes. */
    start(): void {
      if (release) return;
      baseline ??= read();
      release = store.subscribe(() => share());
    },
    connect(): void {
      connected = true;
    },
    /** A new peer session invalidates the old acknowledgement, not the baseline. */
    disconnect(): void {
      connected = false;
      releaseLane();
    },
    share,
    /** First contact: send the complete local notebook against an empty baseline. */
    publishAll(): void {
      if (!connected) return;
      const state = read();
      if (!state) {
        connection = 'unpublished';
        return;
      }
      connection = 'idle';
      sendSnapshot(state, parseReaderState(null));
    },
    receive(data: ReadingMessage): void {
      sharing = true;
      try {
        const result = merge(data.baseline, data.state);
        const state = read();
        if (state) baseline = state;
        if (result.status === 'failed') {
          onError(result.error);
          send({
            type: 'sync-error',
            acknowledged: data.request,
            error: wireError(result.error),
          });
        } else if (state) {
          send({ type: 'reading-ack', acknowledged: data.request, state });
        } else {
          // The merge succeeded but the durable copy is unreadable. Reject instead
          // of staying silent, otherwise the peer's pending snapshot never clears.
          const error = 'Reading data could not be read after saving.';
          onError(error);
          send({ type: 'sync-error', acknowledged: data.request, error: wireError(error) });
        }
      } finally {
        sharing = false;
      }
    },
    acknowledge(data: AckMessage): void {
      if (lane.kind !== 'pending' || lane.request !== data.acknowledged || sharing) return;
      const sentState = lane.state;
      sharing = true;
      let result: ReadingMergeResult | undefined;
      try {
        result = merge(sentState, data.state);
      } finally {
        sharing = false;
      }
      if (!result || result.status === 'failed') {
        // Release the lane; the local snapshot stays intact and the next edit retries.
        releaseLane();
        if (result) onError(result.error);
        return;
      }
      baseline = data.state;
      releaseLane();
      share();
    },
    fail(data: ErrorMessage): void {
      if (lane.kind !== 'pending' || lane.request !== data.acknowledged) return;
      releaseLane();
      onError(data.error);
    },
    stop(): void {
      release?.();
      release = undefined;
      connected = false;
      releaseLane();
      connection = 'idle';
    },
  };
}

export type FusionReadingSync = ReturnType<typeof createFusionReadingSync>;
