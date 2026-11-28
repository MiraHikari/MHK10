import { describe, expect, it } from 'vite-plus/test';
import { bounce, createSaverIdle, saverPoints, starPoint } from './saver-model';
import { createTooltipDelay } from './timing';

describe('whole-pixel idle motion', () => {
  it('reflects at the viewport boundary without fractional positions', () => {
    expect(bounce(0, 10, 12, 100)).toBe(80);
    for (const t of [0, 0.016, 50, 5000]) {
      for (const p of saverPoints(t, 64, 640, 360)) {
        expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThan(640);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThan(360);
      }
      expect(Number.isInteger(starPoint(2, t, 640, 360).size)).toBe(true);
    }
  });
  it('leaves reduced-motion scenery stable', () => {
    expect(saverPoints(1, 4, 640, 360, true)).toEqual(saverPoints(999, 4, 640, 360, true));
  });
  it('consumes the wake input, restarts inactivity and suspends idle behind dialogs', () => {
    const idle = createSaverIdle();
    expect(idle.frame(59, false, 60).active).toBe(false);
    expect(idle.frame(60, false, 60)).toMatchObject({ active: true, elapsed: 0 });
    expect(idle.frame(61, true, 60)).toMatchObject({ active: false, consumed: true });
    expect(idle.frame(119, false, 60).active).toBe(false);
    expect(idle.frame(120, false, 60, false).active).toBe(false);
    expect(idle.frame(121, false, 60).active).toBe(false);
    idle.preview(122);
    expect(idle.frame(123, false, 60).active).toBe(true);
  });
  it('delays tooltips and restarts when changing targets', () => {
    const tooltip = createTooltipDelay();
    expect(tooltip.visible('sound', 0)).toBe(false);
    expect(tooltip.visible('sound', 0.49)).toBe(false);
    expect(tooltip.visible('sound', 0.5)).toBe(true);
    expect(tooltip.visible('task', 0.6)).toBe(false);
    expect(tooltip.visible(null, 1.6)).toBe(false);
  });
});
