import { describe, expect, it } from 'vite-plus/test';
import {
  desktopNeedsPaint,
  doomSlamWindow,
  htmlCompositingEnabled,
  sameDesktopScene,
  shutdownNeedsPaint,
  type DesktopPaintScene,
} from './frame-paint-model';

const scene = (patch: Partial<DesktopPaintScene> = {}): DesktopPaintScene => ({
  phase: 'desktop',
  theme: 'std',
  width: 640,
  height: 360,
  risk: 5,
  focused: 'notepad',
  switcher: false,
  systemMenu: false,
  start: false,
  volume: false,
  context: false,
  tip: null,
  assistant: { bob: 0, blink: 0, sparks: 0, tick: 0 },
  windows: [
    {
      id: 'notepad',
      title: 'Editor',
      x: 10,
      y: 12,
      w: 200,
      h: 120,
      k: 1,
      minimized: false,
      maximized: false,
      menu: -1,
    },
  ],
  ...patch,
});

const idle = {
  sceneChanged: false,
  input: false,
  animating: false,
  themeChanged: false,
  restrictionsChanged: false,
  clockSecondChanged: false,
  resolutionDirty: false,
  switcherVisible: false,
  taskbarAnimated: false,
  clientsActive: false,
  menusActive: false,
  slam: false,
};

describe('desktop frame painting', () => {
  it('treats an unchanged scene as idle and a moved window as a new scene', () => {
    expect(sameDesktopScene(scene(), scene())).toBe(true);
    const [win] = scene().windows;
    expect(sameDesktopScene(scene(), scene({ windows: [{ ...win, x: 11 }] }))).toBe(false);
    expect(sameDesktopScene(scene(), scene({ windows: [] }))).toBe(false);
  });

  it('skips a quiet desktop and paints for input, the clock, or an open switcher', () => {
    expect(desktopNeedsPaint(idle)).toBe(false);
    expect(desktopNeedsPaint({ ...idle, input: true })).toBe(true);
    expect(desktopNeedsPaint({ ...idle, clockSecondChanged: true })).toBe(true);
    expect(desktopNeedsPaint({ ...idle, switcherVisible: true })).toBe(true);
  });

  it('keeps painting shutdown while the phase is moving or the pointer is active', () => {
    const quiet = {
      phaseChanged: false,
      animated: false,
      input: false,
      resolutionDirty: false,
      themeChanged: false,
    };
    expect(shutdownNeedsPaint(quiet)).toBe(false);
    expect(shutdownNeedsPaint({ ...quiet, animated: true })).toBe(true);
    expect(shutdownNeedsPaint({ ...quiet, phaseChanged: true })).toBe(true);
  });

  it('keeps client timers and delayed menu hover running between clock ticks', () => {
    expect(desktopNeedsPaint({ ...idle, clientsActive: true })).toBe(true);
    expect(desktopNeedsPaint({ ...idle, menusActive: true })).toBe(true);
  });

  it('repaints the assistant only when its quantized pose changes', () => {
    const pose = { bob: 1, blink: 0, sparks: 0, tick: 0 };
    expect(sameDesktopScene(scene(), scene({ assistant: pose }))).toBe(false);
    expect(sameDesktopScene(scene({ assistant: pose }), scene({ assistant: { ...pose } }))).toBe(
      true,
    );
    expect(
      sameDesktopScene(scene({ assistant: pose }), scene({ assistant: { ...pose, blink: 1 } })),
    ).toBe(false);
    expect(
      sameDesktopScene(
        scene({ assistant: { ...pose, sparks: 1, tick: 7 } }),
        scene({ assistant: { ...pose, sparks: 1, tick: 8 } }),
      ),
    ).toBe(false);
  });

  it('repaints a tip when it appears, changes or expires', () => {
    const tip = { lines: ['Hello'], until: 5 };
    expect(sameDesktopScene(scene({ tip }), scene({ tip: { ...tip } }))).toBe(true);
    expect(sameDesktopScene(scene(), scene({ tip }))).toBe(false);
    expect(sameDesktopScene(scene({ tip }), scene())).toBe(false);
    expect(sameDesktopScene(scene({ tip }), scene({ tip: { ...tip, lines: ['Goodbye'] } }))).toBe(
      false,
    );
  });

  it('keeps the title slam for three seconds and withholds HTML during canvas corruption', () => {
    expect(doomSlamWindow(-0.01)).toBe(false);
    expect(doomSlamWindow(0)).toBe(true);
    expect(doomSlamWindow(2.9)).toBe(true);
    expect(doomSlamWindow(3)).toBe(false);
    const stable = {
      phase: 'desktop',
      saverVisible: false,
      firmware: false,
      slam: false,
      glitch: false,
      wobble: false,
      invert: false,
      flash: false,
    };
    expect(htmlCompositingEnabled(stable)).toBe(true);
    expect(htmlCompositingEnabled({ ...stable, phase: 'shutdown' })).toBe(false);
    expect(htmlCompositingEnabled({ ...stable, firmware: true })).toBe(false);
    expect(htmlCompositingEnabled({ ...stable, flash: true })).toBe(false);
  });
});
