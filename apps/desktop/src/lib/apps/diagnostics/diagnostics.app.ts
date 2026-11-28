import { textCommand as commandKey } from '../../ui/canvas/text-mode';
import { defineCanvasApp } from '../../os/host/app-session';
import { appMetadata } from '../../../data/app-catalog';
// A complete L1 utility client inside the desktop's managed window.
import type { AppServices, AppFrame } from '../../os/host/app-contracts';
import { C } from '../../gfx/palette';

import { motionTime } from '../../gfx/timing';
import { R } from '../../gfx/primitives';

import type { RuntimeSnapshot } from '../../os/story/runtime-state';
import { diagnosticSignals, runDiagnostic } from '../../os/story/diagnostics';
import { documentLines } from '../../ui/text/document';

interface State {
  tab: number;
  output: string[];
  command: string;
  caret: number;
  history: string[];
  historyAt: number;
  scroll: number;
}
const DOS = { font: 'dos' as const, color: C.white };

function consoleInput(frame: AppFrame, s: State, env: AppServices): void {
  let chars = Array.from(s.command);
  for (const char of frame.input.io.typed)
    if (char >= ' ' && chars.length < 80) {
      chars.splice(s.caret++, 0, char);
    }
  const keys = frame.input.io.keyPressed;
  if (keys.has('Backspace') && s.caret > 0) chars.splice(--s.caret, 1);
  if (keys.has('Delete')) chars.splice(s.caret, 1);
  if (keys.has('ArrowLeft')) s.caret = Math.max(0, s.caret - 1);
  if (keys.has('ArrowRight')) s.caret = Math.min(chars.length, s.caret + 1);
  if (keys.has('Home')) s.caret = 0;
  if (keys.has('End')) s.caret = chars.length;
  if (keys.has('Escape')) {
    chars = [];
    s.caret = 0;
  }
  s.command = chars.join('');
  if (keys.has('ArrowUp') || keys.has('ArrowDown')) {
    s.historyAt = Math.max(
      0,
      Math.min(s.history.length, s.historyAt + (keys.has('ArrowUp') ? -1 : 1)),
    );
    s.command = s.history[s.historyAt] ?? '';
    s.caret = Array.from(s.command).length;
  }
  if (keys.has('PageUp')) s.scroll += 8;
  if (keys.has('PageDown')) s.scroll -= 8;
  if (!keys.has('Enter')) return;
  frame.input.consumeKey('Enter');
  const command = s.command.trim();
  const result = runDiagnostic(
    command,
    env.snapshot().story,
    env.files.list('personal'),
    env.snapshot().meter,
  );
  if (result.clear) s.output = [];
  else s.output.push('C:\\PUBLIC>' + command, ...result.lines, '');
  s.output = s.output.slice(-180);
  if (command && s.history.at(-1) !== command) s.history.push(command);
  s.history = s.history.slice(-24);
  s.historyAt = s.history.length;
  s.command = '';
  s.caret = 0;
  s.scroll = 0;
  if (result.view) s.tab = 1;
  if (result.open) env.open(result.open);
  env.play('click');
}

function drawConsole(
  s: State,
  v: AppFrame,
  env: AppServices,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (v.focused && v.win.menu.open < 0) consoleInput(v, s, env);
  const ctx = v.draw.getCtx();
  v.draw.l1Panel(x, y, w, h, 'C:\\PUBLIC');
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 3, y + 3, w - 6, h - 6);
  ctx.clip();
  const rows = Math.max(1, Math.floor((h - 34) / 11));
  const lines = s.output.flatMap((value) =>
    documentLines(value, w - 22, (value) => v.draw.tw(value, 'dos')).map((line) => line.text),
  );
  if (v.input.hit(x, y, w, h).hover && v.input.io.wheel)
    s.scroll += Math.sign(v.input.io.wheel) * 3;
  s.scroll = Math.max(0, Math.min(Math.max(0, lines.length - rows), s.scroll));
  const end = lines.length - s.scroll;
  lines
    .slice(Math.max(0, end - rows), end)
    .forEach((value, i) => v.draw.text(value, x + 9, y + 9 + i * 11, DOS));
  const prefix = 'C:\\PUBLIC>',
    px = x + 9 + v.draw.tw(prefix, 'dos'),
    commandWidth = w - (px - x) - 12;
  v.draw.text(prefix, x + 9, y + h - 15, { ...DOS, color: C.white });
  const chars = Array.from(s.command);
  let left = s.caret;
  while (left > 0 && v.draw.tw(chars.slice(left - 1, s.caret).join(''), 'dos') <= commandWidth - 8)
    left--;
  const display = v.draw.fitText(chars.slice(left).join(''), commandWidth, 'dos');
  v.draw.text(display, px, y + h - 15, { ...DOS, color: C.white });
  if (v.focused && (env.reducedMotion || Math.floor(env.now() * 2) % 2 === 0))
    v.draw.rect(
      px + v.draw.tw(chars.slice(left, s.caret).join(''), 'dos'),
      y + h - 7,
      7,
      2,
      C.yellow,
    );
  ctx.restore();
}

