export type ResizeCursor = 'size-ns' | 'size-ew' | 'size-nesw' | 'size-nwse';

export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export interface WindowBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A resolution change keeps every frame and saved restore rectangle reachable. */
export function fitWindowToArea(
  bounds: Readonly<WindowBounds>,
  width: number,
  height: number,
): WindowBounds {
  const w = Math.max(1, Math.min(Math.round(bounds.w), width));
  const h = Math.max(1, Math.min(Math.round(bounds.h), height));
  return {
    x: Math.max(0, Math.min(Math.round(bounds.x), width - w)),
    y: Math.max(0, Math.min(Math.round(bounds.y), height - h)),
    w,
    h,
  };
}

/** Only the three-pixel frame is draggable; title controls and HTML content stay interactive. */
export function resizeEdgeAt(b: WindowBounds, x: number, y: number): ResizeEdge | null {
  const dx = x - b.x,
    dy = y - b.y;
  if (dx < 0 || dy < 0 || dx >= b.w || dy >= b.h) return null;
  if (dx >= 3 && dx < b.w - 3 && dy >= 3 && dy < b.h - 3) return null;
  const vertical = dy < 10 ? 'n' : dy >= b.h - 10 ? 's' : '';
  const horizontal = dx < 10 ? 'w' : dx >= b.w - 10 ? 'e' : '';
  return (vertical + horizontal) as ResizeEdge;
}

export function resizeCursor(edge: ResizeEdge): ResizeCursor {
  if (edge === 'n' || edge === 's') return 'size-ns';
  if (edge === 'e' || edge === 'w') return 'size-ew';
  return edge === 'ne' || edge === 'sw' ? 'size-nesw' : 'size-nwse';
}

/** Anchor opposite edges, snap to logical pixels, and keep the frame above the taskbar. */
export function resizeBounds(
  b: WindowBounds,
  edge: ResizeEdge,
  dx: number,
  dy: number,
  minW: number,
  minH: number,
  screenW: number,
  screenH: number,
): WindowBounds {
  let { x, y, w, h } = b;
  const limit = (v: number, low: number, high: number) =>
    Math.max(low, Math.min(high, Math.round(v)));
  if (edge.includes('e')) w = limit(b.w + dx, minW, screenW - b.x);
  if (edge.includes('s')) h = limit(b.h + dy, minH, screenH - b.y);
  if (edge.includes('w')) {
    x = limit(b.x + dx, 0, b.x + b.w - minW);
    w = b.x + b.w - x;
  }
  if (edge.includes('n')) {
    y = limit(b.y + dy, 0, b.y + b.h - minH);
    h = b.y + b.h - y;
  }
  return { x, y, w, h };
}
