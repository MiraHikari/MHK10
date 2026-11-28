import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  createHtmlWindows,
  htmlWindowShortcut,
  subtractRect,
  visibleClient,
  type HtmlRect,
  type HtmlWindowView,
} from './html-windows';
import { createInputController } from '../../ui/canvas/input';
import { FUSION_EVENTS } from '@mhk/site-core/fusion/protocol-model';
let input = createInputController();
let { beginFrame, io, queueInput } = input;

const contains = (rect: HtmlRect, x: number, y: number) =>
  x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
const area = (rects: HtmlRect[]) => rects.reduce((total, rect) => total + rect.w * rect.h, 0);

class HostElement extends EventTarget {
  style: Record<string, string> = { position: '' };
  children: HostElement[] = [];
  parentElement: HostElement | null = null;
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  className = '';
  classList = { add: vi.fn() };
  hidden = false;
  inert = false;
  closest = vi.fn<(selector: string) => HostElement | null>(() => null);
  focus = vi.fn();
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 640, height: 360 };
  }
  replaceChildren(...children: HostElement[]) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.append(...children);
  }
  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }
  append(...children: HostElement[]) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }
  remove() {
    if (this.parentElement)
      this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }
}

class HostDocument extends EventTarget {
  URL = 'https://mhk10.test/blog/';
  head = new HostElement();
  documentElement = new HostElement();
  createElement() {
    return new HostElement();
  }
}

class HostFrame extends HostElement {
  contentDocument: HostDocument | null = null;
  contentWindow = new EventTarget();
  private source = '';
  constructor(private readonly setSource: (value: string) => void) {
    super();
  }
  set src(value: string) {
    this.setSource(value);
    this.source = value;
  }
  get src() {
    return this.source;
  }
}

