import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { WM, truncateLabel } from './wm';
import {
  createInputController,
  type InputController,
  type IO,
  type RawInput,
} from '../../ui/canvas/input';
import { createRenderer, type Renderer } from '../../gfx/context';
import { canvasFixture, makeTestCanvas } from '../../gfx/canvas-fixture';
import { createWidgetScope, type WidgetScope } from '../../ui/canvas/widgets';
import { displayMetrics } from '../../gfx/display-metrics';
import { TIMING } from '../../gfx/timing';
import { interpolateWindowBounds, titleBounds } from './window-motion';

let draw: Renderer;
let input: InputController;
let widgets: WidgetScope;
let io: IO;
const queueInput = (event: RawInput) => input.queueInput(event);
const beginFrame = (time: number) => input.beginFrame(time);

const spec = (id: string) => ({ id, appId: id, title: id, x: 10, y: 10, w: 200, h: 100 });

beforeEach(() => {
  draw = createRenderer(canvasFixture().canvas, { createCanvas: makeTestCanvas });
  input = createInputController();
  widgets = createWidgetScope(draw, input);
  io = input.io;
  vi.spyOn(draw, 'dither');
  queueInput({ cancel: true, px: 0, py: 0 });
  beginFrame(0);
  io.cancelled = false;
  io.cursor = 'arrow';
});

afterEach(() => {
  widgets.dispose();
  input.dispose();
  draw.dispose();
});

describe('window ownership', () => {
  it('publishes frozen snapshots and changes state only through commands', () => {
    const wm = new WM(draw, input, widgets);
    const initial = wm.open({ ...spec('app'), launchBounds: { x: 1, y: 2, w: 3, h: 4 } });
    const roster = wm.wins;
    expect(Object.isFrozen(roster)).toBe(true);
    expect(Object.isFrozen(initial)).toBe(true);
    expect(Object.isFrozen(initial.menu)).toBe(true);
    expect(Object.isFrozen(initial.launchBounds)).toBe(true);
    expect(Reflect.set(initial, 'title', 'outside')).toBe(false);
    expect(Reflect.set(initial.menu, 'open', 9)).toBe(false);
    wm.setTitle('app', 'Changed');
    wm.setMenuOpen('app', 2);
    wm.tick(TIMING.open);
    expect(initial).toMatchObject({ title: 'app', menu: { open: -1 }, k: 0 });
    expect(wm.byId('app')).toMatchObject({ title: 'Changed', menu: { open: 2 }, k: 1 });
    expect(wm.requestClose('app')).toBe(true);
    expect(wm.requestClose('app')).toBe(true);
    expect(wm.takeCloseRequests()).toEqual(['app']);
    expect(wm.takeCloseRequests()).toEqual([]);
    expect(wm.byId('app')).toBeDefined();
    wm.closeMenus();
    expect(wm.byId('app')?.menu.open).toBe(-1);
  });

  it('keeps input, dimensions and disposal independent between window managers', () => {
    const otherDraw = createRenderer(canvasFixture(800, 480).canvas, {
      createCanvas: makeTestCanvas,
    });
    const otherInput = createInputController();
    const otherWidgets = createWidgetScope(otherDraw, otherInput);
    try {
      const first = new WM(draw, input, widgets);
      const second = new WM(otherDraw, otherInput, otherWidgets);
      first.open(spec('app'));
      second.open(spec('app'));
      first.toggleMaximize('app');
      second.toggleMaximize('app');
      expect(first.byId('app')).toMatchObject({ w: 640, h: 338 });
      expect(second.byId('app')).toMatchObject({ w: 800, h: 458 });
      input.queueInput({ key: 'SystemMenu' });
      input.beginFrame(1);
      first.handleKeys();
      second.handleKeys();
      expect(first.systemMenuOpen).toBe(true);
      expect(second.systemMenuOpen).toBe(false);
      first.clear();
      second.windowCommand('app', 'restore');
      second.windowCommand('app', 'move');
      otherInput.queueInput({ key: 'ArrowRight' });
      otherInput.beginFrame(2);
      second.handleKeys();
      expect(second.byId('app')?.x).toBe(18);
    } finally {
      otherWidgets.dispose();
      otherInput.dispose();
      otherDraw.dispose();
    }
  });

  it('restores the drawing clip when caption drawing fails', () => {
    const wm = new WM(draw, input, widgets);
    wm.reducedMotion = true;
    wm.open(spec('app'));
    const context = draw.getCtx();
    vi.spyOn(context, 'restore').mockClear();
    vi.spyOn(draw, 'text').mockImplementationOnce(() => {
      throw new Error('draw failed');
    });
    expect(() => wm.draw('app')).toThrow('draw failed');
    expect(context.restore).toHaveBeenCalledOnce();
    expect(wm.draw('app')).not.toBeNull();
  });

  it('uses the supplied font measurement for task labels', () => {
    expect(truncateLabel((value) => String(value).length * 2, 'abcdefgh', 'ui', 12)).toBe('abc...');
    expect(truncateLabel((value) => String(value).length * 4, 'abcdefgh', 'ui', 12)).toBe('...');
  });
  it('renders Restore after maximizing and Maximize after restoring', () => {
    const wm = new WM(draw, input, widgets);
    wm.reducedMotion = true;
    const caption = vi.spyOn(widgets, 'capBtn');
    wm.open(spec('app'));
    wm.draw('app');
    expect(caption.mock.calls.some((call) => call[2] === 'max')).toBe(true);
    caption.mockClear();
    wm.windowCommand('app', 'maximize');
    wm.draw('app');
    expect(caption.mock.calls.some((call) => call[2] === 'restore')).toBe(true);
    expect(caption.mock.calls.some((call) => call[2] === 'max')).toBe(false);
    caption.mockClear();
    wm.windowCommand('app', 'restore');
    wm.draw('app');
    expect(caption.mock.calls.some((call) => call[2] === 'max')).toBe(true);
  });
  it('keeps application menu keys with the focused window and clears menu focus on desktop return', () => {
    const wm = new WM(draw, input, widgets);
    wm.reducedMotion = true;
    wm.open(spec('first'));
    wm.open(spec('second'));
    const menus = { File: [{ command: 'new', label: 'New' }] };
    queueInput({ key: 'F10' });
    beginFrame(1);
    wm.draw('first', { menus, active: false });
    expect(io.keyPressed.has('F10')).toBe(true);
    expect(wm.byId('first')?.menu.focused).toBeUndefined();
    wm.draw('second', { menus, active: true });
    expect(io.keyPressed.has('F10')).toBe(false);
    expect(wm.byId('second')?.menu).toMatchObject({ open: -1, focused: 0 });
    wm.focusDesktop();
    expect(wm.byId('second')?.menu.focused).toBeUndefined();
  });
  it('preserves menu marks and keyboard selection in the final popup overlay', () => {
    const text = vi.spyOn(draw, 'text');
    const rect = vi.spyOn(draw, 'rect');
    const overlayWidgets = createWidgetScope(draw, input);
    try {
      const wm = new WM(draw, input, overlayWidgets);
      wm.reducedMotion = true;
      wm.open(spec('app'));
      const menus = {
        View: [
          { command: 'checked', label: 'Checked', checked: true, default: true },
          { command: 'radio', label: 'Radio', checked: true, radio: true },
        ],
      };
      queueInput({ key: 'F10' });
      queueInput({ key: 'ArrowDown' });
      beginFrame(1);
      wm.draw('app', { menus });
      queueInput({ key: 'ArrowDown' });
      beginFrame(2);
      wm.draw('app', { menus });
      expect(wm.byId('app')?.menu.row).toBe(1);
      text.mockClear();
      rect.mockClear();
      wm.drawMenuOverlay('app', menus);
      expect(text.mock.calls.find(([label]) => label === 'Checked')?.[3]?.font).toBe('bold');
      expect(rect.mock.calls).toContainEqual([19, 70, expect.any(Number), 18, draw.TH.sel]);
      expect(rect.mock.calls).toContainEqual([22, 60, 2, 1, draw.TH.text]);
      expect(rect.mock.calls).toContainEqual([24, 77, 4, 4, draw.TH.selText]);
    } finally {
      overlayWidgets.dispose();
    }
  });
});

