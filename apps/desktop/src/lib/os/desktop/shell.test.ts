import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { createShell } from './shell';
import { createBrowserRuntime } from '../host/browser-runtime';
import { defineCanvasApp } from '../host/app-session';
import type { Application, CanvasApp, AppServices, AppFrame } from '../host/app-contracts';
import type { HtmlWindowView } from '../windows/html-windows';
import type { SaveTextRequest, SaveTextResult } from '../files/save-request';
import type { InputController, RawInput } from '../../ui/canvas/input';
import { canvasFixture, makeTestCanvas } from '../../gfx/canvas-fixture';
import { taskManagerApp } from '../../apps/task-manager/task-manager.app';
import { claimSurface } from '../../ui/browser/lifetime';

const { mountedInputs } = vi.hoisted(() => ({
  mountedInputs: new WeakMap<HTMLCanvasElement, InputController>(),
}));
const { htmlFrames } = vi.hoisted(() => ({
  htmlFrames: new WeakMap<HTMLCanvasElement, readonly HtmlWindowView[]>(),
}));
vi.mock('../host/screen', () => ({
  mountDesktop: (canvas: HTMLCanvasElement, input: InputController) => {
    mountedInputs.set(canvas, input);
    return () => mountedInputs.delete(canvas);
  },
}));
vi.mock('../host/monitor', () => ({ mountMonitor: () => ({ refresh() {}, dispose() {} }) }));
vi.mock('../host/browser-fonts', () => ({ prepareFonts: async () => true }));
vi.mock('../../ui/browser/pointer-layer', () => ({
  createPointerLayer: () => ({ draw() {}, dispose() {} }),
}));
vi.mock('../windows/html-windows', () => ({
  createHtmlWindows: (canvas: HTMLCanvasElement) => ({
    sync: (views: readonly HtmlWindowView[]) => htmlFrames.set(canvas, views),
    containsPointer: () => false,
    cursorKind: () => 'arrow',
    overChildFrame: () => false,
    prepareClose: () => {},
    dispose: () => htmlFrames.delete(canvas),
  }),
}));
const shells: ReturnType<typeof createShell>[] = [];
let defaultSurface: ReturnType<typeof browserSurface>;
function desktop(
  applications: Application[],
  saveDialog?: Parameters<typeof createShell>[2]['saveDialog'],
  canvas = defaultSurface.canvas,
) {
  const runtime = createBrowserRuntime();
  const shell = createShell(
    applications,
    runtime,
    {
      saveDialog:
        saveDialog ??
        (() => {
          throw new Error('Unexpected save dialog');
        }),
    },
    canvas,
  );
  shells.push(shell);
  return shell;
}
function editor(overrides: Partial<CanvasApp> = {}): CanvasApp {
  return {
    ...defineCanvasApp({
      id: 'notepad',
      title: 'Editor',
      w: 300,
      h: 200,
      create: () => ({}),
      draw: () => {},
    }),
    ...overrides,
  };
}

/** Supply browser resources while keeping Shell, WM, input routing and sessions real. */
function createSurfaceCanvas() {
  const attributes = new Map<string, string>();
  const fixture = canvasFixture();
  const context = Object.assign(fixture.context, { setTransform: vi.fn(), globalAlpha: 1 });
  const canvas = Object.assign(new EventTarget(), {
    width: fixture.canvas.width,
    height: fixture.canvas.height,
    dataset: {} as Record<string, string>,
    getContext: () => context,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    getAttribute: (name: string) => attributes.get(name) ?? null,
    focus() {},
  }) as unknown as HTMLCanvasElement;
  return canvas;
}