function drawMonitor(
  frame: AppFrame,
  snapshot: RuntimeSnapshot,
  t: number,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const current = snapshot.story;
  const signal = diagnosticSignals(current, snapshot.meter),
    fg = C.white;
  const accent = C.yellow,
    dim = C.aqua;
  frame.draw.l1Panel(x, y, w, h, 'SIGNAL MONITOR');
  const ctx = frame.draw.getCtx();
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 3, y + 3, w - 6, h - 6);
  ctx.clip();
  frame.draw.text('LOCAL SIGNAL', x + 10, y + 9, { ...DOS, color: fg });
  frame.draw.text('4 TASKS / 0 SOCKETS', x + w - 10, y + 9, {
    ...DOS,
    color: accent,
    align: 'right',
  });
  const split = R(w * 0.43),
    nx = x + 10,
    ny = y + 31;
  const node = (cx: number, cy: number, label: string, color: string) => {
    frame.draw.rect(cx - 18, cy - 9, 36, 18, color);
    frame.draw.rect(cx - 17, cy - 8, 34, 16, C.navy);
    frame.draw.text(label, cx, cy - 4, { ...DOS, color, align: 'center' });
  };
  const human = [nx + 25, ny + 17],
    gate = [nx + R((split - 20) / 2), ny + 50],
    agent = [nx + split - 43, ny + 17];
  const bus = (a: number[], b: number[], color: string, speed: number) => {
    frame.draw.line(a[0], a[1], b[0], b[1], color);
    if (speed > 0) {
      const u = (t * speed) % 1;
      frame.draw.rect(R(a[0] + (b[0] - a[0]) * u) - 1, R(a[1] + (b[1] - a[1]) * u) - 1, 3, 3, fg);
    }
  };
  bus(
    human,
    gate,
    current.ending === 'doom' ? C.yellow : dim,
    current.ending === 'doom' ? 0 : 0.35,
  );
  bus(
    agent,
    gate,
    current.ending === 'human' ? C.aqua : accent,
    current.ending === 'human' ? 0 : 0.2 + signal.load / 100,
  );
  node(human[0], human[1], 'HUM', current.ending === 'doom' ? C.yellow : fg);
  node(agent[0], agent[1], 'AGI', current.ending === 'human' ? C.aqua : accent);
  node(gate[0], gate[1], 'GATE', fg);
  frame.draw.text(signal.veto, nx + R((split - 20) / 2), ny + 69, {
    ...DOS,
    color: fg,
    align: 'center',
  });

  // Each frame is a cheap deterministic signal trace; values come from story state.
  const gx = x + split + 8,
    gy = y + 30,
    gw = w - split - 20,
    gh = 53;
  for (let row = 0; row <= 4; row++)
    frame.draw.line(gx, gy + R((row * gh) / 4), gx + gw, gy + R((row * gh) / 4), dim);
  for (let col = 0; col <= 8; col++)
    frame.draw.line(gx + R((col * gw) / 8), gy, gx + R((col * gw) / 8), gy + gh, dim);
  let px = gx,
    py = gy + R(gh / 2);
  for (let offset = 0; offset <= gw; offset += 3) {
    const wave = Math.sin(offset * 0.09 + t * 1.4) * Math.sin(offset * 0.037 - t * 0.5);
    const next = gy + R(gh / 2 + wave * (4 + signal.level * 0.18));
    frame.draw.line(px, py, gx + offset, next, fg);
    px = gx + offset;
    py = next;
  }
  frame.draw.text('P(DOOM) ' + signal.level + '%', gx, gy + gh + 10, { ...DOS, color: fg });
  frame.draw.text('LOAD ' + signal.load + '%', gx, gy + gh + 24, { ...DOS, color: accent });
  frame.draw.text(frame.draw.fitText(signal.agent, gw - 95, 'dos'), gx + gw, gy + gh + 24, {
    ...DOS,
    color: fg,
    align: 'right',
  });

  // The skyline is a model of the city, not a network or hardware measurement.
  const horizon = y + h - 37,
    cityTop = y + 116;
  frame.draw.line(x + 10, horizon, x + w - 10, horizon, accent);
  const step = 12,
    buildings = Math.floor((w - 20) / step);
  for (let i = 0; i < buildings; i++) {
    const height = Math.min(Math.max(4, horizon - cityTop), 8 + ((i * 17 + 9) % 28));
    const bx = x + 10 + i * step,
      by = horizon - height;
    frame.draw.rect(bx, by, step - 3, height, dim);
    frame.draw.line(bx, by, bx + step - 4, by, accent);
    for (let row = 1; row * 6 < height - 2; row++) {
      const lit =
        current.ending !== 'doom' &&
        (i + row + Math.floor(t * 0.35)) % (current.ending === 'human' ? 3 : 4) !== 0;
      if (lit) frame.draw.rect(bx + 3, by + row * 6, 2, 2, fg);
    }
  }
  frame.draw.text(
    frame.draw.fitText(signal.signal.toUpperCase(), w - 20, 'dos'),
    x + 10,
    y + h - 26,
    {
      ...DOS,
      color: fg,
    },
  );
  frame.draw.text(`EVENTS ${current.logs.length}   BUS ${signal.agent}`, x + 10, y + h - 11, {
    ...DOS,
    color: accent,
  });
  ctx.restore();
}