describe('anchored Windows transitions', () => {
  const launch = { x: 24, y: 128, w: 32, h: 32 };
  const task = { x: 410, y: 340, w: 76, h: 18 };
  const currentOutline = (wm: WM) => {
    vi.mocked(draw.dither).mockClear();
    wm.drawTransitions();
    const calls = vi.mocked(draw.dither).mock.calls;
    if (!calls.length) return null;
    return { x: calls[0][0], y: calls[0][1], w: calls[0][2], h: calls[2][3] };
  };

  it('discards an uncommitted window without an outline and allows the same ID to reopen', () => {
    const wm = new WM(draw, input, widgets);
    wm.open(spec('existing'));
    wm.tick(TIMING.open);
    wm.open(spec('failed'));
    wm.discard('failed');
    expect(wm.byId('failed')).toBeUndefined();
    expect(wm.taskWindows().map((win) => win.id)).toEqual(['existing']);
    expect(wm.focused).toBe('existing');
    expect(currentOutline(wm)).toBeNull();
    wm.open(spec('failed'));
    expect(wm.taskWindows().map((win) => win.id)).toEqual(['existing', 'failed']);
    expect(currentOutline(wm)).not.toBeNull();
  });

  it('clears live windows and already closing outlines idempotently', () => {
    const wm = new WM(draw, input, widgets);
    wm.open(spec('closed'));
    wm.tick(TIMING.open);
    wm.close('closed');
    wm.open(spec('live'));
    wm.clear();
    wm.clear();
    expect(wm.taskWindows()).toEqual([]);
    expect(wm.focused).toBeNull();
    expect(currentOutline(wm)).toBeNull();
  });

  it('opens at the launcher and exposes no client until the final rectangle is ready', () => {
    const wm = new WM(draw, input, widgets);
    const win = wm.open({ ...spec('app'), launchBounds: launch });
    expect(currentOutline(wm)).toEqual(launch);
    expect(wm.draw(win.id)).toBeNull();
    wm.tick(TIMING.open / 2);
    expect(currentOutline(wm)).toEqual(interpolateWindowBounds(launch, win, 0.5));
    expect(wm.draw(win.id)).toBeNull();
    expect([
      wm.byId(win.id)!.x,
      wm.byId(win.id)!.y,
      wm.byId(win.id)!.w,
      wm.byId(win.id)!.h,
    ]).toEqual([10, 10, 200, 100]);
    wm.tick(TIMING.open / 2);
    expect(wm.byId(win.id)!.k).toBe(1);
    expect(currentOutline(wm)).toBeNull();
  });

  it('minimizes to the actual task button and restores from that same rectangle', () => {
    const wm = new WM(draw, input, widgets);
    const win = wm.open({ ...spec('app'), launchBounds: launch });
    wm.tick(TIMING.open);
    wm.setTaskBounds(win.id, task);
    wm.minimize(win.id);
    expect(wm.byId(win.id)!.minimized).toBe(true);
    expect(wm.draw(win.id)).toBeNull();
    wm.tick(TIMING.open / 2);
    expect(currentOutline(wm)).toEqual(interpolateWindowBounds(win, task, 0.5));
    wm.tick(TIMING.open / 2);
    wm.restore(win.id);
    expect(wm.byId(win.id)!.minimized).toBe(false);
    expect(wm.focused).toBe(win.id);
    expect(currentOutline(wm)).toEqual(task);
    expect(wm.draw(win.id)).toBeNull();
    wm.tick(TIMING.open);
    expect(wm.byId(win.id)!.k).toBe(1);
  });

  it('keeps maximize and restore contents at stable endpoints during the outline', () => {
    const wm = new WM(draw, input, widgets);
    const win = wm.open(spec('app'));
    wm.tick(TIMING.open);
    wm.toggleMaximize(win.id);
    expect(currentOutline(wm)).toEqual({ x: 10, y: 10, w: 200, h: 100 });
    expect([
      wm.byId(win.id)!.x,
      wm.byId(win.id)!.y,
      wm.byId(win.id)!.w,
      wm.byId(win.id)!.h,
    ]).toEqual([0, 0, 640, 338]);
    expect(wm.draw(win.id)).toBeNull();
    wm.tick(TIMING.open);
    wm.toggleMaximize(win.id);
    expect(currentOutline(wm)).toEqual({ x: 0, y: 0, w: 640, h: 338 });
    expect([
      wm.byId(win.id)!.x,
      wm.byId(win.id)!.y,
      wm.byId(win.id)!.w,
      wm.byId(win.id)!.h,
    ]).toEqual([10, 10, 200, 100]);
    expect(wm.draw(win.id)).toBeNull();
  });

  it('reverses an interrupted minimize without jumping back to an endpoint', () => {
    const wm = new WM(draw, input, widgets);
    const win = wm.open(spec('app'));
    wm.tick(TIMING.open);
    wm.setTaskBounds(win.id, task);
    wm.minimize(win.id);
    wm.tick(TIMING.open / 2);
    const halfway = currentOutline(wm);
    wm.restore(win.id);
    expect(currentOutline(wm)).toEqual(halfway);
    wm.tick(TIMING.open);
    expect(wm.byId(win.id)!.k).toBe(1);
    expect(wm.byId(win.id)!.minimized).toBe(false);
  });

  it('closes toward the launch anchor after removal and does not keep a reused instance outline', () => {
    const wm = new WM(draw, input, widgets);
    const win = wm.open({ ...spec('app'), launchBounds: launch });
    wm.tick(TIMING.open);
    wm.close(win.id);
    expect(wm.byId(win.id)).toBeUndefined();
    wm.tick(TIMING.open / 2);
    expect(currentOutline(wm)).toEqual(interpolateWindowBounds(win, launch, 0.5));
    const replacement = wm.open({ ...spec('app'), x: 250, y: 150 });
    expect(currentOutline(wm)).toEqual(titleBounds(replacement));
    expect(vi.mocked(draw.dither).mock.calls).toHaveLength(4);
    expect(wm.taskWindows().map((entry) => entry.id)).toEqual(['app']);
  });

  it('closes toward a copied refreshed source without changing client bounds or opening motion', () => {
    const wm = new WM(draw, input, widgets);
    const win = wm.open({ ...spec('app'), launchBounds: launch });
    wm.tick(TIMING.open / 2);
    const opening = currentOutline(wm);
    const moved = { x: 326.4, y: 78.6, w: 31.8, h: 32.2 };
    wm.setLaunchBounds(win.id, moved);
    moved.x = 999;
    expect(currentOutline(wm)).toEqual(opening);
    expect([
      wm.byId(win.id)!.x,
      wm.byId(win.id)!.y,
      wm.byId(win.id)!.w,
      wm.byId(win.id)!.h,
    ]).toEqual([10, 10, 200, 100]);
    wm.tick(TIMING.open / 2);
    wm.close(win.id);
    wm.tick(TIMING.open / 2);
    expect(currentOutline(wm)).toEqual(
      interpolateWindowBounds(win, { x: 326, y: 79, w: 32, h: 32 }, 0.5),
    );
  });

  it('falls back to the caption when the launch source is no longer visible', () => {
    const wm = new WM(draw, input, widgets);
    const win = wm.open({ ...spec('app'), launchBounds: launch });
    wm.tick(TIMING.open);
    wm.setLaunchBounds(win.id, undefined);
    wm.close(win.id);
    wm.tick(TIMING.open / 2);
    expect(currentOutline(wm)).toEqual(interpolateWindowBounds(win, titleBounds(win), 0.5));
  });

  it('ignores source updates for missing windows and already closing instances', () => {
    const wm = new WM(draw, input, widgets);
    wm.setLaunchBounds('app', launch);
    expect(wm.taskWindows()).toEqual([]);
    const win = wm.open(spec('app'));
    expect(currentOutline(wm)).toEqual(titleBounds(win));
    wm.tick(TIMING.open);
    wm.close(win.id);
    wm.setLaunchBounds(win.id, launch);
    wm.tick(TIMING.open / 2);
    expect(currentOutline(wm)).toEqual(interpolateWindowBounds(win, titleBounds(win), 0.5));
  });

  it('reserves the hidden destination against click-through without starting a resize', () => {
    const wm = new WM(draw, input, widgets);
    wm.open(spec('underneath'));
    wm.tick(TIMING.open);
    const top = wm.open(spec('opening'));
    queueInput({ px: 209, py: 109, down: true });
    beginFrame(1);
    wm.computeGate();
    expect(wm.gated).toBe(top.id);
    expect(io.cursor).toBe('arrow');
    expect(wm.draw(top.id)).toBeNull();
  });

  it('copies host anchors and completes every motion when animation is disabled', () => {
    const wm = new WM(draw, input, widgets);
    const origin = { ...launch };
    const win = wm.open({ ...spec('app'), launchBounds: origin });
    origin.x = 999;
    expect(currentOutline(wm)).toEqual(launch);
    wm.reducedMotion = true;
    expect(wm.byId(win.id)!.k).toBe(1);
    expect(currentOutline(wm)).toBeNull();
    wm.setTaskBounds(win.id, task);
    wm.minimize(win.id);
    wm.restore(win.id);
    wm.toggleMaximize(win.id);
    expect(currentOutline(wm)).toBeNull();
    expect(wm.byId(win.id)!.k).toBe(1);
    expect(wm.byId(win.id)!.maximized).toBe(true);
    wm.close(win.id);
    expect(currentOutline(wm)).toBeNull();
  });
});

