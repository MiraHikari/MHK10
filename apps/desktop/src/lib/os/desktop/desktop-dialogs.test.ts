import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import type { AppFrameRequest, AppServices } from '../host/app-contracts';
import { createInputController } from '../../ui/canvas/input';
import { createFileSystem, type FileStorage } from '../files/filesystem';
import { createRenderer } from '../../gfx/context';
import { createFrameEffects } from '../../gfx/fx';
import { canvasFixture, makeTestCanvas } from '../../gfx/canvas-fixture';
import {
  DEFAULT_SETTINGS,
  type DesktopCapabilities,
  type DesktopSettings,
} from './desktop-settings';
import { createFindDialog, createRunDialog } from './desktop-dialogs';

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((dispose) => dispose());
});

function harness(
  app: ReturnType<typeof createRunDialog>,
  options: { settings?: DesktopSettings; files?: AppServices['files'] } = {},
) {
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
  let settings = options.settings ?? { ...DEFAULT_SETTINGS };
  const desktop = {
    getSettings: () => settings,
    updateSettings(patch: Partial<DesktopSettings>) {
      settings = { ...settings, ...patch };
    },
    setPixelWallpaper: () => {},
    printDocument: () => {},
    previewSaver: () => {},
  } as DesktopCapabilities;
  const files = options.files ?? createFileSystem(storage);
  const input = createInputController();
  const draw = createRenderer(canvasFixture().canvas, { createCanvas: makeTestCanvas });
  const renderedText = vi.spyOn(draw, 'text');
  const effects = createFrameEffects(draw);
  let time = 0;
  const env = {
    files,
    desktop,
    now: () => time,
    open: vi.fn(() => ({ accepted: true as const })),
    openFile: vi.fn(() => ({ accepted: true as const })),
    close: vi.fn(),
    play: vi.fn(),
    setTitle: vi.fn(),
    msg: vi.fn(),
  } as unknown as AppServices;
  const boot = () => {
    const session = app.createSession(env, { draw, input, effects, owner: app.id });
    const view: Omit<AppFrameRequest, 't' | 'dt'> = {
      win: { id: app.id, menu: { open: -1 } },
      client: { x: 0, y: 0, w: app.w - 6, h: app.h - 25 },
      menuSel: null,
      focused: true,
      pointerIn: true,
    };
    const frame = () => {
      time += 0.05;
      input.beginFrame(time);
      input.setGate(app.id);
      session.frame({ ...view, t: time, dt: 0.05 });
    };
    const key = (key: string, extra: { typed?: string } = {}) => {
      input.queueInput({ key, ...extra });
      frame();
    };
    const click = (x: number, y: number) => {
      input.queueInput({ px: x, py: y, down: true });
      frame();
      input.queueInput({ down: false });
      frame();
    };
    frame();
    return { session, frame, key, click };
  };
  cleanups.push(() => {
    effects.dispose();
    draw.dispose();
    input.dispose();
  });
  return { env, boot, renderedText, readSettings: () => settings };
}

describe('Run history', () => {
  const apps = [
    { id: 'notepad', title: 'Notepad' },
    { id: 'mines', title: 'Minesweeper' },
  ];
  it('shows commands passed into the dialog ahead of stored settings', () => {
    const passed = harness(createRunDialog(apps, ['notepad', 'mines']), {
      settings: { ...DEFAULT_SETTINGS, recentRunCommands: ['solitaire'] },
    });
    const session = passed.boot();
    const drawn = passed.renderedText.mock.calls.map((call) => call[0]);
    expect(drawn).toContain('notepad');
    expect(drawn).toContain('mines');
    expect(drawn).not.toContain('solitaire');
    session.session.dispose();
  });
  it('remembers a successful command and leaves the next Run field empty', () => {
    const dialog = harness(createRunDialog(apps));
    const first = dialog.boot();
    first.key('Enter', { typed: 'notepad' });
    expect(dialog.env.open).toHaveBeenCalledExactlyOnceWith('notepad');
    expect(dialog.readSettings().recentRunCommands).toEqual(['notepad']);
    expect(dialog.readSettings().recentProgramIds).toEqual(['notepad']);
    first.session.dispose();
    dialog.renderedText.mockClear();
    vi.mocked(dialog.env.open).mockClear();
    const second = dialog.boot();
    expect(dialog.renderedText.mock.calls.map((call) => call[0])).toContain('notepad');
    second.key('Enter');
    expect(dialog.env.open).not.toHaveBeenCalled();
    expect(dialog.env.close).toHaveBeenCalledTimes(1);
    second.session.dispose();
  });
});

