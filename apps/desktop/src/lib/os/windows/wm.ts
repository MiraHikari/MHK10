import { popupLayout, windowClient } from '../../ui/canvas/layout';
import { menuLabels, type AppMenus, type AppMenuSelection } from '../../ui/canvas/menu-types';
// wm.ts: the window manager. Owns window state (z-order, focus, drag, open animation,
// minimize/maximize) and draws window chrome through the widget kit. Apps only ever see
// their client rect — all title-bar behaviour lives here.

import type { Renderer } from '../../gfx/context';
import { C } from '../../gfx/palette';
import { TIMING } from '../../gfx/timing';
import { R, clamp } from '../../gfx/primitives';
import type { FontName } from '../../gfx/text';
import type { MenuBarState, WidgetScope } from '../../ui/canvas/widgets';
import type { InputController, HitResult } from '../../ui/canvas/input';
import {
  resizeEdgeAt,
  resizeBounds,
  resizeCursor,
  fitWindowToArea,
  type ResizeEdge,
  type WindowBounds,
} from './resize';
import { WindowMenu, windowMenuEntries, type WindowCommand } from './window-menu';
import { arrangeWindows, type WindowArrangement } from './window-arrangement';
import {
  createWindowMotion,
  motionBounds,
  pixelBounds,
  titleBounds,
  type WindowMotion,
  type WindowMotionKind,
} from './window-motion';

const NO_HIT: HitResult = { hover: false, held: false, clicked: false, rclicked: false };

export interface WinSpec {
  id: string; // unique instance id
  appId: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  icon?: string;
  ctl?: 'mx' | 'x' | '';
  noClose?: boolean;
  modal?: boolean;
  resizable?: boolean;
  minW?: number;
  minH?: number;
  launchBounds?: Readonly<WindowBounds>;
}

interface MutableWinState extends WinSpec {
  k: number; // 0..1 visible-window transition; clients are exposed only at 1
  minimized: boolean;
  maximized: boolean;
  docked?: 'left' | 'right';
  saved: { x: number; y: number; w: number; h: number } | null;
  menu: MenuBarState;
}

/** A point-in-time projection. Nested geometry and menu state cannot mutate the manager. */
export type WinState = Readonly<Omit<MutableWinState, 'saved' | 'menu'>> & {
  readonly saved: Readonly<WindowBounds> | null;
  readonly menu: Readonly<MenuBarState>;
};

function snapshot(win: MutableWinState): WinState {
  return Object.freeze({
    ...win,
    saved: win.saved ? Object.freeze({ ...win.saved }) : null,
    menu: Object.freeze({ ...win.menu }),
    ...(win.launchBounds ? { launchBounds: Object.freeze({ ...win.launchBounds }) } : {}),
  });
}

export interface ChromeOpts {
  register?: 'L1';
  statusFont?: 'dos';
  menus?: AppMenus;
  status?: string;
  active?: boolean;
}

export type MenuSel = AppMenuSelection;
export interface DrawResult {
  client: { x: number; y: number; w: number; h: number };
  menuSel: MenuSel | null;
}

const OPEN_T = TIMING.open;

// drag state is WM-internal
export class WM {
  private motionReduced = false;
  private transitions = new Map<string, WindowMotion>();
  private taskBounds = new Map<string, WindowBounds>();
  private drag: { id: string; dx: number; dy: number } | null = null;
  private resize: {
    id: string;
    edge: ResizeEdge;
    x: number;
    y: number;
    bounds: WindowBounds;
  } | null = null;
  private placement: {
    id: string;
    mode: 'move' | 'size';
    original: WindowBounds;
    docked?: 'left' | 'right';
    saved: WindowBounds | null;
    px: number;
    py: number;
  } | null = null;
  private switcher = false;
  private systemMenu: WindowMenu;
  private desktopSnapshot: { ids: string[]; focused: string | null } | null = null;
  private openingOrder: string[] = [];
  private windows: MutableWinState[] = []; // array order = z-order (last = topmost)
  private focusedId: string | null = null;
  private closeRequests = new Set<string>();
  /** The window that owns mouse events this frame (topmost under the pointer, the dragged window, or the top modal). */
  private gatedId: string | null = null;

  constructor(
    private readonly renderer: Renderer,
    private readonly input: InputController,
    private readonly widgets: WidgetScope,
  ) {
    this.systemMenu = new WindowMenu(renderer, input, widgets);
  }

  get wins(): readonly WinState[] {
    return Object.freeze(this.windows.map(snapshot));
  }
  get focused(): string | null {
    return this.focusedId;
  }
  get gated(): string | null {
    return this.gatedId;
  }

  setTitle(id: string, title: string): void {
    const win = this.mutableById(id);
    if (win) win.title = title;
  }

  setMenuOpen(id: string, index: number): void {
    const win = this.mutableById(id);
    if (win) win.menu = { open: Number.isInteger(index) ? Math.max(-1, index) : -1 };
  }

