import { ReaderModel, parseReaderState, type ReaderState } from './reading-model';
import { FUSION_EVENTS } from './protocol-model';
import { parseStoredReaderState } from './reading-storage-model';
import { createReadingRepository, type ReadingRepository } from './reading-repository';
import {
  createReaderStorage,
  READER_STORAGE_KEY,
  SHARED_READING_STORAGE_KEY,
  type ReaderStorage,
  type ReaderStoragePort,
} from './reading-storage';

export const READER_STATE_EVENT = FUSION_EVENTS.readerState;
export const SHARED_READING_EVENT = FUSION_EVENTS.readingState;
type ReadingMergeResult =
  | { status: 'merged'; persisted: boolean }
  | { status: 'failed'; error: string };

function browserStorage(): ReaderStoragePort {
  return window.localStorage;
}
function eventName(key: string): string {
  return key === READER_STORAGE_KEY ? READER_STATE_EVENT : SHARED_READING_EVENT;
}
function publish(key: string): void {
  window.dispatchEvent(new Event(eventName(key)));
}
function subscribe(key: string, listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const target = window;
  const changed = (event: StorageEvent) => {
    if (event.key === key || event.key === null) listener();
  };
  target.addEventListener(eventName(key), listener);
  target.addEventListener('storage', changed);
  return () => {
    target.removeEventListener(eventName(key), listener);
    target.removeEventListener('storage', changed);
  };
}

/**
 * One repository per key for the stateless helpers below. Reads always refresh
 * its baseline first, so a shared repository is safe for the visitor notebook:
 * every change reads the durable copy immediately before committing.
 */
const repositories = new Map<string, ReadingRepository>();
function repositoryFor(key: string): ReadingRepository {
  let repository = repositories.get(key);
  if (!repository) {
    repository = createReadingRepository({
      port: {
        getItem: (name) => browserStorage().getItem(name),
        setItem: (name, value) => browserStorage().setItem(name, value),
      },
      key,
      notify: () => publish(key),
      subscribe: (listener) => subscribe(key, listener),
    });
    repositories.set(key, repository);
  }
  return repository;
}
function read(key: string): ReaderState {
  return repositoryFor(key).read();
}
function merge(key: string, baseline: unknown, incoming: unknown): ReadingMergeResult {
  const before = parseStoredReaderState(baseline);
  const next = parseStoredReaderState(incoming);
  if (!before.ok) return { status: 'failed', error: before.error };
  if (!next.ok) return { status: 'failed', error: next.error };
  const result = repositoryFor(key).integrate(before.state, next.state);
  return result.ok
    ? { status: 'merged', persisted: result.persisted }
    : { status: 'failed', error: result.error };
}

/** Desktop composition retains its existing notebook key and session Interface. */
export function readSharedReaderState(): ReaderState {
  return read(READER_STORAGE_KEY);
}
export function mergeSharedReaderState(baseline: unknown, incoming: unknown): ReadingMergeResult {
  return merge(READER_STORAGE_KEY, baseline, incoming);
}
export function subscribeSharedReaderState(listener: () => void): () => void {
  return subscribe(READER_STORAGE_KEY, listener);
}
export function createBrowserReaderStorage(): ReaderStorage {
  // Each session keeps its own baseline and one-way damaged guard: two mounted
  // desktop windows merge their independent edits against the copies they last
  // synchronized, not each other.
  const session = createReaderStorage(
    {
      getItem: (key) => browserStorage().getItem(key),
      setItem: (key, value) => browserStorage().setItem(key, value),
    },
    () => publish(READER_STORAGE_KEY),
    READER_STORAGE_KEY,
  );
  return { ...session, subscribe: subscribeSharedReaderState };
}

