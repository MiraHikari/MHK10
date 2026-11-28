import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { chromium, type Browser } from '@playwright/test';
import {
  ASSET_FILE_LIMIT,
  ASSET_TOTAL_LIMIT,
  createBrowserAssetStore,
  type AssetDatabase,
} from './browser-asset-store';

function backend() {
  const blobs = new Map<string, Blob>();
  const db: AssetDatabase = {
    put: vi.fn(async (id, blob, totalLimit) => {
      const total = [...blobs].reduce(
        (sum, [key, value]) => sum + (key === id ? 0 : value.size),
        blob.size,
      );
      if (total > totalLimit) return 'full';
      blobs.set(id, blob);
      return 'stored';
    }),
    get: vi.fn(async (id) => blobs.get(id)),
    list: vi.fn(async () =>
      [...blobs].map(([id, blob]) => ({
        id,
        size: blob.size,
        mime: blob.type || 'application/octet-stream',
      })),
    ),
    remove: vi.fn(async (id) => {
      blobs.delete(id);
    }),
    close: vi.fn(),
  };
  return { db, blobs };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('binary asset store session and lifetime contract', () => {
  it('retains bounded exportable blobs when opening storage is denied', async () => {
    const open = vi.fn((): Promise<AssetDatabase> => {
      throw new Error('Denied');
    });
    const store = createBrowserAssetStore({ open });
    const blob = new Blob(['session content'], { type: 'text/plain' });
    expect(await store.put('opaque asset id', blob)).toEqual({ ok: true, persisted: false });
    expect(await (await store.get('opaque asset id'))?.text()).toBe('session content');
    expect(await store.list()).toEqual([
      { id: 'opaque asset id', size: blob.size, mime: 'text/plain' },
    ]);
    expect(open).toHaveBeenCalledTimes(1);
    const rows = await store.list();
    rows[0].size = 0;
    expect((await store.list())[0].size).toBe(blob.size);
    await store.remove('opaque asset id');
    expect(await store.get('opaque asset id')).toBeUndefined();
    expect(await store.list()).toEqual([]);
    store.dispose();
  });
  it('does not report a durable write after quota or transaction-abort failures', async () => {
    const { db } = backend();
    vi.mocked(db.put)
      .mockRejectedValueOnce(new DOMException('Full', 'QuotaExceededError'))
      .mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));
    const store = createBrowserAssetStore({ open: async () => db });
    for (const id of ['quota', 'aborted']) {
      expect(await store.put(id, new Blob([id]))).toEqual({ ok: true, persisted: false });
      expect(await (await store.get(id))?.text()).toBe(id);
    }
    vi.mocked(db.list).mockRejectedValueOnce(new Error('Unavailable'));
    expect((await store.list()).map((item) => item.id)).toEqual(['quota', 'aborted']);
    store.dispose();
  });
  it('enforces file and total byte bounds before mutation and permits smaller replacements', async () => {
    const { db } = backend(),
      open = vi.fn(async () => db);
    const store = createBrowserAssetStore({ open });
    expect(
      await store.put('oversized', new Blob([new Uint8Array(ASSET_FILE_LIMIT + 1)])),
    ).toMatchObject({ ok: false });
    expect(open).not.toHaveBeenCalled();
    vi.mocked(db.list).mockResolvedValue([
      { id: 'existing', size: ASSET_TOTAL_LIMIT, mime: 'application/octet-stream' },
    ]);
    expect(await store.put('extra', new Blob(['x']))).toMatchObject({ ok: false });
    expect(db.put).not.toHaveBeenCalled();
    expect(await store.put('existing', new Blob(['replacement']))).toEqual({
      ok: true,
      persisted: true,
    });
    expect(db.put).toHaveBeenCalledWith('existing', expect.any(Blob), ASSET_TOTAL_LIMIT);
    store.dispose();
  });
  it('honors the database atomic size check when another instance consumed the remaining space', async () => {
    const { db } = backend();
    vi.mocked(db.put).mockResolvedValue('full');
    const store = createBrowserAssetStore({ open: async () => db });
    expect(await store.put('race', new Blob(['x']))).toMatchObject({ ok: false });
    expect(await store.get('race')).toBeUndefined();
    store.dispose();
  });
  it('orders accepted puts, reads and removals through the same queue', async () => {
    const { db } = backend(),
      commit = deferred<'stored' | 'full'>();
    vi.mocked(db.put).mockReturnValueOnce(commit.promise);
    const store = createBrowserAssetStore({ open: async () => db });
    const put = store.put('ordered', new Blob(['ready']));
    const read = store.get('ordered');
    await vi.waitFor(() => expect(db.put).toHaveBeenCalledTimes(1));
    expect(db.get).not.toHaveBeenCalled();
    commit.resolve('stored');
    expect(await put).toEqual({ ok: true, persisted: true });
    expect(await (await read)?.text()).toBe('ready');
    const remove = store.remove('ordered'),
      after = store.get('ordered');
    await remove;
    expect(await after).toBeUndefined();
    store.dispose();
  });
  it('closes a late-opening database without beginning a transaction after disposal', async () => {
    const { db } = backend(),
      opening = deferred<AssetDatabase>(),
      open = vi.fn(() => opening.promise);
    const store = createBrowserAssetStore({ open });
    const put = store.put('late', new Blob(['late']));
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    store.dispose();
    store.dispose();
    opening.resolve(db);
    expect(await put).toMatchObject({ ok: false });
    expect(db.close).toHaveBeenCalledTimes(1);
    expect(db.put).not.toHaveBeenCalled();
    expect(db.list).not.toHaveBeenCalled();
    expect(await store.get('late')).toBeUndefined();
    expect(await store.list()).toEqual([]);
    expect(await store.put('later', new Blob(['later']))).toMatchObject({ ok: false });
    expect(open).toHaveBeenCalledTimes(1);
  });
  it('does not retain a late write result after disposal and aborts the active backend', async () => {
    const { db } = backend(),
      commit = deferred<'stored' | 'full'>();
    vi.mocked(db.put).mockReturnValue(commit.promise);
    const store = createBrowserAssetStore({ open: async () => db });
    const result = store.put('pending', new Blob(['pending']));
    await vi.waitFor(() => expect(db.put).toHaveBeenCalledTimes(1));
    store.dispose();
    commit.resolve('stored');
    expect(await result).toMatchObject({ ok: false });
    expect(db.close).toHaveBeenCalledTimes(1);
    expect(await store.get('pending')).toBeUndefined();
    expect(await store.list()).toEqual([]);
  });
  it('keeps a failed delete tombstoned within its session', async () => {
    const { db } = backend();
    const store = createBrowserAssetStore({ open: async () => db });
    await store.put('delete-me', new Blob(['old']));
    vi.mocked(db.remove).mockRejectedValueOnce(new Error('Transaction failed'));
    await store.remove('delete-me');
    expect(await store.get('delete-me')).toBeUndefined();
    expect(await store.list()).toEqual([]);
    store.dispose();
  });
});