const pressKey = (wm: WM, key: string) => {
  io.keyPressed.add(key);
  return wm.handleKeys();
};

describe('window focus and bounds', () => {
  it('reflows maximized and restored bounds without changing task order or focus', () => {
    const wm = new WM(draw, input, widgets);
    wm.reducedMotion = true;
    const normal = wm.open({ ...spec('normal'), x: 750, y: 430, w: 500, h: 300 });
    const maximized = wm.open({ ...spec('maximized'), x: 720, y: 410, w: 480, h: 280 });
    wm.toggleMaximize(maximized.id);
    wm.resizeWorkArea(800, 426);
    expect([
      wm.byId(normal.id)!.x,
      wm.byId(normal.id)!.y,
      wm.byId(normal.id)!.w,
      wm.byId(normal.id)!.h,
    ]).toEqual([300, 126, 500, 300]);
    expect([
      wm.byId(maximized.id)!.x,
      wm.byId(maximized.id)!.y,
      wm.byId(maximized.id)!.w,
      wm.byId(maximized.id)!.h,
    ]).toEqual([0, 0, 800, 426]);
    expect(wm.focused).toBe('maximized');
    expect(wm.taskWindows().map((win) => win.id)).toEqual(['normal', 'maximized']);
    wm.toggleMaximize(maximized.id);
    expect([
      wm.byId(maximized.id)!.x,
      wm.byId(maximized.id)!.y,
      wm.byId(maximized.id)!.w,
      wm.byId(maximized.id)!.h,
    ]).toEqual([320, 146, 480, 280]);
  });

  it('releases an active resize gesture before using a new work area', () => {
    const wm = new WM(draw, input, widgets);
    wm.reducedMotion = true;
    const win = wm.open(spec('app'));
    queueInput({ px: 209, py: 109, down: true });
    beginFrame(1);
    wm.computeGate();
    queueInput({ px: 309, py: 159 });
    beginFrame(2);
    wm.tick(0.016);
    expect(wm.byId(win.id)!.w).toBe(300);
    wm.resizeWorkArea(960, 514);
    queueInput({ px: 609, py: 400 });
    beginFrame(3);
    wm.tick(0.016);
    expect(wm.byId(win.id)!.w).toBe(300);
    expect(wm.byId(win.id)!.h).toBe(150);
  });
  it('cycles through every task in stable creation order despite z-order changes', () => {
    const wm = new WM(draw, input, widgets);
    wm.open(spec('first'));
    wm.open(spec('second'));
    wm.open(spec('third'));
    expect(wm.cycleFocus()).toBe(true);
    expect(wm.focused).toBe('first');
    wm.cycleFocus();
    expect(wm.focused).toBe('second');
    wm.cycleFocus();
    expect(wm.focused).toBe('third');
    wm.cycleFocus(true);
    expect(wm.focused).toBe('second');
    wm.cycleFocus(true);
    expect(wm.focused).toBe('first');
    wm.cycleFocus(true);
    expect(wm.focused).toBe('third');
    expect(wm.taskWindows().map((win) => win.id)).toEqual(['first', 'second', 'third']);
  });

  it('restores a minimized task without losing maximized bounds', () => {
    const wm = new WM(draw, input, widgets),
      first = wm.open(spec('first'));
    wm.toggleMaximize(first.id);
    wm.minimize(first.id);
    wm.open(spec('second'));
    wm.cycleFocus();
    expect(wm.focused).toBe(first.id);
    expect(wm.byId(first.id)!.minimized).toBe(false);
    expect(wm.byId(first.id)!.maximized).toBe(true);
    wm.toggleMaximize(first.id);
    expect([
      wm.byId(first.id)!.x,
      wm.byId(first.id)!.y,
      wm.byId(first.id)!.w,
      wm.byId(first.id)!.h,
    ]).toEqual([10, 10, 200, 100]);
  });

  it('starts at either end from the desktop and puts reopened tasks at the end', () => {
    const wm = new WM(draw, input, widgets);
    expect(wm.cycleFocus()).toBe(false);
    wm.open(spec('first'));
    wm.open(spec('second'));
    wm.close('first');
    wm.open(spec('first'));
    expect(wm.taskWindows().map((win) => win.id)).toEqual(['second', 'first']);
    wm.focusDesktop();
    wm.cycleFocus();
    expect(wm.focused).toBe('second');
    wm.focusDesktop();
    wm.cycleFocus(true);
    expect(wm.focused).toBe('first');
  });

  it('does not cycle past a modal and omits dialogs from the taskbar', () => {
    const wm = new WM(draw, input, widgets);
    wm.open(spec('first'));
    wm.open({ ...spec('dialog'), appId: '$msg', modal: true });
    expect(wm.cycleFocus()).toBe(false);
    expect(wm.cycleFocus(true)).toBe(false);
    expect(wm.focused).toBe('dialog');
    expect(wm.taskWindows().map((win) => win.id)).toEqual(['first']);
  });

  it('cancels an unfinished keyboard move before cycling to another task', () => {
    const wm = new WM(draw, input, widgets);
    wm.open(spec('first'));
    const second = wm.open(spec('second'));
    wm.windowCommand(second.id, 'move');
    pressKey(wm, 'ArrowRight');
    expect(wm.byId(second.id)!.x).toBe(18);
    wm.cycleFocus();
    expect(wm.byId(second.id)!.x).toBe(10);
    expect(wm.interacting).toBe(false);
    expect(wm.focused).toBe('first');
  });

  it('returns focus to a visible window after minimizing and closing', () => {
    const wm = new WM(draw, input, widgets);
    wm.open(spec('first'));
    wm.open(spec('second'));
    wm.open(spec('third'));
    wm.minimize('second');
    wm.close('third');
    expect(wm.focused).toBe('first');
    wm.minimize('first');
    expect(wm.focused).toBe(null);
  });

  it('restores original bounds after a maximize cycle', () => {
    const wm = new WM(draw, input, widgets),
      win = wm.open(spec('app'));
    wm.toggleMaximize(win.id);
    expect(wm.byId(win.id)!.h).toBe(338);
    wm.toggleMaximize(win.id);
    expect({
      x: wm.byId(win.id)!.x,
      y: wm.byId(win.id)!.y,
      w: wm.byId(win.id)!.w,
      h: wm.byId(win.id)!.h,
    }).toEqual({ x: 10, y: 10, w: 200, h: 100 });
  });

  it('blocks underlying windows as soon as a modal opens', () => {
    const wm = new WM(draw, input, widgets);
    wm.open(spec('first'));
    wm.open({ ...spec('dialog'), modal: true });
    io.px = 600;
    io.py = 300;
    wm.computeGate();
    expect(wm.gated).toBe('dialog');
    wm.minimize('dialog');
    expect(wm.byId('dialog')?.minimized).toBe(false);
  });

  it('keeps the top modal above new tasks and rejects background focus and commands', () => {
    const wm = new WM(draw, input, widgets);
    wm.reducedMotion = true;
    wm.open(spec('first'));
    wm.open({ ...spec('dialog'), modal: true });
    wm.open(spec('late'));
    wm.focus('first');
    wm.restore('late');
    wm.toggleMaximize('first');
    wm.minimize('first');
    expect(wm.focused).toBe('dialog');
    expect(wm.wins.at(-1)?.id).toBe('dialog');
    expect(wm.byId('first')).toMatchObject({ minimized: false, maximized: false });
    expect(wm.requestClose('first')).toBe(false);
    wm.open({ ...spec('second-dialog'), modal: true });
    wm.focus('dialog');
    wm.openSystemMenu('second-dialog');
    expect(wm.focused).toBe('second-dialog');
    expect(wm.systemMenuOpen).toBe(true);
    wm.close('second-dialog');
    expect(wm.focused).toBe('dialog');
    wm.close('dialog');
    expect(wm.focused).toBe('late');
  });

  it('applies maximize and docking availability to direct host commands', () => {
    const wm = new WM(draw, input, widgets);
    wm.reducedMotion = true;
    wm.open({ ...spec('fixed'), ctl: 'x' });
    wm.toggleMaximize('fixed');
    wm.minimize('fixed');
    expect(wm.byId('fixed')).toMatchObject({ minimized: false, maximized: false, w: 200, h: 100 });
    expect(wm.windowCommand('fixed', 'dock-left')).toBe(false);
  });

  it('captures input for popup menus beyond the parent window bounds', () => {
    const wm = new WM(draw, input, widgets),
      win = wm.open(spec('app'));
    wm.setMenuOpen(win.id, 0);
    io.px = 600;
    io.py = 300;
    wm.computeGate();
    expect(wm.gated).toBe('app');
  });

  it('captures a corner resize outside the window and preserves resized restore bounds', () => {
    const wm = new WM(draw, input, widgets),
      win = wm.open(spec('app'));
    wm.tick(TIMING.open);
    io.px = 209;
    io.py = 109;
    io.down = io.wentDown = true;
    wm.computeGate();
    expect(io.cursor).toBe('size-nwse');
    io.wentDown = false;
    io.px = 350;
    io.py = 220;
    wm.tick(0.016);
    wm.computeGate();
    expect(wm.gated).toBe('app');
    expect(wm.byId(win.id)!.w).toBe(341);
    expect(wm.byId(win.id)!.h).toBe(211);
    io.down = false;
    wm.tick(0.016);
    wm.toggleMaximize(win.id);
    wm.toggleMaximize(win.id);
    expect(wm.byId(win.id)!.w).toBe(341);
    expect(wm.byId(win.id)!.h).toBe(211);
  });

  it('protects legacy app minimums and allows explicit smaller HTML minimums', () => {
    for (const minW of [undefined, 120]) {
      const wm = new WM(draw, input, widgets),
        win = wm.open({ ...spec('app'), minW });
      wm.tick(TIMING.open);
      io.px = 209;
      io.py = 60;
      io.down = io.wentDown = true;
      wm.computeGate();
      io.wentDown = false;
      io.px = 80;
      wm.tick(0.016);
      expect(wm.byId(win.id)!.w).toBe(minW ?? 200);
      wm.close(win.id);
    }
  });

  it('applies the final release position, then releases capture', () => {
    const wm = new WM(draw, input, widgets),
      win = wm.open(spec('app'));
    wm.tick(TIMING.open);
    io.px = 209;
    io.py = 60;
    io.down = io.wentDown = true;
    wm.computeGate();
    io.wentDown = io.down = false;
    io.wentUp = true;
    io.px = 309;
    wm.tick(0.016);
    expect(wm.byId(win.id)!.w).toBe(300);
    io.px = 600;
    io.wentUp = false;
    wm.computeGate();
    expect(wm.gated).toBe(null);
  });

  it('never starts resize on maximized windows, dialogs, or title controls', () => {
    for (const mode of ['maximized', 'modal', 'fixed', 'title']) {
      const wm = new WM(draw, input, widgets),
        win = wm.open({ ...spec('app'), modal: mode === 'modal', resizable: mode !== 'fixed' });
      wm.tick(TIMING.open);
      if (mode === 'maximized') wm.toggleMaximize(win.id);
      io.cursor = 'arrow';
      io.px = wm.byId(win.id)!.x + wm.byId(win.id)!.w - (mode === 'title' ? 10 : 1);
      io.py = wm.byId(win.id)!.y + 10;
      io.down = io.wentDown = true;
      wm.computeGate();
      expect(io.cursor).toBe('arrow');
    }
  });
});

