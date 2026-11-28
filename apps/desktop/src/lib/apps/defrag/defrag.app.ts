import { textCommand } from '../../ui/canvas/text-mode';
import { appMetadata } from '../../../data/app-catalog';
import { C } from '../../gfx/palette';

import { defineCanvasApp } from '../../os/host/app-session';

import {
  createDisk,
  DISK_BLOCKS,
  startDisk,
  stepDisk,
  stopDisk,
  TRAINING_FRAGMENTS,
  type DiskState,
} from './defrag-model';

interface State {
  disk: DiskState;
  notice: string;
  recovered: number;
}
export const defragApp = defineCanvasApp<State>({
  ...appMetadata('defrag'),
  // 只在整理中（v.dt 推进）或高风险扰动动画时持续帧。
  needsFrame: (s, env) => s.disk.running || (!env.reducedMotion && env.snapshot().meter >= 61),
  create: () => ({ disk: createDisk(), notice: 'DRIVE C: READY', recovered: 0 }),
  status: (s) =>
    `${s.disk.mode.toUpperCase()} ${Math.floor((s.disk.cursor / DISK_BLOCKS) * 100)}% | ${s.disk.fragments.length} FRAGMENTS`,
  draw(s, v, env) {
    const c = v.client;
    s.disk = stepDisk(s.disk, v.dt, env.snapshot().meter, env.reducedMotion);
    v.draw.rect(c.x, c.y, c.w, c.h, C.navy);
    v.draw.l1Panel(c.x + 7, c.y + 10, c.w - 18, c.h - 22, 'DISK UTILITIES');
    const x = c.x + 19;
    const y = c.y + 25;
    const keyboard = v.focused;
    if (
      textCommand(v, 'F2 DEFRAG', undefined, x, y + 4, false, s.disk.running) ||
      (!s.disk.running && keyboard && v.input.io.keyPressed.has('F2'))
    ) {
      s.disk = startDisk(s.disk, 'defrag');
      s.notice = 'MOVING ALLOCATED BLOCKS';
      env.play('click');
    }
    if (
      textCommand(v, 'F3 SCANDISK', undefined, x + 100, y + 4, false, s.disk.running) ||
      (!s.disk.running && keyboard && v.input.io.keyPressed.has('F3'))
    ) {
      s.disk = startDisk(s.disk, 'scan');
      s.notice = 'CHECKING ALLOCATION TABLE';
      env.play('click');
    }
    if (
      textCommand(v, 'ESC STOP', undefined, x + 220, y + 4, false, !s.disk.running) ||
      (keyboard && v.input.io.keyPressed.has('Escape'))
    ) {
      s.disk = stopDisk(s.disk);
      s.notice = 'OPERATION STOPPED';
    }
    const gridY = y + 27;
    const cellW = Math.floor((c.w - 40) / 20);
    s.disk.blocks.forEach((block, i) => {
      const allocated = block < 120;
      const complete = s.disk.mode === 'scan' ? i < s.disk.cursor : block === i;
      const color =
        i === s.disk.cursor && s.disk.running
          ? C.yellow
          : !allocated
            ? C.navy
            : complete
              ? C.aqua
              : C.white;
      v.draw.rect(x + (i % 20) * cellW, gridY + Math.floor(i / 20) * 10, cellW - 3, 7, color);
      if (!allocated)
        v.draw.rect(
          x + (i % 20) * cellW,
          gridY + Math.floor(i / 20) * 10 + 6,
          cellW - 3,
          1,
          C.aqua,
        );
    });
    const progressY = gridY + 90;
    const percent = Math.floor((s.disk.cursor / DISK_BLOCKS) * 100);
    v.draw.text(
      `${s.disk.mode === 'scan' ? 'VERIFIED' : 'PROCESSED'} ${String(percent).padStart(3)}%`,
      x,
      progressY,
      { font: 'dos', color: C.white },
    );
    v.draw.text(`${s.disk.fragments.length} FRAGMENTS FOUND`, x + 200, progressY, {
      font: 'dos',
      color: C.yellow,
    });
    const notice = s.disk.disturbances
      ? 'WARNING: ALLOCATION CHANGED WITHOUT REQUEST'
      : s.disk.cursor === DISK_BLOCKS && !s.disk.running
        ? 'CHECK COMPLETE. NO LOST CLUSTERS.'
        : s.notice;
    v.draw.text(notice, x, progressY + 20, { font: 'dos', color: C.aqua });
    if (
      textCommand(
        v,
        'RECOVER FRAGMENTS',
        undefined,
        x,
        c.y + c.h - 39,
        false,
        !s.disk.fragments.length,
      )
    ) {
      let durable = true;
      for (const index of s.disk.fragments) {
        const fragment = TRAINING_FRAGMENTS[index];
        const result = env.files.saveGeneratedText(
          `defrag:${fragment.name}`,
          fragment.name,
          fragment.body,
          'story',
        );
        durable &&= result.ok && result.persisted;
      }
      s.recovered = s.disk.fragments.length;
      s.notice = durable ? 'FRAGMENTS SAVED TO EVIDENCE' : 'WRITE INCOMPLETE. EXPORT FRAGMENTS.';
      env.story.dispatch('investigate');
      env.play(durable ? 'click' : 'error');
    }
    if (
      textCommand(v, 'EXPORT', undefined, x + 176, c.y + c.h - 39, false, !s.disk.fragments.length)
    ) {
      env.downloadText(
        'TRAINING-FRAGMENTS.TXT',
        s.disk.fragments
          .map((i) => `${TRAINING_FRAGMENTS[i].name}\n${TRAINING_FRAGMENTS[i].body}`)
          .join('\n\n'),
      );
      s.notice = 'FRAGMENTS EXPORTED';
    }
    if (textCommand(v, 'ARCHIVE', undefined, x + 266, c.y + c.h - 39, false)) env.open('training');
    if (s.recovered) v.draw.text(s.notice, x, c.y + c.h - 61, { font: 'dos', color: C.yellow });
  },
});
