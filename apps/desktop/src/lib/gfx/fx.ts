import type { Renderer } from './context';
import { FPS } from './context';
import { C } from './palette';
import { applyDisplayPalette } from './display-palette';
import { clamp, hash, R, prog, backOut } from './primitives';

export interface FX {
  glitch?: number; // 0..1 row tearing
  wobble?: number; // px sine rows
  tilt?: number; // rad
  zoom?: number;
  shake?: number; // px
  dx?: number;
  dy?: number; // px
  invert?: boolean;
  flash?: [string, number]; // [colour, alpha]
}

export interface WordArtOpts {
  arch?: number;
  wave?: number;
  phase?: number;
  depth?: number;
  k?: number;
}

export function createFrameEffects(draw: Renderer) {
  const { getCtx, createCanvas, rect, stipple, textSource, fontTop, fontCap } = draw;

  let FX: FX = {};
  const resetFX = () => {
    FX = {};
  };

  const _snaps: HTMLCanvasElement[] = [];
  function snap(i = 0): HTMLCanvasElement {
    // copy of the frame as drawn so far
    const cv = getCtx().canvas;
    const c =
      _snaps[i] || (_snaps[i] = Object.assign(createCanvas(), { width: draw.W, height: draw.H }));
    if (c.width !== draw.W || c.height !== draw.H) {
      c.width = draw.W;
      c.height = draw.H;
    }
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, draw.W, draw.H);
    g.drawImage(cv, 0, 0);
    return c;
  }

  function applyFX(t: number, reducedMotion = false): void {
    if (reducedMotion) FX = {};
    const ctx = getCtx(),
      f = FX,
      fr = Math.floor(t * FPS);
    if (f.glitch || f.wobble) {
      const s = snap(3);
      for (let y = 0; y < draw.H; y += 2) {
        let dx = 0;
        if (f.wobble) dx += Math.sin(y * 0.07 + t * 9) * f.wobble;
        if (f.glitch) {
          const band = Math.floor(y / 12);
          if (hash(band * 7.3 + fr) < f.glitch * 0.6)
            dx += (hash(band + fr * 3.1) - 0.5) * 120 * f.glitch;
        }
        if (R(dx)) ctx.drawImage(s, 0, y, draw.W, 2, R(dx), y, draw.W, 2);
      }
    }
    if (f.tilt || f.zoom || f.shake || f.dx || f.dy) {
      const s = snap(3),
        sh = f.shake || 0,
        z = f.zoom || 1;
      rect(0, 0, draw.W, draw.H, C.black);
      ctx.save();
      try {
        ctx.translate(
          draw.W / 2 + R((f.dx || 0) + (hash(fr) - 0.5) * 2 * sh),
          draw.H / 2 + R((f.dy || 0) + (hash(fr + 99) - 0.5) * 2 * sh),
        );
        ctx.rotate(f.tilt || 0);
        ctx.scale(z, z);
        ctx.drawImage(s, -draw.W / 2, -draw.H / 2);
      } finally {
        ctx.restore();
      }
    }
    if (f.invert) {
      ctx.save();
      try {
        ctx.globalCompositeOperation = 'difference';
        rect(0, 0, draw.W, draw.H, C.white);
      } finally {
        ctx.restore();
      }
    }
    if (f.flash && f.flash[1] > 0) stipple(0, 0, draw.W, draw.H, f.flash[0], f.flash[1]);
    applyDisplayPalette(draw, draw.TH);
  }

  // ---------- WordArt: chunky 90s titles (from hook.js) ----------
  // style: 0 rainbow · 1 ice (black bg) · 2 sunset (navy bg) · 3 gold (red bg)
  const WA_STYLES: string[][] = [
    [C.red, C.yellow, C.lime, C.aqua, C.blue, C.fuchsia],
    [C.white, C.white, C.aqua, C.aqua, C.blue, C.blue],
    [C.yellow, C.yellow, C.red, C.red, C.fuchsia, C.fuchsia],
    [C.white, C.white, C.yellow, C.yellow, C.yellow, C.olive],
  ];
  const _wa = new Map<string, [HTMLCanvasElement, HTMLCanvasElement]>();
  let wordartFontRevision = -1;
  function wordart(
    str: string,
    cx: number,
    cy: number,
    s: number,
    style = 0,
    o: WordArtOpts = {},
  ): void {
    const ctx = getCtx(),
      k = o.k ?? 1;
    if (k <= 0) return;
    if (wordartFontRevision !== draw.fonts.fontRevision) {
      _wa.clear();
      wordartFontRevision = draw.fonts.fontRevision;
    }
    s = Math.max(1, R(s * (k < 1 ? backOut(k) : 1)));
    const key = str + '|' + style;
    let pair = _wa.get(key);
    if (!pair) {
      // [banded colour fill, black silhouette]
      const src = textSource(str, 'bold'),
        fTop = fontTop('bold'),
        fCap = fontCap('bold');
      const mk = () => Object.assign(createCanvas(), { width: src.width, height: src.height });
      const col = mk(),
        g = col.getContext('2d')!,
        bands = WA_STYLES[style];
      g.drawImage(src, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      for (let y = 0; y < src.height; y++) {
        g.fillStyle =
          bands[
            clamp(Math.floor(((y - fTop + 1) / (fCap + 1)) * bands.length), 0, bands.length - 1)
          ];
        g.fillRect(0, y, src.width, 1);
      }
      const blk = mk(),
        b = blk.getContext('2d')!;
      b.drawImage(src, 0, 0);
      b.globalCompositeOperation = 'source-atop';
      b.fillStyle = C.black;
      b.fillRect(0, 0, src.width, src.height);
      _wa.set(key, (pair = [col, blk]));
    }
    const [col, blk] = pair,
      w = col.width,
      hh = col.height;
    const x0 = R(cx - (w * s) / 2),
      y0 = R(cy - (fontTop('bold') + fontCap('bold') / 2) * s),
      depth = o.depth ?? 2;
    const off = (x: number) =>
      R(
        ((o.arch ? -o.arch * Math.sin((Math.PI * x) / w) : 0) +
          (o.wave ? o.wave * Math.sin(x * 0.35 + (o.phase || 0)) : 0)) /
          s,
      ) * s;
    const pass = (img: HTMLCanvasElement, dx: number, dy: number) => {
      for (let x = 0; x < w; x++)
        ctx.drawImage(img, x, 0, 1, hh, x0 + x * s + dx, y0 + off(x) + dy, s, hh * s);
    };
    for (let d = depth; d > 0; d--) pass(blk, d * s, d * s); // extrusion
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const)
      pass(blk, dx, dy); // 1px outline
    pass(col, 0, 0);
  }

  /** The video's shutdown dim: a 50% black checkerboard over the finished frame. */
  let _dimPat: CanvasPattern | null = null;
  function dim(x: number, y: number, w: number, h: number): void {
    const ctx = getCtx();
    if (!_dimPat) {
      const p = createCanvas();
      p.width = p.height = 2;
      const g = p.getContext('2d')!;
      g.fillStyle = C.black;
      g.fillRect(0, 0, 1, 1);
      g.fillRect(1, 1, 1, 1);
      _dimPat = ctx.createPattern(p, 'repeat');
    }
    if (_dimPat) {
      ctx.fillStyle = _dimPat;
      ctx.fillRect(R(x), R(y), R(w), R(h));
    }
  }

  /** The taskbar-clock-to-CRT-collapse helper reused by the power-off screen: squash, line, dot. */
  function crtCollapse(t: number): void {
    const ctx = getCtx();
    const a = prog(t, 0, 0.18),
      b = prog(t, 0.18, 0.42),
      e = prog(t, 0.42, 0.8);
    const shot = snap(0);
    rect(0, 0, draw.W, draw.H, C.black);
    const eo = (k: number) => 1 - (1 - k) ** 3;
    if (a < 1) {
      const h = Math.max(2, R(draw.H * (1 - eo(a))));
      ctx.drawImage(shot, 0, 0, draw.W, draw.H, 0, (draw.H - h) >> 1, draw.W, h);
      if (a > 0.45) rect(0, draw.H / 2 - 1, draw.W, 2, a > 0.7 ? C.white : C.silver);
    } else if (b < 1) {
      const w = Math.max(6, R(draw.W * (1 - eo(b))));
      rect((draw.W - w) >> 1, draw.H / 2 - 1, w, 2, C.white);
    } else if (e < 1) {
      const r = e < 0.4 ? 2 : 1;
      rect(
        draw.W / 2 - r,
        draw.H / 2 - r,
        2 * r,
        2 * r,
        e < 0.4 ? C.white : e < 0.75 ? C.silver : C.gray,
      );
    }
  }
  return {
    get FX() {
      return FX;
    },
    resetFX,
    snap,
    applyFX,
    wordart,
    dim,
    crtCollapse,
    dispose() {
      _snaps.length = 0;
      _wa.clear();
      _dimPat = null;
      FX = {};
    },
  };
}
export type FrameEffects = ReturnType<typeof createFrameEffects>;