describe('window system menu', () => {
  it('opens with the system shortcut and captures input outside the window', () => {
    const wm = new WM(draw, input, widgets),
      win = wm.open(spec('app'));
    wm.setMenuOpen(win.id, 0);
    expect(pressKey(wm, 'SystemMenu')).toBe(true);
    expect(wm.systemMenuOpen).toBe(true);
    expect(wm.byId(win.id)!.menu.open).toBe(-1);
    io.px = 639;
    io.py = 359;
    wm.computeGate();
    expect(wm.gated).toBe(win.id);
    expect(io.keyPressed.size).toBe(0);
    pressKey(wm, 'Escape');
    expect(wm.interacting).toBe(false);
    expect(wm.focused).toBe(win.id);
  });

  it('skips unavailable Restore and performs the first enabled command with Enter', () => {
    const wm = new WM(draw, input, widgets),
      win = wm.open(spec('app'));
    wm.openSystemMenu(win.id);
    pressKey(wm, 'Home');
    pressKey(wm, 'Enter');
    expect(wm.systemMenuOpen).toBe(false);
    expect(wm.interacting).toBe(true);
    pressKey(wm, 'ArrowRight');
    expect(wm.byId(win.id)!.x).toBe(18);
  });

  it('navigates past the separator and activates Close with End then Enter', () => {
    const wm = new WM(draw, input, widgets),
      win = wm.open(spec('app'));
    wm.openSystemMenu(win.id);
    pressKey(wm, 'End');
    pressKey(wm, 'Enter');
    expect(wm.takeCloseRequests()).toEqual([win.id]);
    expect(wm.interacting).toBe(false);
  });

  it('wraps keyboard navigation over enabled commands', () => {
    const wm = new WM(draw, input, widgets),
      win = wm.open(spec('app'));
    wm.openSystemMenu(win.id);
    pressKey(wm, 'Home');
    pressKey(wm, 'ArrowUp');
    pressKey(wm, 'Enter');
    expect(wm.takeCloseRequests()).toEqual([win.id]);
  });

  it.each(['F10', 'StartMenu'])(
    'preserves %s and the close shortcut while a menu is open',
    (key) => {
      const wm = new WM(draw, input, widgets),
        win = wm.open(spec('app'));
      wm.openSystemMenu(win.id);
      expect(pressKey(wm, key)).toBe(false);
      expect(wm.systemMenuOpen).toBe(false);
      expect(io.keyPressed.has(key)).toBe(true);
      io.keyPressed.clear();
      wm.openSystemMenu(win.id);
      expect(pressKey(wm, 'CloseWindow')).toBe(true);
      expect(wm.takeCloseRequests()).toEqual([win.id]);
    },
  );

  it('uses mnemonics while consuming typed input before apps see it', () => {
    const wm = new WM(draw, input, widgets),
      win = wm.open(spec('app'));
    wm.openSystemMenu(win.id);
    io.typed = 'x';
    pressKey(wm, 'x');
    expect(wm.byId(win.id)!.maximized).toBe(true);
    expect(io.typed).toBe('');
    expect(io.keyPressed.size).toBe(0);
  });

  it('never runs unavailable commands on a fixed or protected window', () => {
    const wm = new WM(draw, input, widgets),
      win = wm.open({ ...spec('dialog'), modal: true, noClose: true, ctl: 'x' });
    for (const command of ['restore', 'size', 'minimize', 'maximize', 'close'] as const)
      expect(wm.windowCommand(win.id, command)).toBe(false);
    expect(wm.takeCloseRequests()).toEqual([]);
    expect(wm.byId(win.id)!.minimized).toBe(false);
  });

  it('restores a minimized maximized window without losing its normal bounds', () => {
    const wm = new WM(draw, input, widgets),
      win = wm.open(spec('app'));
    wm.toggleMaximize(win.id);
    wm.minimize(win.id);
    wm.openSystemMenu(win.id, 620, 338);
    pressKey(wm, 'r');
    expect(wm.byId(win.id)!.minimized).toBe(false);
    expect(wm.byId(win.id)!.maximized).toBe(true);
    wm.windowCommand(win.id, 'restore');
    expect({
      x: wm.byId(win.id)!.x,
      y: wm.byId(win.id)!.y,
      w: wm.byId(win.id)!.w,
      h: wm.byId(win.id)!.h,
    }).toEqual({ x: 10, y: 10, w: 200, h: 100 });
  });

  it('clamps taskbar menus above the taskbar and blocks opening behind modals', () => {
    const wm = new WM(draw, input, widgets),
      win = wm.open(spec('app'));
    wm.openSystemMenu(win.id, 639, 359);
    const bounds = wm.systemMenuBounds()!;
    expect(bounds.x + bounds.w).toBeLessThanOrEqual(640);
    expect(bounds.y + bounds.h).toBeLessThanOrEqual(338);
    wm.open({ ...spec('modal'), modal: true });
    wm.openSystemMenu(win.id);
    expect(wm.systemMenuOpen).toBe(false);
    expect(wm.focused).toBe('modal');
  });
});

