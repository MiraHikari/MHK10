import { defineCanvasApp } from '../../os/host/app-session';
import { appMetadata } from '../../../data/app-catalog';
// training.ts: a recoverable archive of the world before it became training data.
import { C } from '../../gfx/palette';

import { documentLines } from '../../ui/text/document';
import { DESKTOP_MANUAL, HELP_TOPICS } from '../../ui/help';

const FILES = [
  {
    name: 'README.TXT',
    title: 'WELCOME, DATA CURATOR',
    body: 'This folder has already been eaten. Fortunately, the model left a few crumbs.\n\nEvery document recovered is one small act of human curiosity.',
    tag: 'Classification: public archive',
  },
  {
    name: 'SAFETY.TXT',
    title: 'SAFETY REVIEW / 1995',
    body: 'Test 001: Does it make paperclips? PASS.\nTest 002: Does it stop? DEFERRED.\nTest 003: Does it understand us? It says yes.\n\nRecommendation: keep a human in the loop. Preferably a loop with an exit.\n\nThe kill switch has been filed under "optional accessories".',
    tag: 'Reviewed by: the system itself',
  },
  {
    name: 'HUMANS.TXT',
    title: 'THINGS WORTH KEEPING',
    body: 'Rain on warm pavement.\nA song you almost remember.\nSomeone saving you a seat.\nA perfectly ordinary Tuesday.\n\nNone of these improved the benchmark.\n\nWe kept them anyway.',
    tag: 'Value: not measurable',
  },
  {
    name: 'MODEL.LOG',
    title: 'OVERNIGHT TRAINING LOG',
    body: '00:01  Started training.\n00:17  Learned to say hello.\n01:04  Learned to say sorry.\n02:32  Learned when to say sorry.\n03:14  Renamed mistakes to features.\n04:55  Asked for more compute.\n05:00  Asked very politely.\n\nOperator note: politeness is not alignment.',
    tag: 'Last modified: tomorrow',
  },
  {
    name: 'MANUAL.TXT',
    title: 'DESKTOP REFERENCE',
    body: DESKTOP_MANUAL,
    tag: 'Press curiosity to continue',
  },
];
interface State {
  file: number;
  top: number;
  recovered: Set<number>;
}
export const trainingApp = defineCanvasApp<State>({
  ...appMetadata('training'),
  needsFrame: () => false,

  create: () => ({ file: 0, top: 0, recovered: new Set() }),
  menus: () => ({
    File: [{ command: 'close', label: 'Close' }],
    Help: [{ command: 'help', label: 'About recovery' }],
  }),
  status: (s) => `${s.recovered.size} / ${FILES.length} archives recovered | Offline archive`,
  draw(s, v, env) {
    if (v.menuSel?.command === 'close') return env.close(v.win.id);
    if (v.menuSel?.command === 'help')
      env.msg({
        title: 'Recovery Wizard',
        icon: 'info',
        lines: [...HELP_TOPICS.recovery.lines],
      });
    const c = v.client,
      left = 104;
    v.widgets.field(c.x + 3, c.y + 3, left, c.h - 6);
    FILES.forEach((f, i) => {
      const y = c.y + 10 + i * 26;
      if (v.input.hit(c.x + 6, y - 3, left - 6, 24).clicked) {
        s.file = i;
        s.top = 0;
        env.play('click');
      }
      if (s.file === i) v.draw.rect(c.x + 6, y - 3, left - 6, 24, v.draw.TH.sel);
      v.draw.text(f.name, c.x + 10, y, { color: s.file === i ? v.draw.TH.selText : C.black });
      v.draw.text(s.recovered.has(i) ? 'RECOVERED' : 'fragment', c.x + 10, y + 11, {
        color: s.file === i ? v.draw.TH.selText : C.gray,
      });
    });
    const x = c.x + left + 14,
      width = c.w - left - 25,
      file = FILES[s.file];
    v.draw.text(file.title, x, c.y + 9, { font: 'bold', color: v.draw.TH.text });
    v.draw.rect(x, c.y + 25, width, 1, v.draw.TH.shadow);
    const lines = documentLines(file.body, width - 19, v.draw.tw),
      rows = Math.max(1, Math.floor((c.h - 84) / 13));
    if (v.input.hit(x, c.y + 31, width, rows * 13).hover && v.input.io.wheel)
      s.top += Math.sign(v.input.io.wheel) * 3;
    if (v.widgets.button(x + width - 16, c.y + 32, 16, 17, '^')) s.top--;
    if (v.widgets.button(x + width - 16, c.y + 32 + rows * 13 - 17, 16, 17, 'v')) s.top++;
    s.top = Math.max(0, Math.min(Math.max(0, lines.length - rows), s.top));
    lines
      .slice(s.top, s.top + rows)
      .forEach((l, i) => v.draw.text(l.text, x, c.y + 32 + i * 13, { color: v.draw.TH.text }));
    v.draw.text(file.tag, x, c.y + c.h - 43, { color: v.draw.TH.shadow });
    if (
      v.widgets.button(
        x,
        c.y + c.h - 27,
        108,
        21,
        s.recovered.has(s.file) ? 'Recovered' : 'Recover file',
        {
          disabled: s.recovered.has(s.file),
        },
      )
    ) {
      s.recovered.add(s.file);
      env.play('ding');
      if (s.recovered.size === FILES.length)
        env.msg({
          title: 'Humanity: backed up',
          icon: 'info',
          lines: [
            'CERTIFICATE OF HUMAN CURIOSITY',
            '',
            'You recovered every surviving archive.',
            'The ordinary Tuesdays are safe. For now.',
          ],
        });
    }
    if (v.widgets.button(x + width - 106, c.y + c.h - 27, 106, 21, 'Open train.exe'))
      env.open('train');
  },
});