  closeMenus(): void {
    this.closeSystemMenu();
    for (const win of this.windows) win.menu = { open: -1 };
  }

  focusDesktop(): void {
    if (this.windows.some((win) => win.modal && !win.minimized)) return;
    this.closeMenus();
    this.finishPlacement(true);
    this.focusedId = null;
  }

  requestClose(id: string): boolean {
    return this.windowCommand(id, 'close');
  }

  /** Consume requests only after accepted client input has run for this frame. */
  takeCloseRequests(): readonly string[] {
    const ids = [...this.closeRequests];
    this.closeRequests.clear();
    return ids;
  }

  /** Commit one display reflow without changing sessions, task order or the focused application. */
  resizeWorkArea(width: number, height: number): void {
    this.closeSystemMenu();
    this.finishPlacement(true);
    this.drag = this.resize = null;
    this.transitions.clear();
    this.taskBounds.clear();
    this.gatedId = null;
    for (const win of this.windows) {
      if (win.saved) win.saved = fitWindowToArea(win.saved, width, height);
      if (win.launchBounds) win.launchBounds = fitWindowToArea(win.launchBounds, width, height);
      const side = win.docked;
      Object.assign(
        win,
        win.maximized
          ? { x: 0, y: 0, w: width, h: height }
          : side
            ? this.dockedBounds(side, width, height)
            : fitWindowToArea(win, width, height),
      );
      win.menu = { open: -1 };
      win.k = 1;
    }
  }

  get reducedMotion(): boolean {
    return this.motionReduced;
  }
  set reducedMotion(value: boolean) {
    this.motionReduced = value;
    if (value) {
      this.transitions.clear();
      for (const win of this.windows) win.k = 1;
    }
  }

  /** The shell publishes actual task button geometry whenever its taskbar layout changes. */
  setTaskBounds(id: string, bounds: Readonly<WindowBounds>): void {
    this.taskBounds.set(id, pixelBounds(bounds));
    const motion = this.transitions.get(id);
    if (motion?.kind === 'minimize') motion.to = pixelBounds(bounds);
  }

  /** Refresh a live window's source; absent sources close toward the window caption. */
  setLaunchBounds(id: string, bounds: Readonly<WindowBounds> | undefined): void {
    const win = this.mutableById(id);
    if (!win) return;
    if (bounds) win.launchBounds = pixelBounds(bounds);
    else delete win.launchBounds;
  }

  private currentBounds(win: MutableWinState): WindowBounds {
    const motion = this.transitions.get(win.id);
    return motion
      ? motionBounds(motion)
      : win.minimized
        ? (this.taskBounds.get(win.id) ?? titleBounds(win))
        : pixelBounds(win);
  }

  private animate(
    win: MutableWinState,
    kind: WindowMotionKind,
    from: Readonly<WindowBounds>,
    to: Readonly<WindowBounds>,
  ): void {
    this.transitions.delete(win.id);
    win.menu = { open: -1 };
    if (
      this.reducedMotion ||
      (from.x === to.x && from.y === to.y && from.w === to.w && from.h === to.h)
    ) {
      win.k = 1;
      return;
    }
    this.transitions.set(win.id, createWindowMotion(kind, from, to));
    win.k = 0;
  }

  private finishMotion(win: MutableWinState): void {
    this.transitions.delete(win.id);
    win.k = 1;
  }

  open(spec: WinSpec): WinState {
    this.closeSystemMenu();
    this.finishPlacement(true);
    this.close(spec.id);
    const w: MutableWinState = {
      ...spec,
      ...(spec.launchBounds ? { launchBounds: pixelBounds(spec.launchBounds) } : {}),
      minW: spec.minW ?? spec.w,
      minH: spec.minH ?? spec.h,
      k: this.reducedMotion ? 1 : 0,
      minimized: false,
      maximized: false,
      saved: null,
      menu: { open: -1 },
    };
    const modalIndex = this.windows.findIndex((win) => win.modal && !win.minimized);
    this.windows.splice(!w.modal && modalIndex >= 0 ? modalIndex : this.windows.length, 0, w);
    this.openingOrder.push(w.id);
    this.focusedId = this.topModal()?.id ?? w.id;
    this.animate(w, 'open', w.launchBounds ?? titleBounds(w), w);
    return snapshot(w);
  }

  close(id: string): void {
    this.remove(id, true);
  }

  /** Roll back an uncommitted window without leaving a closing outline. */
  discard(id: string): void {
    this.remove(id, false);
  }

  /** Release the workspace, including outlines of already closed windows. */
  clear(): void {
    while (this.windows.length) this.discard(this.windows[this.windows.length - 1].id);
    this.transitions.clear();
    this.taskBounds.clear();
    this.switcher = false;
    this.desktopSnapshot = null;
    this.gatedId = null;
  }

