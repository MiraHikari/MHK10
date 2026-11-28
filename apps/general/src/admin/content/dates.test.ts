import { describe, expect, it } from 'vite-plus/test';
import { formatClock, formatToday, toLocalIsoString } from './dates';

describe('formatToday', () => {
  it('returns the local calendar day instead of the UTC day', () => {
    // 00:30 local on Nov 28 is still Nov 27 in UTC for UTC+8 — the bug this
    // helper exists to avoid.
    const local = new Date(2026, 10, 28, 0, 30, 0);
    expect(formatToday(local)).toBe('2026-11-28');
  });

  it('pads single-digit months and days', () => {
    expect(formatToday(new Date(2026, 0, 5, 12, 0, 0))).toBe('2026-01-05');
  });
});

describe('formatClock', () => {
  it('pads hours and minutes', () => {
    expect(formatClock(new Date(2026, 0, 5, 9, 4, 0))).toBe('09:04');
  });
});

describe('toLocalIsoString', () => {
  it('keeps the wall-clock time and stamps the real offset', () => {
    const date = new Date(2026, 10, 28, 10, 30, 5);
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const hh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
    const mm = String(Math.abs(offset) % 60).padStart(2, '0');
    expect(toLocalIsoString(date)).toBe(`2026-11-28T10:30:05${sign}${hh}:${mm}`);
  });

  it('round-trips through Date.parse to the same instant', () => {
    const date = new Date(2026, 10, 28, 23, 59, 59);
    expect(new Date(toLocalIsoString(date)).getTime()).toBe(date.getTime());
  });
});
