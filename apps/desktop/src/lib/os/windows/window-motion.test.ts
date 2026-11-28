import { describe, expect, it } from 'vite-plus/test';
import {
  createWindowMotion,
  interpolateWindowBounds,
  motionBounds,
  titleBounds,
} from './window-motion';

describe('window outline geometry', () => {
  it('starts and finishes at the exact supplied rectangles', () => {
    const icon = { x: 24, y: 130, w: 32, h: 32 };
    const window = { x: 92, y: 16, w: 540, h: 310 };
    expect(interpolateWindowBounds(icon, window, 0)).toEqual(icon);
    expect(interpolateWindowBounds(icon, window, 1)).toEqual(window);
    expect(interpolateWindowBounds(icon, window, 0.5)).toEqual({ x: 58, y: 73, w: 286, h: 171 });
  });

  it('interpolates both axes toward a specific task button and remains on the pixel grid', () => {
    const window = { x: 310, y: 26, w: 290, h: 218 };
    const task = { x: 74, y: 340, w: 110, h: 18 };
    for (let frame = 0; frame <= 12; frame++) {
      const rect = interpolateWindowBounds(window, task, frame / 12);
      expect(Object.values(rect).every(Number.isInteger)).toBe(true);
      expect(rect.x).toBeGreaterThanOrEqual(task.x);
      expect(rect.x).toBeLessThanOrEqual(window.x);
      expect(rect.y).toBeGreaterThanOrEqual(window.y);
      expect(rect.y).toBeLessThanOrEqual(task.y);
    }
    expect(interpolateWindowBounds(window, task, 2)).toEqual(task);
    expect(interpolateWindowBounds(window, task, -1)).toEqual(window);
  });

  it('copies source geometry and uses caption bounds instead of a floating centre fallback', () => {
    const source = { x: 20, y: 30, w: 32, h: 32 };
    const destination = { x: 150, y: 100, w: 400, h: 220 };
    const motion = createWindowMotion('open', source, destination);
    source.x = 999;
    destination.y = 999;
    expect(motionBounds(motion)).toEqual({ x: 20, y: 30, w: 32, h: 32 });
    expect(titleBounds(motion.to)).toEqual({ x: 153, y: 103, w: 394, h: 18 });
  });

  it('rounds fractional inputs once and tolerates a cancelled clock tick', () => {
    const source = { x: 2.4, y: 3.7, w: 0, h: 0 };
    const destination = { x: 90, y: 40, w: 320, h: 200 };
    expect(interpolateWindowBounds(source, destination, Number.NaN)).toEqual({
      x: 2,
      y: 4,
      w: 1,
      h: 1,
    });
  });
});