describe('Find dialog', () => {
  function publication(readText: (id: string) => Promise<string | undefined>) {
    return createFileSystem(null, {
      library: {
        folders: [{ id: 'library:articles', name: 'Articles', readonly: true }],
        files: [
          {
            id: 'publication',
            name: 'Article.md',
            content: '',
            folder: 'library:articles',
            source: 'personal',
            readonly: true,
            deleted: false,
            kind: 'text',
          },
        ],
        readText,
      },
    });
  }

  it('loads publication text only for a document query and finds words absent from the filename', async () => {
    const body = Promise.withResolvers<string>();
    const read = vi.fn(() => body.promise);
    const files = publication(read);
    const dialog = harness(createFindDialog([]), { files });
    const session = dialog.boot();
    expect(read).not.toHaveBeenCalled();
    session.click(126, 10);
    expect(read).not.toHaveBeenCalled();
    session.key('n', { typed: 'unique-needle' });
    expect(dialog.renderedText.mock.calls.map(([value]) => value)).toContain(
      'Searching documents...',
    );
    expect(dialog.renderedText.mock.calls.map(([value]) => value)).not.toContain(
      'No matching documents.',
    );
    body.resolve('Complete authored body with UNIQUE-NEEDLE inside.');
    await vi.waitFor(() => {
      dialog.renderedText.mockClear();
      session.frame();
      expect(dialog.renderedText.mock.calls.map(([value]) => value)).toContain(
        '1 document(s) found.',
      );
    });
    session.key('Enter');
    expect(dialog.env.openFile).toHaveBeenCalledExactlyOnceWith('publication');
    expect(files.get('publication')?.content).toContain('Complete authored body');
    expect(read).toHaveBeenCalledOnce();
    session.session.dispose();
  });

  it('keeps a failed query available and retries without claiming there are no matches', async () => {
    let unavailable = true;
    const read = vi.fn(async () => (unavailable ? undefined : 'Complete body with unique-needle.'));
    const dialog = harness(createFindDialog([]), { files: publication(read) });
    const session = dialog.boot();
    session.click(126, 10);
    session.key('n', { typed: 'unique-needle' });
    await vi.waitFor(() => {
      dialog.renderedText.mockClear();
      session.frame();
      const text = dialog.renderedText.mock.calls.map(([value]) => value);
      expect(text).toContain('Search could not finish.');
      expect(text).toContain('unique-needle');
      expect(text).not.toContain('No matching documents.');
    });
    session.key('Enter');
    expect(dialog.env.openFile).not.toHaveBeenCalled();
    unavailable = false;
    session.click(100, 198);
    await vi.waitFor(() => {
      dialog.renderedText.mockClear();
      session.frame();
      const text = dialog.renderedText.mock.calls.map(([value]) => value);
      expect(text).toContain('1 document(s) found.');
      expect(text).toContain('unique-needle');
    });
    expect(read).toHaveBeenCalledTimes(2);
    session.key('Enter');
    expect(dialog.env.openFile).toHaveBeenCalledExactlyOnceWith('publication');
    session.session.dispose();
  });

  it('uses the latest accepted query after the shared publication load finishes', async () => {
    const body = Promise.withResolvers<string>();
    const dialog = harness(createFindDialog([]), { files: publication(() => body.promise) });
    const session = dialog.boot();
    session.click(126, 10);
    session.key('n', { typed: 'unique-needle' });
    session.key('SelectAll');
    session.key('x', { typed: 'latest-query' });
    body.resolve('Only unique-needle matches this body.');
    await vi.waitFor(() => {
      dialog.renderedText.mockClear();
      session.frame();
      const text = dialog.renderedText.mock.calls.map(([value]) => value);
      expect(text).toContain('0 document(s) found.');
      expect(text).toContain('latest-query');
      expect(text).not.toContain('Article.md');
    });
    session.key('Enter');
    expect(dialog.env.openFile).not.toHaveBeenCalled();
    session.session.dispose();
  });

  it('cancels a pending search when its caller closes the session', async () => {
    const body = Promise.withResolvers<string>();
    const files = publication(() => body.promise);
    const dialog = harness(createFindDialog([]), { files });
    const session = dialog.boot();
    session.click(126, 10);
    session.key('n', { typed: 'unique-needle' });
    const close = session.session.requestClose();
    session.frame();
    expect(await close).toBe(true);
    expect(session.session.closed).toBe(true);
    body.resolve('Late body with unique-needle.');
    await vi.waitFor(() => expect(files.get('publication')?.content).toContain('Late body'));
    dialog.renderedText.mockClear();
    session.frame();
    expect(dialog.renderedText).not.toHaveBeenCalled();
    expect(dialog.env.openFile).not.toHaveBeenCalled();
  });
  it('moves through programs with the list keys and opens the selected id', () => {
    const dialog = harness(
      createFindDialog([
        { id: 'notepad', title: 'Notepad' },
        { id: 'mines', title: 'Minesweeper' },
        { id: '$run', title: 'Run' },
      ]),
    );
    const session = dialog.boot();
    expect(dialog.renderedText.mock.calls.map((call) => call[0])).toContain('2 program(s) found.');
    expect(dialog.renderedText.mock.calls.map((call) => call[0])).not.toContain('Run');
    session.key('ArrowDown');
    session.key('Enter');
    expect(dialog.env.open).toHaveBeenCalledExactlyOnceWith('mines');
    expect(dialog.env.openFile).not.toHaveBeenCalled();
    session.session.dispose();
  });
  it('searches document text and opens the file id', () => {
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
    const files = createFileSystem(storage);
    const note = files.createText('notes.txt', 'unique-needle-text').file!;
    const dialog = harness(createFindDialog([{ id: 'notepad', title: 'Notepad' }]), { files });
    const session = dialog.boot();
    session.click(126, 10);
    session.key('n', { typed: 'unique-needle' });
    expect(dialog.renderedText.mock.calls.map((call) => call[0])).toContain('notes.txt');
    session.key('Enter');
    expect(dialog.env.openFile).toHaveBeenCalledExactlyOnceWith(note.id);
    expect(dialog.env.open).not.toHaveBeenCalledWith('unique-needle-text');
    expect(dialog.env.open).not.toHaveBeenCalledWith('killswitch');
    expect(files.get(note.id)?.content).toBe('unique-needle-text');
    session.session.dispose();
  });
});