  private remove(id: string, animate: boolean): void {
    this.openingOrder = this.openingOrder.filter((openId) => openId !== id);
    if (this.systemMenu.state?.id === id) this.closeSystemMenu();
    if (this.placement?.id === id) this.placement = null;
    if (this.desktopSnapshot) {
      this.desktopSnapshot.ids = this.desktopSnapshot.ids.filter((saved) => saved !== id);
      if (this.desktopSnapshot.focused === id) this.desktopSnapshot.focused = null;
    }
    const i = this.windows.findIndex((w) => w.id === id);
    if (i >= 0) {
      const w = this.windows[i];
      if (animate && !w.minimized)
        this.animate(w, 'close', this.currentBounds(w), w.launchBounds ?? titleBounds(w));
      else this.transitions.delete(id);
      this.windows.splice(i, 1);
    }
    this.closeRequests.delete(id);
    this.taskBounds.delete(id);
    if (this.focusedId === id)
      this.focusedId = this.windows.findLast((w) => !w.minimized)?.id ?? null;
    if (this.drag?.id === id) this.drag = null;
    if (this.resize?.id === id) this.resize = null;
    if (this.gatedId === id) this.gatedId = null;
    if (!animate) this.transitions.delete(id);
  }

  private mutableById(id: string): MutableWinState | undefined {
    return this.windows.find((w) => w.id === id);
  }

  byId(id: string): WinState | undefined {
    const win = this.mutableById(id);
    return win ? snapshot(win) : undefined;
  }

  /** Task placement and keyboard traversal stay stable when focus changes z-order. */
  taskWindows(): readonly WinState[] {
    return this.openingOrder.flatMap((id) => {
      const win = this.mutableById(id);
      return win && !win.modal && win.appId !== '$msg' ? [snapshot(win)] : [];
    });
  }

  cycleFocus(reverse = false): boolean {
    if (this.windows.some((win) => win.modal && !win.minimized)) return false;
    const tasks = this.taskWindows();
    if (!tasks.length) return false;
    const current = tasks.findIndex((win) => win.id === this.focusedId);
    const index =
      current < 0
        ? reverse
          ? tasks.length - 1
          : 0
        : (current + (reverse ? -1 : 1) + tasks.length) % tasks.length;
    this.closeSystemMenu();
    this.finishPlacement(true);
    this.drag = this.resize = null;
    this.restore(tasks[index].id);
    if (this.input.io.keyDown.has('Control') || this.input.io.keyDown.has('Meta'))
      this.switcher = true;
    return true;
  }

  focus(id: string): void {
    if (this.blockedByModal(id)) return;
    if (this.systemMenu.state?.id !== id) this.closeSystemMenu();
    if (this.placement?.id !== id) this.finishPlacement(true);
    for (const w of this.windows) if (w.id !== id) w.menu = { open: -1 };
    const i = this.windows.findIndex((w) => w.id === id);
    if (i >= 0) {
      const [w] = this.windows.splice(i, 1);
      this.windows.push(w);
      this.focusedId = id;
    }
  }

  minimize(id: string): void {
    const w = this.mutableById(id);
    if (!w || w.modal || w.minimized || this.blockedByModal(id) || !(w.ctl ?? 'mx').includes('m'))
      return;
    const from = this.currentBounds(w);
    if (this.systemMenu.state?.id === id) this.closeSystemMenu();
    if (this.placement?.id === id) this.finishPlacement(true);
    w.minimized = true;
    this.animate(w, 'minimize', from, this.taskBounds.get(id) ?? titleBounds(w));
    if (this.drag?.id === id) this.drag = null;
    if (this.resize?.id === id) this.resize = null;
    w.menu = { open: -1 };
    if (this.focusedId === id)
      this.focusedId = this.windows.findLast((win) => !win.minimized)?.id ?? null;
  }

  /** Restore from the current task button while retaining normal/maximized client bounds. */
  restore(id: string): void {
    const win = this.mutableById(id);
    if (!win || this.blockedByModal(id)) return;
    if (win.minimized) {
      const from = this.currentBounds(win);
      win.minimized = false;
      this.animate(win, 'restore', from, win);
    }
    this.focus(id);
  }

  toggleMaximize(id: string): void {
    const w = this.mutableById(id);
    if (!w || w.modal || this.blockedByModal(id) || !(w.ctl ?? 'mx').includes('m')) return;
    const from = this.currentBounds(w);
    this.closeSystemMenu();
    this.finishPlacement(true);
    this.drag = null;
    this.resize = null;
    w.minimized = false;
    if (w.maximized) {
      Object.assign(w, w.saved);
      w.maximized = false;
      w.saved = null;
    } else {
      if (!w.docked) w.saved = { x: w.x, y: w.y, w: w.w, h: w.h };
      w.maximized = true;
      Object.assign(w, { x: 0, y: 0, w: this.renderer.W, h: this.renderer.H - 22 });
    }
    delete w.docked;
    this.animate(w, w.maximized ? 'maximize' : 'unmaximize', from, w);
  }