describe('HTML window mount lifetime', () => {
  it('checkpoints reading before navigation and closing, while dispose only releases resources', () => {
    const windows = createHtmlWindows(canvas as unknown as HTMLCanvasElement, handlers, input);
    windows.sync([view], [view.win], [], true, true);
    const frame = createElement.mock.results.find((result) => result.value instanceof HostFrame)!
      .value as HostFrame;
    const checkpoints = vi.fn();
    frame.contentWindow.addEventListener(FUSION_EVENTS.flushReading, checkpoints);
    windows.prepareClose(view.win.id);
    expect(checkpoints).toHaveBeenCalledTimes(1);
    windows.sync([{ ...view, href: '/skills/?item=TypeScript' }], [view.win], [], true, true);
    expect(checkpoints).toHaveBeenCalledTimes(2);
    windows.sync([], [], [], true, true);
    expect(checkpoints).toHaveBeenCalledTimes(3);
    windows.dispose();
    expect(checkpoints).toHaveBeenCalledTimes(3);
  });
  let parent: HostElement;
  let canvas: HostElement;
  let hostWindow: EventTarget;
  let createElementNS: ReturnType<typeof vi.fn>;
  let createElement: ReturnType<typeof vi.fn>;
  let setFrameSource = vi.fn<(value: string) => void>();
  const handlers = { focus: vi.fn(), open: vi.fn(), canInteract: () => true };
  const view: HtmlWindowView = {
    href: '/skills/',
    client: { x: 3, y: 22, w: 300, h: 180 },
    win: {
      id: 'skills',
      appId: 'skills',
      title: 'Device Manager',
      x: 0,
      y: 0,
      w: 306,
      h: 205,
      k: 1,
      minimized: false,
      maximized: false,
      saved: null,
      menu: { open: -1 },
    },
  };

  beforeEach(() => {
    input.dispose();
    input = createInputController();
    ({ beginFrame, io, queueInput } = input);
    parent = new HostElement();
    canvas = new HostElement();
    parent.append(canvas);
    hostWindow = new EventTarget();
    setFrameSource = vi.fn<(value: string) => void>();
    createElement = vi.fn((name: string) =>
      name === 'iframe' ? new HostFrame(setFrameSource) : new HostElement(),
    );
    createElementNS = vi.fn(() => new HostElement());
    vi.stubGlobal('document', {
      createElement,
      createElementNS,
    });
    vi.stubGlobal('window', hostWindow);
    vi.stubGlobal('HTMLIFrameElement', HostFrame);
    vi.stubGlobal('getComputedStyle', (element: HostElement) => ({
      position: element.style.position || 'static',
    }));
    vi.stubGlobal('location', { origin: 'https://mhk10.test' });
    handlers.open.mockClear();
    handlers.focus.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function bindClient(frame: HostFrame) {
    const doc = new HostDocument();
    frame.contentDocument = doc;
    frame.dispatchEvent(new Event('load'));
    const child = new HostElement();
    child.closest.mockImplementation((selector) => (selector === 'iframe' ? child : null));
    return {
      doc,
      point(type = 'pointermove') {
        const event = new Event(type);
        Object.defineProperty(event, 'target', { value: child });
        Object.assign(event, { clientX: 12, clientY: 18 });
        doc.dispatchEvent(event);
      },
    };
  }

  it.each([
    'canvas',
    'parent',
    'minimize',
    'occlude',
    'hide',
    'disable',
    'navigate',
    'remove',
    'dispose',
  ])('releases the nested-frame cursor when its pointer leaves through %s', (change) => {
    const mounted = createHtmlWindows(canvas as unknown as HTMLCanvasElement, handlers, input);
    mounted.sync([view], [view.win], [], true, true);
    const client = bindClient(parent.children[1].children[1].children[0] as HostFrame);
    client.point();
    expect(mounted.containsPointer()).toBe(true);
    expect(mounted.overChildFrame()).toBe(true);
    if (change === 'canvas') canvas.dispatchEvent(new Event('pointermove'));
    else if (change === 'parent') parent.dispatchEvent(new Event('pointerleave'));
    else if (change === 'minimize') {
      const minimized = { ...view, win: { ...view.win, minimized: true } };
      mounted.sync([minimized], [minimized.win], [], true, true);
    } else if (change === 'occlude') {
      mounted.sync([view], [view.win], [view.client], true, true);
    } else if (change === 'hide') mounted.sync([view], [view.win], [], false, true);
    else if (change === 'disable') mounted.sync([view], [view.win], [], true, false);
    else if (change === 'navigate') {
      mounted.sync([{ ...view, href: '/blog/' }], [view.win], [], true, true);
    } else if (change === 'remove') mounted.sync([], [], [], true, true);
    else mounted.dispose();
    expect(mounted.containsPointer()).toBe(false);
    expect(mounted.overChildFrame()).toBe(false);
    mounted.dispose();
  });

  it('acquires nested-frame pointer ownership on pointerover and ignores hidden clients', () => {
    const mounted = createHtmlWindows(canvas as unknown as HTMLCanvasElement, handlers, input);
    mounted.sync([view], [view.win], [], true, true);
    const client = bindClient(parent.children[1].children[1].children[0] as HostFrame);
    client.point('pointerover');
    expect(mounted.containsPointer()).toBe(true);
    expect(mounted.overChildFrame()).toBe(true);
    mounted.sync([], [view.win], [], true, true);
    client.point('pointerover');
    expect(mounted.containsPointer()).toBe(false);
    expect(mounted.overChildFrame()).toBe(false);
    mounted.dispose();
  });

  it('keeps the pointer owner when another client binds, leaves, navigates or closes', () => {
    const mounted = createHtmlWindows(canvas as unknown as HTMLCanvasElement, handlers, input);
    const second = {
      ...view,
      win: { ...view.win, id: 'second', x: 330 },
      client: { ...view.client, x: 333 },
    };
    mounted.sync([view], [view.win], [], true, true);
    const first = bindClient(parent.children[1].children[1].children[0] as HostFrame);
    first.point();
    mounted.sync([view, second], [view.win, second.win], [], true, true);
    expect(mounted.overChildFrame()).toBe(true);
    const other = bindClient(parent.children[1].children[2].children[0] as HostFrame);
    other.doc.documentElement.dispatchEvent(new Event('pointerleave'));
    expect(mounted.containsPointer()).toBe(true);
    expect(mounted.overChildFrame()).toBe(true);
    mounted.sync([view, { ...second, href: '/about/' }], [view.win, second.win], [], true, true);
    expect(mounted.overChildFrame()).toBe(true);
    mounted.sync([view], [view.win], [], true, true);
    expect(mounted.containsPointer()).toBe(true);
    expect(mounted.overChildFrame()).toBe(true);
    mounted.dispose();
  });

  it('removes an inserted overlay when later SVG initialization fails and permits retry', () => {
    createElementNS.mockImplementation((_namespace: string, name: string) => {
      if (name === 'filter') throw new Error('filter initialization failed');
      return new HostElement();
    });
    expect(() =>
      createHtmlWindows(canvas as unknown as HTMLCanvasElement, handlers, input),
    ).toThrow('filter initialization failed');
    expect(parent.children).toEqual([canvas]);
    expect(parent.style.position).toBe('relative');
    createElementNS.mockImplementation(() => new HostElement());
    const mounted = createHtmlWindows(canvas as unknown as HTMLCanvasElement, handlers, input);
    expect(parent.children).toHaveLength(2);
    mounted.dispose();
    mounted.dispose();
    expect(parent.children).toEqual([canvas]);
    expect(parent.style.position).toBe('relative');
  });

  it('removes earlier listeners when the final message listener cannot be registered', () => {
    vi.spyOn(hostWindow, 'addEventListener').mockImplementationOnce(() => {
      throw new Error('message listener failed');
    });
    expect(() =>
      createHtmlWindows(canvas as unknown as HTMLCanvasElement, handlers, input),
    ).toThrow('message listener failed');
    queueInput({ px: 17, py: 23 });
    beginFrame(1);
    parent.dispatchEvent(new Event('pointerleave'));
    beginFrame(2);
    expect([io.px, io.py]).toEqual([17, 23]);
    expect(parent.children).toEqual([canvas]);
    const mounted = createHtmlWindows(canvas as unknown as HTMLCanvasElement, handlers, input);
    parent.dispatchEvent(new Event('pointerleave'));
    beginFrame(3);
    expect([io.px, io.py]).toEqual([-1, -1]);
    mounted.dispose();
    expect(parent.children).toEqual([canvas]);
  });

  it('keeps shared parent positioning stable when another overlay is still mounted', () => {
    const secondCanvas = new HostElement();
    parent.append(secondCanvas);
    const first = createHtmlWindows(canvas as unknown as HTMLCanvasElement, handlers, input);
    const second = createHtmlWindows(secondCanvas as unknown as HTMLCanvasElement, handlers, input);
    const secondLayer = parent.children.at(-1);
    expect(parent.style.position).toBe('relative');
    first.dispose();
    expect(parent.children).toEqual([canvas, secondCanvas, secondLayer]);
    expect(parent.style.position).toBe('relative');
    second.dispose();
    expect(parent.children).toEqual([canvas, secondCanvas]);
    expect(parent.style.position).toBe('relative');
  });

  it('rolls back a failed client creation and retries its address through sync', () => {
    const mounted = createHtmlWindows(canvas as unknown as HTMLCanvasElement, handlers, input);
    const layer = parent.children[1];
    const definitions = layer.children[0].children[0];
    setFrameSource.mockImplementationOnce(() => {
      throw new Error('client navigation failed');
    });
    expect(() => mounted.sync([view], [view.win], [], true, true)).toThrow(
      'client navigation failed',
    );
    expect(layer.children).toHaveLength(1);
    expect(definitions.children).toHaveLength(1);
    mounted.sync([view], [view.win], [], true, true);
    expect(setFrameSource).toHaveBeenCalledTimes(2);
    expect(setFrameSource).toHaveBeenLastCalledWith('/skills/');
    expect(layer.children).toHaveLength(2);
    expect(definitions.children).toHaveLength(2);
    mounted.dispose();
    expect(parent.children).toEqual([canvas]);
  });

  it.each(['blog', 'acdsee'])(
    'publishes the stable %s identity separately from a local-file window instance',
    (appId) => {
      const mounted = createHtmlWindows(canvas as unknown as HTMLCanvasElement, handlers, input);
      const local = {
        ...view,
        href: appId === 'blog' ? '/blog/?file=notes' : '/acdsee/?file=photo',
        win: { ...view.win, id: `${appId}:file:local`, appId },
      };
      mounted.sync([local], [local.win], [], true, true);
      const frame = parent.children[1].children[1].children[0];
      expect(frame.dataset).toMatchObject({
        htmlWindow: `${appId}:file:local`,
        htmlApp: appId,
      });
      expect(setFrameSource).toHaveBeenLastCalledWith(local.href);
      mounted.dispose();
    },
  );

  it('removes one file client without navigating or replacing the other application instance', () => {
    const mounted = createHtmlWindows(canvas as unknown as HTMLCanvasElement, handlers, input);
    const locals = ['first', 'second'].map((fileId) => ({
      ...view,
      href: `/blog/?file=${fileId}`,
      win: { ...view.win, id: `blog:file:${fileId}`, appId: 'blog' },
    }));
    mounted.sync(
      locals,
      locals.map((local) => local.win),
      [],
      true,
      true,
    );
    const layer = parent.children[1];
    const first = layer.children[1];
    const second = layer.children[2];
    const frame = second.children[0] as HostFrame;
    expect(frame.src).toBe('/blog/?file=second');
    setFrameSource.mockClear();
    mounted.sync([locals[1]], [locals[1].win], [], true, true);
    expect(first.parentElement).toBeNull();
    expect(layer.children).toEqual([layer.children[0], second]);
    expect(second.children[0]).toBe(frame);
    expect(frame.dataset).toEqual({ htmlWindow: 'blog:file:second', htmlApp: 'blog' });
    expect(setFrameSource).not.toHaveBeenCalled();
    mounted.dispose();
  });

  it('ignores late sync calls after disposal instead of acquiring another client', () => {
    const mounted = createHtmlWindows(canvas as unknown as HTMLCanvasElement, handlers, input);
    mounted.dispose();
    createElement.mockClear();
    mounted.sync([view], [view.win], [], true, true);
    expect(createElement).not.toHaveBeenCalled();
    expect(parent.children).toEqual([canvas]);
  });

  it('ignores commands from hidden or noninteractive clients and accepts the same visible source', () => {
    const mounted = createHtmlWindows(canvas as unknown as HTMLCanvasElement, handlers, input);
    mounted.sync([view], [view.win], [], true, true);
    const frame = parent.children[1].children[1].children[0] as HostFrame;
    const send = () => {
      const event = new Event('message');
      Object.assign(event, {
        origin: 'https://mhk10.test',
        source: frame.contentWindow,
        data: { type: 'doom95:open', id: 'gallery' },
      });
      hostWindow.dispatchEvent(event);
    };
    send();
    expect(handlers.open).toHaveBeenCalledOnce();
    mounted.sync([view], [view.win], [], true, false);
    send();
    mounted.sync([view], [view.win], [], false, true);
    send();
    mounted.sync([], [view.win], [], true, true);
    send();
    expect(handlers.open).toHaveBeenCalledOnce();
    mounted.sync([view], [view.win], [], true, true);
    send();
    expect(handlers.open).toHaveBeenCalledTimes(2);
    mounted.dispose();
  });

  it('retries a client address after navigation throws without duplicating the window', () => {
    const mounted = createHtmlWindows(canvas as unknown as HTMLCanvasElement, handlers, input);
    mounted.sync([view], [view.win], [], true, true);
    const nextView = { ...view, href: '/skills/?selection=typescript' };
    setFrameSource.mockImplementationOnce(() => {
      throw new Error('client navigation failed');
    });
    expect(() => mounted.sync([nextView], [view.win], [], true, true)).toThrow(
      'client navigation failed',
    );
    mounted.sync([nextView], [view.win], [], true, true);
    expect(setFrameSource).toHaveBeenCalledTimes(3);
    expect(setFrameSource).toHaveBeenLastCalledWith(nextView.href);
    expect(parent.children[1].children).toHaveLength(2);
    mounted.dispose();
  });

  it('retries clipping after SVG allocation fails instead of keeping stale client geometry', () => {
    const mounted = createHtmlWindows(canvas as unknown as HTMLCanvasElement, handlers, input);
    mounted.sync([view], [view.win], [], true, true);
    const clip = parent.children[1].children[0].children[0].children[1];
    expect(clip.children[0].attributes.width).toBe('300');
    const nextView = { ...view, client: { ...view.client, w: 320 } };
    createElementNS.mockImplementationOnce(() => {
      throw new Error('clip initialization failed');
    });
    expect(() => mounted.sync([nextView], [view.win], [], true, true)).toThrow(
      'clip initialization failed',
    );
    mounted.sync([nextView], [view.win], [], true, true);
    expect(clip.children[0].attributes.width).toBe('320');
    mounted.dispose();
  });
});

describe('embedded window keyboard shortcuts', () => {
  const event = {
    key: '',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  };
  it.each([
    [{ key: 'F10' }, undefined],
    [{ key: 'F10', shiftKey: true }, 'ContextMenu'],
    [{ key: ' ', altKey: true }, 'SystemMenu'],
    [{ key: 'F4', ctrlKey: true }, 'CloseWindow'],
    [{ key: 'Escape', ctrlKey: true }, 'StartMenu'],
    [{ key: 'Tab', ctrlKey: true }, 'CycleWindow'],
    [{ key: 'Tab', ctrlKey: true, shiftKey: true }, 'CycleWindowReverse'],
    [{ key: 'F2' }, undefined],
    [{ key: 'F5' }, undefined],
    [{ key: 'F4', altKey: true }, 'CloseWindow'],
    [{ key: 'Tab', altKey: true }, undefined],
    [{ key: 'Escape', ctrlKey: true, shiftKey: true }, 'TaskManager'],
    [{ key: 'F2', altKey: true }, 'Run'],
    [{ key: 'd', ctrlKey: true, altKey: true }, 'ShowDesktop'],
    [{ key: 's', ctrlKey: true }, undefined],
    [{ key: 'ArrowLeft', altKey: true }, undefined],
    [{ key: 'F5', ctrlKey: true }, undefined],
    [{ key: 'a' }, undefined],
    [{ key: ' ', altKey: true, ctrlKey: true }, undefined],
    [{ key: 'F10', isComposing: true }, undefined],
  ])('maps %j to %s', (input, command) => {
    expect(htmlWindowShortcut({ ...event, ...input })).toBe(command);
  });
});

describe('HTML window occlusion', () => {
  it('uses the current work area beyond the classic right and bottom edges', () => {
    expect(visibleClient({ x: 610, y: 330, w: 500, h: 300 }, [], { w: 960, h: 514 })).toEqual([
      { x: 610, y: 330, w: 350, h: 184 },
    ]);
    expect(visibleClient({ x: 20, y: 514, w: 100, h: 50 }, [], { w: 960, h: 514 })).toEqual([]);
  });
  const client = { x: 10, y: 10, w: 100, h: 80 };

  it('keeps clients unchanged when occluders only touch their edge', () => {
    expect(subtractRect(client, { x: 110, y: 10, w: 20, h: 80 })).toEqual([client]);
    expect(subtractRect(client, { x: 10, y: 90, w: 100, h: 20 })).toEqual([client]);
  });

  it('removes a client entirely when another window covers it', () => {
    expect(subtractRect(client, { x: 0, y: 0, w: 200, h: 200 })).toEqual([]);
  });

  it('preserves visible area around an interior occluder', () => {
    const parts = subtractRect(client, { x: 30, y: 30, w: 20, h: 20 });
    expect(parts).toHaveLength(4);
    expect(area(parts)).toBe(7600);
    expect(parts.every((rect) => rect.w > 0 && rect.h > 0)).toBe(true);
  });

  it('clips negative window positions and excludes the taskbar', () => {
    expect(visibleClient({ x: -12, y: -8, w: 700, h: 400 }, [])).toEqual([
      { x: 0, y: 0, w: 640, h: 338 },
    ]);
    expect(visibleClient({ x: 20, y: 338, w: 80, h: 40 }, [])).toEqual([]);
    expect(visibleClient({ x: 650, y: 20, w: 80, h: 40 }, [])).toEqual([]);
  });

  it('does not expose holes where multiple blockers overlap', () => {
    const source = { x: 0, y: 0, w: 10, h: 10 };
    const cuts = [
      { x: 2, y: 2, w: 5, h: 5 },
      { x: 4, y: 4, w: 5, h: 5 },
    ];
    const parts = visibleClient(source, cuts);
    expect(area(parts)).toBe(59);
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const covered = cuts.some((cut) => contains(cut, x + 0.5, y + 0.5));
        expect(parts.filter((part) => contains(part, x + 0.5, y + 0.5)).length).toBe(
          covered ? 0 : 1,
        );
      }
    }
  });

  it('produces the same visible pixels regardless of blocker order or duplication', () => {
    const source = { x: -2, y: -2, w: 14, h: 14 };
    const cuts = [
      { x: -4, y: 2, w: 8, h: 5 },
      { x: 2, y: 4, w: 8, h: 5 },
      { x: 8, y: -4, w: 8, h: 8 },
    ];
    const first = visibleClient(source, cuts);
    const reordered = visibleClient(source, [...cuts].reverse().concat(cuts));
    expect(area(first)).toBe(area(reordered));
    for (let y = -2; y < 12; y++) {
      for (let x = -2; x < 12; x++) {
        const expected = x >= 0 && y >= 0 && !cuts.some((cut) => contains(cut, x + 0.5, y + 0.5));
        expect(first.filter((rect) => contains(rect, x + 0.5, y + 0.5)).length).toBe(
          expected ? 1 : 0,
        );
        expect(reordered.filter((rect) => contains(rect, x + 0.5, y + 0.5)).length).toBe(
          expected ? 1 : 0,
        );
      }
    }
  });
});
