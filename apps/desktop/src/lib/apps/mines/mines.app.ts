import type { AppFrame } from '../../os/host/app-contracts';
import { defineCanvasApp } from '../../os/host/app-session';
import { appMetadata } from '../../../data/app-catalog';
// mines.ts: Minesweeper — fully playable. The board logic is pure (board.ts); this is the view.

import { C } from '../../gfx/palette';

import {
  createBoard,
  openCell,
  toggleFlag,
  flagsUsed,
  chordOpen,
  COLS,
  ROWS,
  MINES,
} from './board';

const NUMC = ['', C.blue, C.green, C.red, C.navy, C.maroon, C.teal, C.black, C.gray];

interface State {
  b: ReturnType<typeof createBoard>;
  time: number;
  timerOn: boolean;
  face: 'ok' | 'oh' | 'dead' | 'cool';
}

function face(frame: AppFrame, x: number, y: number, mood: 'ok' | 'oh' | 'dead' | 'cool'): void {
  frame.draw.disc(x, y, 9, C.black);
  frame.draw.disc(x, y, 8, C.yellow);
  if (mood === 'cool') {
    // sunglasses
    frame.draw.rect(x - 6, y - 5, 5, 3, C.black);
    frame.draw.rect(x + 1, y - 5, 5, 3, C.black);
    frame.draw.rect(x - 1, y - 4, 2, 1, C.black);
  } else if (mood === 'dead') {
    for (const ex of [-5, 2])
      for (let i = 0; i < 4; i++) {
        frame.draw.rect(x + ex + i, y - 5 + i, 1, 1, C.black);
        frame.draw.rect(x + ex + 3 - i, y - 5 + i, 1, 1, C.black);
      }
  } else {
    frame.draw.rect(x - 4, y - 4, 2, 3, C.black);
    frame.draw.rect(x + 2, y - 4, 2, 3, C.black);
  }
  if (mood === 'oh') return void frame.draw.ring(x, y + 3, 2, C.black);
  const e = mood === 'dead' ? 1 : -1;
  frame.draw.rect(x - 3, y + 4, 6, 1, C.black);
  frame.draw.rect(x - 4, y + 4 + e, 1, 1, C.black);
  frame.draw.rect(x + 3, y + 4 + e, 1, 1, C.black);
}