  get systemMenuOpen(): boolean {
    return this.systemMenu.state !== null;
  }
  get interacting(): boolean {
    return this.systemMenuOpen || this.placement !== null;
  }
  get animating(): boolean {
    return this.transitions.size > 0 || this.windows.some((win) => win.k < 1);
  }
  get switcherVisible(): boolean {
    return this.switcher;
  }

  /** Hide the Ctrl+Tab switcher once Control and Meta are released. */
  syncSwitcher(): void {
    if (!this.input.io.keyDown.has('Control') && !this.input.io.keyDown.has('Meta'))
      this.switcher = false;
  }

  /** Close the system menu and cancel keyboard move or size, restoring its original rectangle. */
  cancelKeyboardGesture(): void {
    this.closeSystemMenu();
    this.finishPlacement(true);
  }
  get canRestoreDesktop(): boolean {
    return !!this.desktopSnapshot?.ids.some((id) => this.mutableById(id)?.minimized);
  }

  openSystemMenu(id: string, x?: number, y?: number): void {
    const win = this.mutableById(id);
    if (!win || this.blockedByModal(id)) return;
    this.finishPlacement(true);
    this.focus(id);
    win.menu = { open: -1 };
    this.drag = this.resize = null;
    this.systemMenu.open(win, x, y);
    this.gatedId = id;
  }

  closeSystemMenu(): void {
    this.systemMenu.close();
  }

  systemMenuBounds(): WindowBounds | null {
    const win = this.mutableById(this.systemMenu.state?.id ?? '');
    return win ? this.systemMenu.bounds(win) : null;
  }

  drawSystemMenu(): void {
    const win = this.mutableById(this.systemMenu.state?.id ?? '');
    if (!win) {
      this.closeSystemMenu();
      return;
    }
    const command = this.systemMenu.draw(win);
    if (command) this.windowCommand(win.id, command);
  }

  windowCommand(id: string, command: WindowCommand): boolean {
    const win = this.mutableById(id);
    if (
      !win ||
      this.blockedByModal(id) ||
      !windowMenuEntries(win).some((entry) => entry.command === command && !entry.disabled)
    )
      return false;
    this.closeSystemMenu();
    this.finishPlacement(true);
    if (command === 'restore') {
      if (win.minimized) {
        this.restore(id);
      } else if (win.maximized) this.toggleMaximize(win.id);
      else if (win.docked) {
        const from = this.currentBounds(win);
        this.undock(win);
        this.animate(win, 'unmaximize', from, win);
      }
    } else if (command === 'minimize') this.minimize(id);
    else if (command === 'maximize') {
      this.toggleMaximize(win.id);
      this.focus(id);
    } else if (command === 'dock-left' || command === 'dock-right') {
      this.finishMotion(win);
      this.focus(id);
      this.dock(win, command === 'dock-left' ? 'left' : 'right');
    } else if (command === 'close') this.closeRequests.add(id);
    else {
      this.finishMotion(win);
      this.focus(id);
      this.placement = {
        id,
        mode: command,
        original: { x: win.x, y: win.y, w: win.w, h: win.h },
        docked: win.docked,
        saved: win.saved,
        px: this.input.io.px,
        py: this.input.io.py,
      };
    }
    return true;
  }

  /** Call before shell shortcuts or app drawing; a handled frame belongs to the WM. */
  handleKeys(): boolean {
    if (this.input.io.cancelled) {
      const handled = this.interacting;
      this.drag = this.resize = null;
      this.cancelKeyboardGesture();
      return handled;
    }
    if (this.input.io.keyPressed.has('SystemMenu')) {
      this.input.consumeKey('SystemMenu');
      if (this.systemMenuOpen) this.closeSystemMenu();
      else if (this.focusedId) this.openSystemMenu(this.focusedId);
      return true;
    }
    if (!this.interacting) return false;
    if (
      ['StartMenu', 'F10', 'CycleWindow', 'CycleWindowReverse'].some((key) =>
        this.input.io.keyPressed.has(key),
      )
    ) {
      this.cancelKeyboardGesture();
      return false;
    }
    if (this.input.io.keyPressed.has('CloseWindow')) {
      this.input.consumeKey('CloseWindow');
      if (this.focusedId) this.windowCommand(this.focusedId, 'close');
      return true;
    }
    this.input.consumeText();
    for (const key of this.input.io.keyPressed) {
      this.input.consumeKey(key);
      if (this.placement) {
        if (key === 'Escape' || key === 'Enter') this.finishPlacement(key === 'Escape');
        else {
          const step = this.input.io.keyDown.has('Shift') ? 1 : 8;
          this.adjustPlacement(
            key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0,
            key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0,
          );
        }
      } else {
        const win = this.mutableById(this.systemMenu.state?.id ?? '');
        const command = win ? this.systemMenu.key(win, key) : null;
        if (win && command) this.windowCommand(win.id, command);
      }
    }
    return true;
  }

