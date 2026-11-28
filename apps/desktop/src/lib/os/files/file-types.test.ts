import { expect, it } from 'vite-plus/test';
import {
  displayedFileName,
  fileHandlers,
  fileHandlerLabel,
  fileOpenChoices,
  fileSize,
  fileType,
  resolveFileOpen,
} from './file-types';
import { APP_CATALOG } from '../../../data/app-catalog';
import { publicFileTarget, publicLibrary } from '../../../data/public-files';
import { createFileSystem, type FileStorage } from './filesystem';
it('routes supported extensions to real installed applications', () => {
  for (const name of [
    'notes.txt',
    'readme.md',
    'drawing.pixel',
    'voice.SND.txt',
    'image.JPEG',
    'record.wav',
  ]) {
    expect(APP_CATALOG.some((app) => app.id === fileType(name).application)).toBe(true);
  }
  expect(fileType('voice.SND.txt').application).toBe('sound-recorder');
  expect(fileHandlers('readme.md')).toEqual(['blog', 'notepad']);
});
it('does not treat arbitrary executables, links or unknown files as runnable programs', () => {
  expect(fileType('untrusted.exe').application).toBeUndefined();
  expect(fileType('script.bat').category).toBe('application');
  expect(fileHandlers('site.url')).toEqual([]);
  expect(fileType('blob.bin').category).toBe('binary');
});
it('hides only recognized file extensions and formats actual sizes', () => {
  expect(displayedFileName('读书笔记.md', false)).toBe('读书笔记');
  expect(displayedFileName('voice.snd.txt', false)).toBe('voice');
  expect(displayedFileName('program.exe', false)).toBe('program.exe');
  expect(fileSize(0)).toBe('0 bytes');
  expect(fileSize(2048)).toBe('2.0 KB');
  expect(fileSize(2 ** 20)).toBe('1.0 MB');
  expect(fileSize(NaN)).toBe('Unknown');
});
it('resolves legacy file/folder collisions and rejects shortcut cycles or incompatible overrides', () => {
  const file = {
    id: 'chat',
    name: 'Notes.txt',
    content: 'Note',
    source: 'visitor',
    deleted: false,
    readonly: false,
  };
  const files = {
    get: (id: string) =>
      id === 'chat'
        ? file
        : id === 'loop'
          ? { ...file, id, name: 'loop.lnk', target: { appId: 'notepad', fileId: 'loop' } }
          : undefined,
    folders: () => [{ id: 'chat' }, { id: 'root' }],
  };
  expect(resolveFileOpen(files, 'chat')).toEqual({
    kind: 'application',
    application: 'notepad',
    fileId: 'chat',
  });
  expect(resolveFileOpen(files, 'root')).toEqual({ kind: 'folder', id: 'root' });
  expect(resolveFileOpen(files, 'loop')).toMatchObject({ kind: 'failed' });
  expect(resolveFileOpen(files, 'chat', 'killswitch')).toMatchObject({ kind: 'failed' });
});
it('labels every handler for the Open With picker', () => {
  for (const name of ['Notes.txt', 'Readme.md', 'Photo.png', 'Song.mp3', 'Art.pixel', 'Clip.snd']) {
    for (const handler of fileHandlers(name)) {
      expect(fileHandlerLabel(handler).length).toBeGreaterThan(0);
    }
  }
  expect(fileHandlerLabel('blog')).toBe('Reader');
  expect(fileHandlerLabel('notepad')).toBe('Notepad');
});
it('offers the full Open With list on demand, even for files with a default', () => {
  const files = {
    get: (id: string) =>
      id === 'note'
        ? {
            id,
            name: 'Notes.txt',
            content: 'hi',
            source: 'visitor',
            deleted: false,
            readonly: false,
          }
        : id === 'shot'
          ? {
              id,
              name: 'shot.png',
              content: '',
              source: 'visitor',
              deleted: false,
              readonly: false,
              kind: 'image',
              assetId: 'a1',
            }
          : undefined,
    folders: () => [{ id: 'root' }],
  };
  expect(fileOpenChoices(files, 'note')).toEqual({
    name: 'Notes.txt',
    applications: ['notepad', 'blog'],
  });
  expect(fileOpenChoices(files, 'shot')).toEqual({ name: 'shot.png', applications: ['acdsee'] });
  expect(fileOpenChoices(files, 'missing')).toBeUndefined();
});
it('shares stored defaults between Open With and opening, while unknown files still ask initially', () => {
  const files = {
    get: (id: string) => ({
      id,
      name: id,
      content: 'text',
      source: 'visitor',
      deleted: false,
      readonly: false,
    }),
    folders: () => [],
  };
  const associations = { '.txt': 'blog', '.custom': 'blog' } as const;
  expect(fileOpenChoices(files, 'Notes.txt', associations)?.applications).toEqual([
    'blog',
    'notepad',
  ]);
  expect(resolveFileOpen(files, 'Notes.txt', undefined, undefined, associations)).toMatchObject({
    application: 'blog',
  });
  expect(resolveFileOpen(files, 'Notes.custom')).toMatchObject({
    kind: 'choose',
    applications: ['notepad', 'blog'],
  });
  expect(resolveFileOpen(files, 'Notes.custom', undefined, undefined, associations)).toMatchObject({
    application: 'blog',
  });
  expect(resolveFileOpen(files, 'Notes.txt', 'notepad', undefined, associations)).toMatchObject({
    application: 'notepad',
  });
});

