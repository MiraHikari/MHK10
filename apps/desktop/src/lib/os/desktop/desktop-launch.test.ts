import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { publicLibrary } from '../../../data/public-files';
import { createRenderer, type Renderer } from '../../gfx/context';
import { canvasFixture, makeTestCanvas } from '../../gfx/canvas-fixture';
import { createFrameEffects, type FrameEffects } from '../../gfx/fx';
import { createInputController, type InputController } from '../../ui/canvas/input';
import { createWidgetScope, type WidgetScope } from '../../ui/canvas/widgets';
import type { AppServices, AppSession, CanvasApp, HtmlApp, MsgSpec } from '../host/app-contracts';
import { createFileAssociationStore } from '../files/file-associations';
import { createFileSystem, type FileSystem } from '../files/filesystem';
import { WM } from '../windows/wm';
import { createWindowSessions, type WindowSessions } from '../windows/window-sessions';
import { DEFAULT_SETTINGS } from './desktop-settings';
import { createDesktopLauncher, type DesktopLauncher } from './desktop-launch';

let draw: Renderer;
let input: InputController;
let widgets: WidgetScope;
let effects: FrameEffects;
let wm: WM;
let sessions: WindowSessions;
let files: FileSystem;
let launcher: DesktopLauncher;
let disposed = false;
let recent: readonly string[] = [];
const assigned: string[] = [];
const messages: MsgSpec[] = [];
let acceptClose = true;
let requestClose = async () => acceptClose;

const session = (): AppSession => ({
  frame() {},
  menus: () => undefined,
  status: () => undefined,
  prepareUnload: () => true,
  requestClose: async () => true,
  flushClose: async () => true,
  dispose() {},
  closed: false,
});

const canvas = (id: string, title = id): CanvasApp => ({
  kind: 'canvas',
  id,
  title,
  w: 200,
  h: 120,
  createSession: () => session(),
});

const blog: HtmlApp = {
  kind: 'html',
  id: 'blog',
  title: 'Documents',
  html: '/blog/',
  w: 520,
  h: 300,
};

function setup(
  applications: Parameters<typeof createWindowSessions>[1] = [
    canvas('notepad'),
    canvas('computer'),
    blog,
  ],
  viewport = { width: 640, height: 360 },
) {
  disposed = false;
  recent = [];
  assigned.length = 0;
  messages.length = 0;
  acceptClose = true;
  requestClose = async () => acceptClose;
  draw = createRenderer(canvasFixture().canvas, { createCanvas: makeTestCanvas });
  input = createInputController();
  widgets = createWidgetScope(draw, input);
  effects = createFrameEffects(draw);
  wm = new WM(draw, input, widgets);
  sessions = createWindowSessions(wm, applications);
  files = createFileSystem(null, { library: publicLibrary });
  launcher = createDesktopLauncher({
    disposed: () => disposed,
    modalOpen: () => wm.wins.some((win) => win.modal && !win.minimized),
    personal: true,
    sessions,
    wm,
    files,
    associations: createFileAssociationStore(null, ['notepad', 'blog']),
    settings: () => ({ ...DEFAULT_SETTINGS, recentProgramIds: recent }),
    updateRecent: (ids) => {
      recent = ids;
    },
    width: () => viewport.width,
    height: () => viewport.height,
    requestClose: () => requestClose(),
    msg: (spec) => {
      messages.push(spec);
    },
    services: {} as AppServices,
    surface: { draw, input, effects },
    iconBounds: () => undefined,
    storedLaunchBounds: () => undefined,
    location: {
      origin: 'https://mhk10.test',
      assign: (url) => {
        assigned.push(url);
      },
    },
  });
}

afterEach(() => {
  sessions?.dispose();
  effects?.dispose();
  widgets?.dispose();
  input?.dispose();
  draw?.dispose();
});