  private adjustPlacement(dx: number, dy: number): void {
    const action = this.placement,
      win = this.mutableById(action?.id ?? '');
    if (!action || !win) return;
    if (action.mode === 'size')
      Object.assign(
        win,
        resizeBounds(
          win,
          'se',
          dx,
          dy,
          win.minW ?? win.w,
          win.minH ?? win.h,
          this.renderer.W,
          this.renderer.H - 22,
        ),
      );
    else {
      win.x = R(clamp(win.x + dx, -win.w + 60, this.renderer.W - 60));
      win.y = R(clamp(win.y + dy, 0, this.renderer.H - 26));
    }
  }

  private finishPlacement(cancel: boolean): void {
    if (!this.placement) return;
    const win = this.mutableById(this.placement.id);
    if (win) {
      if (cancel) {
        Object.assign(win, this.placement.original);
        win.docked = this.placement.docked;
        win.saved = this.placement.saved;
      } else {
        delete win.docked;
        win.saved = null;
      }
    }
    this.placement = null;
  }

  arrange(mode: WindowArrangement): void {
    if (this.windows.some((win) => win.modal && !win.minimized)) return;
    this.closeSystemMenu();
    this.finishPlacement(true);
    this.drag = this.resize = null;
    const windows = this.windows.filter((win) => !win.minimized && !win.modal);
    for (const win of windows) {
      if (win.maximized) {
        Object.assign(win, win.saved);
        win.maximized = false;
      }
      delete win.docked;
      this.finishMotion(win);
    }
    const bounds = arrangeWindows(windows, mode, this.renderer.W, this.renderer.H - 22);
    windows.forEach((win, index) => {
      Object.assign(win, bounds[index]);
      win.saved = null;
      win.menu = { open: -1 };
    });
  }

  showDesktop(): void {
    if (this.windows.some((win) => win.modal && !win.minimized)) return;
    const ids = this.windows.filter((win) => !win.minimized).map((win) => win.id);
    if (!ids.length) return;
    this.desktopSnapshot = { ids, focused: this.focusedId };
    for (const id of ids) this.minimize(id);
  }

  restoreDesktop(): void {
    if (!this.desktopSnapshot || this.windows.some((win) => win.modal && !win.minimized)) return;
    const snapshot = this.desktopSnapshot;
    this.desktopSnapshot = null;
    for (const id of snapshot.ids) {
      const win = this.mutableById(id);
      if (win) this.restore(win.id);
    }
    if (snapshot.focused && this.mutableById(snapshot.focused)) this.focus(snapshot.focused);
    else this.focusedId = this.windows.findLast((win) => !win.minimized)?.id ?? null;
  }

  private mutableAtPoint(x: number, y: number): MutableWinState | null {
    for (let i = this.windows.length - 1; i >= 0; i--) {
      const w = this.windows[i];
      if (w.minimized) continue;
      if (x >= w.x && x < w.x + w.w && y >= w.y && y < w.y + w.h) return w;
    }
    return null;
  }

  private topModal(): MutableWinState | undefined {
    return this.windows.findLast((win) => win.modal && !win.minimized);
  }

  private blockedByModal(id: string): boolean {
    const modal = this.topModal();
    return !!modal && modal.id !== id;
  }

  topAtPoint(x: number, y: number): WinState | null {
    const win = this.mutableAtPoint(x, y);
    return win ? snapshot(win) : null;
  }

  /** Decide which window owns the mouse this frame. Call before drawing windows. */
  computeGate(blocked = false): void {
    if (blocked) {
      this.gatedId = null;
      return;
    }
    if (this.systemMenu.state) {
      this.gatedId = this.systemMenu.state.id;
      return;
    }
    if (this.placement) {
      this.gatedId = this.placement.id;
      this.input.requestCursor(this.placement.mode === 'size' ? 'size-nwse' : 'arrow');
      return;
    }
    const topModal = this.topModal();
    if (topModal) {
      this.gatedId = topModal.id;
      return;
    }
    if (this.resize) {
      this.gatedId = this.resize.id;
      this.input.requestCursor(resizeCursor(this.resize.edge));
      return;
    }
    if (this.drag) {
      this.gatedId = this.drag.id;
      return;
    }
    const popup = this.windows.find((w) => !w.minimized && w.menu.open >= 0);
    if (popup) {
      this.gatedId = popup.id;
      return;
    }
    const w = this.mutableAtPoint(this.input.io.px, this.input.io.py);
    this.gatedId = w ? w.id : null;
    // The outline reserves the destination rectangle; input must not fall through it.
    if (w && w.k < 1) return;
    // clicking a window focuses it (and starts a title drag if applicable)
    if (w && (this.input.io.wentDown || this.input.io.rwentDown)) this.focus(w.id);
    else if (!w && this.input.io.wentDown && this.input.io.py < this.renderer.H - 22)
      this.focusedId = null;
    if (w && !w.maximized && !w.modal && w.resizable !== false && (w.ctl ?? 'mx').includes('m')) {
      const edge = resizeEdgeAt(w, this.input.io.px, this.input.io.py);
      if (edge) {
        this.input.requestCursor(resizeCursor(edge));
        if (this.input.io.wentDown) {
          delete w.docked;
          w.saved = null;
          this.resize = {
            id: w.id,
            edge,
            x: this.input.io.px,
            y: this.input.io.py,
            bounds: { x: w.x, y: w.y, w: w.w, h: w.h },
          };
          w.menu = { open: -1 };
        }
      }
    }
  }

