import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import type { AppServices, AppFrameRequest } from '../../os/host/app-contracts';
import { createInputController } from '../../ui/canvas/input';
import {
  createFileSystem,
  type FileStorage,
  type FileSystemOptions,
  type FolderId,
} from '../../os/files/filesystem';
import { createDocuments } from '../../os/files/documents';
import { createRenderer } from '../../gfx/context';
import { createFrameEffects } from '../../gfx/fx';
import { canvasFixture, makeTestCanvas } from '../../gfx/canvas-fixture';
import { computerApp } from './computer.app';

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((dispose) => dispose());
});

function explorer(options: FileSystemOptions = {}, services: Partial<AppServices> = {}) {
  const records = new Map<string, string>();
  const storage: FileStorage = {
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => {
      records.set(key, value);
    },
    removeItem: (key) => {
      records.delete(key);
    },
  };
  const files = createFileSystem(storage, options);
  const documents = createDocuments(files);
  const input = createInputController();
  const draw = createRenderer(canvasFixture().canvas, { createCanvas: makeTestCanvas });
  const effects = createFrameEffects(draw);
  const renderedText = vi.spyOn(draw, 'text');
  const surfaces = {
    publish: vi.fn<NonNullable<AppServices['fileSurfaces']>['publish']>(),
    remove: vi.fn<NonNullable<AppServices['fileSurfaces']>['remove']>(),
  };
  let time = 0;
  const env = {
    files,
    documents,
    fileSurfaces: surfaces,
    now: () => time,
    msg: vi.fn(),
    close: vi.fn(),
    open: vi.fn(() => ({ accepted: true as const })),
    play: vi.fn(),
    takeFileOpen: vi.fn<NonNullable<AppServices['takeFileOpen']>>(),
    openFile: vi.fn<NonNullable<AppServices['openFile']>>(() => ({ accepted: true })),
    chooseFileApplication: vi.fn<NonNullable<AppServices['chooseFileApplication']>>(() => ({
      accepted: true,
    })),
    ...services,
  } as unknown as AppServices;
  const session = computerApp.createSession(env, { draw, input, effects, owner: 'computer' });
  const view: Omit<AppFrameRequest, 't' | 'dt'> = {
    win: { id: 'computer', menu: { open: -1 } },
    client: { x: 0, y: 0, w: 390, h: 222 },
    menuSel: null,
    focused: true,
    pointerIn: true,
  };
  const frame = (changes: Partial<AppFrameRequest> = {}) => {
    time += 0.05;
    input.beginFrame(time);
    input.setGate(changes.focused === false ? null : 'computer');
    session.frame({ ...view, t: time, dt: 0.05, ...changes });
  };
  const click = (x: number, y: number, right = false) => {
    input.queueInput({ px: x, py: y, ...(right ? { rdown: true } : { down: true }) });
    frame();
    input.queueInput(right ? { rdown: false } : { down: false });
    frame();
  };
  const key = (key: string, changes: Partial<AppFrameRequest> = {}) => {
    input.queueInput({ key });
    frame(changes);
  };
  const type = (typed: string) => {
    input.queueInput({ typed });
    frame();
  };
  const command = (command: string) => frame({ menuSel: { menu: 'File', item: command, command } });
  const surface = () => surfaces.publish.mock.calls.at(-1)![1];
  const row = (label: string) => {
    const found = surface().entries.find((entry) => entry.label === label);
    if (!found) throw new Error(`Missing visible row: ${label}`);
    return found.bounds;
  };
  const select = (label: string, right = false) => {
    const bounds = row(label);
    click(bounds.x + 3, bounds.y + 3, right);
  };
  const go = (folder: FolderId) => {
    vi.mocked(env.takeFileOpen!).mockReturnValueOnce(folder);
    frame();
  };
  const menuDisabled = (menu: 'File' | 'Edit' | 'View', command: string) => {
    const entry = session
      .menus()
      ?.[menu].find((entry) => typeof entry !== 'string' && entry.command === command);
    if (!entry || typeof entry === 'string') throw new Error(`Missing command: ${command}`);
    return entry.disabled ?? false;
  };
  cleanups.push(() => {
    session.dispose();
    effects.dispose();
    draw.dispose();
    input.dispose();
  });
  frame();
  return {
    files,
    storage,
    env,
    documents,
    session,
    input,
    surfaces,
    frame,
    click,
    key,
    type,
    command,
    surface,
    row,
    select,
    go,
    menuDisabled,
    renderedText,
  };
}

