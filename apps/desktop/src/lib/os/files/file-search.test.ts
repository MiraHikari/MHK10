import { describe, expect, it } from 'vite-plus/test';
import { createFileSystem } from './filesystem';
import { resolveFileOpen } from './file-types';
import {
  findOpenAction,
  myDocumentsSnapshot,
  searchFiles,
  type FileSearchRecord,
} from './file-search';

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

describe('file search', () => {
  it('matches names and text without regard to case and skips deleted files', () => {
    const files: FileSearchRecord[] = [
      { id: 'diary', name: 'diary.txt', content: 'Dear Diary,\nPaperclip', deleted: false },
      { id: 'gone', name: 'paperclip.txt', content: 'Paperclip', deleted: true },
      { id: 'plain', name: 'Readme.TXT', content: 'Hello', readonly: true },
    ];
    expect(searchFiles(files, '  PAPERCLIP ').map((hit) => hit.id)).toEqual(['diary']);
    expect(searchFiles(files, 'readme.txt')).toEqual([
      { id: 'plain', name: 'Readme.TXT', readonly: true },
    ]);
    expect(searchFiles(files, '').map((hit) => hit.id)).toEqual(['diary', 'plain']);
    expect(files[0]).toMatchObject({ content: 'Dear Diary,\nPaperclip', deleted: false });
  });

  it('searches My Documents and personal publications without making them writable', () => {
    const files = createFileSystem(storage(), {
      library: {
        folders: [{ id: 'library:root', name: 'Library', readonly: true }],
        files: [
          {
            id: 'library:article',
            name: 'article.md',
            content: '完整原文',
            folder: 'library:root',
            readonly: true,
            deleted: false,
            source: 'personal',
            kind: 'text',
          },
        ],
      },
    });
    const nested = files.createFolder('Work');
    if (!nested.ok) throw new Error(nested.error);
    files.createText('draft.txt', 'NEEDLE', nested.folder.id);
    files.createText('desk.txt', 'NEEDLE', 'desktop');
    const diary = files.get('diary')!;
    files.remove(diary.id);
    const snapshot = myDocumentsSnapshot(files);
    expect(snapshot.find((file) => file.name === 'desk.txt')).toBeUndefined();
    expect(snapshot.find((file) => file.id === diary.id)).toBeUndefined();
    expect(snapshot.find((file) => file.id === 'personal:about')).toMatchObject({
      name: 'MiraHikari',
      readonly: true,
      source: 'personal',
      content: '',
    });
    expect(searchFiles(snapshot, 'needle').map((hit) => hit.name)).toEqual(['draft.txt']);
    expect(searchFiles(snapshot, '完整').map((hit) => hit.id)).toEqual(['library:article']);
    const article = snapshot.find((file) => file.id === 'library:article')!;
    article.content = 'changed in the snapshot';
    expect(files.writeText(article.id, 'rewrite').ok).toBe(false);
    expect(files.get(article.id)).toMatchObject({ readonly: true, content: '完整原文' });
    expect(files.writeText('personal:about', 'rewrite').ok).toBe(false);
    expect(files.get('personal:about')).toMatchObject({ readonly: true, content: '' });
  });

  it('opens a hit as a file id plus resolveFileOpen and does not run file text', () => {
    const files = createFileSystem(storage());
    const note = files.createText('notes.txt', 'killswitch').file!;
    const [hit] = searchFiles(myDocumentsSnapshot(files), 'KILLSWITCH');
    expect(hit).toMatchObject({ id: note.id, name: 'notes.txt' });
    expect(
      findOpenAction({ kind: 'file', id: hit.id, label: hit.name }, (id) =>
        resolveFileOpen(files, id),
      ),
    ).toEqual({
      kind: 'file',
      id: note.id,
      target: { kind: 'application', application: 'notepad', fileId: note.id },
    });
    expect(
      findOpenAction({ kind: 'file', id: 'personal:about', label: 'MiraHikari' }, (id) =>
        resolveFileOpen(files, id),
      ),
    ).toEqual({
      kind: 'file',
      id: 'personal:about',
      target: { kind: 'application', application: 'profile' },
    });
    expect(
      findOpenAction({ kind: 'program', id: 'javascript:alert(1)', label: 'alert' }, () => {
        throw new Error('file text must not be resolved as a program');
      }),
    ).toEqual({ kind: 'failed', error: 'The application is not installed.' });
    expect(
      findOpenAction({ kind: 'program', id: 'notepad', label: 'Notepad' }, () => {
        throw new Error('programs do not resolve as files');
      }),
    ).toEqual({ kind: 'program', id: 'notepad' });
    expect(
      findOpenAction({ kind: 'file', id: 'missing', label: 'missing.txt' }, (id) =>
        resolveFileOpen(files, id),
      ).kind,
    ).toBe('failed');
    expect(files.get(note.id)?.content).toBe('killswitch');
  });
});
