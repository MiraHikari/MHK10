import { describe, expect, it } from 'vite-plus/test';
import { DEFAULT_KOUNTER_URL, resolveKounterServerUrl } from './kounter-model';

it('uses the shared counter default for blank configuration', () => {
  expect(resolveKounterServerUrl('  ')).toBe(DEFAULT_KOUNTER_URL);
  expect(resolveKounterServerUrl(' https://local.example/// ')).toBe('https://local.example');
});
import {
  FLAG_WINDOW_MS,
  SITE_PV_TARGET,
  SITE_UV_TARGET,
  formatCount,
  isLocalhost,
  markCounted,
  parseCounterResponse,
  parseFlags,
  planVisit,
  shouldCount,
} from './kounter-model';

const NOW = 1_750_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe('kounter constants', () => {
  it('uses the OpenKounter site targets and a 24h window', () => {
    expect(SITE_PV_TARGET).toBe('site-pv');
    expect(SITE_UV_TARGET).toBe('site-uv');
    expect(FLAG_WINDOW_MS).toBe(DAY);
  });
});

describe('isLocalhost', () => {
  it('recognises local development hosts only', () => {
    expect(isLocalhost('localhost')).toBe(true);
    expect(isLocalhost('127.0.0.1')).toBe(true);
    expect(isLocalhost('[::1]')).toBe(true);
    expect(isLocalhost('www.example.com')).toBe(false);
    expect(isLocalhost('192.168.1.5')).toBe(false);
  });
});

describe('formatCount', () => {
  it('formats thousands with commas', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(12345)).toBe('12,345');
    expect(formatCount(1234567)).toBe('1,234,567');
  });
});

describe('parseCounterResponse', () => {
  it('accepts a successful counter payload', () => {
    expect(parseCounterResponse({ code: 0, data: { time: 42, target: 'site-pv' } })).toEqual({
      ok: true,
      count: 42,
    });
    expect(parseCounterResponse({ code: 0, data: { time: 0 } })).toEqual({ ok: true, count: 0 });
  });

  it('rejects non-zero codes and malformed bodies', () => {
    for (const value of [
      null,
      undefined,
      'oops',
      [],
      {},
      { code: 1, data: { time: 42 } },
      { code: '0', data: { time: 42 } },
      { code: 0 },
      { code: 0, data: null },
      { code: 0, data: [] },
      { code: 0, data: { time: '42' } },
      { code: 0, data: { time: Number.POSITIVE_INFINITY } },
      { code: 0, data: { time: -1 } },
      { code: 0, data: { time: 1.5 } },
    ]) {
      expect(parseCounterResponse(value)).toEqual({ ok: false });
    }
  });
});

describe('parseFlags', () => {
  it('keeps numeric timestamps and drops everything else', () => {
    expect(parseFlags({ 'site-uv': NOW, '/blog/a': 5 })).toEqual({
      'site-uv': NOW,
      '/blog/a': 5,
    });
    expect(
      parseFlags({ 'site-uv': NOW, broken: 'yesterday', missing: null, infinite: Infinity }),
    ).toEqual({ 'site-uv': NOW });
    expect(parseFlags(null)).toEqual({});
    expect(parseFlags('{oops')).toEqual({});
    expect(parseFlags([NOW])).toEqual({});
  });

  it('returns a fresh plain record', () => {
    const input = { 'site-uv': NOW };
    const parsed = parseFlags(input);
    expect(parsed).toEqual(input);
    expect(parsed).not.toBe(input);
  });
});

describe('24h deduplication', () => {
  it('counts when there is no valid flag', () => {
    expect(shouldCount({}, 'site-uv', NOW)).toBe(true);
  });

  it('uses an inclusive 24h boundary', () => {
    expect(shouldCount({ 'site-uv': NOW - DAY + 1 }, 'site-uv', NOW)).toBe(false);
    expect(shouldCount({ 'site-uv': NOW - DAY }, 'site-uv', NOW)).toBe(true);
    expect(shouldCount({ 'site-uv': NOW }, 'site-uv', NOW + DAY - 1)).toBe(false);
    expect(shouldCount({ 'site-uv': NOW }, 'site-uv', NOW + DAY)).toBe(true);
  });

  it('does not count while a future timestamp keeps the window closed', () => {
    expect(shouldCount({ 'site-uv': NOW + 1000 }, 'site-uv', NOW)).toBe(false);
  });

  it('keeps targets independent', () => {
    const flags = { '/blog/a': NOW };
    expect(shouldCount(flags, '/blog/a', NOW)).toBe(false);
    expect(shouldCount(flags, '/blog/b', NOW)).toBe(true);
  });

  it('marks a target without mutating the input record', () => {
    const flags = { '/blog/a': 1 };
    const next = markCounted(flags, 'site-uv', NOW);
    expect(next).toEqual({ '/blog/a': 1, 'site-uv': NOW });
    expect(next).not.toBe(flags);
    expect(flags).toEqual({ '/blog/a': 1 });
  });
});

describe('planVisit', () => {
  it('increments PV and UV on a first writable visit', () => {
    const flags = { '/blog/a': 5 };
    const plan = planVisit('www.example.com', flags, NOW);
    expect(plan).toEqual({
      writable: true,
      incUv: true,
      targets: [SITE_PV_TARGET, SITE_UV_TARGET],
      flags: { '/blog/a': 5, 'site-uv': NOW },
    });
    expect(flags).toEqual({ '/blog/a': 5 });
  });

  it('increments only PV while UV is inside the 24h window', () => {
    const flags = { 'site-uv': NOW - 1000 };
    const plan = planVisit('www.example.com', flags, NOW);
    expect(plan).toEqual({
      writable: true,
      incUv: false,
      targets: [SITE_PV_TARGET],
      flags,
    });
  });

  it('increments UV again exactly at the 24h boundary', () => {
    const plan = planVisit('www.example.com', { 'site-uv': NOW - DAY }, NOW);
    expect(plan.incUv).toBe(true);
    expect(plan.targets).toEqual([SITE_PV_TARGET, SITE_UV_TARGET]);
    expect(plan.flags).toEqual({ 'site-uv': NOW });
  });

  it('stays read-only on local hosts', () => {
    for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
      const flags = { '/blog/a': 5 };
      const plan = planVisit(hostname, flags, NOW);
      expect(plan).toEqual({ writable: false, incUv: false, targets: [], flags });
    }
  });
});