describe('keyboard move and size', () => {
  it('commits arrow movement with Enter and restores a later cancelled move', () => {
    const wm = new WM(draw, input, widgets),
      win = wm.open(spec('app'));
    wm.windowCommand(win.id, 'move');
    pressKey(wm, 'ArrowLeft');
    io.keyDown.add('Shift');
    pressKey(wm, 'ArrowUp');
    pressKey(wm, 'Enter');
    expect([wm.byId(win.id)!.x, wm.byId(win.id)!.y]).toEqual([2, 9]);
    expect(wm.interacting).toBe(false);
    wm.windowCommand(win.id, 'move');
    pressKey(wm, 'ArrowRight');
    pressKey(wm, 'Escape');
    expect([wm.byId(win.id)!.x, wm.byId(win.id)!.y]).toEqual([2, 9]);
  });

  it('enforces minimum size and the taskbar boundary during keyboard sizing', () => {
    const wm = new WM(draw, input, widgets),
      win = wm.open({ ...spec('app'), x: 430, y: 230, minW: 196, minH: 96 });
    wm.windowCommand(win.id, 'size');
    pressKey(wm, 'ArrowLeft');
    pressKey(wm, 'ArrowUp');
    expect([wm.byId(win.id)!.w, wm.byId(win.id)!.h]).toEqual([196, 96]);
    for (let i = 0; i < 5; i++) {
      pressKey(wm, 'ArrowRight');
      pressKey(wm, 'ArrowDown');
    }
    expect([wm.byId(win.id)!.w, wm.byId(win.id)!.h]).toEqual([210, 108]);
    pressKey(wm, 'Escape');
    expect([wm.byId(win.id)!.w, wm.byId(win.id)!.h]).toEqual([200, 100]);
  });

  it('allows pointer adjustment and consumes the click that commits placement', () => {
    const wm = new WM(draw, input, widgets),
      win = wm.open(spec('app'));
    wm.windowCommand(win.id, 'move');
    io.px = 20;
    io.py = 30;
    wm.tick(0.016);
    expect([wm.byId(win.id)!.x, wm.byId(win.id)!.y]).toEqual([30, 40]);
    io.wentDown = io.down = true;
    wm.tick(0.016);
    expect(wm.interacting).toBe(false);
    expect(io.wentDown).toBe(false);
  });

  it('cancels an unfinished placement when the host loses input ownership', () => {
    const wm = new WM(draw, input, widgets),
      win = wm.open(spec('app'));
    wm.windowCommand(win.id, 'size');
    pressKey(wm, 'ArrowRight');
    queueInput({ cancel: true });
    beginFrame(1);
    expect(wm.handleKeys()).toBe(true);
    expect(wm.interacting).toBe(false);
    expect(wm.byId(win.id)!.w).toBe(200);
  });
});

