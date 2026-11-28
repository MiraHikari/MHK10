import { defineCanvasApp } from '../../os/host/app-session';
import { appMetadata } from '../../../data/app-catalog';
// train.ts: the loss chart from the video's trainWin, explicitly started by the user.
// Opening the chart never authorizes training or advances the local story.

import { C } from '../../gfx/palette';
import { R, lerp, clamp, hash } from '../../gfx/primitives';

// the loss curve, ported from apps.js
const lossAt = (u: number, stable: boolean) =>
  stable
    ? 0.16 + 0.012 * Math.sin(u * 90)
    : 0.1 + 0.78 * Math.exp(-3.2 * u) + 0.035 * (hash(Math.floor(u * 140)) - 0.5);

interface State {
  e: number;
  run: number;
  fell: number;
  stableLamp: boolean;
  paused: boolean;
  started: boolean;
}

export const trainApp = defineCanvasApp<State>({
  ...appMetadata('train'),
  // 训练推进与 STABLE 指示灯闪烁依赖时间；暂停且灯不闪时无需帧。
  needsFrame: (s, env) => !s.paused || (!env.reducedMotion && s.stableLamp && s.fell < 0),

  create: () => ({ e: 0.03, run: 0, fell: -1, stableLamp: false, paused: true, started: false }),

  status: (s, env) =>
    env.story.get().ending === 'human'
      ? 'Execution revoked. Start a new story to train again.'
      : !s.started
        ? 'Ready. Click Run to authorize training.'
        : s.paused
          ? 'Paused. The future can wait.'
          : s.fell < 0
            ? `epoch ${Math.floor(s.e * 400)}    loss ${(2.9 * lossAt(s.e, s.stableLamp)).toFixed(2)}`
            : s.fell < 0.5
              ? 'loss 0.00'
              : s.fell < 4
                ? 'loss -inf    (that was sudden)'
                : s.stableLamp
                  ? 'Stable. Nothing to see here.'
                  : 'Training...',

  draw(s, v, env) {
    const stopped = env.story.get().ending === 'human';
    if (stopped) s.paused = true;
    // advance the run; the third run is "stable", then the drop returns
    if (!s.paused && s.fell < 0) {
      s.e += v.dt * 0.045;
      if (s.e >= 0.52) {
        s.fell = 0;
        v.effects.FX.shake = 5;
        env.play('boom');
      }
    } else if (!s.paused) {
      s.fell += v.dt;
      if (s.fell > 4.5) {
        s.run++;
        s.e = 0.03;
        s.fell = -1;
        s.stableLamp = s.run % 3 === 2;
      }
    }

    const c = v.client;
    const p = { x: c.x + 34, y: c.y + 6, w: c.w - 42, h: c.h - 30 };
    v.widgets.field(p.x - 2, p.y - 2, p.w + 4, p.h + 4);
    for (let i = 1; i < 4; i++) v.draw.rect(p.x, p.y + R((p.h * i) / 4), p.w, 1, v.draw.TH.lite);
    for (let i = 1; i < 6; i++) v.draw.rect(p.x + R((p.w * i) / 6), p.y, 1, p.h, v.draw.TH.lite);
    v.draw.text('loss', c.x + 6, p.y + 2, { color: v.draw.TH.text });
    v.draw.text('epoch', p.x + 4, p.y + p.h + 7, { color: v.draw.TH.text });
    const n = R(p.w * clamp(s.e));
    let px = p.x,
      py = p.y + R(p.h * (1 - lossAt(0, s.stableLamp)));
    for (let i = 1; i <= n; i++) {
      const yy = p.y + R(p.h * (1 - lossAt(i / p.w, s.stableLamp)));
      v.draw.line(px, py, p.x + i, yy, C.red, 2);
      px = p.x + i;
      py = yy;
    }
    // the sudden drop: the curve leaves through the bottom of the chart
    if (s.fell >= 0) {
      const drop = Math.min(1, s.fell / 0.32);
      const y1 = lerp(py, p.y + p.h + 2, drop * drop * drop);
      v.draw.line(px, py, px, R(y1), C.red, 2);
      if (s.fell < 4)
        v.effects.FX.shake = Math.max(
          v.effects.FX.shake ?? 0,
          3 * Math.exp(-6 * Math.max(0, s.fell - 0.3)),
        );
    }
    // the STABLE lamp (from ch03)
    if (s.stableLamp && s.fell < 0) {
      const lab = s.e > 0.3 ? 'UNSTABLE' : 'STABLE',
        lw = v.draw.tw(lab, 'bold') + 22,
        lx = p.x + p.w - lw - 4,
        ly = p.y + 5;
      v.widgets.bevel(lx, ly, lw, 16, 'thinUp');
      const bad = s.e > 0.3;
      v.draw.disc(lx + 8, ly + 8, 3, C.black);
      v.draw.disc(
        lx + 8,
        ly + 8,
        2,
        !bad ? C.lime : env.reducedMotion || Math.floor(env.now() * 12) % 2 ? C.red : C.maroon,
      );
      v.draw.text(lab, lx + 16, ly + 4, { font: 'bold', color: v.draw.TH.text });
    }
    if (
      v.widgets.button(
        c.x + c.w - 144,
        p.y + p.h + 3,
        64,
        19,
        !s.started ? 'Run' : s.paused ? 'Resume' : 'Pause',
        { disabled: stopped },
      )
    ) {
      if (!s.started) {
        s.started = true;
        env.story.dispatch('train');
      }
      s.paused = !s.paused;
      env.play('click');
    }
    if (v.widgets.button(c.x + c.w - 76, p.y + p.h + 3, 70, 19, 'Recovery')) env.open('recovery');
  },
});
