import type { Renderer } from '../../gfx/context';
// assistant.ts: the paperclip office assistant, ported from the video's ui.js.
// (x, y) = bottom centre; s = integer scale (1 is about 27x48 px). The eyes follow the pointer.

import { C } from '../../gfx/palette';
import { lerp, R, hash } from '../../gfx/primitives';

export interface AssistantOpts {
  look?: [number, number]; // each -1..1
  blink?: number; // 0..1
  sparks?: number; // 0..1 twinkles in the eyes
  mood?: 'idle' | 'happy' | 'evil';
  bob?: number; // px
}

export function createAssistantDrawing(renderer: Renderer) {
  function assistant(x: number, y: number, s = 1, o: AssistantOpts = {}, t = 0): void {
    x = R(x);
    y = R(y - (o.bob || 0));
    const pts: [number, number][] = [];
    const L = (x0: number, y0: number, x1: number, y1: number) => {
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
      for (let i = 0; i <= n; i++) pts.push([lerp(x0, x1, i / n), lerp(y0, y1, i / n)]);
    };
    const A = (cx: number, cy: number, r: number, a0: number, a1: number) => {
      const n = Math.ceil(Math.abs(a1 - a0) * r * 2);
      for (let i = 0; i <= n; i++) {
        const a = lerp(a0, a1, i / n);
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
    };
    // the wire, in units with y up from the bottom
    L(-4, 30, -4, 14);
    A(0, 14, 4, Math.PI, 2 * Math.PI);
    L(4, 14, 4, 37);
    A(-3.5, 37, 7.5, 0, Math.PI);
    L(-11, 37, -11, 12);
    A(0, 12, 11, Math.PI, 2 * Math.PI);
    L(11, 12, 11, 30);
    const P = pts.map(([px, py]) => [x + px * s, y - 1 - py * s] as [number, number]);
    for (const [px, py] of P) renderer.disc(px, py, 2 * s, C.black);
    for (const [px, py] of P) renderer.disc(px, py, s, C.silver);
    for (const [px, py] of P) renderer.rect(R(px) - s, R(py) - s, s, s, C.white);
    // eyes
    const [lx, ly] = o.look || [0, 0],
      bl = o.blink || 0,
      evil = o.mood === 'evil',
      tick = Math.floor(t * 12);
    for (const [ex, ey] of [
      [-5, 33],
      [6, 34],
    ] as const) {
      const cx = x + ex * s,
        cy = y - ey * s,
        ry = Math.max(1, R(5 * s * (1 - bl)));
      renderer.ell(cx, cy, 4 * s + 1, ry + 1, C.black);
      renderer.ell(cx, cy, 4 * s, ry, evil ? C.yellow : C.white);
      if (bl < 0.7)
        renderer.disc(
          cx + R(lx * 2 * s),
          cy + R(ly * 2 * s),
          Math.max(1, R(1.6 * s)),
          evil ? C.red : C.black,
        );
      const dir = ex < 0 ? 1 : -1,
        by = cy - 7 * s - (o.mood === 'happy' ? s : 0),
        tiltY = evil ? -2 * s * dir : s * dir;
      renderer.line(cx - 4 * s, by + tiltY, cx + 4 * s, by - tiltY, C.black, Math.max(2, s + 1));
      if ((o.sparks || 0) > 0 && hash(ex + tick) < (o.sparks || 0))
        renderer.spr(
          'star',
          cx - 3 * s + R((hash(ex * 3 + tick) - 0.5) * 5 * s),
          cy - 3 * s + R((hash(ex * 5 + tick) - 0.5) * 5 * s),
          s,
        );
    }
  }

  /** A cached, static paperclip canvas (28*s x 50*s, feet at bottom centre). */
  const _clips: Record<string, HTMLCanvasElement> = {};
  function clipSprite(s = 1, mood: 'idle' | 'evil' = 'idle'): HTMLCanvasElement {
    return (
      _clips[s + mood] ||
      (_clips[s + mood] = renderer.offscreen(28 * s, 50 * s, (child) =>
        createAssistantDrawing(child).assistant(14 * s, 50 * s, s, { mood }),
      ))
    );
  }

  return {
    assistant,
    clipSprite,
    dispose() {
      for (const key of Object.keys(_clips)) delete _clips[key];
    },
  };
}