describe('desktop window arrangements', () => {
  it('tiles visible windows and leaves minimized windows untouched', () => {
    const wm = new WM(draw, input, widgets),
      first = wm.open(spec('first')),
      second = wm.open(spec('second'));
    const hidden = wm.open(spec('hidden'));
    wm.minimize(hidden.id);
    wm.toggleMaximize(first.id);
    wm.arrange('vertical');
    expect([
      wm.byId(first.id)!.x,
      wm.byId(first.id)!.y,
      wm.byId(first.id)!.w,
      wm.byId(first.id)!.h,
      wm.byId(first.id)!.maximized,
    ]).toEqual([0, 0, 320, 338, false]);
    expect([
      wm.byId(second.id)!.x,
      wm.byId(second.id)!.y,
      wm.byId(second.id)!.w,
      wm.byId(second.id)!.h,
    ]).toEqual([320, 0, 320, 338]);
    expect([
      wm.byId(hidden.id)!.x,
      wm.byId(hidden.id)!.y,
      wm.byId(hidden.id)!.w,
      wm.byId(hidden.id)!.h,
      wm.byId(hidden.id)!.minimized,
    ]).toEqual([10, 10, 200, 100, true]);
    wm.toggleMaximize(first.id);
    wm.toggleMaximize(first.id);
    expect(wm.byId(first.id)!.w).toBe(320);
  });

  it('cascades windows with visible title bars and preserves fixed app dimensions', () => {
    const wm = new WM(draw, input, widgets),
      first = wm.open(spec('first')),
      fixed = wm.open({ ...spec('fixed'), resizable: false });
    wm.arrange('cascade');
    expect([wm.byId(first.id)!.x, wm.byId(first.id)!.y]).toEqual([0, 0]);
    expect([
      wm.byId(fixed.id)!.x,
      wm.byId(fixed.id)!.y,
      wm.byId(fixed.id)!.w,
      wm.byId(fixed.id)!.h,
    ]).toEqual([22, 22, 200, 100]);
  });

  it('preserves legacy minimum sizes when many horizontal tiles must overlap', () => {
    const wm = new WM(draw, input, widgets);
    for (let i = 0; i < 5; i++) wm.open(spec(String(i)));
    wm.arrange('horizontal');
    for (const win of wm.wins) {
      expect(wm.byId(win.id)!.h).toBe(100);
      expect(wm.byId(win.id)!.y + wm.byId(win.id)!.h).toBeLessThanOrEqual(338);
      expect(Number.isInteger(wm.byId(win.id)!.y)).toBe(true);
    }
  });

  it('restores only windows minimized by Show Desktop and preserves their states', () => {
    const wm = new WM(draw, input, widgets),
      first = wm.open(spec('first')),
      hidden = wm.open(spec('hidden'));
    wm.minimize(hidden.id);
    wm.focus(first.id);
    wm.toggleMaximize(first.id);
    wm.showDesktop();
    wm.showDesktop();
    expect(wm.focused).toBe(null);
    wm.restoreDesktop();
    expect(wm.byId(first.id)!.minimized).toBe(false);
    expect(wm.byId(first.id)!.maximized).toBe(true);
    expect(wm.byId(hidden.id)!.minimized).toBe(true);
    expect(wm.focused).toBe(first.id);
  });

  it('does not rearrange or hide windows while a modal is active', () => {
    const wm = new WM(draw, input, widgets),
      first = wm.open(spec('first'));
    wm.open({ ...spec('modal'), modal: true });
    wm.arrange('cascade');
    wm.showDesktop();
    expect([
      wm.byId(first.id)!.x,
      wm.byId(first.id)!.y,
      wm.byId(first.id)!.w,
      wm.byId(first.id)!.h,
      wm.byId(first.id)!.minimized,
    ]).toEqual([10, 10, 200, 100, false]);
    expect(wm.focused).toBe('modal');
  });

  it('does not restore a newly opened instance that reused a previously hidden id', () => {
    const wm = new WM(draw, input, widgets);
    wm.open(spec('app'));
    wm.showDesktop();
    expect(wm.canRestoreDesktop).toBe(true);
    wm.close('app');
    const replacement = wm.open(spec('app'));
    wm.minimize(replacement.id);
    wm.restoreDesktop();
    expect(wm.byId(replacement.id)!.minimized).toBe(true);
    expect(wm.canRestoreDesktop).toBe(false);
  });
});

