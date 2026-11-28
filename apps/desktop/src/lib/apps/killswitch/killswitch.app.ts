import type { AppFrame } from '../../os/host/app-contracts';
import { defineCanvasApp } from '../../os/host/app-session';
import { appMetadata } from '../../../data/app-catalog';
// killswitch.ts: the emergency stop, and its Out of Office AutoReply — the postcard
// from ch06: sea, island, palm tree, the little guy, the sun.

import { C, PAL } from '../../gfx/palette';
import { R, hash, prog, easeOut } from '../../gfx/primitives';

function registerPostcard(frame: AppFrame) {
  frame.draw.defSprite(
    'k_guy',
    `
    ....................
    .KKK................
    KYYYK...............
    KKKKKK..............
    KYYYK...............
    .YYY................
    .WWWWWWWRRRRRYY.....
    mWWWWWWWRRRRRRYY....
    .mm...........mm....
    ..mm.........mm.....
    ...mmmmmmmmmmm......`,
    PAL,
  );
}

interface State {
  asked: boolean;
  askedAt: number;
  artwork?: boolean;
  unsubscribe?: () => void;
}

export const killApp = defineCanvasApp<State>({
  ...appMetadata('killswitch'),
  // 静态确认页；故事变化时由订阅请求一次重绘。
  needsFrame: () => false,

  status: (_s, env) =>
    env.story.get().stage === 'control'
      ? 'Emergency override available. Human signature required.'
      : 'Open Recovery Console to review the ownership request.',

  create: (env) => {
    const state: State = { asked: false, askedAt: 0 };
    state.unsubscribe = env.story.subscribe(() => env.invalidate());
    return state;
  },
  dispose: (s) => s.unsubscribe?.(),

  draw(_s, v, env) {
    const c = v.client,
      by = c.y + 200;
    const current = env.story.get(),
      enabled = current.stage === 'control';
    v.draw.text('Operator status:', c.x + 10, c.y + 8, { color: v.draw.TH.text });
    v.widgets.field(c.x + 8, c.y + 22, c.w - 16, 36);
    v.draw.text(
      enabled
        ? 'human emergency override available'
        : current.ending
          ? 'story closed; local records preserved'
          : 'waiting for an ownership review',
      c.x + 18,
      c.y + 31,
      { color: v.draw.TH.text },
    );
    v.draw.text('Owner: ' + current.owner, c.x + 18, c.y + 68, { color: v.draw.TH.text });
    if (v.widgets.button(c.x + 86, c.y + 89, 124, 21, 'Recovery Console')) env.open('recovery');
    bigButton(v, c.x + 147, by, enabled);
    if (!enabled)
      v.draw.text('EMERGENCY STOP', c.x + 148, by + 47, {
        font: 'bold',
        color: v.draw.TH.hi,
        align: 'center',
      });
    v.draw.text('EMERGENCY STOP', c.x + 147, by + 46, {
      font: 'bold',
      color: enabled ? v.draw.TH.text : v.draw.TH.shadow,
      align: 'center',
    });
    if (enabled) {
      const r = v.input.hit(c.x + 87, by - 70, 120, 116);
      if (r.clicked)
        env.msg({
          title: 'Emergency human override',
          icon: 'question',
          lines: [
            'Stop AI execution and restore human control?',
            'This completes the human recovery ending.',
            'Personal documents will remain unchanged.',
          ],
          buttons: ['Stop AI', 'Cancel'],
          def: 1,
          onBtn: (i, e) => {
            if (i === 0 && env.story.dispatch('human')) {
              e.play('ding');
              e.open('recovery');
            }
          },
        });
    }
  },
});