describe('desktop launch', () => {
  it('cascades new windows and restores an application that is already open', () => {
    setup([canvas('notepad'), canvas('calculator')]);
    expect(launcher.openApp('notepad')).toEqual({ accepted: true });
    expect(launcher.openApp('calculator')).toEqual({ accepted: true });
    expect(wm.byId('notepad')).toMatchObject({ x: 50, y: 8 });
    expect(wm.byId('calculator')).toMatchObject({ x: 152, y: 32 });
    expect(launcher.openApp('notepad')).toEqual({ accepted: true });
    expect(wm.wins.map((win) => win.id)).toEqual(['calculator', 'notepad']);
    expect(recent).toEqual(['notepad', 'calculator']);
  });

  it('navigates to a catalog route once, and retries after closing is refused', async () => {
    setup([]);
    acceptClose = false;
    expect(launcher.openApp('gallery')).toEqual({ accepted: true });
    expect(launcher.openApp('gallery')).toEqual({ accepted: false, reason: 'blocked' });
    await Promise.resolve();
    expect(assigned).toEqual([]);
    acceptClose = true;
    expect(launcher.openApp('gallery')).toEqual({ accepted: true });
    await Promise.resolve();
    expect(assigned).toEqual(['/gallery/']);
    expect(launcher.openApp('missing-application')).toEqual({
      accepted: false,
      reason: 'unknown-app',
    });
  });

  it('opens the Reader with more room when the workspace allows it', () => {
    setup(undefined, { width: 1024, height: 720 });
    expect(launcher.openApp('blog')).toEqual({ accepted: true });
    expect(wm.byId('blog')).toMatchObject({ w: 640, h: 400 });
  });

  it('opens a folder in My Computer and hands the folder over once', () => {
    setup();
    const folder = files.createFolder('Pack', 'desktop');
    expect(folder.ok).toBe(true);
    if (!folder.ok) return;
    expect(launcher.openFile(folder.folder.id)).toEqual({ accepted: true });
    expect(wm.byId('computer')).toBeTruthy();
    expect(launcher.takeFolder('computer')).toBe(folder.folder.id);
    expect(launcher.takeFolder('computer')).toBeUndefined();
    expect(launcher.takeFolder('notepad')).toBeUndefined();
  });

  it('settles rejected or late route closes without navigating a disposed desktop', async () => {
    setup([]);
    requestClose = vi.fn().mockRejectedValueOnce(new Error('close failed')).mockResolvedValue(true);
    launcher.openApp('gallery');
    await Promise.resolve();
    await Promise.resolve();
    expect(assigned).toEqual([]);
    expect(recent).toEqual([]);
    expect(launcher.openApp('gallery')).toEqual({ accepted: true });
    await Promise.resolve();
    expect(assigned).toEqual(['/gallery/']);

    const close = Promise.withResolvers<boolean>();
    requestClose = () => close.promise;
    launcher.openApp('gallery');
    disposed = true;
    close.resolve(true);
    await close.promise;
    expect(assigned).toEqual(['/gallery/']);
  });

  it('clears failed and released folder handoffs', () => {
    let failing = true;
    setup([
      {
        ...canvas('computer'),
        createSession: () => {
          if (failing) throw new Error('mount failed');
          return session();
        },
      },
    ]);
    const folder = files.createFolder('Pack', 'desktop');
    if (!folder.ok) throw new Error('missing folder');
    launcher.openFile(folder.folder.id);
    expect(launcher.takeFolder('computer')).toBeUndefined();
    failing = false;
    launcher.openFile(folder.folder.id);
    launcher.release('computer');
    expect(launcher.takeFolder('computer')).toBeUndefined();
  });

  it('uses a published reader href and a private file query on separate instances', () => {
    setup();
    expect(launcher.openFile('library:article:colophon')).toEqual({ accepted: true });
    expect(sessions.htmlUrl('blog')).toBe('/blog/colophon/');
    const notes = files.createText('Notes.txt', 'draft');
    expect(notes.ok).toBe(true);
    if (!notes.file) return;
    expect(launcher.openFile(notes.file.id, 'blog')).toEqual({ accepted: true });
    const href = new URL('/blog/', 'https://mhk10.test');
    href.searchParams.set('file', notes.file.id);
    expect(sessions.htmlUrl(`blog:file:${notes.file.id}`)).toBe(href.pathname + href.search);
  });

  it('asks which application should open an unassociated text file', () => {
    setup();
    const notes = files.createText('README', 'draft');
    if (!notes.file) throw new Error('missing file');
    expect(launcher.openFile(notes.file.id)).toEqual({ accepted: true });
    expect(wm.wins.map((win) => win.appId)).not.toContain('notepad');
    expect(messages[0]?.title).toBe('Open With');
    messages[0]?.onBtn?.(0, {} as AppServices, false);
    expect(wm.byId(`notepad:file:${notes.file.id}`)).toBeTruthy();
  });

  it('refuses work while a modal is open or the desktop is disposed', () => {
    setup();
    sessions.open(
      { id: 'dialog', appId: '$msg', title: 'Dialog', x: 0, y: 0, w: 80, h: 40, modal: true },
      { message: { title: 'Dialog', lines: ['Wait'] } },
    );
    const notes = files.createText('Notes.txt', 'draft');
    if (!notes.file) throw new Error('missing file');
    expect(launcher.openFile(notes.file.id)).toEqual({ accepted: false, reason: 'blocked' });
    expect(launcher.openApp('notepad')).toEqual({ accepted: false, reason: 'blocked' });
    expect(launcher.openApp('gallery')).toEqual({ accepted: false, reason: 'blocked' });
    disposed = true;
    expect(launcher.openApp('notepad')).toEqual({ accepted: false, reason: 'unavailable' });
  });
});
