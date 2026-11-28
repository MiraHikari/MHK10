import { describe, expect, it } from 'vite-plus/test';
import { popupLayout, windowClient } from './layout';

describe('shared window geometry', () => {
  it('clamps popups and derives matching row hit regions', () => {
    const layout = popupLayout(
      639,
      359,
      ['Open', '-', '~Unavailable'],
      (value) => value.length * 6,
    );
    expect(layout.x + layout.w).toBe(640);
    expect(layout.y + layout.h).toBe(360);
    expect(layout.rows[1]).toMatchObject({ h: 8, separator: true });
    expect(layout.rows.at(-1)!.y + 18).toBe(layout.y + layout.h - 3);
  });
  it('uses the same client in a standalone app and a managed window', () => {
    expect(windowClient({ x: 0, y: 0, w: 340, h: 250 }, true, true)).toEqual({
      x: 3,
      y: 40,
      w: 334,
      h: 188,
    });
    expect(windowClient({ x: -3, y: -40, w: 340, h: 250 }, true, true)).toEqual({
      x: 0,
      y: 0,
      w: 334,
      h: 188,
    });
  });
});
