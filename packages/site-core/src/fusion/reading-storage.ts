import type { ReaderState } from './reading-model';
import { createReadingRepository } from './reading-repository';
import { READER_STORAGE_KEY, type ReaderStoragePort } from './reading-keys';

/** Preserve the desktop notebook and general-site visitor key across presentation changes. */
export {
  READER_STORAGE_KEY,
  SHARED_READING_STORAGE_KEY,
  type ReaderStoragePort,
} from './reading-keys';
export interface ReaderStorage {
  read(): unknown;
  /** Returns the complete merged state only after a verified durable write. */
  write(state: ReaderState): ReaderState | void;
  reconcile?(state: ReaderState): ReaderState;
  subscribe?(listener: () => void): () => void;
  recovery?(): string | undefined;
}

/** One session owns a baseline; composition supplies storage and its legacy-compatible key. */
export function createReaderStorage(
  storage: ReaderStoragePort,
  changed: () => void = () => {},
  key = READER_STORAGE_KEY,
): Omit<ReaderStorage, 'read' | 'write' | 'reconcile'> & {
  read(): ReaderState;
  write(state: ReaderState): ReaderState;
  reconcile(state: ReaderState): ReaderState;
} {
  const repository = createReadingRepository({ port: storage, key, notify: changed });
  // Legacy sessions are one-way: once this session has seen damaged or newer
  // data, it keeps refusing writes even if another tab repairs the record.
  let damaged = false;
  const observe = (error: unknown): never => {
    if (repository.recovery() !== undefined) damaged = true;
    throw error;
  };
  return {
    read() {
      try {
        return repository.read();
      } catch (error) {
        return observe(error);
      }
    },
    write(state) {
      if (damaged)
        throw new Error(
          'Saved notebook is damaged or uses a newer format. Export a recovery backup before replacing it.',
        );
      const result = repository.commit(state);
      if (!result.ok) {
        if (repository.recovery() !== undefined) damaged = true;
        throw new Error(result.error);
      }
      return result.state;
    },
    reconcile(state) {
      try {
        return repository.reconcile(state);
      } catch (error) {
        return observe(error);
      }
    },
    recovery: () => repository.recovery(),
  };
}
