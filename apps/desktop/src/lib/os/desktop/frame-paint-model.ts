export interface DesktopPaintWindow {
  readonly id: string;
  readonly title: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly k: number;
  readonly minimized: boolean;
  readonly maximized: boolean;
  readonly menu: number;
}

export interface DesktopPaintScene {
  readonly phase: string;
  readonly theme: string;
  readonly width: number;
  readonly height: number;
  readonly risk: number;
  readonly focused: string;
  readonly switcher: boolean;
  readonly systemMenu: boolean;
  readonly start: boolean;
  readonly volume: boolean;
  readonly context: boolean;
  readonly tip: { readonly lines: readonly string[]; readonly until: number } | null;
  /**
   * Quantized assistant pose: the paperclip bob, blink and spark twinkle are
   * animation, but their *visible* state only changes a handful of times per
   * second. Keeping them in the scene key means an idle desktop paints ~5 Hz
   * instead of 60 Hz.
   */
  readonly assistant: {
    readonly bob: number;
    readonly blink: number;
    readonly sparks: number;
    readonly tick: number;
  };
  readonly windows: readonly DesktopPaintWindow[];
}

function sameWindow(left: DesktopPaintWindow, right: DesktopPaintWindow | undefined): boolean {
  return (
    !!right &&
    left.id === right.id &&
    left.title === right.title &&
    left.x === right.x &&
    left.y === right.y &&
    left.w === right.w &&
    left.h === right.h &&
    left.k === right.k &&
    left.minimized === right.minimized &&
    left.maximized === right.maximized &&
    left.menu === right.menu
  );
}

/** True when two desktop frames describe the same painted scene. */
export function sameDesktopScene(left: DesktopPaintScene, right: DesktopPaintScene): boolean {
  return (
    left.phase === right.phase &&
    left.theme === right.theme &&
    left.width === right.width &&
    left.height === right.height &&
    left.risk === right.risk &&
    left.focused === right.focused &&
    left.switcher === right.switcher &&
    left.systemMenu === right.systemMenu &&
    left.start === right.start &&
    left.volume === right.volume &&
    left.context === right.context &&
    left.tip?.until === right.tip?.until &&
    (left.tip?.lines.join('\n') ?? '') === (right.tip?.lines.join('\n') ?? '') &&
    left.assistant.bob === right.assistant.bob &&
    left.assistant.blink === right.assistant.blink &&
    left.assistant.sparks === right.assistant.sparks &&
    left.assistant.tick === right.assistant.tick &&
    left.windows.length === right.windows.length &&
    left.windows.every((win, index) => sameWindow(win, right.windows[index]))
  );
}

export interface DesktopPaintInput {
  readonly sceneChanged: boolean;
  readonly input: boolean;
  readonly animating: boolean;
  readonly themeChanged: boolean;
  readonly restrictionsChanged: boolean;
  readonly clockSecondChanged: boolean;
  readonly resolutionDirty: boolean;
  readonly switcherVisible: boolean;
  readonly taskbarAnimated: boolean;
  readonly clientsActive: boolean;
  readonly menusActive: boolean;
  readonly slam: boolean;
}

/** Idle frames skip the desktop paint. Motion, input and clock changes paint again. */
export function desktopNeedsPaint(input: DesktopPaintInput): boolean {
  return (
    input.sceneChanged ||
    input.input ||
    input.animating ||
    input.themeChanged ||
    input.restrictionsChanged ||
    input.clockSecondChanged ||
    input.resolutionDirty ||
    input.switcherVisible ||
    input.taskbarAnimated ||
    input.clientsActive ||
    input.menusActive ||
    input.slam
  );
}

/** The P(doom) title occupies the first three seconds after it is triggered. */
export function doomSlamWindow(elapsed: number): boolean {
  return elapsed >= 0 && elapsed < 3;
}

/**
 * Embedded documents composite only on a stable desktop.
 * Tearing, flashes and the title slam stay on the canvas.
 */
export function htmlCompositingEnabled(input: {
  readonly phase: string;
  readonly saverVisible: boolean;
  readonly firmware: boolean;
  readonly slam: boolean;
  readonly glitch: boolean;
  readonly wobble: boolean;
  readonly invert: boolean;
  readonly flash: boolean;
}): boolean {
  return (
    input.phase === 'desktop' &&
    !input.saverVisible &&
    !input.firmware &&
    !input.slam &&
    !input.glitch &&
    !input.wobble &&
    !input.invert &&
    !input.flash
  );
}

export function shutdownNeedsPaint(input: {
  readonly phaseChanged: boolean;
  readonly animated: boolean;
  readonly input: boolean;
  readonly resolutionDirty: boolean;
  readonly themeChanged: boolean;
}): boolean {
  return (
    input.phaseChanged ||
    input.animated ||
    input.input ||
    input.resolutionDirty ||
    input.themeChanged
  );
}
