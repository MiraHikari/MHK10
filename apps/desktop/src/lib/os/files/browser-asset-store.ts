import { STORAGE_KEYS } from '../../../data/storage-keys';
export const ASSET_FILE_LIMIT = 32 * 1024 * 1024;
export const ASSET_TOTAL_LIMIT = 128 * 1024 * 1024;
export const ASSET_DATABASE_NAME = STORAGE_KEYS.assets;

export interface AssetInfo {
  id: string;
  size: number;
  mime: string;
}
export type AssetPutResult = { ok: true; persisted: boolean } | { ok: false; error: string };
/** A durable port resolves writes only after commit. close() aborts active transactions. */
export interface AssetDatabase {
  put(id: string, blob: Blob, totalLimit: number): Promise<'stored' | 'full'>;
  get(id: string): Promise<Blob | undefined>;
  remove(id: string): Promise<void>;
  list(): Promise<AssetInfo[]>;
  close(): void;
}
interface Options {
  open?: (signal: AbortSignal) => Promise<AssetDatabase>;
}
const metadata = (id: string, blob: Blob): AssetInfo => ({
  id,
  size: blob.size,
  mime: blob.type || 'application/octet-stream',
});
const closedResult = (): AssetPutResult => ({ ok: false, error: 'The asset store is closed.' });

/** One runtime owns its database connection and bounded session copies; URLs belong to consumers. */
export function createBrowserAssetStore(options: Options = {}) {
  const memory = new Map<string, Blob>();
  const removed = new Set<string>();
  let index = new Map<string, AssetInfo>();
  let database: AssetDatabase | undefined;
  let opening: Promise<AssetDatabase | undefined> | undefined;
  let disposed = false;
  let tail: Promise<unknown> = Promise.resolve();
  const controller = new AbortController();
  const available = () => {
    if (disposed) return Promise.resolve(undefined);
    opening ??= Promise.resolve()
      .then(() => {
        if (disposed) return undefined;
        return (options.open ?? openDatabase)(controller.signal);
      })
      .then((value) => {
        if (!value) return undefined;
        if (disposed) {
          value.close();
          return undefined;
        }
        database = value;
        return value;
      })
      .catch(() => undefined);
    return opening;
  };
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation, operation);
    tail = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  async function entries(): Promise<Map<string, AssetInfo>> {
    const db = await available();
    if (disposed) return new Map();
    if (db) {
      try {
        const values = await db.list();
        if (disposed) return new Map();
        index = new Map(values.map((value) => [value.id, { ...value }]));
      } catch {
        /* Keep the last known directory and session copies. */
      }
    }
    const merged = new Map(index);
    memory.forEach((blob, id) => merged.set(id, metadata(id, blob)));
    removed.forEach((id) => merged.delete(id));
    return merged;
  }
  return {
    put(id: string, blob: Blob): Promise<AssetPutResult> {
      return enqueue(async () => {
        if (disposed) return closedResult();
        if (!id || id.length > 256) return { ok: false, error: 'The asset identifier is invalid.' };
        if (!Number.isSafeInteger(blob.size) || blob.size < 0 || blob.size > ASSET_FILE_LIMIT)
          return { ok: false, error: 'A file cannot exceed 32 MiB.' };
        const current = await entries();
        if (disposed) return closedResult();
        const total =
          [...current.values()].reduce((sum, item) => sum + item.size, 0) -
          (current.get(id)?.size ?? 0) +
          blob.size;
        if (total > ASSET_TOTAL_LIMIT)
          return { ok: false, error: 'Asset storage cannot exceed 128 MiB.' };
        let persisted = false;
        const db = await available();
        if (disposed) return closedResult();
        if (db) {
          try {
            const result = await db.put(id, blob, ASSET_TOTAL_LIMIT);
            if (disposed) return closedResult();
            if (result === 'full')
              return { ok: false, error: 'Asset storage cannot exceed 128 MiB.' };
            persisted = true;
          } catch {
            if (disposed) return closedResult();
            // Quota, denied transactions and aborted commits retain an exportable session copy.
          }
        }
        if (disposed) return closedResult();
        memory.set(id, blob);
        removed.delete(id);
        if (persisted) index.set(id, metadata(id, blob));
        return { ok: true, persisted };
      });
    },
    get(id: string): Promise<Blob | undefined> {
      return enqueue(async () => {
        if (disposed || removed.has(id)) return undefined;
        const cached = memory.get(id);
        if (cached) return cached;
        const db = await available();
        if (disposed || !db) return undefined;
        try {
          const blob = await db.get(id);
          if (disposed) return undefined;
          if (blob && blob.size <= ASSET_FILE_LIMIT) {
            memory.set(id, blob);
            index.set(id, metadata(id, blob));
          }
          return blob && blob.size <= ASSET_FILE_LIMIT ? blob : undefined;
        } catch {
          return undefined;
        }
      });
    },
    remove(id: string): Promise<void> {
      return enqueue(async () => {
        if (disposed) return;
        const db = await available();
        if (disposed) return;
        if (db) {
          try {
            await db.remove(id);
          } catch {
            /* Tombstone still removes the session's reference. */
          }
        }
        if (disposed) return;
        memory.delete(id);
        index.delete(id);
        removed.add(id);
      });
    },
    list(): Promise<AssetInfo[]> {
      return enqueue(async () =>
        disposed ? [] : [...(await entries()).values()].map((item) => ({ ...item })),
      );
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      controller.abort();
      database?.close();
      database = undefined;
      memory.clear();
      removed.clear();
      index.clear();
    },
  };
}
export type BrowserAssetStore = ReturnType<typeof createBrowserAssetStore>;

