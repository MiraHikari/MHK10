import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { AppServices, AppFrame } from './app-contracts';
import { createCanvasSurfaceRuntime, type CanvasSurfaceRuntime } from './canvas-surface-runtime';
import { canvasFixture } from '../../gfx/canvas-fixture';
import { createBrowserRuntime } from './browser-runtime';
import { mountHybridUi } from '../../ui/browser/hybrid-ui';
import type { SaveTextResult } from '../files/save-request';
import type { MenuPresentation } from '../../ui/canvas/menu-types';

const fixture = vi.hoisted(() => ({
  state: { dirty: false, canUndo: false },
  draw: vi.fn(),
  close: vi.fn(),
  checkpoint: vi.fn(),
  dispose: vi.fn(),
  initializeFonts: vi.fn(),
  saveText: vi.fn(),
  releasePicker: vi.fn(),
  status: undefined as string | undefined,
  menuPresentation: undefined as MenuPresentation | undefined,
}));
vi.mock('../../apps', async () => {
  const { defineCanvasApp } = await import('./app-session');
  return {
    loadApp: async () =>
      defineCanvasApp({
        id: 'notepad',
        title: 'Test editor',
        w: 340,
        h: 250,
        create: () => fixture.state,
        menus: () => ({
          Edit: [
            {
              command: 'undo',
              label: 'Undo',
              disabled: !fixture.state.canUndo,
              ...fixture.menuPresentation,
            },
          ],
        }),
        draw: (...args: unknown[]) => fixture.draw(...args),
        onClose: () => fixture.close(),
        checkpoint: () => fixture.checkpoint(),
        status: () => fixture.status,
        dispose: () => fixture.dispose(),
      }),
  };
});
vi.mock('./canvas-surface-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./canvas-surface-runtime')>();
  const { makeTestCanvas } = await import('../../gfx/canvas-fixture');
  return {
    ...actual,
    createCanvasSurfaceRuntime: vi.fn((canvas: HTMLCanvasElement) => {
      const surface = actual.createCanvasSurfaceRuntime(canvas, { createCanvas: makeTestCanvas });
      const initialize = surface.draw.fonts.initFonts;
      vi.spyOn(surface.draw.fonts, 'initFonts').mockImplementation(() => {
        fixture.initializeFonts();
        initialize();
      });
      return surface;
    }),
  };
});
vi.mock('./screen', () => ({ mountDesktop: vi.fn(() => () => {}) }));
vi.mock('../files/dom-save-picker', () => ({
  createDomSavePicker: () => ({
    saveText: fixture.saveText,
    dispose: fixture.releasePicker,
    open: false,
  }),
}));
vi.mock('../../ui/browser/hybrid-ui', () => ({ mountHybridUi: vi.fn(() => () => {}) }));
vi.mock('./browser-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./browser-runtime')>();
  return { ...actual, createBrowserRuntime: vi.fn(actual.createBrowserRuntime) };
});

import { mountAppHost } from './app-host';

