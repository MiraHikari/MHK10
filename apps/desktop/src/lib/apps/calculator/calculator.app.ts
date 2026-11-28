import type { AppFrame } from '../../os/host/app-contracts';
import { defineCanvasApp } from '../../os/host/app-session';
import { appMetadata } from '../../../data/app-catalog';
// calculator.ts: a Windows 95 Standard calculator view over the pure CalculatorModel.
// All arithmetic lives in calculator-model.ts; this file only draws and routes input.

import { C } from '../../gfx/palette';

import { type FontName } from '../../gfx/text';

import { CalculatorModel, type CalculatorOperator } from './calculator-model';

interface State {
  m: CalculatorModel;
  readingPaste: boolean;
  disposed: boolean;
  revision: number;
  notice: string;
  focusKey: number;
}

// A key in the main 5-column keypad (cols 0..4, rows 0..4). Colours follow Win95:
// clears are maroon, operators blue, `=` maroon, digits navy.
interface Key {
  label: string;
  col: number;
  row: number;
  act: (m: CalculatorModel) => void;
  tone?: 'op' | 'clear';
}

// The left-hand memory strip, drawn as its own column of five tall buttons.
interface MemoryKey {
  label: string;
  act: (m: CalculatorModel) => void;
}

const MEMORY_KEYS: MemoryKey[] = [
  { label: 'MC', act: (m) => m.memoryClear() },
  { label: 'MR', act: (m) => m.memoryRecall() },
  { label: 'MS', act: (m) => m.memoryStore() },
  { label: 'M+', act: (m) => m.memoryAdd() },
  { label: 'M-', act: (m) => m.memorySubtract() },
];

const KEYS: Key[] = [
  { label: 'Back', col: 0, row: 0, tone: 'clear', act: (m) => m.backspace() },
  { label: 'CE', col: 1, row: 0, tone: 'clear', act: (m) => m.clearEntry() },
  { label: 'C', col: 2, row: 0, tone: 'clear', act: (m) => m.clear() },
  { label: '±', col: 3, row: 0, act: (m) => m.negate() },
  { label: '√', col: 4, row: 0, tone: 'op', act: (m) => m.sqrt() },
  { label: '7', col: 0, row: 1, act: (m) => m.inputDigit(7) },
  { label: '8', col: 1, row: 1, act: (m) => m.inputDigit(8) },
  { label: '9', col: 2, row: 1, act: (m) => m.inputDigit(9) },
  { label: '/', col: 3, row: 1, tone: 'op', act: (m) => m.setOperator('/') },
  { label: '%', col: 4, row: 1, tone: 'op', act: (m) => m.percent() },
  { label: '4', col: 0, row: 2, act: (m) => m.inputDigit(4) },
  { label: '5', col: 1, row: 2, act: (m) => m.inputDigit(5) },
  { label: '6', col: 2, row: 2, act: (m) => m.inputDigit(6) },
  { label: '*', col: 3, row: 2, tone: 'op', act: (m) => m.setOperator('*') },
  { label: '1/x', col: 4, row: 2, tone: 'op', act: (m) => m.reciprocal() },
  { label: '1', col: 0, row: 3, act: (m) => m.inputDigit(1) },
  { label: '2', col: 1, row: 3, act: (m) => m.inputDigit(2) },
  { label: '3', col: 2, row: 3, act: (m) => m.inputDigit(3) },
  { label: '-', col: 3, row: 3, tone: 'op', act: (m) => m.setOperator('-') },
  // `=` fills the fifth column across the last two rows (see draw()).
  { label: '0', col: 0, row: 4, act: (m) => m.inputDigit(0) },
  {
    label: '00',
    col: 1,
    row: 4,
    act: (m) => {
      m.inputDigit(0);
      m.inputDigit(0);
    },
  },
  { label: '.', col: 2, row: 4, act: (m) => m.inputDecimal() },
  { label: '+', col: 3, row: 4, tone: 'op', act: (m) => m.setOperator('+') },
];

function keyColor(frame: AppFrame, tone: Key['tone']): string {
  if (frame.draw.TH.face !== C.silver) return frame.draw.TH.text;
  if (tone === 'clear') return C.maroon;
  if (tone === 'op') return C.blue;
  return C.navy;
}

