import type { DrawingTarget } from './context';
// 0..1, deterministic

export interface RectLike {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const R = Math.round;
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a)); // 0..1 progress of t through [a, b]
export const ease = (k: number) => k * k * (3 - 2 * k);
export const easeIn = (k: number) => k * k * k;
export const easeOut = (k: number) => 1 - (1 - k) ** 3;
export const backOut = (k: number) => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2;
export const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
export const inRect = (x: number, y: number, r: RectLike) =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

export function createPrimitives(target: DrawingTarget) {
  const { getCtx, createCanvas } = target;
  function rect(x: number, y: number, w: number, h: number, c: string): void {
    const ctx = getCtx();
    ctx.fillStyle = c;
    ctx.fillRect(R(x), R(y), R(w), R(h));
  }
  function frame(x: number, y: number, w: number, h: number, c: string, t = 1): void {
    rect(x, y, w, t, c);
    rect(x, y + h - t, w, t, c);
    rect(x, y, t, h, c);
    rect(x + w - t, y, t, h, c);
  }
  function line(x0: number, y0: number, x1: number, y1: number, c: string, w = 1): void {
    // Bresenham
    x0 = R(x0);
    y0 = R(y0);
    x1 = R(x1);
    y1 = R(y1);
    const ctx = getCtx();
    ctx.fillStyle = c;
    const dx = Math.abs(x1 - x0),
      dy = Math.abs(y1 - y0),
      sx = x0 < x1 ? 1 : -1,
      sy = y0 < y1 ? 1 : -1,
      o = w >> 1;
    let err = dx - dy;
    for (let n = 0; n < 4000; n++) {
      ctx.fillRect(x0 - o, y0 - o, w, w);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }
  }
  function path(pts: [number, number][], c: string, w = 1): void {
    for (let i = 1; i < pts.length; i++)
      line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], c, w);
  }
  function ell(cx: number, cy: number, rx: number, ry: number, c: string): void {
    // filled ellipse, no antialiasing
    cx = R(cx);
    cy = R(cy);
    rx = Math.max(0, R(rx));
    ry = Math.max(0, R(ry));
    const ctx = getCtx();
    ctx.fillStyle = c;
    for (let y = -ry; y <= ry; y++) {
      const hw = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry || 1))) + 0.5);
      ctx.fillRect(cx - hw, cy + y, 2 * hw + 1, 1);
    }
  }
  const disc = (cx: number, cy: number, r: number, c: string) => ell(cx, cy, r, r, c);
  function ring(cx: number, cy: number, r: number, c: string, w = 1): void {
    // circle outline
    cx = R(cx);
    cy = R(cy);
    r = R(r);
    const ctx = getCtx();
    ctx.fillStyle = c;
    for (let y = -r; y <= r; y++) {
      const a = Math.floor(Math.sqrt(r * r - y * y) + 0.5),
        ri = r - w,
        b = Math.abs(y) <= ri ? Math.floor(Math.sqrt(ri * ri - y * y) + 0.5) : -1;
      if (b < 0) ctx.fillRect(cx - a, cy + y, 2 * a + 1, 1);
      else {
        ctx.fillRect(cx - a, cy + y, a - b, 1);
        ctx.fillRect(cx + b + 1, cy + y, a - b, 1);
      }
    }
  }
  function poly(pts: [number, number][], c: string): void {
    // scanline polygon fill
    const ctx = getCtx();
    ctx.fillStyle = c;
    const ys = pts.map((p) => p[1]),
      y0 = Math.ceil(Math.min(...ys)),
      y1 = Math.floor(Math.max(...ys));
    for (let y = y0; y <= y1; y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i],
          [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= y && by > y) || (by <= y && ay > y))
          xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2)
        ctx.fillRect(R(xs[i]), y, Math.max(1, R(xs[i + 1]) - R(xs[i])), 1);
    }
  }

  const _pat: Record<string, CanvasPattern | null> = {};
  const MASK_ORDER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  /** A 1-bit Bayer mask overlays existing pixels without inventing blended colours. */
  function stipple(
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    coverage: number,
  ): void {
    const level = Math.max(0, Math.min(16, Math.round(coverage * 16)));
    if (!level) return;
    const ctx = getCtx(),
      key = `mask:${color}:${level}`;
    if (!_pat[key]) {
      const canvas = createCanvas();
      canvas.width = canvas.height = 4;
      const mask = canvas.getContext('2d')!;
      mask.fillStyle = color;
      MASK_ORDER.forEach((value, i) => {
        if (value < level) mask.fillRect(i % 4, Math.floor(i / 4), 1, 1);
      });
      _pat[key] = ctx.createPattern(canvas, 'repeat');
    }
    ctx.fillStyle = _pat[key]!;
    ctx.fillRect(R(x), R(y), R(w), R(h));
  }
  function dither(x: number, y: number, w: number, h: number, c1: string, c2: string): void {
    // 50% checkerboard of two colours
    const ctx = getCtx(),
      k = c1 + c2;
    if (!_pat[k]) {
      const p = createCanvas();
      p.width = p.height = 2;
      const g = p.getContext('2d')!;
      g.fillStyle = c1;
      g.fillRect(0, 0, 2, 2);
      g.fillStyle = c2;
      g.fillRect(0, 0, 1, 1);
      g.fillRect(1, 1, 1, 1);
      _pat[k] = ctx.createPattern(p, 'repeat');
    }
    ctx.fillStyle = _pat[k]!;
    ctx.fillRect(R(x), R(y), R(w), R(h));
  }
  return {
    rect,
    frame,
    line,
    path,
    ell,
    disc,
    ring,
    poly,
    stipple,
    dither,
    dispose: () => {
      for (const key of Object.keys(_pat)) delete _pat[key];
    },
  };
}
export type Primitives = ReturnType<typeof createPrimitives>;
