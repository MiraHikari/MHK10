import { C } from '../../gfx/palette';
import type { AppFrame } from '../../os/host/app-contracts';
import { MACHINE_TAPE } from './machine-tape.generated';
import type { MachineTape } from './machine-tape';

export function tapeStatus(tape: MachineTape): string {
  const { side, phase, muted } = tape.snapshot();
  const state = {
    ready: 'Ready',
    starting: 'Loading audio',
    playing: 'Playing',
    paused: 'Paused',
    finished: 'Finished',
    unavailable: 'Audio unavailable',
  }[phase];
  return `Tape ${side} | ${state}${muted ? ' | Muted' : ''}`;
}

export function drawMachineTape(
  tape: MachineTape,
  view: AppFrame,
  reducedMotion: boolean,
  leave: () => void,
): void {
  const { x, y, w, h } = view.client;
  const { draw, input, widgets } = view;
  const keyboard = view.focused && view.win.menu.open < 0 && !view.menuSel;
  if (
    widgets.button(x + w - 112, y + 4, 100, 23, 'My Recordings') ||
    (keyboard && input.consumeKey('Escape'))
  ) {
    leave();
    return;
  }

  const { side, phase, position, duration } = tape.snapshot();
  const playing = phase === 'playing' || phase === 'starting';
  draw.text('Two Sounds of a Machine', x + 12, y + 9, { font: 'bold', color: draw.TH.text });
  draw.rect(x + 12, y + 27, 24, 14, draw.TH.title);
  draw.text('01', x + 16, y + 30, { font: 'dos', color: draw.TH.titleText });
  draw.text('IBM M2 / Anonimski · CC0', x + 42, y + 30, { color: draw.TH.text });
  draw.text('SAME STRIKES', x + w - 14, y + 30, {
    font: 'dos',
    color: draw.TH.text,
    align: 'right',
  });

  const fieldY = y + 45;
  const traceX = x + 110;
  const traceWidth = w - 127;
  widgets.field(x + 11, fieldY, w - 22, 72, C.black);
  draw.rect(x + 104, fieldY + 3, 1, 66, C.gray);
  draw.rect(x + 14, fieldY + 35, w - 28, 1, C.gray);
  for (let second = 0; second <= Math.floor(duration); second++) {
    const tickX = traceX + Math.round((second / duration) * (traceWidth - 1));
    draw.rect(tickX, fieldY + 3, 1, 4, C.gray);
    draw.rect(tickX, fieldY + 65, 1, 4, C.gray);
  }
  const sides = [
    ['A', 'RECORDING', 'Key strikes'],
    ['B', 'PC SPEAKER', 'Square waves'],
  ] as const;
  sides.forEach(([key, title, caption], row) => {
    const rowY = fieldY + 6 + row * 35;
    const center = rowY + 11;
    const selected = side === key;
    const color = selected ? C.lime : C.silver;
    if (selected) draw.rect(x + 15, rowY, 2, 25, C.lime);
    draw.text(`${key}  ${title}`, x + 21, rowY, { font: 'bold', color });
    draw.text(caption, x + 21, rowY + 14, { color });
    draw.rect(traceX, center, traceWidth, 1, C.green);
    const waveform = MACHINE_TAPE.waveform[key];
    waveform.forEach(([low, high], index) => {
      const sampleX = traceX + Math.floor((index * traceWidth) / waveform.length);
      const width = Math.max(1, Math.floor(traceWidth / waveform.length));
      const upper = Math.round((high * 16) / 63);
      const lower = Math.round((low * 16) / 63);
      if (upper !== lower) draw.rect(sampleX, center - upper, width, upper - lower + 1, color);
    });
  });
  const head = reducedMotion && playing ? Math.floor(position * 4) / 4 : position;
  const headX = traceX + Math.round((head / duration) * (traceWidth - 1));
  draw.rect(headX, fieldY + 7, 1, 58, C.white);
  draw.rect(headX - 2, fieldY + 4, 5, 2, C.white);

  const buttonY = y + h - 72;
  if (
    widgets.button(x + 12, buttonY, 113, 23, 'A  Recording', { pressed: side === 'A' }) ||
    (keyboard && (input.consumeKey('a') || input.consumeKey('A')))
  )
    tape.select('A');
  if (
    widgets.button(x + 130, buttonY, 113, 23, 'B  PC Speaker', { pressed: side === 'B' }) ||
    (keyboard && (input.consumeKey('b') || input.consumeKey('B')))
  )
    tape.select('B');
  draw.text(`${position.toFixed(2)} / ${duration.toFixed(2)} s`, x + w - 14, buttonY + 8, {
    font: 'dos',
    color: draw.TH.text,
    align: 'right',
  });
  if (
    widgets.button(x + 12, buttonY + 27, 78, 24, playing ? 'Pause' : 'Play', { def: true }) ||
    (keyboard && (input.consumeKey('Enter') || input.consumeKey(' ')))
  )
    tape.toggle();
  if (
    widgets.button(x + 96, buttonY + 27, 66, 24, 'Stop', { disabled: phase === 'ready' }) ||
    (keyboard && (input.consumeKey('s') || input.consumeKey('S')))
  )
    tape.stop();
  if (
    widgets.button(x + 168, buttonY + 27, 74, 24, 'Replay') ||
    (keyboard && (input.consumeKey('r') || input.consumeKey('R')))
  )
    tape.replay();
  draw.text('A / B: side   Enter: play/pause   S: stop   R: replay', x + 12, y + h - 15, {
    color: draw.TH.text,
  });
}
