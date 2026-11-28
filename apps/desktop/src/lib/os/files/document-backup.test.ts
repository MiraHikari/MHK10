import { describe, expect, it, vi } from 'vite-plus/test';
import { createDocumentBackup } from './document-backup';
import { createFileSystem, FILES_KEY } from './filesystem';
import { createBrowserAssetStore } from './browser-asset-store';

function fixture() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const blobs = new Map<string, Blob>();
  const assets = createBrowserAssetStore({
    open: async () => ({
      get: async (id) => blobs.get(id),
      put: async (id, blob) => {
        blobs.set(id, blob);
        return 'stored';
      },
      remove: async (id) => {
        blobs.delete(id);
      },
      list: async () => [...blobs].map(([id, blob]) => ({ id, size: blob.size, mime: blob.type })),
      close() {},
    }),
  });
  const files = createFileSystem(storage);
  return { storage, values, blobs, assets, files, backup: createDocumentBackup(files, assets) };
}

describe('document backups', () => {
  it('includes external publication bytes copied into My Documents', async () => {
    const source = fixture();
    source.files.createBinary('copy.png', {
      kind: 'image',
      mime: 'image/png',
      size: 5,
      assetId: 'library-asset:photo',
      persisted: true,
    });
    const external = vi.fn(async (id: string) =>
      id === 'library-asset:photo' ? new Blob(['photo'], { type: 'image/png' }) : undefined,
    );
    const backup = createDocumentBackup(source.files, source.assets, external);
    const result = await backup.export();
    expect(result.ok).toBe(true);
    expect(external).toHaveBeenCalledWith('library-asset:photo');
    if (!result.ok) return;
    const target = fixture();
    expect(await target.backup.import(result.content)).toEqual({ ok: true });
    const copy = target.files.findByName('copy.png')!;
    expect(await (await target.assets.get(copy.assetId!))?.text()).toBe('photo');
  });
  it('round trips folder records, text, deleted files and binary contents with fresh identities', async () => {
    const source = fixture();
    const created = source.files.createFolder('Trips');
    if (!created.ok) throw new Error(created.error);
    const folder = created.folder;
    const text = source.files.createText('draft.txt', 'visitor text', folder.id).file!;
    source.files.remove(text.id);
    await source.assets.put('original', new Blob(['image bytes'], { type: 'image/png' }));
    source.files.createBinary(
      'photo.png',
      { kind: 'image', mime: 'image/png', size: 11, assetId: 'original', persisted: true },
      folder.id,
    );
    const result = await source.backup.export();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const target = fixture();
    expect(await target.backup.import(result.content)).toEqual({ ok: true });
    expect(target.files.get(text.id)).toMatchObject({
      content: 'visitor text',
      deleted: true,
      folder: folder.id,
    });
    const photo = target.files.findByName('photo.png', folder.id)!;
    expect(photo.assetId).not.toBe('original');
    expect(await (await target.assets.get(photo.assetId!))?.text()).toBe('image bytes');
    expect(createFileSystem(target.storage).get(photo.id)).toMatchObject({
      assetId: photo.assetId,
    });
  });

  it('rejects a metadata-only legacy binary backup without replacing current files', async () => {
    const target = fixture();
    target.files.createText('keep.txt', 'kept');
    const source = fixture();
    source.files.createBinary('photo.png', {
      kind: 'image',
      mime: 'image/png',
      size: 2,
      assetId: 'missing',
      persisted: true,
    });
    expect(await target.backup.import(source.files.exportData())).toMatchObject({
      ok: false,
      error: expect.stringContaining('missing binary'),
    });
    expect(target.files.findByName('keep.txt')?.content).toBe('kept');
  });

  it('cleans staged assets and preserves the directory after a failed commit', async () => {
    const source = fixture();
    await source.assets.put('audio', new Blob(['sound'], { type: 'audio/wav' }));
    source.files.createBinary('sound.wav', {
      kind: 'audio',
      mime: 'audio/wav',
      size: 5,
      assetId: 'audio',
      persisted: true,
    });
    const exported = await source.backup.export();
    if (!exported.ok) throw new Error(exported.error);
    const target = fixture();
    target.files.createText('keep.txt', 'kept');
    const before = target.values.get(FILES_KEY);
    vi.spyOn(target.storage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(await target.backup.import(exported.content)).toMatchObject({ ok: false });
    expect(target.values.get(FILES_KEY)).toBe(before);
    expect(target.files.findByName('keep.txt')?.content).toBe('kept');
    expect(await target.assets.list()).toEqual([]);
  });

  it('refuses to label a missing binary as a complete backup', async () => {
    const source = fixture();
    source.files.createBinary('missing.png', {
      kind: 'image',
      mime: 'image/png',
      size: 5,
      assetId: 'missing',
      persisted: true,
    });
    expect(await source.backup.export()).toMatchObject({
      ok: false,
      error: expect.stringContaining('unavailable'),
    });
  });
});