describe('Computer session interaction', () => {
  it('finishes an accepted publication paste before closing the file window', async () => {
    const body = Promise.withResolvers<string | undefined>();
    const e = explorer({
      library: {
        folders: [],
        files: [
          {
            id: 'publication',
            name: 'Article.txt',
            content: '',
            folder: 'root',
            source: 'personal',
            deleted: false,
            readonly: true,
          },
        ],
        readText: () => body.promise,
      },
    });
    e.files.setClipboard('publication', 'copy');
    e.go('notes');
    e.key('Paste');
    expect(e.session.status()).toBe('Copying files...');
    expect(e.menuDisabled('Edit', 'paste')).toBe(true);
    expect(e.files.findByName('Article.txt', 'notes')).toBeUndefined();
    const closing = e.session.requestClose();
    e.frame();
    body.resolve('The complete article');
    await expect(closing).resolves.toBe(true);
    expect(e.files.findByName('Article.txt', 'notes')?.content).toBe('The complete article');
    expect(e.session.closed).toBe(true);
  });

  it('reports failed file selection, observes cancel and releases a pending picker on close', async () => {
    for (const outcome of ['failed', 'cancelled', 'close'] as const) {
      const chosen =
        Promise.withResolvers<Awaited<ReturnType<AppServices['pickFile']>['result']>>();
      const cancel = vi.fn(() => chosen.resolve({ status: 'cancelled' }));
      const imported = vi.fn(async () => ({ ok: true as const }));
      const e = explorer(
        {},
        {
          pickFile: () => ({ result: chosen.promise, cancel }),
          importDocuments: imported,
          documentBackupLimit: 1000,
        },
      );
      e.command('import');
      expect(e.session.status()).toBe('Choosing a backup...');
      if (outcome === 'close') {
        const closing = e.session.requestClose();
        await e.session.flushClose();
        expect(await closing).toBe(true);
        expect(cancel).toHaveBeenCalledOnce();
      } else {
        chosen.resolve(
          outcome === 'failed'
            ? { status: 'failed', error: 'Picker unavailable.' }
            : { status: 'cancelled' },
        );
        await vi.waitFor(() => expect(e.session.status()).not.toBe('Choosing a backup...'));
        if (outcome === 'failed')
          expect(e.env.msg).toHaveBeenCalledWith(
            expect.objectContaining({ lines: ['Picker unavailable.'] }),
          );
        else expect(e.env.msg).not.toHaveBeenCalled();
      }
      expect(imported).not.toHaveBeenCalled();
    }
  });
  it.each(['Delete', 'Enter', 'F2'])(
    'clears selection on blank space before handling %s',
    (key) => {
      const e = explorer();
      const file = e.files.createText('Pointer.txt', 'Keep this document.', 'notes').file!;
      e.go('notes');
      e.select(file.name);
      e.click(20, 150);
      e.key(key);
      expect(e.files.get(file.id)).toMatchObject({
        name: file.name,
        content: file.content,
        deleted: false,
      });
      expect(e.env.openFile).not.toHaveBeenCalled();
      expect(e.menuDisabled('Edit', 'rename')).toBe(true);
    },
  );

  it('uses the drawn row boundary for activation and published drag targets', () => {
    const e = explorer();
    const file = e.files.createText('Pointer.txt', '', 'notes').file!;
    e.go('notes');
    const row = e.row(file.name);
    e.click(row.x + row.w - 1, row.y + row.h - 1);
    e.key('Enter');
    expect(e.env.openFile).toHaveBeenCalledExactlyOnceWith(file.id);
    vi.mocked(e.env.openFile!).mockClear();
    e.click(row.x + row.w - 1, row.y + row.h);
    e.key('Enter');
    expect(e.env.openFile).not.toHaveBeenCalled();
  });

  it('opens a folder on its paired second click and isolates the next directory item', () => {
    const e = explorer();
    e.click(20, 110);
    expect(e.menuDisabled('File', 'new-folder')).toBe(true);
    e.click(20, 110);
    expect(e.menuDisabled('File', 'new-folder')).toBe(false);
    expect(e.input.io.dbl).toBe(false);
    expect(e.input.io.wentUp).toBe(false);
    e.click(20, 110);
    expect(e.env.openFile).not.toHaveBeenCalled();
    expect(e.surface().target.folder).toBe('root');
    e.click(20, 110);
    e.frame();
    expect(e.surface().target.folder).toBe('evidence');
  });

  it('creates nested folders and documents, then deletes the selected folder transactionally', () => {
    const e = explorer();
    e.go('notes');
    e.key('NewFolder');
    const folder = e.files.folders('notes')[0];
    expect(folder.name).toBe('New Folder');
    expect(e.menuDisabled('File', 'new-folder')).toBe(true);
    e.key('Escape');
    e.key('Enter');
    e.frame();
    expect(e.surface().target.folder).toBe(folder.id);
    e.command('new');
    expect(e.files.list('documents', folder.id)).toHaveLength(1);
    expect(e.env.open).toHaveBeenCalledWith('notepad');
    e.key('Backspace');
    e.select(folder.name);
    e.key('Delete');
    expect(e.files.getFolder(folder.id)?.deleted).toBe(true);
    expect(e.files.list('bin')).toHaveLength(1);
  });

  it('renames with real text input, retaining full names when extensions are hidden', () => {
    const e = explorer();
    const file = e.files.createText('SYSTEM.LOG', 'chapter 1', 'notes').file!;
    Object.assign(e.env, { desktop: { getSettings: () => ({ showFileExtensions: false }) } });
    e.go('notes');
    e.select('SYSTEM');
    e.key('F2');
    expect(e.renderedText.mock.calls.some(([text]) => text === file.name)).toBe(true);
    expect(e.menuDisabled('Edit', 'delete')).toBe(true);
    e.type('renamed.txt');
    e.key('Enter');
    expect(e.files.get(file.id)?.name).toBe('renamed.txt');
    expect(e.input.io.keyPressed.has('Enter')).toBe(false);
  });

  it('isolates editing from file operations and unfocused keyboard input', () => {
    const e = explorer();
    const file = e.files.createText('Keep.txt', '', 'notes').file!;
    e.go('notes');
    e.select(file.name);
    e.key('F2');
    for (const key of ['Delete', 'Backspace', 'F5', 'F2']) e.key(key);
    expect(e.surface().target.folder).toBe('notes');
    expect(e.files.list('bin')).toHaveLength(0);
    expect(e.menuDisabled('File', 'open')).toBe(true);
    e.key('Escape');
    for (const key of ['F2', 'Delete', 'Backspace']) e.key(key, { focused: false });
    expect(e.surface().target.folder).toBe('notes');
    expect(e.files.get(file.id)?.deleted).toBe(false);
  });

  it('uses file associations and the chooser, reports refused opens without a fallback', () => {
    const e = explorer();
    const file = e.files.createText('Document.txt', '', 'notes').file!;
    e.go('notes');
    e.select(file.name);
    e.command('open-with');
    expect(e.env.chooseFileApplication).toHaveBeenCalledExactlyOnceWith(file.id);
    e.key('Enter');
    expect(e.env.openFile).toHaveBeenCalledExactlyOnceWith(file.id);
    expect(e.input.io.keyPressed.has('Enter')).toBe(false);
    vi.mocked(e.env.openFile!).mockReturnValue({ accepted: false, reason: 'blocked' });
    e.key('Enter');
    expect(e.env.open).not.toHaveBeenCalled();
    expect(e.env.msg).toHaveBeenCalledWith(expect.objectContaining({ title: 'Open File' }));
  });

  it('keeps navigation history, type-ahead and sorting connected to the selected file', () => {
    const e = explorer();
    const file = e.files.createText('Zebra.txt', '', 'notes').file!;
    const alpha = e.files.createText('Alpha.txt', '', 'notes').file!;
    e.go('notes');
    e.select(file.name);
    e.command('sort-name');
    e.key('Enter');
    expect(e.env.openFile).toHaveBeenLastCalledWith(file.id);
    e.type('alpha');
    e.key('Enter');
    expect(e.env.openFile).toHaveBeenLastCalledWith(alpha.id);
    e.key('F5');
    expect(e.session.status()).toBe('2 object(s). Refreshed.');
    e.key('NavigationUp');
    expect(e.surface().target.folder).toBe('root');
    e.key('NavigationBack');
    expect(e.surface().target.folder).toBe('notes');
    e.key('NavigationForward');
    expect(e.surface().target.folder).toBe('root');
  });

  it('offers read-only properties through the context menu and blocks underlying shortcuts', () => {
    const e = explorer();
    e.click(20, 68);
    e.key('Enter');
    e.frame();
    e.select('MiraHikari', true);
    e.key('Delete');
    expect(e.files.list('personal')).toHaveLength(4);
    expect(e.files.list('bin')).toHaveLength(0);
    e.key('ArrowUp');
    e.key('Enter');
    e.frame();
    expect(e.env.msg).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Properties',
        lines: expect.arrayContaining(['Type: Application shortcut', 'Target: MiraHikari']),
      }),
    );
  });

  it('copies files, moves folders and retains a session-only notice when Paste cannot persist', async () => {
    const e = explorer();
    e.go('root');
    e.select('diary.txt');
    e.key('Copy');
    e.go('notes');
    e.key('Paste');
    await vi.waitFor(() => expect(e.session.status()).not.toBe('Copying files...'));
    expect(e.files.findByName('diary.txt', 'notes')).toBeDefined();
    const created = e.files.createFolder('Project');
    if (!created.ok) throw new Error(created.error);
    e.go('root');
    e.select('Project');
    e.key('Cut');
    e.go('notes');
    e.key('Paste');
    await vi.waitFor(() => expect(e.session.status()).not.toBe('Copying files...'));
    expect(e.files.getFolder(created.folder.id)?.parent).toBe('notes');
    e.files.setClipboard('diary', 'copy');
    e.storage.setItem = () => {
      throw new Error('quota');
    };
    e.key('Paste');
    await vi.waitFor(() => expect(e.session.status()).toContain('Session only'));
    expect(e.env.msg).not.toHaveBeenCalled();
  });

  it.each(['reset', 'dispose'] as const)(
    'ignores late Move confirmation after %s and releases its surface',
    (reason) => {
      const e = explorer();
      e.go('root');
      e.select('diary.txt');
      e.command('move');
      const dialog = vi.mocked(e.env.msg).mock.calls.at(-1)![0];
      expect(dialog.title).toBe('Move File');
      if (reason === 'reset') e.files.reset();
      else e.session.dispose();
      dialog.onBtn?.(1, e.env);
      expect(e.files.list('documents', 'notes')).toHaveLength(0);
      e.session.dispose();
      expect(e.surfaces.remove).toHaveBeenCalledExactlyOnceWith('computer');
    },
  );

  it('moves a selected file through its live dialog and leaves fixed directories protected', () => {
    const e = explorer();
    e.go('root');
    e.select('Notes');
    expect(e.menuDisabled('Edit', 'rename')).toBe(true);
    expect(e.menuDisabled('Edit', 'delete')).toBe(true);
    e.select('diary.txt');
    e.command('move');
    const dialog = vi.mocked(e.env.msg).mock.calls.at(-1)![0];
    dialog.onBtn?.(1, e.env);
    expect(e.files.get('diary')?.folder).toBe('notes');
  });

  it('releases an active Rename after Reset and keeps the reset result visible', () => {
    const e = explorer();
    e.go('root');
    e.select('diary.txt');
    e.key('F2');
    e.command('reset');
    const dialog = vi.mocked(e.env.msg).mock.calls.at(-1)![0];
    dialog.onBtn?.(0, e.env);
    e.frame();
    expect(e.menuDisabled('File', 'new-folder')).toBe(false);
    expect(e.menuDisabled('View', 'back')).toBe(true);
    expect(e.session.status()).toBe(e.files.notice);
    e.type('discarded rename');
    e.key('Enter');
    expect(e.files.get('diary')?.name).toBe('diary.txt');
  });

  it('copies mounted publication files while its write commands stay disabled', () => {
    const e = explorer({
      library: {
        folders: [{ id: 'library:root', name: 'Library', readonly: true }],
        files: [
          {
            id: 'library:article',
            name: 'article.md',
            folder: 'library:root',
            content: '原文',
            readonly: true,
            deleted: false,
            source: 'personal',
            kind: 'text',
          },
        ],
      },
    });
    e.click(20, 68);
    e.key('Enter');
    e.frame();
    e.select('Library');
    e.key('Enter');
    e.frame();
    e.select('article.md');
    for (const command of ['new', 'new-folder']) expect(e.menuDisabled('File', command)).toBe(true);
    for (const command of ['rename', 'delete', 'cut'])
      expect(e.menuDisabled('Edit', command)).toBe(true);
    e.key('Copy');
    e.go('notes');
    e.key('Paste');
    expect(e.files.findByName('article.md', 'notes')).toMatchObject({
      readonly: false,
      content: '原文',
    });
    expect(e.files.get('library:article')).toMatchObject({ readonly: true, deleted: false });
  });
});