  tick(dt: number): void {
    const step = Number.isFinite(dt) ? Math.max(0, dt) / OPEN_T : 0;
    for (const [id, motion] of this.transitions) {
      motion.progress = this.reducedMotion ? 1 : Math.min(1, motion.progress + step);
      const win = this.mutableById(id);
      if (win) win.k = motion.progress;
      if (motion.progress >= 1) this.transitions.delete(id);
    }
    if (this.placement) {
      if (
        this.input.io.px >= 0 &&
        this.input.io.py >= 0 &&
        this.placement.px >= 0 &&
        this.placement.py >= 0
      )
        this.adjustPlacement(
          this.input.io.px - this.placement.px,
          this.input.io.py - this.placement.py,
        );
      this.placement.px = this.input.io.px;
      this.placement.py = this.input.io.py;
      if (this.input.io.wentDown || this.input.io.rwentDown) {
        this.finishPlacement(this.input.io.rwentDown);
        this.input.consumePointer();
      }
      return;
    }
    if (!this.input.io.down && !this.input.io.wentUp) {
      this.drag = null;
      this.resize = null;
      return;
    }
    if (this.resize) {
      const r = this.resize,
        w = this.mutableById(r.id);
      if (w && !w.maximized && !w.minimized)
        Object.assign(
          w,
          resizeBounds(
            r.bounds,
            r.edge,
            this.input.io.px - r.x,
            this.input.io.py - r.y,
            w.minW ?? r.bounds.w,
            w.minH ?? r.bounds.h,
            this.renderer.W,
            this.renderer.H - 22,
          ),
        );
      if (!this.input.io.down) this.resize = null;
      return;
    }
    if (this.drag) {
      const w = this.mutableById(this.drag.id);
      if (w && !w.maximized) {
        const area = this.renderer.getDisplayMetrics().workArea;
        const side = !this.canDock(w)
          ? null
          : this.input.io.px <= area.x
            ? 'left'
            : this.input.io.px >= area.x + area.w - 1
              ? 'right'
              : null;
        if (side) this.dock(w, side);
        else {
          if (w.docked) this.undock(w);
          w.x = R(clamp(this.input.io.px - this.drag.dx, -w.w + 60, this.renderer.W - 60));
          w.y = R(clamp(this.input.io.py - this.drag.dy, 0, this.renderer.H - 26));
        }
      }
    }
    if (!this.input.io.down) this.drag = null;
  }

  private workArea(): WindowBounds {
    const area = this.renderer.getDisplayMetrics().workArea;
    return { x: area.x, y: area.y, w: area.w, h: area.h };
  }

  private dockedBounds(
    side: 'left' | 'right',
    width = this.workArea().w,
    height = this.workArea().h,
    x = this.workArea().x,
    y = this.workArea().y,
  ): WindowBounds {
    const leftWidth = Math.floor(width / 2);
    if (side === 'left') return { x, y, w: leftWidth, h: height };
    return { x: x + leftWidth, y, w: width - leftWidth, h: height };
  }

  private canDock(win: MutableWinState): boolean {
    return (
      !win.minimized && !win.modal && win.resizable !== false && (win.ctl ?? 'mx').includes('m')
    );
  }

  /** Dock shares the maximize restore slot and keeps both halves inside the work area. */
  private dock(win: MutableWinState, side: 'left' | 'right'): void {
    if (!this.canDock(win)) return;
    if (!win.maximized && !win.docked) win.saved = { x: win.x, y: win.y, w: win.w, h: win.h };
    win.maximized = false;
    win.minimized = false;
    win.docked = side;
    Object.assign(win, this.dockedBounds(side));
  }

  private undock(win: MutableWinState): void {
    if (!win.docked) return;
    delete win.docked;
    Object.assign(win, win.saved);
    win.saved = null;
  }