export const diagnosticsApp = defineCanvasApp<State>({
  ...appMetadata('diagnostics'),

  create: () => ({
    tab: 0,
    output: ['MHK10 DOS 6.22', 'DIAGNOSTIC TERMINAL READY', ''],
    command: '',
    caret: 0,
    history: [],
    historyAt: 0,
    scroll: 0,
  }),
  draw(s, v, env) {
    const c = v.client;
    const focused = v.focused && v.win.menu.open < 0;
    v.draw.rect(c.x, c.y, c.w, c.h, C.navy);
    if (commandKey(v, 'F2 CONSOLE', 'F2', c.x + 5, c.y + 10, focused)) s.tab = 0;
    if (commandKey(v, 'F3 MONITOR', 'F3', c.x + 115, c.y + 10, focused)) s.tab = 1;
    if (commandKey(v, 'F4 TASKS', 'F4', c.x + 225, c.y + 10, focused)) {
      s.tab = 0;
      s.output.push(
        'C:\\PUBLIC>TASKS',
        ...runDiagnostic('tasks', env.snapshot().story, [], env.snapshot().meter).lines,
        '',
      );
      s.output = s.output.slice(-180);
      s.scroll = 0;
    }
    const x = c.x + 8,
      y = c.y + 32,
      w = c.w - 16,
      h = c.h - 61;
    if (s.tab === 0) drawConsole(s, v, env, x, y, w, h);
    else drawMonitor(v, env.snapshot(), motionTime(env.now(), env.reducedMotion), x, y, w, h);
    if (commandKey(v, 'F5 RECOVERY', 'F5', c.x + 5, c.y + c.h - 14, focused)) env.open('recovery');
    if (commandKey(v, 'F6 CLEAR', 'F6', c.x + 133, c.y + c.h - 14, focused)) {
      s.output = [];
      s.scroll = 0;
    }
    v.draw.text(s.tab ? 'MONITOR ACTIVE' : 'READY', c.x + c.w - 9, c.y + c.h - 14, {
      ...DOS,
      color: C.aqua,
      align: 'right',
    });
  },
});
