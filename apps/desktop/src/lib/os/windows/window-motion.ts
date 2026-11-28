import type { WindowBounds } from './resize';

export type WindowMotionKind =
  | 'open'
  | 'minimize'
  | 'restore'
  | 'close'
  | 'maximize'
  | 'unmaximize';
export interface WindowMotion {
  kind: WindowMotionKind;
  from: WindowBounds;
  to: WindowBounds;
  progress: number;
}

/** Outline geometry never changes client geometry. Both endpoints are copied and pixel aligned. */
export function pixelBounds(bounds: Readonly<WindowBounds>): WindowBounds {
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    w: Math.max(1, Math.round(bounds.w)),
    h: Math.max(1, Math.round(bounds.h)),
  };
}

export function interpolateWindowBounds(
  from: Readonly<WindowBounds>,
  to: Readonly<WindowBounds>,
  progress: number,
): WindowBounds {
  const k = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const a = pixelBounds(from),
    b = pixelBounds(to);
  return pixelBounds({
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    w: a.w + (b.w - a.w) * k,
    h: a.h + (b.h - a.h) * k,
  });
}

/** With no icon/menu/task rectangle, collapse to the window's own caption, never its centre. */
export function titleBounds(bounds: Readonly<WindowBounds>): WindowBounds {
  const b = pixelBounds(bounds);
  return { x: b.x + 3, y: b.y + 3, w: Math.max(1, b.w - 6), h: Math.min(18, Math.max(1, b.h - 6)) };
}

export function createWindowMotion(
  kind: WindowMotionKind,
  from: Readonly<WindowBounds>,
  to: Readonly<WindowBounds>,
): WindowMotion {
  return { kind, from: pixelBounds(from), to: pixelBounds(to), progress: 0 };
}

export function motionBounds(motion: Readonly<WindowMotion>): WindowBounds {
  return interpolateWindowBounds(motion.from, motion.to, motion.progress);
}