it.each(['site-update'])(
  'opens saved %s article shortcuts after remounting the current publication library',
  (slug) => {
    const saved = new Map<string, string>();
    const storage: FileStorage = {
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => {
        saved.set(key, value);
      },
      removeItem: (key) => {
        saved.delete(key);
      },
    };
    const oldId = `library:article:${slug}`;
    const files = createFileSystem(storage, { library: publicLibrary });
    const shortcut = files.createShortcut(
      `${slug}.lnk`,
      { appId: 'blog', fileId: oldId },
      'desktop',
    );
    expect(shortcut.ok).toBe(true);
    expect(shortcut.persisted).toBe(true);
    if (!shortcut.file) throw new Error('The article shortcut was not saved.');

    const reloaded = createFileSystem(storage, { library: publicLibrary });
    expect(reloaded.get(shortcut.file.id)?.target?.fileId).toBe(oldId);
    expect(reloaded.get(oldId)).toBeUndefined();
    const target = resolveFileOpen(reloaded, shortcut.file.id);
    expect(target).toEqual({
      kind: 'application',
      application: 'blog',
      fileId: 'library:article:colophon',
    });
    if (target.kind !== 'application' || !target.fileId)
      throw new Error('The article shortcut did not resolve to a file.');
    expect(publicFileTarget(target.fileId)).toEqual({
      application: 'blog',
      href: '/blog/colophon/',
    });
    expect(reloaded.get(target.fileId)).toMatchObject({ readonly: true, source: 'personal' });
    expect(reloaded.remove(target.fileId).ok).toBe(false);
    expect(resolveFileOpen(reloaded, oldId, 'notepad')).toEqual({
      kind: 'application',
      application: 'notepad',
      fileId: 'library:article:colophon',
    });
    expect(resolveFileOpen(reloaded, oldId, 'killswitch')).toMatchObject({ kind: 'failed' });
  },
);

it('does not redirect retired article identifiers onto missing or writable files', () => {
  const missing = createFileSystem(null);
  expect(resolveFileOpen(missing, 'library:article:site-update')).toMatchObject({ kind: 'failed' });
  const writable = {
    get: (id: string) =>
      id === 'library:article:colophon'
        ? {
            id,
            name: 'colophon.md',
            content: 'Visitor text',
            source: 'visitor',
            readonly: false,
            deleted: false,
          }
        : undefined,
    folders: () => [],
  };
  expect(resolveFileOpen(writable, 'library:article:site-update')).toMatchObject({
    kind: 'failed',
  });
});