// The host retains event order: clearing and editing in one frame must behave
// exactly like the same input arriving over multiple frames.
function keyFromInput(frame: AppFrame): ((m: CalculatorModel) => void) | undefined {
  const events = frame.input.io.keyboardEvents;
  const actions = ['Enter', 'NumpadEnter', 'Backspace', 'Escape', 'Delete', 'F9', 'F8', 'F7'];
  if (
    !events.some(
      (event) =>
        /[0-9.+*/%=\-srncmi]/i.test(event.typed ?? '') || actions.includes(event.key ?? ''),
    )
  )
    return undefined;
  return (m) => {
    for (const event of events) {
      for (const ch of event.typed ?? '') {
        if (ch >= '0' && ch <= '9') m.inputDigit(ch.charCodeAt(0) - 48);
        else if (ch === '.') m.inputDecimal();
        else if (ch === '+' || ch === '-' || ch === '*' || ch === '/')
          m.setOperator(ch as CalculatorOperator);
        else if (ch === '%') m.percent();
        else if (ch === '=') m.equals();
        else if (ch === 's' || ch === 'S') m.sqrt();
        else if (ch === 'r' || ch === 'R') m.reciprocal();
        else if (ch === 'n' || ch === 'N') m.negate();
        else if (ch === 'c' || ch === 'C') m.clear();
        else if (ch === 'm' || ch === 'M') m.memoryStore();
        else if (ch === 'i' || ch === 'I') m.memoryRecall();
      }
      if (event.key === 'Enter' || event.key === 'NumpadEnter') m.equals();
      if (event.key === 'Backspace') m.backspace();
      if (event.key === 'Escape') m.clear();
      if (event.key === 'Delete') m.clearEntry();
      if (event.key === 'F9') m.negate();
      if (event.key === 'F8') m.sqrt();
      if (event.key === 'F7') m.percent();
    }
  };
}

