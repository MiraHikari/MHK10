import { createLifetime } from '../../ui/browser/lifetime';
import type { InputController } from '../../ui/canvas/input';
import { parseBridgeMessage } from '../host/browser-bridge';
import type { WinState } from './wm';
import { type CursorKind } from '../../ui/canvas/input';
import { CLASSIC_SIZE, TASKBAR_HEIGHT } from '../../gfx/display-metrics';
import { resolveGlobalShortcut } from '../../ui/browser/keyboard-shortcuts';
import { embeddedShellShortcut } from '../desktop/frame-keys';
import { FUSION_EVENTS } from '@mhk/site-core/fusion/protocol-model';

export interface HtmlRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface HtmlWindowView {
  win: WinState;
  client: HtmlRect;
  href: string;
}

/** Keep shell shortcuts identical while focus is inside an embedded document. */
export function htmlWindowShortcut(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey' | 'isComposing'>,
): string | undefined {
  return embeddedShellShortcut(resolveGlobalShortcut(event));
}

/** Split into disjoint rectangles, so overlapping occluders never expose pixels again. */
export function subtractRect(source: HtmlRect, cut: HtmlRect): HtmlRect[] {
  const left = Math.max(source.x, cut.x),
    top = Math.max(source.y, cut.y);
  const right = Math.min(source.x + source.w, cut.x + cut.w),
    bottom = Math.min(source.y + source.h, cut.y + cut.h);
  if (right <= left || bottom <= top) return [source];
  return [
    { x: source.x, y: source.y, w: source.w, h: top - source.y },
    { x: source.x, y: bottom, w: source.w, h: source.y + source.h - bottom },
    { x: source.x, y: top, w: left - source.x, h: bottom - top },
    { x: right, y: top, w: source.x + source.w - right, h: bottom - top },
  ].filter((rect) => rect.w > 0 && rect.h > 0);
}

export function visibleClient(
  client: HtmlRect,
  occluders: HtmlRect[],
  display = { w: CLASSIC_SIZE.width, h: CLASSIC_SIZE.height - TASKBAR_HEIGHT },
): HtmlRect[] {
  let parts = [
    {
      x: Math.max(0, client.x),
      y: Math.max(0, client.y),
      w: Math.min(display.w, client.x + client.w) - Math.max(0, client.x),
      h: Math.min(display.h, client.y + client.h) - Math.max(0, client.y),
    },
  ].filter((rect) => rect.w > 0 && rect.h > 0);
  for (const cut of occluders) parts = parts.flatMap((rect) => subtractRect(rect, cut));
  return parts;
}

type Entry = {
  lifetime: ReturnType<typeof createLifetime>;
  wrapper: HTMLDivElement;
  frame: HTMLIFrameElement;
  clip: SVGClipPathElement;
  signature: string;
  presentation: string;
  href: string;
  bindDocument(): void;
};
const SVG = 'http://www.w3.org/2000/svg';
let nextOverlay = 0;

const interactiveEntry = (entry: Entry, layer: HTMLDivElement): boolean =>
  !layer.hidden && !entry.wrapper.hidden && !entry.frame.inert;

function flushReading(frame: HTMLIFrameElement): void {
  try {
    frame.contentWindow?.dispatchEvent(new Event(FUSION_EVENTS.flushReading));
  } catch {
    /* Only same-origin registered documents expose synchronous reading checkpoints. */
  }
}

