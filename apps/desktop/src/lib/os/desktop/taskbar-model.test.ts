import { describe, expect, it } from 'vite-plus/test';
import { revealTask, taskbarLayout } from './taskbar-model';
const options = {
  quickLaunch: true,
  labels: true,
  clockWidth: 48,
  risk: false,
  contexts: 0,
  offset: 0,
};

describe('taskbar layout and window anchors', () => {
  it('keeps readable buttons and distinct overflow controls at high window counts', () => {
    const layout = taskbarLayout(40, options);
    expect(layout.tasks.every((task) => task.bounds.w >= 76)).toBe(true);
    expect(layout.previous).not.toBeNull();
    expect(layout.next).not.toBeNull();
    expect(layout.tasks.at(-1)!.bounds.x + layout.tasks.at(-1)!.bounds.w).toBeLessThan(
      layout.next!.x,
    );
    expect(layout.anchor(39)).toEqual(layout.next);
    expect(layout.anchor(0)).toEqual(layout.tasks[0].bounds);
  });
  it('reclamps after closing windows and represents both sides of a scrolled strip', () => {
    const middle = taskbarLayout(40, { ...options, offset: 10 });
    expect(middle.anchor(0)).toEqual(middle.previous);
    expect(middle.anchor(39)).toEqual(middle.next);
    expect(taskbarLayout(2, { ...options, offset: 10 }).offset).toBe(0);
  });
  it('gives quick launch, risk, clock and status icons non-overlapping integer bounds', () => {
    for (const quickLaunch of [true, false])
      for (const labels of [true, false]) {
        const layout = taskbarLayout(20, {
          ...options,
          quickLaunch,
          labels,
          risk: true,
          contexts: 2,
          clockWidth: 72,
        });
        const rects = [
          layout.start,
          ...layout.quick,
          ...layout.tasks.map((task) => task.bounds),
          layout.volume,
          layout.clock,
          ...layout.contexts,
          layout.risk!,
        ].sort((a, b) => a.x - b.x);
        rects.forEach((rect, index) => {
          expect(Object.values(rect).every(Number.isInteger)).toBe(true);
          if (index) expect(rect.x).toBeGreaterThanOrEqual(rects[index - 1].x + rects[index - 1].w);
        });
      }
  });
  it('keeps keyboard-focused tasks visible without undoing manual scrolling', () => {
    expect(revealTask(9, 0, 5)).toBe(5);
    expect(revealTask(1, 5, 5)).toBe(1);
    expect(revealTask(7, 5, 5)).toBe(5);
    expect(revealTask(-1, 5, 5)).toBe(5);
  });
});
