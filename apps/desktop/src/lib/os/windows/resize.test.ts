import { describe, expect, it } from 'vite-plus/test';
import { resizeBounds, resizeCursor, resizeEdgeAt } from './resize';

const bounds = { x: 30, y: 40, w: 200, h: 160 };

describe('Win95 resize geometry', () => {
  it('uses only the frame, with all eight edge directions', () => {
    for (const [x, y, edge] of [
      [30, 40, 'nw'],
      [229, 40, 'ne'],
      [30, 199, 'sw'],
      [229, 199, 'se'],
      [100, 40, 'n'],
      [100, 199, 's'],
      [30, 100, 'w'],
      [229, 100, 'e'],
    ] as const) {
      expect(resizeEdgeAt(bounds, x, y)).toBe(edge);
    }
    expect(resizeEdgeAt(bounds, 34, 44)).toBe(null);
    expect(resizeEdgeAt(bounds, 29, 40)).toBe(null);
    expect(resizeCursor('sw')).toBe('size-nesw');
  });

  it('keeps opposite edges anchored when minimum dimensions are reached', () => {
    expect(resizeBounds(bounds, 'nw', 500, 500, 120, 80, 640, 338)).toEqual({
      x: 110,
      y: 120,
      w: 120,
      h: 80,
    });
    expect(resizeBounds(bounds, 'se', -500, -500, 120, 80, 640, 338)).toEqual({
      ...bounds,
      w: 120,
      h: 80,
    });
  });

  it('stops at desktop limits and rounds fractional pointer movement', () => {
    expect(resizeBounds(bounds, 'se', 999, 999, 120, 80, 640, 338)).toEqual({
      ...bounds,
      w: 610,
      h: 298,
    });
    expect(resizeBounds(bounds, 'nw', -999, -999, 120, 80, 640, 338)).toEqual({
      x: 0,
      y: 0,
      w: 230,
      h: 200,
    });
    expect(resizeBounds(bounds, 'e', 10.3, 0, 120, 80, 640, 338).w).toBe(210);
  });
});
