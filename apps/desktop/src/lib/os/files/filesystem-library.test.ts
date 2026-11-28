import { describe, expect, it, vi } from 'vite-plus/test';
import { createFileSystem, FILES_KEY, type FileStorage, type SandboxFile } from './filesystem';
import { createNativeFileServices } from './native-file-service';

function libraryFixture(readText: (id: string) => Promise<string | undefined>) {
  const values = new Map<string, string>();
  const storage: FileStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
  const publications: SandboxFile[] = ['one', 'two'].map((name) => ({
    id: `library:article:${name}`,
    name: `${name}.md`,
    content: '',
    folder: 'library:articles',
    source: 'personal',
    readonly: true,
    deleted: false,
    kind: name === 'one' ? undefined : 'text',
    size: 100,
  }));
  const files = createFileSystem(storage, {
    library: {
      folders: [{ id: 'library:articles', name: 'Articles', readonly: true }],
      files: publications,
      readText,
    },
  });
  return { files, storage };
}

describe('publication text operations', () => {
  it('shares the selected body load and persists complete copied text without the Library mount', async () => {
    const body = Promise.withResolvers<string>();
    const load = vi.fn(() => body.promise);
    const { files, storage } = libraryFixture(load);
    expect(load).not.toHaveBeenCalled();
    const nativeFiles = createNativeFileServices(
      files,
      async () => ({ status: 'cancelled' }),
      () => ({ accepted: false }),
    );
    const copy = files.copy('library:article:one', 'desktop');
    const reading = nativeFiles.read('library:article:one');
    expect(files.list('documents', 'desktop')).toEqual([]);
    body.resolve('---\ntitle: One\n---\n\n完整原文。');
    expect(await copy).toMatchObject({
      ok: true,
      file: { content: expect.stringContaining('完整原文。') },
    });
    expect(await reading).toMatchObject({
      status: 'read',
      file: { kind: 'text', text: expect.stringContaining('完整原文。') },
    });
    expect(load).toHaveBeenCalledOnce();
    const saved = createFileSystem(storage).list('documents', 'desktop')[0];
    expect(saved.content).toContain('完整原文。');
    expect(saved.readonly).toBe(false);
    expect(storage.getItem(FILES_KEY)).not.toContain('library:article:one');
  });

  it('does not create half a copied folder when one body fails and allows a later retry', async () => {
    let unavailable = true;
    const load = vi.fn(async (id: string) => {
      if (id.endsWith(':two') && unavailable) throw new Error('Offline');
      return `Complete ${id}`;
    });
    const { files } = libraryFixture(load);
    const before = files.exportData();
    expect(await files.copyFolder('library:articles', 'desktop')).toMatchObject({ ok: false });
    expect(files.exportData()).toBe(before);
    expect(files.folders('desktop')).toEqual([]);
    unavailable = false;
    const copied = await files.copyFolder('library:articles', 'desktop');
    if (!copied.ok) throw new Error(copied.error);
    expect(files.list('documents', copied.folder.id).map((file) => file.content)).toEqual([
      'Complete library:article:one',
      'Complete library:article:two',
    ]);
    expect(load.mock.calls.filter(([id]) => id.endsWith(':one'))).toHaveLength(1);
  });

  it('rejects a pending publication copy after Reset and leaves the accepted reset intact', async () => {
    const body = Promise.withResolvers<string>();
    const { files } = libraryFixture(() => body.promise);
    const pending = files.copy('library:article:one', 'desktop');
    expect(files.reset()).toMatchObject({ ok: true, persisted: true });
    const reset = files.exportData();
    body.resolve('Old copy request');
    expect(await pending).toMatchObject({ ok: false, error: expect.stringContaining('reset') });
    expect(files.exportData()).toBe(reset);
    expect(files.list('documents', 'desktop')).toEqual([]);
  });

  it('keeps the accepted clipboard source while a newer copy command waits elsewhere', async () => {
    const body = Promise.withResolvers<string>();
    const { files } = libraryFixture(() => body.promise);
    files.setClipboard('library:article:one', 'copy');
    const pasted = files.paste('desktop');
    files.setClipboard('diary', 'copy');
    body.resolve('Accepted source');
    expect(await pasted).toMatchObject({
      ok: true,
      entry: { file: { name: 'one.md', content: 'Accepted source' } },
    });
    expect(files.clipboard()?.id).toBe('diary');
  });
});