describe('docking and the window switcher', () => {
  it('restores normal bounds from docking and after docking then maximizing', () => {
    const wm = new WM(draw, input, widgets);
    wm.reducedMotion = true;
    const win = wm.open(spec('app'));
    wm.windowCommand(win.id, 'dock-left');
    expect(wm.windowCommand(win.id, 'restore')).toBe(true);
    expect(wm.byId(win.id)).toMatchObject({ x: 10, y: 10, w: 200, h: 100, saved: null });
    wm.windowCommand(win.id, 'dock-right');
    wm.toggleMaximize(win.id);
    wm.toggleMaximize(win.id);
    expect(wm.byId(win.id)).toMatchObject({ x: 10, y: 10, w: 200, h: 100, saved: null });
    expect(wm.byId(win.id)?.docked).toBeUndefined();
  });

  it('keeps docking on cancelled placement and adopts committed placement as normal bounds', () => {
    const wm = new WM(draw, input, widgets);
    wm.reducedMotion = true;
    const win = wm.open(spec('app'));
    wm.windowCommand(win.id, 'dock-left');
    wm.windowCommand(win.id, 'move');
    pressKey(wm, 'ArrowRight');
    pressKey(wm, 'Escape');
    expect(wm.byId(win.id)).toMatchObject({ x: 0, docked: 'left' });
    wm.windowCommand(win.id, 'restore');
    expect(wm.byId(win.id)).toMatchObject({ x: 10, y: 10, w: 200, h: 100 });
    wm.windowCommand(win.id, 'dock-right');
    wm.windowCommand(win.id, 'size');
    pressKey(wm, 'ArrowLeft');
    pressKey(wm, 'Enter');
    const committed = wm.byId(win.id)!;
    expect(committed.docked).toBeUndefined();
    wm.resizeWorkArea(960, 514);
    expect(wm.byId(win.id)?.w).toBe(committed.w);
  });

  it('keeps the selected task and fitted labels visible in an overflowing switcher', () => {
    const wm = new WM(draw, input, widgets);
    wm.reducedMotion = true;
    const text = vi.spyOn(draw, 'text');
    for (let index = 0; index < 40; index++)
      wm.open({ ...spec(`app-${index}`), title: `Window ${index} ${'long '.repeat(30)}` });
    io.keyDown.add('Control');
    wm.cycleFocus(true);
    wm.drawSwitcher();
    const labels = text.mock.calls.filter((call) => String(call[0]).startsWith('Window '));
    expect(labels.length).toBeLessThan(40);
    const selected = labels.find((call) => call[3]?.color === draw.TH.selText);
    expect(selected?.[0]).toMatch(/^Window 38 /);
    for (const [label, x, y] of labels) {
      expect(x + draw.tw(String(label))).toBeLessThanOrEqual(draw.W);
      expect(y + draw.capH('ui')).toBeLessThanOrEqual(draw.H - 22);
    }
  });

  it('docks a resizable window to either work-area half', () => {
    draw.setDisplayMetrics(displayMetrics({ width: 960, height: 540 }));
    const wm = new WM(draw, input, widgets);
    wm.reducedMotion = true;
    const win = wm.open(spec('app'));
    expect(wm.windowCommand(win.id, 'dock-left')).toBe(true);
    const area = draw.getDisplayMetrics().workArea;
    const left = wm.byId(win.id)!;
    expect(left).toMatchObject({
      x: area.x,
      y: area.y,
      w: Math.floor(area.w / 2),
      h: area.h,
      maximized: false,
    });
    expect(left.saved).toEqual({ x: 10, y: 10, w: 200, h: 100 });
    expect(left.x + left.w).toBeLessThanOrEqual(area.x + area.w);
    expect(left.y + left.h).toBeLessThanOrEqual(area.y + area.h);
    expect(wm.windowCommand(win.id, 'dock-right')).toBe(true);
    const right = wm.byId(win.id)!;
    expect(right.x).toBe(area.x + Math.floor(area.w / 2));
    expect(right.w).toBe(area.w - Math.floor(area.w / 2));
    expect(right.h).toBe(area.h);
    expect(right.saved).toEqual({ x: 10, y: 10, w: 200, h: 100 });
    expect(right.x + right.w).toBeLessThanOrEqual(area.x + area.w);
  });

  it('docks from a side drag and keeps the top edge from maximizing', () => {
    draw.setDisplayMetrics(displayMetrics({ width: 960, height: 540 }));
    const wm = new WM(draw, input, widgets);
    wm.reducedMotion = true;
    const win = wm.open(spec('app'));
    io.px = 50;
    io.py = 22;
    io.down = io.wentDown = true;
    wm.computeGate();
    input.setGate(win.id);
    expect(wm.draw(win.id)).not.toBeNull();
    io.wentDown = false;
    io.px = 0;
    wm.tick(0.016);
    const area = draw.getDisplayMetrics().workArea;
    expect(wm.byId(win.id)).toMatchObject({
      x: area.x,
      y: area.y,
      w: Math.floor(area.w / 2),
      h: area.h,
      maximized: false,
    });
    io.px = 220;
    io.py = 0;
    wm.tick(0.016);
    const restored = wm.byId(win.id)!;
    expect(restored.maximized).toBe(false);
    expect([restored.w, restored.h]).toEqual([200, 100]);
    expect(restored.x).toBeGreaterThanOrEqual(area.x);
    expect(restored.y).toBeGreaterThanOrEqual(area.y);
    expect(restored.x + restored.w).toBeLessThanOrEqual(area.x + area.w);
    expect(restored.y + restored.h).toBeLessThanOrEqual(area.y + area.h);
  });

  it('disables dock commands while minimized, modal, or fixed', () => {
    const wm = new WM(draw, input, widgets);
    wm.reducedMotion = true;
    const fixed = wm.open({ ...spec('fixed'), resizable: false });
    const modal = wm.open({ ...spec('modal'), modal: true });
    const normal = wm.open(spec('normal'));
    wm.minimize(normal.id);
    expect(wm.windowCommand(fixed.id, 'dock-left')).toBe(false);
    expect(wm.windowCommand(modal.id, 'dock-right')).toBe(false);
    expect(wm.windowCommand(normal.id, 'dock-left')).toBe(false);
  });

  it('cancels keyboard placement on F10 and still closes on CloseWindow', () => {
    const wm = new WM(draw, input, widgets);
    wm.reducedMotion = true;
    const win = wm.open(spec('app'));
    wm.windowCommand(win.id, 'move');
    pressKey(wm, 'ArrowRight');
    expect(pressKey(wm, 'CycleWindow')).toBe(false);
    expect(io.keyPressed.has('CycleWindow')).toBe(true);
    expect(wm.interacting).toBe(false);
    expect(wm.byId(win.id)!.x).toBe(10);
    io.keyPressed.clear();
    wm.windowCommand(win.id, 'size');
    expect(pressKey(wm, 'CloseWindow')).toBe(true);
    expect(io.keyPressed.has('CloseWindow')).toBe(false);
    expect(wm.takeCloseRequests()).toEqual([win.id]);
  });

  it('draws a work-area switcher while Control is held and hides it without moving focus', () => {
    draw.setDisplayMetrics(displayMetrics({ width: 960, height: 540 }));
    const wm = new WM(draw, input, widgets);
    wm.reducedMotion = true;
    wm.open({ ...spec('first'), title: 'First window', icon: 'i_doc' });
    wm.open({ ...spec('second'), title: 'Second window', icon: 'i_folder' });
    io.keyDown.add('Control');
    expect(wm.cycleFocus()).toBe(true);
    expect(wm.focused).toBe('first');
    expect(wm.switcherVisible).toBe(true);
    const bevel = vi.spyOn(widgets, 'bevel');
    wm.drawSwitcher();
    const panel = bevel.mock.calls.find((call) => call[4] === 'window');
    expect(panel).toBeTruthy();
    const [x, y, w, h] = panel as [number, number, number, number, string];
    const area = draw.getDisplayMetrics().workArea;
    expect(x).toBeGreaterThanOrEqual(area.x);
    expect(y).toBeGreaterThanOrEqual(area.y);
    expect(x + w).toBeLessThanOrEqual(area.x + area.w);
    expect(y + h).toBeLessThanOrEqual(area.y + area.h);
    wm.syncSwitcher();
    expect(wm.switcherVisible).toBe(true);
    expect(wm.focused).toBe('first');
    io.keyDown.delete('Control');
    wm.syncSwitcher();
    expect(wm.switcherVisible).toBe(false);
    expect(wm.focused).toBe('first');
  });
});