// A small EventTarget-based DOM fixture exercises the real host lifecycle and
// event handlers without requiring a browser or a DOM dependency for unit tests.
class Element extends EventTarget {
  width = 0;
  height = 0;
  classList = { add: vi.fn(), remove: vi.fn() };
  private readonly attributes = new Map<string, string>();
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
    if (name === 'aria-label') this.dataset.ariaLabel = value;
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
    if (name === 'aria-label') delete this.dataset.ariaLabel;
  }
  children: Element[] = [];
  parentElement: Element | null = null;
  dataset: Record<string, string> = {};
  style = { setProperty: vi.fn(), aspectRatio: '', cursor: '', transform: '' };
  open = false;
  hidden = false;
  disabled = false;
  private text = '';
  get textContent(): string {
    return this.text + this.children.map((child) => child.textContent).join('');
  }
  set textContent(value: string) {
    this.children.forEach((child) => {
      child.parentElement = null;
    });
    this.children = [];
    this.text = value;
  }
  clientWidth = 400;
  constructor(readonly tagName: string) {
    super();
  }
  append(...children: (Element | string)[]) {
    children.forEach((child) => {
      const node = typeof child === 'string' ? new Element('#text') : child;
      if (typeof child === 'string') node.textContent = child;
      node.parentElement = this;
      this.children.push(node);
    });
  }
  replaceChildren(...children: (Element | string)[]) {
    this.children.forEach((child) => {
      child.parentElement = null;
    });
    this.children = [];
    this.text = '';
    this.append(...children);
  }
  querySelectorAll(selector: string): Element[] {
    return this.children.flatMap((child) => [
      ...(child.tagName === selector ||
      (selector === 'details[open]' && child.tagName === 'details' && child.open)
        ? [child]
        : []),
      ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector: string): Element | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  contains(node: Element): boolean {
    return this === node || this.children.some((child) => child.contains(node));
  }
  remove() {
    if (this.parentElement)
      this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }
  focus() {
    documentFixture.activeElement = this;
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
  }
}

let root: Element;
let canvas: Element;
let menus: Element;
let dialog: Element;
let frame: FrameRequestCallback;
let hostWindow: EventTarget;
let parent: { postMessage: ReturnType<typeof vi.fn> };
let documentFixture: EventTarget & { activeElement: Element | null };
let reduced = false;
let env: AppServices;
let surface: CanvasSurfaceRuntime;
let raster: ReturnType<typeof canvasFixture>;
let mounted: Awaited<ReturnType<typeof mountAppHost>>;
function tick() {
  frame(performance.now() + 16);
}
function incoming(data: object) {
  const event = new Event('message');
  Object.assign(event, { origin: 'https://www.example.com', source: parent, data });
  hostWindow.dispatchEvent(event);
}

beforeEach(async () => {
  vi.clearAllMocks();
  fixture.dispose.mockReset();
  fixture.initializeFonts.mockReset();
  fixture.saveText.mockReset();
  fixture.status = undefined;
  fixture.menuPresentation = undefined;
  fixture.state = { dirty: false, canUndo: false };
  fixture.draw.mockImplementation((_state: unknown, _view: AppFrame, current: AppServices) => {
    env = current;
  });
  fixture.close.mockImplementation(() => {
    fixture.state.dirty = false;
  });
  fixture.checkpoint.mockImplementation(() => {
    fixture.state.dirty = false;
    return true;
  });
  reduced = false;
  root = new Element('main');
  root.dataset.app = 'notepad';
  canvas = new Element('canvas');
  raster = canvasFixture();
  Object.assign(canvas, raster.canvas);
  raster.context.canvas = canvas as unknown as HTMLCanvasElement;
  menus = new Element('nav');
  dialog = new Element('dialog');
  const stage = new Element('div');
  stage.append(canvas);
  root.append(menus, stage, dialog);
  const status = new Element('p');
  root.querySelector = (selector) =>
    ({ canvas, '[data-app-menu]': menus, '[data-app-status]': status, ':scope > dialog': dialog })[
      selector
    ] ?? null;
  documentFixture = Object.assign(new EventTarget(), {
    activeElement: canvas,
    createElement: (name: string) => new Element(name),
    fonts: Object.assign(new EventTarget(), { load: async () => [] }),
  });
  hostWindow = new EventTarget();
  parent = { postMessage: vi.fn() };
  Object.assign(hostWindow, { parent });
  vi.stubGlobal('document', documentFixture);
  vi.stubGlobal('window', hostWindow);
  vi.stubGlobal('location', { origin: 'https://www.example.com' });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return reduced;
    },
  }));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  mounted = await mountAppHost(root as unknown as HTMLElement);
  surface = vi.mocked(createCanvasSurfaceRuntime).mock.results.at(-1)!.value;
  tick();
});
afterEach(() => {
  mounted?.dispose();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('embedded application state', () => {
  it('uses the standalone client dimensions for raster effects and keeps them current when status changes', () => {
    expect([surface.draw.W, surface.draw.H]).toEqual([canvas.width, canvas.height]);
    const originalHeight = canvas.height;
    fixture.status = 'Ready';
    tick();
    expect(canvas.height).toBeLessThan(originalHeight);
    const copy = surface.effects.snap();
    expect([copy.width, copy.height]).toEqual([canvas.width, canvas.height]);
  });

  it('disposes failed frames without clearing their raster and allows a replacement mount', async () => {
    const clear = raster.context.clearRect.mock.calls.length;
    fixture.draw.mockImplementationOnce(() => {
      throw new Error('Frame failed');
    });
    expect(tick).toThrow('Frame failed');
    expect(fixture.dispose).toHaveBeenCalledOnce();
    expect(raster.context.clearRect).toHaveBeenCalledTimes(clear);
    expect(menus.querySelectorAll('details')).toHaveLength(0);
    mounted = await mountAppHost(root as unknown as HTMLElement);
    expect(menus.querySelectorAll('details')).toHaveLength(1);
  });

  it('awaits accepted saving before close and preserves a failed save for a later retry', async () => {
    let complete!: (result: SaveTextResult) => void;
    fixture.saveText.mockImplementationOnce(
      () =>
        new Promise<SaveTextResult>((resolve) => {
          complete = resolve;
        }),
    );
    fixture.draw.mockImplementation((_state: unknown, view: AppFrame, env: AppServices) => {
      const content = view.input.consumeText();
      if (content) void env.saveText({ name: 'accepted.txt', content });
    });
    surface.input.queueInput({ typed: 'last accepted input' });
    const closing = mounted!.requestClose();
    expect(mounted!.requestClose()).toBe(closing);
    tick();
    expect(fixture.saveText).toHaveBeenCalledWith({
      name: 'accepted.txt',
      content: 'last accepted input',
    });
    expect(fixture.close).not.toHaveBeenCalled();
    complete({ status: 'failed', error: 'Storage unavailable' });
    expect(await closing).toBe(false);
    expect(fixture.close).not.toHaveBeenCalled();
    expect(canvas.hidden).toBe(false);
    expect(fixture.releasePicker).not.toHaveBeenCalled();
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    const retry = mounted!.requestClose();
    tick();
    expect(await retry).toBe(true);
    expect(fixture.close).toHaveBeenCalledOnce();
    expect(fixture.releasePicker).toHaveBeenCalledOnce();
  });
  it('enables and disables Undo as state changes without replacing its button', () => {
    const button = menus.querySelector('button')!;
    expect(button.disabled).toBe(true);
    fixture.state.canUndo = true;
    tick();
    expect(menus.querySelector('button')).toBe(button);
    expect(button.disabled).toBe(false);
    fixture.state.canUndo = false;
    tick();
    expect(button.disabled).toBe(true);
  });
  it('updates check, radio and default marks on the same live command', () => {
    const button = menus.querySelector('button')!;
    fixture.state.canUndo = true;
    fixture.menuPresentation = { checked: true, radio: true, default: true };
    tick();
    expect(menus.querySelector('button')).toBe(button);
    expect(button.getAttribute('role')).toBe('menuitemradio');
    expect(button.getAttribute('aria-checked')).toBe('true');
    expect(button.dataset.menuDefault).toBe('true');
    expect(button.dataset.menuCommand).toBe('undo');
    fixture.menuPresentation = { checked: false };
    tick();
    expect(button.getAttribute('role')).toBe('menuitemcheckbox');
    expect(button.getAttribute('aria-checked')).toBe('false');
    expect(button.dataset.menuDefault).toBe('false');
    fixture.menuPresentation = undefined;
    tick();
    expect(button.getAttribute('role')).toBe('menuitem');
    expect(button.getAttribute('aria-checked')).toBeNull();
  });
  it('leaves F10 with the application and forwards Ctrl+Escape as the Start command', () => {
    parent.postMessage.mockClear();
    const menu = Object.assign(new Event('keydown', { cancelable: true }), { key: 'F10' });
    hostWindow.dispatchEvent(menu);
    expect(parent.postMessage).not.toHaveBeenCalled();
    const start = Object.assign(new Event('keydown', { cancelable: true }), {
      key: 'Escape',
      ctrlKey: true,
    });
    hostWindow.dispatchEvent(start);
    expect(start.defaultPrevented).toBe(true);
    expect(parent.postMessage).toHaveBeenCalledWith(
      { type: 'doom95:start' },
      'https://www.example.com',
    );
  });

  it('dismisses Escape without invoking the final or destructive message action', () => {
    const action = vi.fn();
    const cancelled = vi.fn();
    env.msg({
      title: 'Question',
      lines: ['Continue?'],
      buttons: ['Cancel', 'Delete'],
      onBtn: action,
      onDismiss: cancelled,
    });
    expect(dialog.open).toBe(true);
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(dialog.open).toBe(false);
    expect(action).not.toHaveBeenCalled();
    expect(cancelled).toHaveBeenCalledOnce();
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it('keeps noClose messages open when Escape is pressed', () => {
    const cancelled = vi.fn();
    env.msg({ title: 'Required', lines: [], noClose: true, onDismiss: cancelled });
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(dialog.open).toBe(true);
    expect(cancelled).not.toHaveBeenCalled();
  });

  it('returns the visible checkbox choice only when a message action is accepted', () => {
    const action = vi.fn();
    const cancelled = vi.fn();
    env.msg({
      title: 'Open With',
      lines: [],
      check: { label: 'Always use this app', checked: false },
      onBtn: action,
      onDismiss: cancelled,
    });
    const checkbox = dialog.querySelector('input') as unknown as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    dialog.querySelector('button')!.dispatchEvent(new Event('click'));
    expect(action).toHaveBeenCalledWith(0, expect.objectContaining({ msg: env.msg }), true);
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
    expect(action).toHaveBeenCalledTimes(1);
    expect(cancelled).not.toHaveBeenCalled();
  });

  it('acknowledges a parent close only after processing the next frame and saving', async () => {
    fixture.state.dirty = true;
    parent.postMessage.mockClear();
    incoming({ type: 'doom95:close', id: 'notepad' });
    expect(fixture.close).not.toHaveBeenCalled();
    tick();
    await vi.waitFor(() =>
      expect(parent.postMessage).toHaveBeenCalledWith(
        { type: 'doom95:closed', id: 'notepad' },
        'https://www.example.com',
      ),
    );
    expect(fixture.close).toHaveBeenCalledOnce();
    expect(fixture.state.dirty).toBe(false);
    expect(parent.postMessage).toHaveBeenCalledWith(
      { type: 'doom95:closed', id: 'notepad' },
      'https://www.example.com',
    );
    expect(fixture.close.mock.invocationCallOrder[0]).toBeLessThan(
      parent.postMessage.mock.invocationCallOrder[0],
    );
  });

  it('blocks closing when an application refuses and preserves its state', async () => {
    fixture.state.dirty = true;
    fixture.close.mockImplementation(() => false);
    parent.postMessage.mockClear();
    incoming({ type: 'doom95:close', id: 'notepad' });
    tick();
    await vi.waitFor(() =>
      expect(parent.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'doom95:close-blocked' }),
        'https://www.example.com',
      ),
    );
    expect(parent.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'doom95:closed' }),
      expect.anything(),
    );
    expect(dialog.open).toBe(true);
  });

  it('applies local shake and flash, and removes both when reduced motion is enabled', () => {
    fixture.draw.mockImplementation((_state: unknown, _view: AppFrame) => {
      _view.effects.FX.shake = 6;
      _view.effects.FX.flash = ['#ffffff', 0.5];
    });
    const stipple = vi.spyOn(surface.draw, 'stipple');
    raster.context.fillRect.mockClear();
    tick();
    expect(canvas.style.transform).toContain('translate');
    expect(stipple).toHaveBeenCalledTimes(1);
    reduced = true;
    raster.context.fillRect.mockClear();
    vi.mocked(stipple).mockClear();
    tick();
    expect(canvas.style.transform).toBe('');
    expect(raster.context.fillRect).toHaveBeenCalledTimes(1);
    expect(stipple).not.toHaveBeenCalled();
  });
  it('saves text queued in the same frame as a close request', async () => {
    let buffer = '';
    let saved = '';
    fixture.draw.mockImplementation(() => {
      buffer += surface.input.io.typed;
    });
    fixture.close.mockImplementation(() => {
      saved = buffer;
    });
    surface.input.queueInput({ typed: 'last character' });
    const closing = mounted!.requestClose();
    tick();
    expect(await closing).toBe(true);
    expect(saved).toBe('last character');
  });
  it('delivers accepted keyboard input after focus moves to the host text control', () => {
    documentFixture.activeElement = new Element('input');
    fixture.draw.mockClear();
    surface.input.queueInput({ key: 'SelectAll' });
    tick();
    expect(fixture.draw.mock.calls.at(-1)?.[1]).toMatchObject({ focused: true });
  });

  it('checkpoints received text before a pagehide disposes the host', () => {
    let buffer = '',
      saved = '';
    fixture.draw.mockImplementation(() => {
      buffer += surface.input.io.typed;
    });
    fixture.checkpoint.mockImplementation(() => {
      saved = buffer;
      return true;
    });
    surface.input.queueInput({ typed: 'last character before navigation' });
    hostWindow.dispatchEvent(new Event('pagehide'));
    expect(saved).toBe('last character before navigation');
    expect(fixture.dispose).toHaveBeenCalledOnce();
    expect(fixture.close).not.toHaveBeenCalled();
  });

  it('pauses cached pages and resumes the same usable session on browser Back', () => {
    const pagehide = new Event('pagehide');
    Object.assign(pagehide, { persisted: true });
    hostWindow.dispatchEvent(pagehide);
    expect(fixture.checkpoint).toHaveBeenCalled();
    expect(fixture.dispose).not.toHaveBeenCalled();
    fixture.draw.mockClear();
    tick();
    expect(fixture.draw).not.toHaveBeenCalled();
    const pageshow = new Event('pageshow');
    Object.assign(pageshow, { persisted: true });
    hostWindow.dispatchEvent(pageshow);
    tick();
    expect(fixture.draw).toHaveBeenCalledOnce();
    expect(canvas.hidden).toBe(false);
    expect(menus.querySelectorAll('details')).toHaveLength(1);
    hostWindow.dispatchEvent(new Event('pagehide'));
    expect(fixture.dispose).toHaveBeenCalledOnce();
  });

  it('uses only the checkpoint hook when a browser unload is cancelled', () => {
    fixture.checkpoint.mockReturnValue(false);
    const first = new Event('beforeunload', { cancelable: true });
    hostWindow.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true);
    expect(fixture.close).not.toHaveBeenCalled();
    expect(fixture.dispose).not.toHaveBeenCalled();
    expect(canvas.hidden).toBe(false);
    fixture.checkpoint.mockReturnValue(true);
    const second = new Event('beforeunload', { cancelable: true });
    hostWindow.dispatchEvent(second);
    expect(second.defaultPrevented).toBe(false);
    expect(fixture.close).not.toHaveBeenCalled();
    expect(fixture.dispose).not.toHaveBeenCalled();
  });

  it('preserves the selected file when handing off to another Notepad page', () => {
    const file = env.files.createText('selected.txt', 'selected text').file!;
    env.documents.requestOpen(file.id);
    parent.postMessage.mockClear();
    expect(env.open('notepad')).toEqual({ accepted: true });
    const value = parent.postMessage.mock.calls[0][0] as { id: string; href: string };
    expect(value.id).toBe('notepad');
    expect(new URL(value.href).pathname).toBe('/apps/notepad/');
    expect(new URL(value.href).searchParams.get('file')).toBe(file.id);
  });

  it('releases listeners and refuses duplicate mounts until disposal', async () => {
    await expect(mountAppHost(root as unknown as HTMLElement)).rejects.toThrow('active session');
    mounted!.dispose();
    fixture.close.mockClear();
    incoming({ type: 'doom95:close', id: 'notepad' });
    tick();
    expect(fixture.close).not.toHaveBeenCalled();
    mounted = await mountAppHost(root as unknown as HTMLElement);
    expect(mounted).toBeDefined();
    expect(menus.querySelectorAll('details')).toHaveLength(1);
    expect(canvas.hidden).toBe(false);
  });

  it('releases the surface and host resources even when an application disposer throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    fixture.dispose.mockImplementationOnce(() => {
      throw new Error('app cleanup failed');
    });
    expect(() => mounted!.dispose()).not.toThrow();
    expect(menus.querySelectorAll('details')).toHaveLength(0);
    fixture.close.mockClear();
    incoming({ type: 'doom95:close', id: 'notepad' });
    expect(fixture.close).not.toHaveBeenCalled();
    mounted = await mountAppHost(root as unknown as HTMLElement);
    expect(menus.querySelectorAll('details')).toHaveLength(1);
    error.mockRestore();
  });

  it('settles and releases a mount when pagehide arrives while fonts are still loading', async () => {
    mounted!.dispose();
    Object.assign(documentFixture, { fonts: { load: () => new Promise(() => {}) } });
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      frame = callback;
      return 2;
    });
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    const mounting = mountAppHost(root as unknown as HTMLElement);
    hostWindow.dispatchEvent(new Event('pagehide'));
    mounted = await mounting;
    expect(requestFrame).not.toHaveBeenCalled();
    expect(menus.querySelectorAll('details')).toHaveLength(0);
    Object.assign(documentFixture, {
      fonts: Object.assign(new EventTarget(), { load: async () => [] }),
    });
    mounted = await mountAppHost(root as unknown as HTMLElement);
    expect(requestFrame).toHaveBeenCalledOnce();
  });

  it('cleans partial initialization and permits retry after font initialization fails', async () => {
    mounted!.dispose();
    fixture.initializeFonts.mockImplementationOnce(() => {
      throw new Error('font initialization failed');
    });
    await expect(mountAppHost(root as unknown as HTMLElement)).rejects.toThrow(
      'font initialization failed',
    );
    expect(menus.querySelectorAll('details')).toHaveLength(0);
    mounted = await mountAppHost(root as unknown as HTMLElement);
    expect(menus.querySelectorAll('details')).toHaveLength(1);
  });

  it('releases the canvas claim when control initialization fails before the runtime exists', async () => {
    mounted!.dispose();
    vi.mocked(mountHybridUi).mockImplementationOnce(() => {
      throw new Error('control initialization failed');
    });
    await expect(mountAppHost(root as unknown as HTMLElement)).rejects.toThrow(
      'control initialization failed',
    );
    mounted = await mountAppHost(root as unknown as HTMLElement);
    expect(menus.querySelectorAll('details')).toHaveLength(1);
  });

  it('releases controls and the canvas claim when runtime construction fails', async () => {
    mounted!.dispose();
    const releaseControls = vi.fn();
    vi.mocked(mountHybridUi).mockReturnValueOnce(releaseControls);
    vi.mocked(createBrowserRuntime).mockImplementationOnce(() => {
      throw new Error('runtime initialization failed');
    });
    await expect(mountAppHost(root as unknown as HTMLElement)).rejects.toThrow(
      'runtime initialization failed',
    );
    expect(releaseControls).toHaveBeenCalledOnce();
    mounted = await mountAppHost(root as unknown as HTMLElement);
    expect(menus.querySelectorAll('details')).toHaveLength(1);
  });

  it('releases the runtime after an early browser capability failure', async () => {
    mounted!.dispose();
    const runtime = createBrowserRuntime('legacy');
    const releaseRuntime = vi.spyOn(runtime, 'dispose');
    vi.mocked(createBrowserRuntime).mockReturnValueOnce(runtime);
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementationOnce(() => {
        throw new Error('media query initialization failed');
      }),
    );
    await expect(mountAppHost(root as unknown as HTMLElement)).rejects.toThrow(
      'media query initialization failed',
    );
    expect(releaseRuntime).toHaveBeenCalledOnce();
    mounted = await mountAppHost(root as unknown as HTMLElement);
    expect(menus.querySelectorAll('details')).toHaveLength(1);
    expect(releaseRuntime).toHaveBeenCalledOnce();
  });

  it('remounts a previously closed application with a visible canvas and one menu', async () => {
    const closing = mounted!.requestClose();
    tick();
    expect(await closing).toBe(true);
    expect(canvas.hidden).toBe(true);
    mounted = await mountAppHost(root as unknown as HTMLElement);
    expect(canvas.hidden).toBe(false);
    expect(menus.querySelectorAll('details')).toHaveLength(1);
  });

  it('removes an open message and its callbacks when the host is disposed', async () => {
    const action = vi.fn();
    env.msg({ title: 'Confirm', lines: ['Continue?'], buttons: ['Apply'], onBtn: action });
    const oldButton = dialog.querySelector('button')!;
    mounted!.dispose();
    expect(dialog.open).toBe(false);
    expect(dialog.children).toHaveLength(0);
    oldButton.dispatchEvent(new Event('click'));
    expect(action).not.toHaveBeenCalled();
    mounted = await mountAppHost(root as unknown as HTMLElement);
    expect(dialog.open).toBe(false);
    tick();
    expect(fixture.draw).toHaveBeenCalled();
  });
});