function browserSurface() {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const canvas = createSurfaceCanvas();
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal(
    'window',
    Object.assign(new EventTarget(), {
      localStorage: storage,
      innerWidth: 1280,
      innerHeight: 900,
      devicePixelRatio: 1,
      matchMedia: () => Object.assign(new EventTarget(), { matches: true }),
    }),
  );
  vi.stubGlobal('document', {
    documentElement: { dataset: {} },
    querySelectorAll: () => [],
    createElement: () => makeTestCanvas(),
  });
  vi.stubGlobal('navigator', {
    userAgent: '',
    platform: '',
    language: 'en',
    hardwareConcurrency: 1,
  });
  vi.stubGlobal('location', { origin: 'https://mhk10.test' });
  const frames = new Map<number, FrameRequestCallback>();
  let requestId = 0;
  let now = performance.now();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++requestId, callback);
    return requestId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  return {
    canvas,
    errors,
    queue(event: RawInput, target = canvas) {
      const controller = mountedInputs.get(target);
      if (!controller) throw new Error('Surface input is not mounted');
      controller.queueInput(event);
    },
    async tick(expectedSurfaces = 1, options: { allowErrors?: boolean } = {}) {
      expect(frames.size).toBe(expectedSurfaces);
      const pending = [...frames.values()];
      frames.clear();
      now += 16;
      pending.forEach((callback) => callback(now));
      // Session decisions and the host's removal callbacks settle after the frame.
      for (let index = 0; index < 4; index++) await Promise.resolve();
      if (!options.allowErrors) expect(errors).not.toHaveBeenCalled();
    },
  };
}