  /** Centered list of task windows, clamped to the work area by the shared popup geometry. */
  drawSwitcher(): void {
    if (!this.switcher) return;
    const tasks = this.taskWindows();
    if (!tasks.length) return;
    const area = this.workArea();
    const capacity = Math.max(1, Math.floor((area.h - 6) / 18));
    const focused = Math.max(
      0,
      tasks.findIndex((task) => task.id === this.focusedId),
    );
    const start = Math.max(
      0,
      Math.min(tasks.length - capacity, focused - Math.floor(capacity / 2)),
    );
    const visible = tasks.slice(start, start + capacity);
    const labels = visible.map((task) => (task.title === '-' ? ' - ' : task.title));
    const measure = (label: string) => this.renderer.tw(label) + 22;
    const probe = popupLayout(0, 0, labels, measure, { w: area.w, h: area.h });
    const layout = popupLayout(
      area.x + Math.max(0, Math.round((area.w - probe.w) / 2)),
      area.y + Math.max(0, Math.round((area.h - probe.h) / 2)),
      labels,
      measure,
      { w: area.x + area.w, h: area.y + area.h },
    );
    this.widgets.bevel(layout.x, layout.y, layout.w, layout.h, 'window');
    visible.forEach((task, index) => {
      const row = layout.rows[index];
      if (!row || row.separator) return;
      const selected = task.id === this.focusedId;
      if (selected) this.renderer.rect(row.x, row.y, row.w, row.h, this.renderer.TH.sel);
      if (task.icon) this.renderer.spr(task.icon, row.x + 2, row.y + 1);
      this.renderer.text(
        truncateLabel(this.renderer.tw, task.title, 'ui', row.w - 24),
        row.x + 22,
        row.y + 5,
        {
          color: selected ? this.renderer.TH.selText : this.renderer.TH.text,
        },
      );
    });
  }

  /** All transition outlines are drawn above windows without scaling their client content. */
  drawTransitions(): void {
    for (const motion of this.transitions.values()) {
      const { x, y, w, h } = motionBounds(motion);
      const thickness = Math.min(2, w, h);
      this.renderer.dither(x, y, w, thickness, C.black, C.white);
      this.renderer.dither(x, y + h - thickness, w, thickness, C.black, C.white);
      this.renderer.dither(x, y, thickness, h, C.black, C.white);
      this.renderer.dither(x + w - thickness, y, thickness, h, C.black, C.white);
    }
  }

  draw(id: string, o: ChromeOpts = {}): DrawResult | null {
    const w = this.mutableById(id);
    if (!w) return null;
    const active = (o.active ?? true) && this.focusedId === w.id;
    const isGate = this.gatedId === w.id && !this.interacting;
    if (w.k < 1 || w.minimized) return null;
    const controls = w.ctl ?? 'mx';
    if (isGate && controls.includes('m')) {
      const maxX = w.x + w.w - 21 - (controls.includes('x') ? 18 : 0);
      const titleX = w.x + (w.icon || controls !== '' ? 23 : 3);
      const title = this.input.hit(titleX, w.y + 3, Math.max(0, maxX - 32 + 14 - titleX), 18);
      if (this.input.hit(maxX - 16, w.y + 5, 16, 14).clicked) {
        this.minimize(w.id);
        return null;
      }
      if (this.input.hit(maxX, w.y + 5, 16, 14).clicked || (title.clicked && this.input.io.dbl)) {
        this.toggleMaximize(w.id);
        if (w.k < 1) return null;
      }
    }
    this.widgets.bevel(w.x, w.y, w.w, w.h, 'window');
    this.renderer.rect(
      w.x + 3,
      w.y + 3,
      w.w - 6,
      18,
      active ? this.renderer.TH.title : this.renderer.TH.titleOff,
    );
    if (o.register === 'L1') {
      this.renderer.rect(w.x, w.y, w.w, w.h, C.navy);
      this.renderer.cp437(w.x, w.y, w.w, w.h, C.aqua, true);
      this.renderer.rect(w.x + 4, w.y + 4, w.w - 8, 16, active ? C.aqua : C.navy);
    }
    let tx = w.x + 6;
    if (w.icon) {
      this.renderer.spr(w.icon, w.x + 5, w.y + 4);
      tx = w.x + 24;
    } else if ((w.ctl ?? 'mx') !== '') {
      this.renderer.spr('i_doc', w.x + 5, w.y + 4);
      tx = w.x + 24;
    }
    if (isGate && (w.icon || (w.ctl ?? 'mx') !== '')) {
      const icon = this.input.hit(w.x + 3, w.y + 3, 19, 18);
      if (icon.clicked) {
        if (this.input.io.dbl) this.windowCommand(w.id, 'close');
        else this.openSystemMenu(w.id);
      }
    }
    let bx = w.x + w.w - 5 - 16;
    const ctl = w.ctl ?? 'mx';
    const bHit = (x: number, y: number): HitResult =>
      isGate ? this.input.hit(x, y, 16, 14) : NO_HIT;
    if (ctl.includes('x')) {
      const h = bHit(bx, w.y + 5);
      if (o.register === 'L1')
        this.renderer.text('[X]', bx - 4, w.y + 8, {
          font: 'dos',
          color: active ? C.navy : C.yellow,
        });
      else this.widgets.capBtn(bx, w.y + 5, 'x', w.noClose, h.held);
      if (h.clicked && !w.noClose) this.closeRequests.add(w.id);
      bx -= 18;
    }
    if (ctl.includes('m')) {
      const hMax = bHit(bx, w.y + 5);
      this.widgets.capBtn(bx, w.y + 5, w.maximized ? 'restore' : 'max', false, hMax.held);
      bx -= 16;
      const hMin = bHit(bx, w.y + 5);
      this.widgets.capBtn(bx, w.y + 5, 'min', false, hMin.held);
      bx -= 16;
    }
    const g = this.renderer.getCtx();
    g.save();
    try {
      g.beginPath();
      g.rect(w.x + 3, w.y + 3, Math.max(0, bx + 14 - w.x - 3), 18);
      g.clip();
      this.renderer.text(w.title, tx, w.y + 8, {
        font: o.register === 'L1' ? 'dos' : 'bold',
        color:
          o.register === 'L1'
            ? active
              ? C.navy
              : C.aqua
            : active
              ? this.renderer.TH.titleText
              : this.renderer.TH.face,
      });
    } finally {
      g.restore();
    }
    // title-bar drag
    if (isGate && !this.interacting) {
      const titleX = w.x + (tx === w.x + 24 ? 23 : 3);
      const r = this.input.hit(titleX, w.y + 3, Math.max(0, bx + 14 - titleX), 18);
      if (r.rclicked) this.openSystemMenu(w.id, this.input.io.px, this.input.io.py);
      if (r.held && this.input.io.wentDown && !this.drag && !this.resize && !w.maximized)
        this.drag = { id: w.id, dx: this.input.io.px - w.x, dy: this.input.io.py - w.y };
    }
    let cy = w.y + 22;
    let menuSel: MenuSel | null = null;
    if (this.interacting) this.input.setGate(null);
    if (o.menus)
      menuSel = this.widgets.menubar(w.x + 3, cy, o.menus, w.menu, active && !this.interacting);
    if (o.menus) cy += 18;
    if (o.status != null) {
      this.widgets.bevel(w.x + 3, w.y + w.h - 20, w.w - 6, 17, 'thin');
      this.renderer.text(
        truncateLabel(this.renderer.tw, o.status, o.statusFont ?? 'ui', w.w - 14),
        w.x + 7,
        w.y + w.h - 15,
        {
          color: this.renderer.TH.text,
          font: o.statusFont,
        },
      );
    }
    return { client: windowClient(w, !!o.menus, o.status != null), menuSel };
  }