export function createHtmlWindows(
  canvas: HTMLCanvasElement,
  handlers: {
    focus(id: string): void;
    open(id: string, href?: string): void;
    close?(id: string): void;
    canInteract(): boolean;
    activity?(): void;
  },
  input: InputController,
) {
  const lifetime = createLifetime();
  try {
    const parent = canvas.parentElement!;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    const layer = document.createElement('div');
    lifetime.defer(() => layer.remove());
    layer.className = 'html-window-layer';
    Object.assign(layer.style, {
      position: 'absolute',
      width: `${canvas.width || CLASSIC_SIZE.width}px`,
      height: `${canvas.height || CLASSIC_SIZE.height}px`,
      transformOrigin: 'top left',
      pointerEvents: 'none',
      overflow: 'hidden',
      zIndex: '2',
    });
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    const defs = document.createElementNS(SVG, 'defs');
    svg.append(defs);
    layer.append(svg);
    parent.append(layer);
    const prefix = `html-window-${++nextOverlay}-`;
    const phosphor = document.createElementNS(SVG, 'filter');
    phosphor.id = `${prefix}phosphor`;
    phosphor.setAttribute('color-interpolation-filters', 'sRGB');
    const monochrome = document.createElementNS(SVG, 'feColorMatrix');
    monochrome.setAttribute('type', 'saturate');
    monochrome.setAttribute('values', '0');
    const tones = document.createElementNS(SVG, 'feComponentTransfer');
    for (const channel of ['R', 'G', 'B']) {
      const component = document.createElementNS(SVG, `feFunc${channel}`);
      component.setAttribute('type', 'discrete');
      component.setAttribute('tableValues', channel === 'G' ? '0 0.5 1' : '0 0.5 0');
      tones.append(component);
    }
    phosphor.append(monochrome, tones);
    defs.append(phosphor);
    const entries = new Map<string, Entry>();
    const returnFocus = new Map<string, HTMLElement | null>();
    lifetime.defer(() => {
      for (const entry of entries.values()) entry.lifetime.dispose();
      entries.clear();
    });
    let pointer: { windowId: string; cursor: CursorKind; overChildFrame: boolean } | null = null;
    const clearPointer = (windowId?: string) => {
      if (windowId === undefined || pointer?.windowId === windowId) pointer = null;
    };
    lifetime.defer(() => clearPointer());
    lifetime.listen(
      canvas,
      'pointermove',
      () => {
        clearPointer();
      },
      { passive: true },
    );
    lifetime.listen(
      parent,
      'pointerleave',
      () => {
        clearPointer();
        input.queueInput({ px: -1, py: -1 });
      },
      { passive: true },
    );

    function create(view: HtmlWindowView): Entry {
      const entryLifetime = createLifetime();
      entryLifetime.defer(() => clearPointer(view.win.id));
      try {
        let documentLifetime = createLifetime();
        let boundDocument: Document | undefined;
        entryLifetime.defer(() => documentLifetime.dispose());
        const wrapper = document.createElement('div');
        entryLifetime.defer(() => wrapper.remove());
        Object.assign(wrapper.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
        const clip = document.createElementNS(SVG, 'clipPath');
        entryLifetime.defer(() => clip.remove());
        clip.id = `${prefix}${entries.size}-${view.win.id}`;
        clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
        defs.append(clip);
        wrapper.style.clipPath = `url(#${clip.id})`;
        const frame = document.createElement('iframe');
        frame.title = view.win.title;
        frame.dataset.htmlWindow = view.win.id;
        frame.dataset.htmlApp = view.win.appId;
        Object.assign(frame.style, {
          position: 'absolute',
          border: '0',
          background: '#f8f7f1',
          pointerEvents: 'auto',
          colorScheme: 'light',
        });
        function bindDocument(): void {
          if (entryLifetime.disposed) return;
          const doc = frame.contentDocument;
          if (doc === boundDocument) return;
          documentLifetime.dispose();
          boundDocument = undefined;
          clearPointer(view.win.id);
          if (!doc || doc.URL === 'about:blank' || !doc.head) return;
          documentLifetime = createLifetime();
          try {
            doc.documentElement.classList.add('is-embedded');
            const pointerStyle = doc.createElement('style');
            pointerStyle.textContent = 'html, html * { cursor: none !important; }';
            documentLifetime.defer(() => pointerStyle.remove());
            doc.head.append(pointerStyle);
            const updatePointer = (event: PointerEvent) => {
              if (!handlers.canInteract() || frame.inert || wrapper.hidden || layer.hidden) {
                clearPointer(view.win.id);
                return;
              }
              handlers.activity?.();
              const target = event.target as Element | null;
              const editable = target?.closest(
                'textarea, input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]), [contenteditable="true"], .prose',
              );
              pointer = {
                windowId: view.win.id,
                overChildFrame: !!target?.closest('iframe'),
                cursor: target?.closest('[aria-busy="true"]')
                  ? 'wait'
                  : editable
                    ? 'ibeam'
                    : 'arrow',
              };
              const rect = frame.getBoundingClientRect();
              const bounds = canvas.getBoundingClientRect();
              input.queueInput({
                px:
                  ((rect.left - bounds.left) / bounds.width) *
                    (canvas.width || CLASSIC_SIZE.width) +
                  event.clientX,
                py:
                  ((rect.top - bounds.top) / bounds.height) *
                    (canvas.height || CLASSIC_SIZE.height) +
                  event.clientY,
              });
            };
            documentLifetime.listen(
              doc,
              'pointerdown',
              (event) => {
                updatePointer(event);
                if (handlers.canInteract() && !frame.inert && !wrapper.hidden && !layer.hidden)
                  handlers.focus(view.win.id);
              },
              { capture: true },
            );
            documentLifetime.listen(doc, 'pointermove', updatePointer, { passive: true });
            documentLifetime.listen(doc, 'pointerover', updatePointer, {
              capture: true,
              passive: true,
            });
            documentLifetime.listen(doc, 'wheel', () => handlers.activity?.(), {
              passive: true,
              capture: true,
            });
            documentLifetime.listen(doc, 'input', () => handlers.activity?.(), { capture: true });
            documentLifetime.listen(
              doc.documentElement,
              'pointerleave',
              () => {
                clearPointer(view.win.id);
              },
              { passive: true },
            );
            const trackModifiers = (event: KeyboardEvent) => {
              if (event.ctrlKey || event.metaKey) input.io.keyDown.add('Control');
              else input.io.keyDown.delete('Control');
              if (event.metaKey) input.io.keyDown.add('Meta');
              else input.io.keyDown.delete('Meta');
              if (event.shiftKey) input.io.keyDown.add('Shift');
              else input.io.keyDown.delete('Shift');
            };
            documentLifetime.listen(
              doc,
              'keydown',
              (event) => {
                if (!handlers.canInteract() || frame.inert || wrapper.hidden || layer.hidden)
                  return;
                handlers.activity?.();
                trackModifiers(event);
                const command = htmlWindowShortcut(event);
                if (command) {
                  event.preventDefault();
                  event.stopImmediatePropagation();
                  handlers.focus(view.win.id);
                  input.queueInput({ key: command });
                  const active = doc.activeElement;
                  returnFocus.set(view.win.id, active instanceof HTMLElement ? active : null);
                  canvas.focus({ preventScroll: true });
                }
              },
              { capture: true },
            );
            documentLifetime.listen(
              doc,
              'keyup',
              (event) => {
                trackModifiers(event);
                input.io.keyDown.delete(event.key);
              },
              { capture: true },
            );
            if (frame.contentWindow)
              documentLifetime.listen(frame.contentWindow, 'blur', () => {
                input.io.keyDown.clear();
              });
            boundDocument = doc;
          } catch (error) {
            documentLifetime.dispose();
            throw error;
          }
        }
        entryLifetime.listen(frame, 'load', bindDocument);
        wrapper.append(frame);
        layer.append(wrapper);
        const entry = {
          lifetime: entryLifetime,
          wrapper,
          frame,
          clip,
          signature: '',
          presentation: '',
          href: view.href,
          bindDocument,
        };
        frame.src = view.href;
        entries.set(view.win.id, entry);
        return entry;
      } catch (error) {
        entryLifetime.dispose();
        throw error;
      }
    }

    function sync(
      views: HtmlWindowView[],
      wins: readonly WinState[],
      blockers: HtmlRect[],
      enabled: boolean,
      interactive: boolean,
      theme = 'std',
      effectTransform = '',
      reducedMotion = false,
      pixelImages = false,
      focusedId: string | null = null,
      blockHtmlFocus = false,
    ) {
      if (lifetime.disposed) return;
      layer.hidden = !enabled;
      if (!enabled || !interactive) clearPointer();
      const bounds = canvas.getBoundingClientRect();
      layer.style.left = `${canvas.offsetLeft}px`;
      layer.style.top = `${canvas.offsetTop}px`;
      const width = canvas.width || CLASSIC_SIZE.width,
        height = canvas.height || CLASSIC_SIZE.height;
      layer.style.width = `${width}px`;
      layer.style.height = `${height}px`;
      layer.style.transform = `scale(${bounds.width / width},${bounds.height / height}) ${effectTransform}`;
      const ids = new Set(wins.map((win) => win.id));
      const rendered = new Set(views.map((view) => view.win.id));
      // 被关闭的 iframe 若持有焦点，删除后 activeElement 会掉回 <body>，
      // 桌面键盘输入随即失效；记录后归还给画布。
      let restoreCanvasFocus = false;
      for (const [id, entry] of entries) {
        if (!ids.has(id)) {
          if (
            document.activeElement === entry.frame ||
            entry.frame.contentDocument?.hasFocus?.() === true
          )
            restoreCanvasFocus = true;
          flushReading(entry.frame);
          entry.lifetime.dispose();
          entries.delete(id);
          returnFocus.delete(id);
        } else if (!enabled || !rendered.has(id)) {
          entry.wrapper.hidden = true;
          entry.frame.inert = true;
          clearPointer(id);
        }
      }
      if (restoreCanvasFocus) canvas.focus({ preventScroll: true });
      for (const view of views) {
        if (!ids.has(view.win.id)) continue;
        const entry = entries.get(view.win.id) ?? create(view);
        const hidden = !enabled || view.win.minimized || view.win.k < 1;
        if (entry.wrapper.hidden !== hidden) entry.wrapper.hidden = hidden;
        if (entry.href !== view.href) {
          flushReading(entry.frame);
          entry.frame.src = view.href;
          entry.href = view.href;
          clearPointer(view.win.id);
        }
        const index = wins.findIndex((win) => win.id === view.win.id);
        const higher = wins
          .slice(index + 1)
          .filter((win) => !win.minimized && win.k >= 1)
          .map((win) => ({ x: win.x, y: win.y, w: win.w, h: win.h }));
        const parts = visibleClient(view.client, [...higher, ...blockers], {
          w: width,
          h: height - TASKBAR_HEIGHT,
        });
        const signature = JSON.stringify(parts);
        if (signature !== entry.signature) {
          entry.clip.replaceChildren(
            ...parts.map((part) => {
              const rect = document.createElementNS(SVG, 'rect');
              for (const [name, value] of Object.entries({
                x: part.x,
                y: part.y,
                width: part.w,
                height: part.h,
              }))
                rect.setAttribute(name, String(value));
              return rect;
            }),
          );
          entry.signature = signature;
        }
        const receivesInput = interactive && !entry.wrapper.hidden && parts.length > 0;
        const presentation = [
          signature,
          index,
          view.client.x,
          view.client.y,
          view.client.w,
          view.client.h,
          receivesInput ? 1 : 0,
          entry.wrapper.hidden ? 1 : 0,
          theme,
          reducedMotion ? 1 : 0,
          pixelImages ? 1 : 0,
          effectTransform,
        ].join('|');
        if (presentation !== entry.presentation) {
          entry.wrapper.style.zIndex = String(index);
          Object.assign(entry.frame.style, {
            left: `${view.client.x}px`,
            top: `${view.client.y}px`,
            width: `${view.client.w}px`,
            height: `${view.client.h}px`,
            pointerEvents: receivesInput ? 'auto' : 'none',
            filter: theme === 'phosphor' && pixelImages ? `url(#${phosphor.id})` : '',
          });
          entry.frame.inert = !receivesInput;
          entry.presentation = presentation;
        }
        if (!receivesInput) clearPointer(view.win.id);
        entry.bindDocument();
        const root = entry.frame.contentDocument?.documentElement;
        if (root) {
          if (root.dataset.theme !== theme) root.dataset.theme = theme;
          root.dataset.reducedMotion = String(reducedMotion);
          const imageStyle = pixelImages ? 'pixel' : 'original';
          if (root.dataset.imageStyle !== imageStyle) root.dataset.imageStyle = imageStyle;
        }
      }
      const focused = document.activeElement;
      if (
        focused instanceof HTMLIFrameElement &&
        focused.inert &&
        [...entries.values()].some((entry) => entry.frame === focused)
      )
        canvas.focus({ preventScroll: true });
      if (blockHtmlFocus || !focusedId || document.activeElement !== canvas) return;
      const entry = entries.get(focusedId);
      const win = wins.find((item) => item.id === focusedId);
      if (
        !entry ||
        !win ||
        entry.frame.inert ||
        entry.wrapper.hidden ||
        layer.hidden ||
        win.minimized ||
        win.k < 1
      )
        return;
      const doc = entry.frame.contentDocument;
      if (!doc || doc.URL === 'about:blank' || doc.readyState === 'loading') return;
      const remembered = returnFocus.get(focusedId);
      const target =
        remembered && doc.contains(remembered) ? remembered : doc.querySelector('[tabindex="0"]');
      entry.frame.contentWindow?.focus();
      if (target instanceof HTMLElement) target.focus();
    }

    lifetime.listen(window, 'message', (event) => {
      if (event.origin !== location.origin || !handlers.canInteract()) return;
      const source = [...entries.entries()].find(
        ([, entry]) => entry.frame.contentWindow === event.source,
      );
      const data = parseBridgeMessage(event.data);
      if (!source || !data || !interactiveEntry(source[1], layer)) return;
      if (data.type === 'doom95:open') handlers.open(data.id, data.href);
      // Child pointer events also post a legacy focus message. Delivery is
      // asynchronous, so an older message must not steal focus back after a
      // shortcut has already moved the user to the Canvas desktop.
      if (
        data.type === 'doom95:focus' &&
        document.activeElement === source[1].frame &&
        !source[1].frame.inert &&
        !source[1].wrapper.hidden &&
        !layer.hidden
      )
        handlers.focus(source[0]);
      if (data.type === 'doom95:close' && data.id === source[0]) handlers.close?.(source[0]);
      if (data.type === 'doom95:start') {
        input.queueInput({ key: 'StartMenu' });
        canvas.focus({ preventScroll: true });
      }
    });
    return {
      dispose: lifetime.dispose,
      prepareClose: (id?: string) => {
        for (const [windowId, entry] of entries) {
          if (id === undefined || windowId === id) flushReading(entry.frame);
        }
      },
      sync,
      containsPointer: () => pointer !== null,
      cursorKind: () => pointer?.cursor ?? 'arrow',
      overChildFrame: () => pointer?.overChildFrame ?? false,
    };
  } catch (error) {
    lifetime.dispose();
    throw error;
  }
}
