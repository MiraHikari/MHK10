import { parseReaderState, type ReaderState } from './reading-model';
import { mergeReaderStates, parseStoredReaderState } from './reading-storage-model';
import { READER_STORAGE_KEY, type ReaderStoragePort } from './reading-keys';

export type ReadingCommitResult =
  | { ok: true; state: ReaderState; persisted: boolean }
  | { ok: false; error: string };

export interface ReadingRepository {
  read(): ReaderState;
  commit(next: ReaderState): ReadingCommitResult;
  integrate(baseline: ReaderState, incoming: ReaderState): ReadingCommitResult;
  reconcile(next: ReaderState): ReaderState;
  subscribe(listener: () => void): () => void;
  recovery(): string | undefined;
}

/**
 * One owner for the notebook's durable baseline, validation, three-way merge,
 * verified write and recovery export. Storage stays an injected port, so this
 * module never reads browser globals and every presentation shares the same
 * persistence decisions.
 *
 * `commit` owns the local edit baseline. `integrate` takes the caller's per-peer
 * baseline instead and deliberately leaves the local baseline untouched: peer
 * edits fetched during synchronization are not this session's edits, so a later
 * commit must not treat them as reverted local changes.
 */
export function createReadingRepository(options: {
  port: ReaderStoragePort;
  key?: string;
  notify?: () => void;
  subscribe?: (listener: () => void) => () => void;
}): ReadingRepository {
  const { port, notify = () => {} } = options;
  const key = options.key ?? READER_STORAGE_KEY;
  let baseline = parseReaderState(null);
  let recovery: string | undefined;

  function decode(raw: string | null): ReaderState {
    let input: unknown;
    try {
      input = raw === null ? null : JSON.parse(raw);
    } catch {
      recovery = raw ?? undefined;
      throw new Error('Saved notebook is damaged. Export a recovery backup before replacing it.');
    }
    const result = parseStoredReaderState(input);
    if (!result.ok) {
      recovery = raw ?? undefined;
      throw new Error(result.error);
    }
    recovery = undefined;
    return result.state;
  }

  const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : 'Reading data could not be saved.';

  /** Write and read back one serialized state; the caller owns baseline/notification. */
  const persist = (serialized: string): void => {
    port.setItem(key, serialized);
    if (port.getItem(key) !== serialized)
      throw new Error('Reading data could not be saved. Your session copy is kept.');
  };

  return {
    read() {
      baseline = decode(port.getItem(key));
      return structuredClone(baseline);
    },
    commit(next) {
      try {
        const remote = decode(port.getItem(key));
        const result = mergeReaderStates(baseline, next, remote);
        if (!result.ok) return { ok: false, error: result.error };
        const serialized = JSON.stringify(result.state);
        // A rejected or no-op local command leaves the durable copy untouched.
        if (serialized !== JSON.stringify(remote)) {
          persist(serialized);
          // Advance before notifying so a synchronous listener that re-enters
          // commit merges against the copy this commit just made durable.
          baseline = structuredClone(result.state);
          notify();
        } else {
          baseline = structuredClone(result.state);
        }
        return { ok: true, state: structuredClone(result.state), persisted: true };
      } catch (error) {
        return { ok: false, error: errorMessage(error) };
      }
    },
    integrate(peerBaseline, incoming) {
      try {
        const remote = decode(port.getItem(key));
        const result = mergeReaderStates(peerBaseline, incoming, remote);
        if (!result.ok) return { ok: false, error: result.error };
        const serialized = JSON.stringify(result.state);
        // The merged copy is already durable when the peer's edit changed nothing.
        if (serialized !== JSON.stringify(remote)) {
          persist(serialized);
          notify();
        }
        return { ok: true, state: structuredClone(result.state), persisted: true };
      } catch (error) {
        return { ok: false, error: errorMessage(error) };
      }
    },
    reconcile(next) {
      const remote = decode(port.getItem(key));
      const result = mergeReaderStates(baseline, next, remote);
      if (!result.ok) throw new Error(result.error);
      baseline = structuredClone(remote);
      return result.state;
    },
    subscribe(listener) {
      return options.subscribe ? options.subscribe(listener) : () => {};
    },
    recovery: () => recovery,
  };
}
