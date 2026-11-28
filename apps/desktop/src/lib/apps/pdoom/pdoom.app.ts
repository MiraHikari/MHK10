import { defineCanvasApp } from '../../os/host/app-session';
import { appMetadata } from '../../../data/app-catalog';
// pdoom.ts: "P(doom) Properties" — the hook shot of the video, made interactive.
// Every click of the up-arrow drives the taskbar meter, the doomsday clock and the story.
// The layout is the video's hookShot dialog, pixel for pixel.

import { C } from '../../gfx/palette';

import { pdoomText } from '../../os/story/doom';

interface State {
  heldUp: boolean;
  nextRepeat: number;
}

export const pdoomApp = defineCanvasApp<State>({
  ...appMetadata('pdoom'),
  // hold-to-repeat 在 draw 里按 env.now() 推进，只在按住时持续帧。
  needsFrame: (s) => s.heldUp,

  create: () => ({ heldUp: false, nextRepeat: 0 }),

  draw(s, v, env) {
    const c = v.client,
      val = env.snapshot().meter;
    v.draw.text('Probability of doom:', c.x + 12, c.y + 22, { color: v.draw.TH.text });
    v.widgets.field(c.x + 120, c.y + 6, 118, 40, C.black);
    v.draw.text(pdoomText(val), c.x + 232, c.y + 14, {
      font: 'bold',
      scale: 3,
      color: val >= 80 ? C.red : C.lime,
      align: 'right',
    });
    // the spinner
    const UP = { x: c.x + 240, y: c.y + 6 },
      DN = { x: c.x + 240, y: c.y + 26 };
    const d = v.input.hit(UP.x, UP.y, 22, 20).held ? 1 : 0;
    const up = v.widgets.button(UP.x, UP.y, 22, 20, '');
    v.widgets.button(DN.x, DN.y, 22, 20, '');
    for (let i = 0; i < 5; i++) {
      v.draw.rect(UP.x + 10 - i + d, UP.y + 7 + i + d, 1 + 2 * i, 1, v.draw.TH.text);
      v.draw.rect(DN.x + 10 - i, DN.y + 12 - i, 1 + 2 * i, 1, v.draw.TH.shadow);
    }
    if (up) {
      env.doomUp();
      env.play('up');
    }
    // hold-to-repeat makes hammering the up-arrow a choice
    const held = v.input.hit(UP.x, UP.y, 22, 20).held;
    if (held) {
      if (!s.heldUp) {
        s.nextRepeat = env.now() + 0.35;
        s.heldUp = true;
      }
      if (env.now() > s.nextRepeat) {
        env.doomUp();
        env.play('up');
        s.nextRepeat = env.now() + 0.1;
      }
    } else s.heldUp = false;
    if (v.input.hit(DN.x, DN.y, 22, 20).clicked) {
      if (env.doomDown()) env.play('down');
      else {
        env.play('error');
        env.msg({
          title: 'P(doom)',
          icon: 'error',
          lines: ['Cannot decrease P(doom).', 'This parameter is managed by AGI.EXE.'],
        });
      }
    }
    v.widgets.progress(c.x + 12, c.y + 54, c.w - 24, 16, val / 100, {
      bw: 8,
      color: val >= 80 ? C.red : val >= 50 ? C.maroon : C.navy,
      bg: C.silver,
    });
    if (v.widgets.button(c.x + c.w - 146, c.y + 78, 62, 21, 'OK', { def: true }))
      env.close(v.win.id);
    v.widgets.button(c.x + c.w - 76, c.y + 78, 62, 21, 'Cancel', { disabled: true });
  },
});
