/**
 * Micro-desktop geometry for the author-entry recommendation.
 *
 * Pure domain: no DOM, no canvas, no timers. The preview component asks this
 * module where the appWindow, taskbar and Start menu sit for a given logical
 * surface and drag offset, then paints the result with 16-colour fills.
 */

export const PREVIEW_SIZE = { width: 640, height: 360 } as const;
export const PREVIEW_TASKBAR = 32;
export const PREVIEW_WINDOW = { width: 380, height: 210 } as const;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface MicroDesktop {
  /** Desktop surface above the taskbar. */
  readonly field: Rect;
  readonly taskbar: Rect;
  readonly start: Rect;
  readonly tray: Rect;
  readonly taskButton: Rect;
  readonly appWindow: Rect;
  readonly title: Rect;
  readonly close: Rect;
  readonly menu: Rect;
  readonly body: Rect;
  readonly startMenu: Rect | null;
  /** True when the window is parked in the taskbar. */
  readonly minimized: boolean;
}

const WINDOW_ORIGIN = { x: 74, y: 42 } as const;

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/** Clamp a dragged title bar so the window always stays reachable. */
export function dragWindow(offset: Point): Point {
  const maxX = PREVIEW_SIZE.width - PREVIEW_WINDOW.width - 8;
  const maxY = PREVIEW_SIZE.height - PREVIEW_TASKBAR - PREVIEW_WINDOW.height - 8;
  return {
    x: clamp(Math.round(offset.x), 8, maxX),
    y: clamp(Math.round(offset.y), 4, maxY),
  };
}

export function layoutMicroDesktop(options: {
  readonly offset?: Point;
  readonly startOpen?: boolean;
  readonly minimized?: boolean;
}): MicroDesktop {
  const origin = dragWindow(options.offset ?? WINDOW_ORIGIN);
  const appWindow = {
    x: origin.x,
    y: origin.y,
    w: PREVIEW_WINDOW.width,
    h: PREVIEW_WINDOW.height,
  };
  const field = {
    x: 0,
    y: 0,
    w: PREVIEW_SIZE.width,
    h: PREVIEW_SIZE.height - PREVIEW_TASKBAR,
  };
  const taskbar = {
    x: 0,
    y: PREVIEW_SIZE.height - PREVIEW_TASKBAR,
    w: PREVIEW_SIZE.width,
    h: PREVIEW_TASKBAR,
  };
  const start = { x: 6, y: taskbar.y + 5, w: 74, h: 22 };
  const tray = { x: taskbar.w - 78, y: taskbar.y + 6, w: 72, h: 20 };
  const taskButton = { x: start.x + start.w + 6, y: start.y, w: 150, h: start.h };
  const startMenu = options.startOpen ? { x: start.x, y: taskbar.y - 116, w: 168, h: 112 } : null;
  return {
    field,
    taskbar,
    start,
    tray,
    taskButton,
    appWindow,
    title: { x: appWindow.x, y: appWindow.y, w: appWindow.w, h: 22 },
    close: { x: appWindow.x + appWindow.w - 24, y: appWindow.y + 4, w: 16, h: 14 },
    menu: { x: appWindow.x, y: appWindow.y + 22, w: appWindow.w, h: 18 },
    body: {
      x: appWindow.x,
      y: appWindow.y + 40,
      w: appWindow.w,
      h: appWindow.h - 40,
    },
    startMenu,
    minimized: Boolean(options.minimized),
  };
}

export type PreviewHit = 'title' | 'close' | 'start' | 'task';

/** Where a pointer at (x, y) lands relative to the preview window. */
export function hitTest(desktop: MicroDesktop, point: Point): PreviewHit | null {
  const inside = (rect: Rect) =>
    point.x >= rect.x &&
    point.x < rect.x + rect.w &&
    point.y >= rect.y &&
    point.y < rect.y + rect.h;
  if (inside(desktop.start)) return 'start';
  if (inside(desktop.taskButton)) return 'task';
  if (desktop.minimized) return null;
  if (inside(desktop.close)) return 'close';
  if (inside(desktop.title)) return 'title';
  return null;
}

/** Local wall clock, rendered the way the desktop tray renders it. */
export function trayClock(date: Date, twentyFourHour = true): string {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  if (twentyFourHour) return `${String(hours).padStart(2, '0')}:${minutes}`;
  const suffix = hours < 12 ? 'AM' : 'PM';
  const shown = hours % 12 === 0 ? 12 : hours % 12;
  return `${shown}:${minutes} ${suffix}`;
}