/** General-site composition uses its visitor key; only validated notebooks cross the bridge. */
export function readSharedReading(): ReaderState {
  return typeof window === 'undefined' ? parseReaderState(null) : read(SHARED_READING_STORAGE_KEY);
}
export function hasSharedReadingState(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return browserStorage().getItem(SHARED_READING_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}
function syncError(error: string): void {
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent(FUSION_EVENTS.syncError, { detail: error }));
}
export function mergeSharedReading(baseline: unknown, incoming: unknown): boolean {
  const result = reconcileSharedReading(baseline, incoming);
  if (result.status === 'failed') syncError(result.error);
  return result.status === 'merged';
}
/** Result-returning form used by the fusion sync lane, which owns error reporting. */
export function reconcileSharedReading(baseline: unknown, incoming: unknown): ReadingMergeResult {
  return merge(SHARED_READING_STORAGE_KEY, baseline, incoming);
}
export function changeSharedReading(change: (state: ReaderState) => void): boolean {
  let baseline: ReaderState;
  try {
    baseline = readSharedReading();
  } catch (error) {
    syncError(error instanceof Error ? error.message : 'Reading data could not be read.');
    return false;
  }
  const next = structuredClone(baseline);
  change(next);
  const result = repositoryFor(SHARED_READING_STORAGE_KEY).commit(next);
  if (!result.ok) {
    syncError(result.error);
    return false;
  }
  return true;
}
export function subscribeSharedReading(listener: () => void): () => void {
  return subscribe(SHARED_READING_STORAGE_KEY, listener);
}

interface SelectorEntry {
  select(state: ReaderState): unknown;
  listener(value: unknown): void;
  equals(left: unknown, right: unknown): boolean;
  selected: unknown;
  initialized: boolean;
}
interface SelectorRegistry {
  entries: Set<SelectorEntry>;
  release: () => void;
}
/** Selectors share one parse per storage/custom event instead of one per subscriber. */
const selectors = new Map<string, SelectorRegistry>();
function notifySelectors(key: string): void {
  const registry = selectors.get(key);
  if (!registry) return;
  let state: ReaderState;
  try {
    state = read(key);
  } catch {
    // Keep listening so a later repaired or restored notebook can be adopted.
    return;
  }
  for (const entry of [...registry.entries]) {
    if (!registry.entries.has(entry)) continue;
    let next: unknown;
    try {
      next = entry.select(state);
    } catch {
      continue;
    }
    let unchanged = false;
    try {
      unchanged = entry.initialized && entry.equals(entry.selected, next);
    } catch {
      /* A broken comparator treats the slice as changed instead of aborting fan-out. */
    }
    if (unchanged) continue;
    entry.selected = next;
    entry.initialized = true;
    try {
      entry.listener(next);
    } catch {
      /* One throwing subscriber must not starve the remaining selectors. */
    }
  }
}
function subscribeSelector(key: string, entry: SelectorEntry): () => void {
  let registry = selectors.get(key);
  if (!registry) {
    const created: SelectorRegistry = {
      entries: new Set(),
      release: subscribe(key, () => notifySelectors(key)),
    };
    registry = created;
    selectors.set(key, created);
  }
  const owned = registry;
  owned.entries.add(entry);
  return () => {
    if (!owned.entries.delete(entry)) return;
    if (owned.entries.size > 0) return;
    owned.release();
    if (selectors.get(key) === owned) selectors.delete(key);
  };
}

/** Read the current slice at subscription time; only selected changes notify the consumer. */
export function subscribeSharedReadingSelector<T>(
  select: (state: ReaderState) => T,
  listener: (value: T) => void,
  equals: (left: T, right: T) => boolean = Object.is,
): () => void {
  const entry: SelectorEntry = {
    select: (state) => select(state),
    listener: (value) => listener(value as T),
    equals: (left, right) => equals(left as T, right as T),
    selected: undefined,
    initialized: false,
  };
  try {
    entry.selected = select(readSharedReading());
    entry.initialized = true;
  } catch {
    /* Keep listening so a later repaired or restored notebook can be adopted. */
  }
  return subscribeSelector(SHARED_READING_STORAGE_KEY, entry);
}

export function readingDocument(slug: string) {
  const documents = readSharedReading().documents;
  return Object.hasOwn(documents, slug) ? documents[slug] : undefined;
}
export function saveReadingProgress(
  slug: string,
  progress: number,
  anchor: string,
  title?: string,
): void {
  if (!slug || !Number.isFinite(progress)) return;
  changeSharedReading((state) => {
    const model = new ReaderModel(state);
    if (!model.open(slug, Date.now(), title)) return;
    model.position(progress, anchor);
    state.documents = model.serialize().documents;
  });
}