function bigButton(frame: AppFrame, cx: number, by: number, on: boolean): void {
  const [c1, c2, s1, s2] = on
    ? [C.red, C.maroon, C.yellow, C.black]
    : [C.silver, C.gray, C.silver, C.gray];
  const ctx = frame.draw.getCtx();
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - 70, by - 70, 140, 70);
  ctx.clip();
  frame.draw.ell(cx, by, 58, 62, C.black);
  frame.draw.ell(cx, by, 56, 60, c2);
  frame.draw.ell(cx - 3, by - 3, 52, 56, c1);
  frame.draw.ell(cx - 22, by - 36, 11, 7, C.white);
  ctx.restore();
  frame.draw.rect(cx - 72, by, 144, 34, C.black);
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - 70, by + 2, 140, 30);
  ctx.clip();
  frame.draw.rect(cx - 70, by + 2, 140, 30, s1);
  for (let i = -2; i < 8; i++) {
    const x = cx - 70 + i * 24;
    frame.draw.poly(
      [
        [x, by + 32],
        [x + 12, by + 32],
        [x + 42, by + 2],
        [x + 30, by + 2],
      ],
      s2,
    );
  }
  ctx.restore();
}

/** The Out of Office AutoReply — a dialog beside the window, like ch06: sea, island, palm, the guy, the sun. */
export const postcardApp = defineCanvasApp<State>({
  ...appMetadata('postcard'),

  create: (env) => ({ asked: true, askedAt: env.now() }),
  draw(s, v, env) {
    if (!s.artwork) {
      registerPostcard(v);
      s.artwork = true;
    }
    const { x, y, w, h } = v.client;
    // the postcard: sea, sun, waves, island, palm, the guy
    const px = x + 11,
      py = y + 10,
      pw = w - 22;
    v.widgets.field(px, py, pw, 100, C.aqua);
    const motion = env.reducedMotion ? 0 : env.now();
    const t = env.reducedMotion ? 1 : env.now() - s.askedAt;
    const sx = px + pw - 48,
      sy = py + 30 + R(70 * (1 - easeOut(prog(t, 0.1, 0.5))));
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + ((Math.floor(motion * 6) % 2) * Math.PI) / 8;
      v.draw.line(
        sx + Math.cos(a) * 19,
        sy + Math.sin(a) * 19,
        sx + Math.cos(a) * 26,
        sy + Math.sin(a) * 26,
        C.yellow,
        2,
      );
    }
    v.draw.disc(sx, sy, 15, C.yellow);
    v.draw.rect(px, py + 68, pw, 40, C.blue);
    for (let i = 0; i < 8; i++)
      v.draw.rect(px + (R(hash(i) * pw + motion * 14) % pw), py + 71 + i * 3, 9, 1, C.white);
    v.draw.ell(px + 92, py + 101, 84, 22, C.olive);
    v.draw.ell(px + 92, py + 102, 82, 21, C.yellow);
    const tx = px + 56,
      ty = py + 34;
    v.draw.path(
      [
        [px + 44, py + 86],
        [px + 48, py + 58],
        [tx, ty],
      ],
      C.olive,
      4,
    );
    for (const [a, b, e, f] of [
      [-14, -4, -26, 10],
      [-12, -12, -28, -8],
      [0, -14, -6, -24],
      [12, -12, 28, -10],
      [14, -2, 26, 12],
    ] as const)
      v.draw.path(
        [
          [tx, ty],
          [tx + a, ty + b],
          [tx + e, ty + f],
        ],
        C.green,
        3,
      );
    v.draw.disc(tx - 3, ty + 4, 2, C.maroon);
    v.draw.disc(tx + 3, ty + 3, 2, C.maroon);
    v.draw.spr('k_guy', px + 96, py + 60, 2);
    if (t > 0.9)
      v.effects.wordart('PTO', px + 148, py + 28, 3, 0, { k: prog(t, 0.9, 1.05), depth: 1 });
    // the message
    v.draw.text('I am on PTO until after the singularity.', px, py + 108, {
      color: v.draw.TH.text,
    });
    v.draw.text('For urgent shutdowns, please contact:', px, py + 121, { color: v.draw.TH.text });
    if (t > 1.15) v.draw.text('nobody.', px, py + 136, { font: 'bold', color: v.draw.TH.text });
    if (v.widgets.button(x + w / 2 - 31, y + h - 29, 62, 21, 'OK', { def: true }))
      env.close(v.win.id);
  },
});