export const minesApp = defineCanvasApp<State>({
  ...appMetadata('mines'),
  // 计时器运行时才需要每帧重绘。
  needsFrame: (s) => s.timerOn,

  menus: () => ({
    Game: [
      { command: 'new', label: 'New' },
      '-',
      { command: 'beginner', label: 'Beginner (you are playing it)', disabled: true },
      { command: 'intermediate', label: 'Intermediate', disabled: true },
      { command: 'expert', label: 'Expert', disabled: true },
    ],
  }),

  create: () => ({ b: createBoard(), time: 0, timerOn: false, face: 'ok' }),

  draw(s, v, env) {
    if (v.menuSel?.command === 'new') {
      s.b = createBoard();
      s.time = 0;
      s.timerOn = false;
    }
    if (s.b.started && !s.b.dead && !s.b.won) {
      s.timerOn = true;
      s.time = Math.min(999, s.time + v.dt);
    }

    const c = v.client,
      GX = c.x + 6,
      GY = c.y + 46;
    // the status panel: LED counters + the smiley (LED boxes are 54 wide, as in the video)
    v.widgets.bevel(c.x + 6, c.y + 6, c.w - 12, 34, 'thin');
    const led = (x: number, val: number) => {
      v.widgets.field(x, c.y + 11, 54, 24, C.black);
      v.draw.text(String(Math.max(-99, Math.round(val))).padStart(3, '0'), x + 3, c.y + 16, {
        font: 'dos',
        scale: 2,
        color: C.red,
      });
    };
    led(c.x + 12, MINES - flagsUsed(s.b));
    led(c.x + c.w - 66, s.time);
    const sbx = c.x + R2(c.w / 2 - 13);
    const sbHover = v.input.hit(sbx, c.y + 10, 26, 26);
    const resetClicked = v.widgets.button(sbx, c.y + 10, 26, 26, '');
    if (resetClicked || v.menuSel?.command === 'new') {
      s.b = createBoard();
      s.time = 0;
      s.timerOn = false;
      env.play('click');
    }
    const mood: State['face'] = s.b.dead ? 'dead' : s.b.won ? 'cool' : sbHover.held ? 'oh' : 'ok';
    face(v, sbx + 13, c.y + 23, mood);
    // the grid
    v.widgets.bevel(GX - 2, GY - 2, COLS * 16 + 4, ROWS * 16 + 4, 'sunken', C.gray);
    let opened = -1,
      flagged = -1,
      chord = -1;
    for (let i = 0; i < COLS * ROWS; i++) {
      const x = GX + (i % COLS) * 16,
        y = GY + Math.floor(i / COLS) * 16;
      const open = s.b.state[i] === 'open' || (s.b.dead && s.b.mines[i]);
      const h = v.input.hit(x, y, 16, 16);
      if (h.held && v.input.io.rdown) chord = i;
      else {
        if (h.clicked) opened = i;
        if (h.rclicked) flagged = i;
      }
      if (!open) {
        // the raised tile, exactly as the video draws it: white top-left, grey bottom-right, silver face
        v.draw.rect(x, y, 16, 16, C.white);
        v.draw.rect(x + 2, y + 2, 14, 14, C.gray);
        v.draw.rect(x + 2, y + 2, 12, 12, C.silver);
        if (s.b.state[i] === 'flag') sprFlag(v, x, y);
        continue;
      }
      v.draw.rect(
        x,
        y,
        16,
        16,
        s.b.dead && s.b.mines[i] && s.b.state[i] === 'open' ? C.red : C.gray,
      );
      v.draw.rect(x + 1, y + 1, 15, 15, C.silver);
      if (s.b.mines[i]) sprMine(v, x + 2, y + 2);
      else if (s.b.nums[i])
        v.draw.text(s.b.nums[i], x + 9, y + 4, {
          font: 'bold',
          color: NUMC[s.b.nums[i]],
          align: 'center',
        });
    }
    // input: left opens, right flags, both buttons chord an open number
    if (!s.b.dead && !s.b.won) {
      const reveal = (res: ReturnType<typeof openCell>) => {
        if (res === 'boom') {
          env.play('boom');
          v.effects.FX.shake = 6;
          v.effects.FX.flash = [C.white, 0.5];
        } else if (res === 'won') env.play('tada');
        else if (res === 'opened') env.play('click');
      };
      if (chord >= 0) reveal(chordOpen(s.b, chord));
      else {
        if (opened >= 0) reveal(openCell(s.b, opened));
        if (flagged >= 0) {
          toggleFlag(s.b, flagged);
          env.play('click');
        }
      }
    }
  },
});

const R2 = Math.round;

// local pixel art (kept out of the global sprite table)
function sprFlag(frame: AppFrame, x: number, y: number): void {
  const P = C.black;
  frame.draw.rect(x + 7, y + 3, 1, 9, P);
  for (let i = 0; i < 4; i++) frame.draw.rect(x + 3 + i, y + 6 + i, 7 - 2 * i, 1, C.maroon);
  frame.draw.rect(x + 4, y + 12, 6, 1, P);
  frame.draw.rect(x + 3, y + 13, 8, 1, P);
}
function sprMine(frame: AppFrame, x: number, y: number): void {
  const K = C.black;
  frame.draw.rect(x + 6, y, 1, 12, K);
  frame.draw.rect(x, y + 6, 13, 1, K);
  for (let i = 0; i < 5; i++) {
    frame.draw.rect(x + 1 + i, y + 2 + i, 1, 1, K);
    frame.draw.rect(x + 11 - i, y + 2 + i, 1, 1, K);
    frame.draw.rect(x + 1 + i, y + 10 - i, 1, 1, K);
    frame.draw.rect(x + 11 - i, y + 10 - i, 1, 1, K);
  }
  frame.draw.rect(x + 3, y + 3, 7, 7, K);
  frame.draw.rect(x + 5, y + 4, 2, 2, C.white);
}