// Native IndexedDB is tested in Chromium without a fake-IDB dependency or a development server.
describe('native IndexedDB durability', () => {
  let browser: Browser, server: Server, origin: string;
  const source = stripTypeScriptTypes(
    readFileSync(new URL('./browser-asset-store.ts', import.meta.url), 'utf8'),
    { mode: 'strip' },
  );
  beforeAll(async () => {
    server = createServer((request, response) => {
      if (request.url === '/store.mjs') {
        response.writeHead(200, { 'Content-Type': 'text/javascript' });
        response.end(source);
        return;
      }
      if (request.url === '/data/storage-keys') {
        response.writeHead(200, { 'Content-Type': 'text/javascript' });
        response.end(
          stripTypeScriptTypes(
            readFileSync(new URL('../../../data/storage-keys.ts', import.meta.url), 'utf8'),
            { mode: 'strip' },
          ),
        );
        return;
      }
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(
        '<!doctype html><title>Asset store fixture</title><script type="module">import * as assets from "/store.mjs"; window.fixtureAssets = assets;</script>',
      );
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No fixture address');
    origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch();
  });
  afterAll(async () => {
    await browser?.close();
    server?.closeAllConnections();
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  it('reopens persisted blobs with metadata and permanently deletes them after commit', async () => {
    const page = await browser.newPage();
    await page.goto(origin);
    try {
      const result = await page.evaluate(async () => {
        const module = (
          window as unknown as { fixtureAssets: typeof import('./browser-asset-store') }
        ).fixtureAssets;
        const first = module.createBrowserAssetStore();
        const put = await first.put('persisted', new Blob(['durable'], { type: 'text/plain' }));
        first.dispose();
        const second = module.createBrowserAssetStore();
        const text = await (await second.get('persisted'))?.text();
        const rows = await second.list();
        await second.remove('persisted');
        second.dispose();
        const third = module.createBrowserAssetStore();
        const removed = await third.get('persisted');
        const remaining = await third.list();
        third.dispose();
        return { put, text, rows, removed: removed === undefined, remaining };
      });
      expect(result).toEqual({
        put: { ok: true, persisted: true },
        text: 'durable',
        rows: [{ id: 'persisted', size: 7, mime: 'text/plain' }],
        removed: true,
        remaining: [],
      });
    } finally {
      await page.close();
    }
  });
  it('waits for commit rather than request success and retains the aborted write for session export', async () => {
    const page = await browser.newPage();
    await page.goto(origin);
    try {
      const result = await page.evaluate(async () => {
        const module = (
          window as unknown as { fixtureAssets: typeof import('./browser-asset-store') }
        ).fixtureAssets;
        const original = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (
          value: unknown,
          key?: IDBValidKey,
        ): IDBRequest<IDBValidKey> {
          const request =
            key === undefined ? original.call(this, value) : original.call(this, value, key);
          if (this.name === 'assets')
            request.addEventListener('success', () => request.transaction?.abort(), { once: true });
          return request;
        };
        const first = module.createBrowserAssetStore();
        let put;
        try {
          put = await first.put('aborted', new Blob(['session export']));
        } finally {
          IDBObjectStore.prototype.put = original;
        }
        const text = await (await first.get('aborted'))?.text();
        first.dispose();
        const second = module.createBrowserAssetStore();
        const durable = await second.get('aborted');
        second.dispose();
        return { put, text, durable: durable !== undefined };
      });
      expect(result).toEqual({
        put: { ok: true, persisted: false },
        text: 'session export',
        durable: false,
      });
    } finally {
      await page.close();
    }
  });
  it('aborts a transaction disposed after request success before it can commit', async () => {
    const page = await browser.newPage();
    await page.goto(origin);
    try {
      const result = await page.evaluate(async () => {
        const module = (
          window as unknown as { fixtureAssets: typeof import('./browser-asset-store') }
        ).fixtureAssets;
        const first = module.createBrowserAssetStore(),
          original = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (
          value: unknown,
          key?: IDBValidKey,
        ): IDBRequest<IDBValidKey> {
          const request =
            key === undefined ? original.call(this, value) : original.call(this, value, key);
          if (this.name === 'assets')
            request.addEventListener('success', () => first.dispose(), { once: true });
          return request;
        };
        let put;
        try {
          put = await first.put('disposed', new Blob(['must not commit']));
        } finally {
          IDBObjectStore.prototype.put = original;
          first.dispose();
        }
        const second = module.createBrowserAssetStore();
        const durable = await second.get('disposed');
        second.dispose();
        return { ok: put.ok, durable: durable !== undefined };
      });
      expect(result).toEqual({ ok: false, durable: false });
    } finally {
      await page.close();
    }
  });
  it('enforces the total cap atomically across simultaneous native database connections', async () => {
    const page = await browser.newPage();
    await page.goto(origin);
    try {
      const result = await page.evaluate(async () => {
        const module = (
          window as unknown as { fixtureAssets: typeof import('./browser-asset-store') }
        ).fixtureAssets;
        const blob = new Blob([new Uint8Array(module.ASSET_FILE_LIMIT)]);
        const seed = module.createBrowserAssetStore();
        for (const id of ['one', 'two', 'three']) await seed.put(id, blob);
        seed.dispose();
        const first = module.createBrowserAssetStore(),
          second = module.createBrowserAssetStore();
        const results = await Promise.all([first.put('four', blob), second.put('five', blob)]);
        first.dispose();
        second.dispose();
        const read = module.createBrowserAssetStore();
        const rows = await read.list();
        read.dispose();
        return { results, count: rows.length, bytes: rows.reduce((sum, row) => sum + row.size, 0) };
      });
      expect(result.results.filter((value) => value.ok)).toHaveLength(1);
      expect(result.results.filter((value) => !value.ok)).toHaveLength(1);
      expect(result.count).toBe(4);
      expect(result.bytes).toBe(ASSET_TOTAL_LIMIT);
    } finally {
      await page.close();
    }
  });
});