interface AssetRecord {
  id: string;
  blob: Blob;
}
function record(value: unknown): AssetRecord | undefined {
  if (!value || typeof value !== 'object' || !('id' in value) || !('blob' in value)) return;
  if (
    typeof value.id !== 'string' ||
    !value.id ||
    value.id.length > 256 ||
    !(value.blob instanceof Blob)
  )
    return;
  return { id: value.id, blob: value.blob };
}
function openDatabase(signal: AbortSignal): Promise<AssetDatabase> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('Closed'));
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(ASSET_DATABASE_NAME, 1);
    } catch (error) {
      reject(error);
      return;
    }
    let rejected = false;
    const abort = () => {
      rejected = true;
      try {
        request.transaction?.abort();
      } catch {
        /* Upgrade already finished. */
      }
      reject(new Error('Closed'));
    };
    signal.addEventListener('abort', abort, { once: true });
    request.onupgradeneeded = () => {
      if (signal.aborted || rejected) {
        request.transaction?.abort();
        return;
      }
      if (!request.result.objectStoreNames.contains('assets'))
        request.result.createObjectStore('assets', { keyPath: 'id' });
    };
    request.onerror = () => {
      rejected = true;
      signal.removeEventListener('abort', abort);
      reject(request.error ?? new Error('Database unavailable'));
    };
    request.onblocked = () => {
      rejected = true;
      // Keep cancellation attached until this blocked request finally settles.
      reject(new Error('Database upgrade is blocked'));
    };
    request.onsuccess = () => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted || rejected) {
        request.result.close();
        reject(new Error('Closed'));
        return;
      }
      resolve(databasePort(request.result));
    };
  });
}
function databasePort(db: IDBDatabase): AssetDatabase {
  let closed = false;
  const transactions = new Set<IDBTransaction>();
  function transaction<T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore, result: (value: T) => void) => void,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (closed) {
        reject(new Error('Closed'));
        return;
      }
      let tx: IDBTransaction;
      try {
        tx = db.transaction('assets', mode);
      } catch (error) {
        reject(error);
        return;
      }
      transactions.add(tx);
      let value: T;
      let hasResult = false;
      tx.oncomplete = () => {
        transactions.delete(tx);
        if (hasResult) resolve(value);
        else reject(new Error('Transaction returned no result'));
      };
      tx.onabort = tx.onerror = () => {
        transactions.delete(tx);
        reject(tx.error ?? new Error('Transaction aborted'));
      };
      try {
        work(tx.objectStore('assets'), (next) => {
          value = next;
          hasResult = true;
        });
      } catch (error) {
        try {
          tx.abort();
        } catch {
          /* Already inactive. */
        }
        reject(error);
      }
    });
  }
  const close = () => {
    if (closed) return;
    closed = true;
    transactions.forEach((tx) => {
      try {
        tx.abort();
      } catch {
        /* Already completed. */
      }
    });
    transactions.clear();
    db.close();
  };
  db.onversionchange = close;
  return {
    close,
    list: () =>
      transaction('readonly', (store, result) => {
        const request = store.getAll();
        request.onsuccess = () =>
          result(
            (request.result as unknown[]).flatMap((value) => {
              const item = record(value);
              return item ? [metadata(item.id, item.blob)] : [];
            }),
          );
      }),
    get: (id) =>
      transaction('readonly', (store, result) => {
        const request = store.get(id);
        request.onsuccess = () => result(record(request.result)?.blob);
      }),
    remove: (id) =>
      transaction('readwrite', (store, result) => {
        const request = store.delete(id);
        request.onsuccess = () => result(undefined);
      }),
    put: (id, blob, totalLimit) =>
      transaction('readwrite', (store, result) => {
        const request = store.getAll();
        request.onsuccess = () => {
          const total = (request.result as unknown[]).reduce<number>((sum, value) => {
            const item = record(value);
            return sum + (item && item.id !== id ? item.blob.size : 0);
          }, blob.size);
          if (total > totalLimit) {
            result('full');
            return;
          }
          try {
            const write = store.put({ id, blob } satisfies AssetRecord);
            write.onsuccess = () => result('stored');
          } catch {
            store.transaction.abort();
          }
        };
      }),
  };
}
