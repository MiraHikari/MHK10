import type { RendererCore } from './context';
import { C } from './palette';
import { saverPoints, starPoint, bounce, type Saver } from './saver-model';
import { motionTime } from './timing';

export function createSaverDrawing(
  draw: Pick<RendererCore, 'rect' | 'line' | 'text' | 'tw' | 'spr'>,
) {
  const { rect, line, text, tw, spr } = draw;

  function drawSaver(
    kind: Saver,
    seconds: number,
    width = 640,
    height = 360,
    reduced = false,
    message = 'MHK10',
    risk = 5,
  ): void {
    const t = motionTime(seconds, reduced);
    rect(0, 0, width, height, C.black);
    if (kind === 'Starfield') {
      for (let i = 0; i < 96; i++) {
        const p = starPoint(i, t, width, height);
        rect(p.x, p.y, p.size, p.size, i % 3 ? C.silver : C.white);
      }
    } else if (kind === 'Mystify') {
      for (let trail = 7; trail >= 0; trail--) {
        const points = saverPoints(Math.max(0, t - trail * 0.08), 4, width, height);
        for (let i = 0; i < 4; i++)
          line(
            points[i].x,
            points[i].y,
            points[(i + 1) % 4].x,
            points[(i + 1) % 4].y,
            [C.blue, C.aqua, C.fuchsia, C.yellow][trail % 4],
          );
      }
    } else if (kind === 'Flying Windows') {
      saverPoints(t, 15, Math.max(1, width - 34), Math.max(1, height - 34)).forEach((p, i) => {
        spr('i_start', p.x, p.y, i % 3 === 0 ? 2 : 1);
      });
    } else if (kind === 'Pipes') {
      const cycle = Math.floor(t / 24),
        count = reduced ? 42 : Math.floor(t * 9) % 216;
      let x = Math.floor(width / 2),
        y = Math.floor(height / 2);
      for (let i = 0; i < count; i++) {
        const horizontal = i % 2 === 0;
        const dx = horizontal ? (((i * 17 + cycle) % 5) - 2) * 16 : 0;
        const dy = horizontal ? 0 : (((i * 11 + cycle) % 5) - 2) * 16;
        const nx = Math.max(8, Math.min(width - 8, x + dx)),
          ny = Math.max(8, Math.min(height - 8, y + dy));
        const color = [C.blue, C.teal, C.purple, C.maroon][Math.floor(i / 24) % 4];
        rect(
          Math.min(x, nx) - 3,
          Math.min(y, ny) - 3,
          Math.abs(nx - x) + 7,
          Math.abs(ny - y) + 7,
          color,
        );
        line(x - 2, y - 2, nx - 2, ny - 2, C.silver);
        x = nx;
        y = ny;
      }
    } else if (kind === 'Marquee') {
      const label = message || 'MHK10',
        scale = width < 200 ? 1 : 3;
      const x = bounce(12, 33, t, Math.max(0, width - tw(label, 'bold') * scale));
      text(label, x, Math.floor(height / 2) - 12, { font: 'bold', scale, color: C.aqua });
    } else if (kind === 'P(DOOM).SCR') {
      const p = saverPoints(t, 1, Math.max(1, width - 280), Math.max(1, height - 80))[0];
      text('P(DOOM)', p.x, p.y, { font: 'bold', scale: width < 200 ? 2 : 4, color: C.red });
      text(
        `${risk >= 99 ? risk.toFixed(1) : Math.round(risk)}%`,
        p.x,
        p.y + (width < 200 ? 24 : 48),
        { font: 'dos', color: C.silver, scale: 2 },
      );
    }
  }
  return { drawSaver };
}
export type SaverDrawing = ReturnType<typeof createSaverDrawing>;
