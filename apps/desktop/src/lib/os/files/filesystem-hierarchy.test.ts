import { describe, expect, it, vi } from 'vite-plus/test';
import {
  createFileSystem,
  FILES_KEY,
  type FolderId,
  type FileFolder,
  type SandboxFile,
} from './filesystem';
import { createDocuments } from './documents';

function fixture(raw?: string) {
  const values = new Map<string, string>(raw ? [[FILES_KEY, raw]] : []);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  return { storage, files: createFileSystem(storage, { now: () => 42 }) };
}
function folder(
  files: ReturnType<typeof createFileSystem>,
  name: string,
  parent: FolderId = 'root',
): FileFolder {
  const result = files.createFolder(name, parent);
  if (!result.ok) throw new Error(result.error);
  return result.folder;
}

describe('hierarchical local filesystem', () => {
  it('adds Desktop while preserving My Documents and supports sibling-scoped names', () => {
    const { files, storage } = fixture();
    expect(files.folders(null).map((entry) => entry.id)).toEqual(['root', 'desktop']);
    const work = folder(files, 'Work'),
      notes = folder(files, 'Notes', work.id);
    folder(files, 'Work', 'desktop');
    files.createText('draft.txt', '中文', notes.id);
    const loaded = createFileSystem(storage);
    expect(loaded.folderPath(notes.id)).toBe('My Documents\\Work\\Notes');
    expect(loaded.folders(work.id).map((entry) => entry.id)).toEqual([notes.id]);
    expect(loaded.list('documents', notes.id)[0].content).toBe('中文');
  });

  it('enforces one sibling namespace for newly created files and folders', () => {
    const { files } = fixture();
    folder(files, 'Work');
    expect(files.createText('work').ok).toBe(false);
    files.createText('record.txt');
    expect(files.createFolder('RECORD.TXT').ok).toBe(false);
  });

  it('moves a tree without changing IDs and rejects cycles before mutating storage', async () => {
    const { files, storage } = fixture();
    const parent = folder(files, 'Parent'),
      child = folder(files, 'Child', parent.id);
    const file = files.createText('inside.txt', 'kept', child.id).file!;
    const before = files.exportData(),
      revision = files.revision;
    storage.setItem.mockClear();
    expect(files.moveFolder(parent.id, child.id).ok).toBe(false);
    expect(files.moveFolder(parent.id, parent.id).ok).toBe(false);
    expect((await files.copyFolder(parent.id, child.id)).ok).toBe(false);
    expect(files.exportData()).toBe(before);
    expect(files.revision).toBe(revision);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(files.moveFolder(parent.id, 'desktop').ok).toBe(true);
    expect(files.get(file.id)?.folder).toBe(child.id);
    expect(files.folderPath(child.id)).toBe('Desktop\\Parent\\Child');
  });

  it('copies a complete tree in one snapshot with independent IDs and immutable blob references', async () => {
    const { files, storage } = fixture();
    const parent = folder(files, 'Project'),
      child = folder(files, 'Art', parent.id);
    files.createText('readme.txt', 'original', parent.id);
    files.createBinary(
      'image.png',
      { kind: 'image', mime: 'image/png', size: 25, assetId: 'asset:one', persisted: true },
      child.id,
    );
    storage.setItem.mockClear();
    const copy = await files.copyFolder(parent.id, 'desktop');
    expect(copy.ok).toBe(true);
    if (!copy.ok) return;
    expect(copy.folder.id).not.toBe(parent.id);
    expect(storage.setItem).toHaveBeenCalledOnce();
    const copiedChild = files.folders(copy.folder.id)[0];
    expect(copiedChild.id).not.toBe(child.id);
    expect(files.list('documents', copiedChild.id)[0]).toMatchObject({
      kind: 'image',
      assetId: 'asset:one',
      readonly: false,
    });
    const copiedText = files.list('documents', copy.folder.id)[0];
    files.writeText(copiedText.id, 'changed');
    expect(files.list('documents', parent.id)[0].content).toBe('original');
    expect(createFileSystem(storage).get(copiedText.id)?.content).toBe('changed');
  });

  it('does not partially copy a tree when the directory capacity is exceeded', async () => {
    const { files, storage } = fixture();
    const project = folder(files, 'Project');
    files.createText('inside.txt', 'kept', project.id);
    for (let index = 0; index < 198; index++) files.createText(`note-${index}.txt`);
    const before = files.exportData();
    storage.setItem.mockClear();
    expect((await files.copyFolder(project.id, 'desktop')).ok).toBe(false);
    expect(files.exportData()).toBe(before);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('restores deleted trees without resurrecting items deleted before the folder', () => {
    const { files, storage } = fixture();
    const parent = folder(files, 'Work'),
      child = folder(files, 'Nested', parent.id);
    const live = files.createText('live.txt', 'live', child.id).file!;
    const old = files.createText('old.txt', 'old', child.id).file!;
    files.remove(old.id);
    files.removeFolder(parent.id);
    expect(files.get(live.id)?.deleted).toBe(true);
    expect(files.deletedFolders().map((entry) => entry.id)).toEqual([parent.id]);
    folder(files, 'Work');
    const restored = files.restoreFolder(parent.id);
    expect(restored).toMatchObject({ ok: true, folder: { name: 'Work (2)' } });
    expect(files.get(live.id)?.deleted).toBe(false);
    expect(files.get(old.id)?.deleted).toBe(true);
    expect(createFileSystem(storage).folderPath(child.id)).toBe('My Documents\\Work (2)\\Nested');
    files.emptyBin();
    expect(files.get(old.id)).toBeUndefined();
    expect(files.get(live.id)?.content).toBe('live');
  });

  it('restores an individual file to an available ancestor when its folder is still deleted', () => {
    const { files } = fixture();
    const parent = folder(files, 'Work');
    const file = files.createText('note.txt', 'kept', parent.id).file!;
    files.removeFolder(parent.id);
    files.createText('note.txt', 'other');
    expect(files.restore(file.id).file).toMatchObject({ folder: 'root', name: 'note (2).txt' });
    files.emptyBin();
    expect(files.getFolder(parent.id)).toBeUndefined();
    expect(files.get(file.id)?.content).toBe('kept');
  });

  it('retains a cut source after a paste conflict and clears Clipboard only after a successful move', async () => {
    const { files } = fixture();
    const first = files.createText('same.txt', 'first').file!;
    files.createText('same.txt', 'second', 'desktop');
    files.setClipboard(first.id, 'cut');
    expect((await files.paste('desktop')).ok).toBe(false);
    expect(files.clipboard()?.id).toBe(first.id);
    expect(files.get(first.id)?.folder).toBe('root');
    files.rename(first.id, 'moved.txt');
    expect((await files.paste('desktop')).ok).toBe(true);
    expect(files.get(first.id)?.folder).toBe('desktop');
    expect(files.clipboard()).toBeNull();
    files.setClipboard(first.id, 'copy');
    expect((await files.paste('desktop')).ok).toBe(true);
    expect(files.findByName('moved (2).txt', 'desktop')?.content).toBe('first');
    files.reset();
    expect(files.clipboard()).toBeNull();
  });

  it('does not persist a fake file entry when its binary data exists only in the session', () => {
    const { files, storage } = fixture();
    const saved = files.createBinary('temporary.png', {
      kind: 'image',
      mime: 'image/png',
      size: 42,
      assetId: 'asset:temporary',
      persisted: false,
    });
    expect(saved).toMatchObject({ ok: true, persisted: false });
    expect(files.get(saved.file!.id)?.transient).toBe(true);
    files.createText('durable.txt', 'saved');
    const reloaded = createFileSystem(storage);
    expect(reloaded.get(saved.file!.id)).toBeUndefined();
    expect(reloaded.findByName('durable.txt')?.content).toBe('saved');
    expect(files.writeText(saved.file!.id, 'wrong kind').ok).toBe(false);
  });

  it('protects the mounted public library and allows deliberate copies without persisting the mount', async () => {
    const { storage } = fixture();
    const publicFile: SandboxFile = {
      id: 'library:article:one',
      name: 'article.md',
      content: '完整原文',
      folder: 'library:root',
      readonly: true,
      deleted: false,
      source: 'personal',
      kind: 'text',
    };
    const files = createFileSystem(storage, {
      library: {
        folders: [{ id: 'library:root', name: 'Library', readonly: true }],
        files: [publicFile],
      },
    });
    publicFile.content = 'external mutation';
    expect(files.get(publicFile.id)?.content).toBe('完整原文');
    expect(files.writeText(publicFile.id, 'rewrite').ok).toBe(false);
    expect(files.createFolder('Bad', 'library:root').ok).toBe(false);
    expect(files.setClipboard(publicFile.id, 'cut').ok).toBe(false);
    const document = createDocuments(files).open(publicFile.id);
    expect(document.get().content).toBe('完整原文');
    document.edit('editable copy');
    expect(document.save().status).toBe('failed');
    const copy = await files.copy(publicFile.id, 'desktop');
    expect(copy.file).toMatchObject({ readonly: false, source: 'visitor', content: '完整原文' });
    expect(storage.getItem(FILES_KEY)).not.toContain('library:article:one');
  });

  it('keeps cyclic or orphaned snapshots as recoverable data without overwriting them', () => {
    for (const folders of [
      [
        { id: 'folder:a', name: 'A', parent: 'folder:b' },
        { id: 'folder:b', name: 'B', parent: 'folder:a' },
      ],
      [{ id: 'folder:a', name: 'A', parent: 'folder:missing' }],
    ]) {
      const raw = JSON.stringify({ version: 1, folders, files: [] });
      const { files, storage } = fixture(raw);
      expect(files.notice).toContain('damaged');
      expect(files.createFolder('Session').persisted).toBe(false);
      expect(storage.getItem(FILES_KEY)).toBe(raw);
      expect(files.exportData()).toContain('recoveryRaw');
    }
  });
});
