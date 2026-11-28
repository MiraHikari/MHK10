// Unit tests for the P(doom) meter — pure logic, no DOM required.

import { describe, it, expect } from 'vite-plus/test';
import {
  createDoom,
  doomUp,
  doomDown,
  pdoomText,
  pdoomColor,
  doomMood,
  UP_STEP,
  PD_STEPS,
  type DoomState,
} from './doom';

describe('createDoom', () => {
  it('starts at 5 (PD_STEPS[0]) with nothing fired', () => {
    const d = createDoom();
    expect(d.v).toBe(PD_STEPS[0]);
    expect(d.v).toBe(5);
    expect(d.fired.size).toBe(0);
  });
});

describe('doomUp', () => {
  it('reaches exactly 99.9 after N = ceil((99.9-5)/UP_STEP) clicks and is clamped there', () => {
    const d = createDoom();
    const N = Math.ceil((99.9 - 5) / UP_STEP);
    expect(N).toBeGreaterThan(0);
    for (let k = 1; k <= N; k++) {
      doomUp(d);
      expect(d.v).toBeLessThanOrEqual(99.9);
      // before the final click the value is still unclamped arithmetic
      if (k < N) expect(d.v).toBeCloseTo(5 + k * UP_STEP, 10);
    }
    expect(d.v).toBe(99.9);
  });

  it('never exceeds 99.9 no matter how many extra clicks', () => {
    const d = createDoom();
    for (let k = 0; k < 40; k++) {
      doomUp(d);
      expect(d.v).toBeLessThanOrEqual(99.9);
    }
    expect(d.v).toBe(99.9);
  });
});

describe('doomDown', () => {
  it('decreases by UP_STEP while v < 34 and never goes below 5', () => {
    const d = createDoom();
    doomUp(d);
    doomUp(d); // 5 + 2*5.5 = 16
    expect(d.v).toBe(16);
    expect(doomDown(d)).toBe(true);
    expect(d.v).toBeCloseTo(16 - UP_STEP, 10);
    expect(doomDown(d)).toBe(true);
    expect(d.v).toBe(5); // walked back to the floor
    expect(doomDown(d)).toBe(true); // still succeeds at the floor...
    expect(d.v).toBe(5); // ...but the value never drops below 5
  });

  it('returns false and leaves the value unchanged once v >= 34 (managed by AGI.EXE)', () => {
    // exact boundary, built as a plain DoomState
    const atBoundary: DoomState = { v: PD_STEPS[1], fired: new Set() };
    expect(atBoundary.v).toBe(34);
    expect(doomDown(atBoundary)).toBe(false);
    expect(atBoundary.v).toBe(34);

    // and on a real state climbed past the first threshold (6 clicks -> 38)
    const d = createDoom();
    doomUp(d, 6);
    expect(d.v).toBeGreaterThanOrEqual(34);
    const before = d.v;
    expect(doomDown(d)).toBe(false);
    expect(d.v).toBe(before);
  });
});

describe('pdoomText', () => {
  it('renders integers without decimals', () => {
    expect(pdoomText(5)).toBe('5%');
    expect(pdoomText(34)).toBe('34%');
    expect(pdoomText(61)).toBe('61%');
    expect(pdoomText(86)).toBe('86%');
    expect(pdoomText(99)).toBe('99%');
  });

  it('renders one decimal above 99', () => {
    expect(pdoomText(99.5)).toBe('99.5%');
    expect(pdoomText(99.9)).toBe('99.9%');
  });
});

describe('pdoomColor', () => {
  it('is navy below 50, maroon 50..79, red >= 80', () => {
    expect(pdoomColor(5)).toBe('#000080');
    expect(pdoomColor(34)).toBe('#000080');
    expect(pdoomColor(49.9)).toBe('#000080');
    expect(pdoomColor(50)).toBe('#800000');
    expect(pdoomColor(61)).toBe('#800000');
    expect(pdoomColor(79.9)).toBe('#800000');
    expect(pdoomColor(80)).toBe('#ff0000');
    expect(pdoomColor(86)).toBe('#ff0000');
    expect(pdoomColor(99.9)).toBe('#ff0000');
  });
});

describe('doomMood', () => {
  // exact boundaries read from the source:
  // evil at PD_STEPS[3] = 86 (with epsilon), sparks at PD_STEPS[1] = 34, happy below.
  it("is 'happy' below 34, 'sparks' from 34, 'evil' from 86", () => {
    expect(doomMood(5)).toBe('happy');
    expect(doomMood(33.999)).toBe('happy');
    expect(doomMood(34)).toBe('sparks');
    expect(doomMood(61)).toBe('sparks');
    expect(doomMood(85.999)).toBe('sparks');
    expect(doomMood(86)).toBe('evil');
    expect(doomMood(99.9)).toBe('evil');
  });
});