beforeEach(() => {
  defaultSurface = browserSurface();
});
afterEach(() => {
  for (const shell of shells.splice(0)) shell.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('desktop session creation and closing', () => {
  it('parks a static client, then wakes it for input and an asynchronous result', async () => {
    let current!: AppServices;
    const draw = vi.fn();
    const app = defineCanvasApp({
      id: 'calculator',
      title: 'Static client',
      w: 200,
      h: 100,
      create(env) {
        current = env;
        return null;
      },
      draw,
      needsFrame: () => false,
    });
    const shell = desktop([app]);
    shell.env.desktop!.updateSettings({
      startupAnimation: 'never',
      hasVisited: true,
      welcome: false,
      welcomeCompleted: true,
      showAssistant: false,
      reducedMotion: true,
    });
    shell.env.open('calculator');
    await shell.mount();
    for (let count = 0; count < 4; count++) await defaultSurface.tick();
    const settled = draw.mock.calls.length;
    expect(settled).toBeGreaterThan(0);
    for (let count = 0; count < 6; count++) await defaultSurface.tick();
    expect(draw).toHaveBeenCalledTimes(settled);
    defaultSurface.queue({ typed: 'input' });
    await defaultSurface.tick();
    await defaultSurface.tick();
    const afterInput = draw.mock.calls.length;
    expect(afterInput).toBeGreaterThan(settled);
    await defaultSurface.tick();
    expect(draw).toHaveBeenCalledTimes(afterInput);
    current.invalidate();
    await defaultSurface.tick();
    expect(draw).toHaveBeenCalledTimes(afterInput + 1);
  });
  it('releases the canvas when initialization fails immediately after claiming it', async () => {
    const canvas = defaultSurface.canvas;
    canvas.setAttribute = () => {
      throw new Error('Cannot initialize canvas');
    };
    const shell = desktop([]);
    await expect(shell.mount(canvas)).rejects.toThrow('Cannot initialize canvas');
    const release = claimSurface(canvas);
    release();
    release();
    expect(shell.env.open('notepad')).toEqual({ accepted: false, reason: 'unavailable' });
  });

  it('does not release a different host when a duplicate canvas claim fails', async () => {
    const canvas = defaultSurface.canvas;
    const release = claimSurface(canvas);
    try {
      await expect(desktop([]).mount(canvas)).rejects.toThrow('already has an active session');
      expect(() => claimSurface(canvas)).toThrow('already has an active session');
    } finally {
      release();
    }
  });

  it('rolls back a failed application and retries its real session factory', () => {
    const app = editor();
    const createSession = vi.fn(app.createSession).mockImplementationOnce(() => {
      throw new Error('Initialization failed');
    });
    const shell = desktop([editor({ createSession })]);
    expect(shell.env.open('notepad')).toEqual({ accepted: false, reason: 'unavailable' });
    expect(shell.env.processes?.()).toEqual([]);
    expect(shell.env.open('notepad')).toEqual({ accepted: true });
    expect(createSession).toHaveBeenCalledTimes(2);
    expect(shell.env.processes?.()).toEqual([
      { id: 'notepad', appId: 'notepad', title: 'Editor', focused: true, minimized: false },
    ]);
  });

  it('keeps the previous application focused when a new session fails', () => {
    const shell = desktop([
      editor(),
      editor({
        id: 'calculator',
        createSession: () => {
          throw new Error('Unavailable');
        },
      }),
    ]);
    shell.env.open('notepad');
    expect(shell.env.open('calculator')).toEqual({ accepted: false, reason: 'unavailable' });
    expect(shell.env.processes?.().map(({ id, focused }) => ({ id, focused }))).toEqual([
      { id: 'notepad', focused: true },
    ]);
  });

  it('releases a session returned after its host was disposed during construction', () => {
    const dispose = vi.fn();
    const app = editor();
    const shell = desktop([
      editor({
        createSession: (env, surface) => {
          shell.dispose();
          const session = app.createSession(env, surface);
          return {
            ...session,
            dispose: () => {
              session.dispose();
              dispose();
            },
          };
        },
      }),
    ]);
    expect(shell.env.open('notepad')).toEqual({ accepted: false, reason: 'unavailable' });
    expect(shell.env.processes?.()).toEqual([]);
    expect(dispose).toHaveBeenCalledOnce();
    shell.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('finishes rollback even if the newly created session cannot release a resource', () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = editor();
    const shell = desktop([
      editor({
        createSession: (env, surface) => {
          shell.dispose();
          const session = app.createSession(env, surface);
          return {
            ...session,
            dispose: () => {
              session.dispose();
              throw new Error('Cleanup failed');
            },
          };
        },
      }),
    ]);
    try {
      expect(shell.env.open('notepad')).toEqual({ accepted: false, reason: 'unavailable' });
      expect(shell.env.processes?.()).toEqual([]);
      expect(report).toHaveBeenCalledOnce();
    } finally {
      report.mockRestore();
    }
  });

  it('rejects opening applications while disposal reenters the host', () => {
    const opening: ReturnType<AppServices['open']>[] = [];
    const createOther = vi.fn(() => null);
    const dispose = vi.fn((_state: null, env: AppServices) => {
      opening.push(env.open('calculator'));
      shell.dispose();
      opening.push(env.open('notepad'));
    });
    const shell = desktop([
      defineCanvasApp({
        id: 'notepad',
        title: 'Editor',
        w: 300,
        h: 200,
        create: () => null,
        draw: () => {},
        dispose,
      }),
      defineCanvasApp({
        id: 'calculator',
        title: 'Calculator',
        w: 200,
        h: 200,
        create: createOther,
        draw: () => {},
      }),
    ]);
    expect(shell.env.open('notepad')).toEqual({ accepted: true });
    shell.dispose();
    shell.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    expect(opening).toEqual([
      { accepted: false, reason: 'unavailable' },
      { accepted: false, reason: 'unavailable' },
    ]);
    expect(createOther).not.toHaveBeenCalled();
    expect(shell.env.processes?.()).toEqual([]);
  });

  it('settles a failed Save As factory and allows the next save dialog to open', async () => {
    let attempt = 0;
    const shell = desktop([], (_request, complete) => {
      const app = editor({
        id: '$save',
        createSession: (env, surface) => {
          if (++attempt === 1) throw new Error('Cannot create the picker');
          complete({ status: 'cancelled' });
          return editor().createSession(env, surface);
        },
      });
      return app;
    });
    expect(await shell.env.saveText({ name: 'a.txt', content: 'draft' })).toMatchObject({
      status: 'failed',
    });
    expect(shell.env.processes?.()).toEqual([]);
    expect(await shell.env.saveText({ name: 'a.txt', content: 'draft' })).toEqual({
      status: 'cancelled',
    });
    expect(attempt).toBe(2);
  });

  it('processes accepted input and saving before removing a closing window', async () => {
    const surface = defaultSurface;
    const firstSave = Promise.withResolvers<SaveTextResult>();
    const secondSave = Promise.withResolvers<SaveTextResult>();
    const pendingSaves = [firstSave, secondSave];
    const requests: SaveTextRequest[] = [];
    const order: string[] = [];
    const onClose = vi.fn(() => {
      order.push('close');
      return true;
    });
    const dispose = vi.fn(() => order.push('dispose'));
    const definition = defineCanvasApp({
      id: 'notepad',
      title: 'Editor',
      w: 300,
      h: 200,
      create: () => ({ text: '' }),
      draw: (state: { text: string }, view: AppFrame, env: AppServices) => {
        if (!view.focused || !view.input.io.typed) return;
        state.text += view.input.io.typed;
        order.push(state.text);
        void env.saveText({ name: 'draft.txt', content: state.text }).then((result) => {
          order.push(result.status);
        });
      },
      onClose,
      dispose,
    });
    const shell = desktop([definition], (request, complete) => {
      requests.push(request);
      const saving = pendingSaves.shift();
      if (!saving) throw new Error('Unexpected save');
      return defineCanvasApp({
        id: '$test-save',
        title: 'Save As',
        w: 200,
        h: 100,
        modal: true,
        create: (env) => {
          void saving.promise.then((result) => {
            complete(result);
            env.close('$test-save');
          });
          return null;
        },
        draw: () => {},
      });
    });
    shell.env.desktop?.updateSettings({
      startupAnimation: 'never',
      welcome: false,
      showAssistant: false,
      reducedMotion: true,
    });
    await shell.mount(surface.canvas);
    expect(shell.phase).toBe('desktop');
    shell.env.open('notepad');
    surface.queue({ typed: 'accepted input' });
    const firstClose = shell.requestClose();
    const repeatedFirstClose = shell.requestClose();
    await surface.tick();
    expect(order).toEqual(['accepted input']);
    expect(requests).toEqual([{ name: 'draft.txt', content: 'accepted input' }]);
    expect(shell.env.processes?.().map(({ id }) => id)).toEqual(['notepad', '$test-save']);
    expect(onClose).not.toHaveBeenCalled();
    firstSave.resolve({ status: 'failed', error: 'Disk full' });
    await expect(firstClose).resolves.toBe(false);
    await expect(repeatedFirstClose).resolves.toBe(false);
    await surface.tick();
    expect(shell.env.processes?.().map(({ id }) => id)).toEqual(['notepad']);
    expect(order).toEqual(['accepted input', 'failed']);
    expect(dispose).not.toHaveBeenCalled();

    surface.queue({ typed: ' after failure' });
    const successfulClose = shell.requestClose();
    const repeatedSuccessfulClose = shell.requestClose();
    await surface.tick();
    expect(requests.at(-1)).toEqual({ name: 'draft.txt', content: 'accepted input after failure' });
    expect(onClose).not.toHaveBeenCalled();
    const saved = shell.env.files.createText('draft.txt', 'accepted input after failure');
    expect(saved).toMatchObject({ ok: true, persisted: true });
    if (!saved.file) throw new Error('The fixture could not save the document');
    secondSave.resolve({ status: 'saved', file: saved.file, persisted: saved.persisted });
    await expect(successfulClose).resolves.toBe(true);
    await expect(repeatedSuccessfulClose).resolves.toBe(true);
    await surface.tick();
    expect(order).toEqual([
      'accepted input',
      'failed',
      'accepted input after failure',
      'saved',
      'close',
      'dispose',
    ]);
    expect(shell.env.processes?.()).toEqual([]);
    expect(onClose).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    shell.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });
});

const readyPreferences = {
  startupAnimation: 'never' as const,
  welcome: false,
  showAssistant: false,
  reducedMotion: true,
};

function savingEditor(id: string, x = 50, y = 40) {
  return defineCanvasApp({
    id,
    title: id,
    x,
    y,
    w: 300,
    h: 200,
    create: () => ({ text: '' }),
    draw(state, current) {
      if (current.focused) state.text += current.input.consumeText();
    },
    onClose(state, services) {
      return services.files.createText(`${id}.txt`, state.text).persisted;
    },
  });
}

describe('composed desktop owners', () => {
  it.each(['show-desktop', 'minimize'] as const)(
    'saves accepted text before %s hides its client',
    async (command) => {
      const surface = defaultSurface;
      const shell = desktop([savingEditor('calculator'), savingEditor('notepad')]);
      shell.env.desktop?.updateSettings(readyPreferences);
      await shell.mount(surface.canvas);
      shell.env.open('calculator');
      shell.env.open('notepad');
      await surface.tick();
      surface.queue({ typed: 'last accepted text' });
      if (command === 'show-desktop') surface.queue({ key: 'ShowDesktop' });
      else {
        surface.queue({ px: 300, py: 50, down: true });
        surface.queue({ down: false });
      }
      await surface.tick();
      expect(shell.env.processes?.().find((process) => process.id === 'notepad')?.minimized).toBe(
        true,
      );
      const closing = shell.requestClose();
      await surface.tick();
      await surface.tick();
      expect(await closing).toBe(true);
      expect(
        shell.env.files.list('documents').find((file) => file.name === 'notepad.txt')?.content,
      ).toBe('last accepted text');
      expect(
        shell.env.files.list('documents').find((file) => file.name === 'calculator.txt')?.content,
      ).toBe('');
    },
  );

  it('routes same-frame text to the client focused by a normal pointer click', async () => {
    const surface = defaultSurface;
    const shell = desktop([savingEditor('calculator'), savingEditor('notepad', 250, 70)]);
    shell.env.desktop?.updateSettings(readyPreferences);
    await shell.mount(surface.canvas);
    shell.env.open('calculator');
    shell.env.open('notepad');
    await surface.tick();
    surface.queue({ px: 100, py: 100, down: true });
    surface.queue({ down: false });
    surface.queue({ typed: 'new focus' });
    await surface.tick();
    expect(shell.env.processes?.().find((process) => process.id === 'calculator')?.focused).toBe(
      true,
    );
    const closing = shell.requestClose();
    await surface.tick();
    await surface.tick();
    expect(await closing).toBe(true);
    expect(
      shell.env.files.list('documents').find((file) => file.name === 'calculator.txt')?.content,
    ).toBe('new focus');
    expect(
      shell.env.files.list('documents').find((file) => file.name === 'notepad.txt')?.content,
    ).toBe('');
  });

  it.each(['system-menu', 'modal'] as const)(
    'does not deliver keyboard input blocked by an active %s',
    async (blocker) => {
      const surface = defaultSurface;
      const shell = desktop([savingEditor('notepad')]);
      shell.env.desktop?.updateSettings(readyPreferences);
      await shell.mount(surface.canvas);
      shell.env.open('notepad');
      await surface.tick();
      if (blocker === 'modal') shell.env.msg({ title: 'Modal', lines: ['Blocked'] });
      else surface.queue({ key: 'SystemMenu' });
      surface.queue({ typed: 'blocked input' });
      await surface.tick();
      const closing = shell.requestClose();
      await surface.tick();
      expect(await closing).toBe(true);
      expect(
        shell.env.files.list('documents').find((file) => file.name === 'notepad.txt')?.content,
      ).toBe('');
    },
  );

  it('reopens Run with a fresh field and never shares typed input between two canvases', async () => {
    const surface = defaultSurface;
    const otherCanvas = createSurfaceCanvas();
    const first = desktop([editor()]);
    const second = desktop([editor()], undefined, otherCanvas);
    first.env.desktop?.updateSettings(readyPreferences);
    second.env.desktop?.updateSettings(readyPreferences);
    await first.mount();
    await second.mount();
    first.env.open('$run');
    second.env.open('$run');
    await surface.tick(2);
    surface.queue({ typed: 'notepad', key: 'Enter' });
    await surface.tick(2);
    expect(first.env.processes?.().map((process) => process.id)).toEqual(['notepad']);
    expect(second.env.processes?.().map((process) => process.id)).toEqual(['$run']);
    first.env.open('$run');
    await surface.tick(2);
    surface.queue({ key: 'Enter' });
    await surface.tick(2);
    expect(first.env.processes?.().map((process) => process.id)).toContain('$run');
    first.dispose();
    surface.queue({ typed: 'notepad', key: 'Enter' }, otherCanvas);
    await surface.tick();
    expect(second.env.processes?.().map((process) => process.id)).toEqual(['notepad']);
  });

  it('keeps local Reader URLs on their own instances without mutating application metadata', async () => {
    const reader = {
      kind: 'html' as const,
      id: 'blog',
      title: 'Reader',
      w: 400,
      h: 270,
      html: '/apps/reader/',
    };
    const shell = desktop([reader]);
    shell.env.desktop?.updateSettings(readyPreferences);
    const first = shell.env.files.createText('first.md', '# First').file!;
    const second = shell.env.files.createText('second.md', '# Second').file!;
    await shell.mount();
    expect(shell.env.openFile?.(first.id, 'blog')).toEqual({ accepted: true });
    expect(shell.env.openFile?.(second.id, 'blog')).toEqual({ accepted: true });
    await defaultSurface.tick();
    const views = htmlFrames.get(defaultSurface.canvas) ?? [];
    expect(views).toHaveLength(2);
    expect(
      views.map((view) => new URL(view.href, 'https://mhk10.test').searchParams.get('file')),
    ).toEqual([first.id, second.id]);
    expect(new Set(views.map((view) => view.win.id)).size).toBe(2);
    expect(reader.html).toBe('/apps/reader/');
  });

  it('rejects a rename after the desktop item changes while its dialog remains open', async () => {
    const shell = desktop([]);
    shell.env.desktop?.updateSettings(readyPreferences);
    const folder = shell.env.files.createFolder('Original', 'desktop');
    if (!folder.ok) throw new Error(folder.error);
    expect(shell.env.files.folders('desktop').map((item) => item.name)).toEqual(['Original']);
    await shell.mount();
    await defaultSurface.tick();
    defaultSurface.queue({ key: 'Home' });
    await defaultSurface.tick();
    defaultSurface.queue({ key: 'F2' });
    await defaultSurface.tick();
    expect(shell.env.processes?.().map((process) => process.id)).toContain('$rename');
    expect(shell.env.files.renameFolder(folder.folder.id, 'Changed elsewhere').ok).toBe(true);
    const closed = vi.spyOn(shell.env, 'close');
    defaultSurface.queue({ typed: 'Candidate', key: 'Enter' });
    await defaultSurface.tick();
    expect(shell.env.files.getFolder(folder.folder.id)?.name).toBe('Changed elsewhere');
    expect(closed).not.toHaveBeenCalled();
    expect(shell.env.processes?.().map((process) => process.id)).toContain('$rename');
  });
  it('preserves repeated context navigation keys received before one frame', async () => {
    const shell = desktop([]);
    shell.env.desktop?.updateSettings(readyPreferences);
    await shell.mount();
    defaultSurface.queue({ key: 'ContextMenu' });
    await defaultSurface.tick();
    for (const key of [
      'Home',
      'ArrowDown',
      'ArrowUp',
      'ArrowDown',
      'ArrowUp',
      'ArrowRight',
      'Enter',
    ])
      defaultSurface.queue({ key });
    await defaultSurface.tick();
    // With no application entries, Home selects Arrange Icons and its first child is By Name.
    expect(localStorage.getItem('doom95.desktop-icons.v1')).toContain('"arrangement":"name"');
  });

  it('keeps Task Manager, modal dialogs and the desktop responsive when dialogs or $run are open', async () => {
    const shell = desktop([taskManagerApp, editor()]);
    shell.env.desktop?.updateSettings(readyPreferences);
    await shell.mount();
    shell.env.open('$run');
    shell.env.open('task-manager');
    await defaultSurface.tick();
    expect(shell.env.processes?.().map((process) => process.appId)).toEqual([
      '$run',
      'task-manager',
    ]);

    // F1 opens the $msg help dialog above Task Manager; $msg is omitted from the roster and paints cleanly.
    defaultSurface.queue({ key: 'F1' });
    await defaultSurface.tick();
    expect(shell.env.processes?.().map((process) => process.appId)).toEqual([
      '$run',
      'task-manager',
    ]);
    expect(defaultSurface.canvas.getAttribute('aria-label')).toBe('MHK10 desktop — MHK10 Help');

    // Escape closes the modal dialog rather than remaining trapped behind a broken frame.
    defaultSurface.queue({ key: 'Escape' });
    await defaultSurface.tick();
    expect(defaultSurface.canvas.getAttribute('aria-label')).toBe('MHK10 desktop — Task Manager');
  });

  it('isolates a throwing application frame so modal dialogs and subsequent input still work', async () => {
    let shouldFail = true;
    const broken = defineCanvasApp({
      id: 'calculator',
      title: 'Broken',
      w: 200,
      h: 120,
      create: () => null,
      draw: () => {
        if (shouldFail) throw new Error('Simulated render failure');
      },
    });
    const shell = desktop([broken]);
    shell.env.desktop?.updateSettings(readyPreferences);
    await shell.mount();
    shell.env.open('calculator');
    await defaultSurface.tick(1, { allowErrors: true });
    expect(defaultSurface.errors).toHaveBeenCalled();

    // Open a modal dialog over the failing window and dismiss it via Escape.
    defaultSurface.errors.mockClear();
    defaultSurface.queue({ key: 'F1' });
    await defaultSurface.tick(1, { allowErrors: true });
    expect(defaultSurface.errors).toHaveBeenCalledOnce();
    defaultSurface.errors.mockClear();
    expect(defaultSurface.canvas.getAttribute('aria-label')).toBe('MHK10 desktop — MHK10 Help');
    shouldFail = false;
    defaultSurface.queue({ key: 'Escape' });
    await defaultSurface.tick();
    expect(defaultSurface.canvas.getAttribute('aria-label')).toBe('MHK10 desktop — Broken');
  });
});