  menuBounds(id: string, defs?: AppMenus) {
    const w = this.mutableById(id);
    if (!w) return null;
    const entries = Object.entries(defs ?? {});
    const selected = entries[w.menu.open];
    if (w.minimized || w.k < 1 || !selected) return null;
    const x =
      w.x +
      6 +
      entries.slice(0, w.menu.open).reduce((sum, item) => sum + this.renderer.tw(item[0]) + 18, 0);
    const {
      x: left,
      y,
      w: width,
      h,
    } = popupLayout(x, w.y + 39, menuLabels(selected[1]), this.renderer.tw, {
      w: this.renderer.W,
      h: this.renderer.H,
    });
    return { x: left, y, w: width, h };
  }

  drawMenuOverlay(id: string, defs?: AppMenus): void {
    const w = this.mutableById(id);
    if (!w) return;
    if (!defs || w.k < 1 || w.menu.open < 0) return;
    let x = w.x + 6;
    const entries = Object.entries(defs);
    for (let i = 0; i < w.menu.open; i++) x += this.renderer.tw(entries[i][0]) + 18;
    this.input.setGate(this.gatedId === w.id ? w.id : null);
    const items = entries[w.menu.open][1];
    this.widgets.menu(x, w.y + 39, menuLabels(items), w.menu.row ?? -1, undefined, {
      keyboard: w.menu.keyboard === true,
      presentation: items.map((entry) => (entry === '-' ? {} : entry)),
    });
  }
}

/** Taskbar task buttons need this: label truncation like the video's taskbar(). */
export function truncateLabel(
  tw: Renderer['tw'],
  label: string,
  font: FontName,
  avail: number,
): string {
  if (tw(label, font) <= avail) return label;
  const suffix = '...';
  if (tw(suffix, font) > avail) return '';
  // 二分查找 + 按码点截断：逐字符重测是 O(n²)，且 slice(0, -1) 会把
  // emoji / 星平面汉字劈成孤立代理项，画成豆腐块。
  const chars = Array.from(label);
  let lo = 0,
    hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (tw(chars.slice(0, mid).join('') + suffix, font) <= avail) lo = mid;
    else hi = mid - 1;
  }
  return chars.slice(0, lo).join('') + suffix;
}