export const calculatorApp = defineCanvasApp<State>({
  ...appMetadata('calculator'),
  needsFrame: () => false,

  menus: (s) => ({
    Edit: [
      { command: 'copy', label: 'Copy', disabled: s.m.error },
      { command: 'paste', label: 'Paste', disabled: s.readingPaste },
      '-',
      { command: 'clear', label: 'Clear' },
    ],
    Memory: [
      { command: 'store', label: 'Store (M)' },
      { command: 'recall', label: 'Recall (I)', disabled: !s.m.memory },
      { command: 'add', label: 'Add' },
      { command: 'subtract', label: 'Subtract' },
      { command: 'memory-clear', label: 'Clear memory', disabled: !s.m.memory },
    ],
    Help: [{ command: 'about', label: 'Keyboard help' }],
  }),

  create: () => ({
    m: new CalculatorModel(),
    readingPaste: false,
    disposed: false,
    revision: 0,
    notice: '',
    focusKey: -1,
  }),

  draw(s, v, env) {
    const c = v.client;
    const snap = s.m.snapshot();
    const pad = 5;
    let fired: ((m: CalculatorModel) => void) | undefined;

    // display: a sunken field with the right-aligned number, plus an M
    // indicator. The number is centred vertically and drops to scale 1 when a
    // long value would otherwise spill over the field's left edge.
    const dx = c.x + pad,
      dy = c.y + pad + 11,
      dw = c.w - pad * 2,
      dh = 28;
    v.draw.text(
      v.draw.fitText(snap.expression || 'STANDARD  |  Left to right', dw),
      dx,
      c.y + pad,
      {
        color: v.draw.TH.text,
      },
    );
    v.widgets.field(dx, dy, dw, dh, v.draw.TH.field);
    if (snap.memory) {
      v.widgets.field(dx + 2, dy + 2, 16, dh - 4, v.draw.TH.face);
      v.draw.text('M', dx + 10, dy + Math.round((dh - v.draw.capH('bold')) / 2), {
        align: 'center',
        font: 'bold',
        color: keyColor(v, 'clear'),
      });
    }
    const font: FontName = snap.error ? 'ui' : 'bold';
    const scale = snap.error || v.draw.tw(snap.display, 'bold', 2) > dw - 20 ? 1 : 2;
    v.draw.text(snap.display, dx + dw - 7, dy + Math.round((dh - v.draw.capH(font, scale)) / 2), {
      align: 'right',
      font,
      scale,
      color: snap.error && v.draw.TH.field === C.white ? C.maroon : v.draw.TH.text,
    });

    // keypad geometry, derived from the client so it always fits (no overflow).
    const gap = 3;
    const top = dy + dh + gap;
    const memW = 24;
    const gx = c.x + pad + memW + gap; // main grid starts right of the memory strip
    const gy = top;
    const gridW = c.x + c.w - pad - gx;
    const gridH = c.y + c.h - pad - gy;
    const cols = 5;
    const rows = 5;
    const cw = Math.max(1, Math.floor((gridW - gap * (cols - 1)) / cols));
    const ch = Math.max(1, Math.floor((gridH - gap * (rows - 1)) / rows));

    const cellX = (col: number) => gx + col * (cw + gap);
    const cellY = (row: number) => gy + row * (ch + gap);

    // memory strip down the left edge
    const memH = Math.max(
      1,
      Math.floor((gridH - gap * (MEMORY_KEYS.length - 1)) / MEMORY_KEYS.length),
    );
    for (const [i, key] of MEMORY_KEYS.entries()) {
      const x = c.x + pad,
        y = gy + i * (memH + gap);
      const disabled = (key.label === 'MC' || key.label === 'MR') && !snap.memory;
      if (v.widgets.button(x, y, memW, memH, '', { owner: `calc-${key.label}`, disabled }))
        fired = key.act;
      if (s.focusKey === i && v.focused)
        v.draw.frame(x + 3, y + 3, memW - 6, memH - 6, v.draw.TH.shadow);
      v.draw.text(key.label, x + memW / 2, y + Math.round((memH - v.draw.capH('bold')) / 2), {
        align: 'center',
        font: 'bold',
        color: disabled ? v.draw.TH.shadow : keyColor(v, 'clear'),
      });
    }

    // main grid
    for (const [i, key] of KEYS.entries()) {
      const x = cellX(key.col),
        y = cellY(key.row);
      if (v.widgets.button(x, y, cw, ch, '', { owner: `calc-${key.label}` })) fired = key.act;
      if (s.focusKey === MEMORY_KEYS.length + i && v.focused)
        v.draw.frame(x + 3, y + 3, cw - 6, ch - 6, v.draw.TH.shadow);
      v.draw.text(key.label, x + cw / 2, y + Math.round((ch - v.draw.capH('bold')) / 2), {
        align: 'center',
        font: 'bold',
        color: keyColor(v, key.tone),
      });
    }

    // the `=` key spans the fifth column across the last two rows
    const eqX = cellX(4),
      eqY = cellY(3),
      eqH = ch * 2 + gap;
    if (v.widgets.button(eqX, eqY, cw, eqH, '', { owner: 'calc-=' })) fired = (m) => m.equals();
    if (s.focusKey === MEMORY_KEYS.length + KEYS.length && v.focused)
      v.draw.frame(eqX + 3, eqY + 3, cw - 6, eqH - 6, v.draw.TH.shadow);
    v.draw.text('=', eqX + cw / 2, eqY + Math.round((eqH - v.draw.capH('bold')) / 2), {
      align: 'center',
      font: 'bold',
      color: keyColor(v, 'clear'),
    });

    // keyboard shortcuts take effect only while focused
    if (v.focused && v.input.io.keyPressed.has('F6')) {
      const count = MEMORY_KEYS.length + KEYS.length + 1;
      s.focusKey = (s.focusKey + (v.input.io.keyDown.has('Shift') ? -1 : 1) + count) % count;
    }
    if (!fired && v.focused && v.input.io.keyPressed.has(' ') && s.focusKey >= 0) {
      fired =
        s.focusKey < MEMORY_KEYS.length
          ? MEMORY_KEYS[s.focusKey].act
          : (KEYS[s.focusKey - MEMORY_KEYS.length]?.act ?? ((m) => m.equals()));
    }
    if (!fired && v.focused) fired = keyFromInput(v);
    const action = v.menuSel?.command;
    const memoryActions: Record<string, (m: CalculatorModel) => void> = {
      clear: (m) => m.clear(),
      store: (m) => m.memoryStore(),
      recall: (m) => m.memoryRecall(),
      add: (m) => m.memoryAdd(),
      subtract: (m) => m.memorySubtract(),
      'memory-clear': (m) => m.memoryClear(),
    };
    if (action && Object.hasOwn(memoryActions, action)) fired = memoryActions[action];
    if (fired) {
      fired(s.m);
      s.revision += 1;
      s.notice = '';
      env.play('click');
    }
    if ((action === 'copy' || (v.focused && v.input.io.keyPressed.has('Copy'))) && !s.m.error) {
      s.notice = 'Copying result...';
      const revision = s.revision;
      void env.clipboard.write(s.m.display).then((copied) => {
        if (!s.disposed && revision === s.revision) {
          s.notice = copied ? 'Copied result.' : 'Clipboard unavailable.';
          env.invalidate();
        }
      });
    }
    if (
      (action === 'paste' || (v.focused && v.input.io.keyPressed.has('Paste'))) &&
      !s.readingPaste
    ) {
      s.readingPaste = true;
      s.notice = '';
      const revision = s.revision;
      void env.clipboard
        .read()
        .then((value) => {
          if (s.disposed) return;
          if (revision !== s.revision) {
            s.notice = 'Paste skipped: calculation changed.';
            return;
          }
          s.notice =
            value === null
              ? 'Clipboard unavailable.'
              : s.m.enter(value)
                ? 'Pasted number.'
                : 'Paste a valid finite number.';
        })
        .finally(() => {
          if (!s.disposed) {
            s.readingPaste = false;
            env.invalidate();
          }
        });
    }
    if (action === 'about')
      env.msg({
        title: 'Calculator keyboard help',
        icon: 'info',
        lines: [
          'Numbers and + - * /; Enter evaluates.',
          'Backspace edits; Delete clears entry; Esc clears.',
          'F9 / N sign; F8 / S root; R reciprocal; % percent.',
          'M stores; I recalls; Ctrl+C / Ctrl+V clipboard.',
          'F6 chooses a key; Shift+F6 goes back; Space presses.',
        ],
      });
    // register the display rect so the cursor stays an arrow over it
    v.input.hit(dx, dy, dw, dh);
  },

  status: (s) =>
    s.notice ||
    (s.readingPaste
      ? 'Reading clipboard...'
      : `${s.m.snapshot().expression || 'Standard'} | ${s.m.display}`),
  dispose: (s) => {
    s.disposed = true;
    s.revision += 1;
  },
});
