import { describe, expect, it } from 'vite-plus/test';
import {
  createFrameWindowSampler,
  createPerfTracker,
  parsePerfOverride,
  resolveEffectivePerfTier,
  resolveMotionBudget,
  tierFromRank,
  tierRank,
  type DevicePerfTier,
  type FrameWindowStats,
} from './device-performance';

/* ------------------------------------------------------------------ */
/*  tierRank / tierFromRank — 档位序                                   */
/* ------------------------------------------------------------------ */

describe('tier ordering', () => {
  it('ranks low < medium < high and round-trips', () => {
    expect(tierRank('low')).toBeLessThan(tierRank('medium'));
    expect(tierRank('medium')).toBeLessThan(tierRank('high'));
    expect(tierFromRank(tierRank('low'))).toBe('low');
    expect(tierFromRank(tierRank('medium'))).toBe('medium');
    expect(tierFromRank(tierRank('high'))).toBe('high');
  });

  it('clamps out-of-range ranks', () => {
    expect(tierFromRank(-5)).toBe('low');
    expect(tierFromRank(99)).toBe('high');
  });
});

/* ------------------------------------------------------------------ */
/*  resolveMotionBudget — 预算表不变量                                 */
/* ------------------------------------------------------------------ */

const PERF_TIERS: readonly DevicePerfTier[] = ['high', 'medium', 'low'];

describe('resolveMotionBudget', () => {
  it('never raises any knob as the perf tier drops, within an intent tier', () => {
    for (const motionLevel of ['full', 'mobile', 'reduced'] as const) {
      for (const key of [
        'resolutionScale',
        'dprCap',
        'frameRate',
        'veilSpeedFactor',
        'transitionBlur',
        'smoothScroll',
        'scrollBreath',
      ] as const) {
        const values = PERF_TIERS.map((tier) =>
          Number(resolveMotionBudget(motionLevel, tier)[key]),
        );
        for (let i = 1; i < values.length; i += 1) {
          expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
        }
      }
    }
  });

  it('keeps every budget value non-negative', () => {
    for (const motionLevel of ['full', 'mobile', 'reduced'] as const) {
      for (const tier of PERF_TIERS) {
        const budget = resolveMotionBudget(motionLevel, tier);
        expect(budget.resolutionScale).toBeGreaterThan(0);
        expect(budget.dprCap).toBeGreaterThan(0);
        expect(budget.frameRate).toBeGreaterThan(0);
        expect(budget.veilSpeedFactor).toBeGreaterThan(0);
      }
    }
  });

  it('preserves the pre-axis full-tier reference values at full/high', () => {
    const budget = resolveMotionBudget('full', 'high');
    expect(budget).toEqual({
      resolutionScale: 0.55,
      dprCap: 1.75,
      frameRate: 60,
      veilSpeedFactor: 1,
      transitionBlur: true,
      smoothScroll: true,
      scrollBreath: true,
    });
  });

  it('caps the mobile tier frame rate at 30 regardless of perf', () => {
    for (const tier of PERF_TIERS) {
      expect(resolveMotionBudget('mobile', tier).frameRate).toBe(30);
    }
  });

  it('keeps transition blur and smooth scroll only off at low perf', () => {
    expect(resolveMotionBudget('full', 'high').transitionBlur).toBe(true);
    expect(resolveMotionBudget('full', 'medium').transitionBlur).toBe(true);
    expect(resolveMotionBudget('full', 'low').transitionBlur).toBe(false);
    expect(resolveMotionBudget('full', 'low').smoothScroll).toBe(false);
    // mobile 档 blur 恒关（意图档降级），平滑滚动保持现状直到 low。
    expect(resolveMotionBudget('mobile', 'high').transitionBlur).toBe(false);
    expect(resolveMotionBudget('mobile', 'medium').smoothScroll).toBe(true);
    expect(resolveMotionBudget('mobile', 'low').smoothScroll).toBe(false);
  });

  it('treats reduced as terminal: identical budget for every perf tier', () => {
    const reducedHigh = resolveMotionBudget('reduced', 'high');
    for (const tier of PERF_TIERS) {
      expect(resolveMotionBudget('reduced', tier)).toEqual(reducedHigh);
    }
    expect(reducedHigh.transitionBlur).toBe(false);
    expect(reducedHigh.smoothScroll).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  parsePerfOverride / resolveEffectivePerfTier — 手动覆盖            */
/* ------------------------------------------------------------------ */

describe('parsePerfOverride', () => {
  it('parses valid values and falls back to auto', () => {
    expect(parsePerfOverride('auto')).toBe('auto');
    expect(parsePerfOverride('high')).toBe('high');
    expect(parsePerfOverride('medium')).toBe('medium');
    expect(parsePerfOverride('low')).toBe('low');
    expect(parsePerfOverride(null)).toBe('auto');
    expect(parsePerfOverride('')).toBe('auto');
    expect(parsePerfOverride('turbo')).toBe('auto');
  });
});

describe('resolveEffectivePerfTier', () => {
  it('prefers the manual override over the measured tier', () => {
    expect(resolveEffectivePerfTier('auto', 'low')).toBe('low');
    expect(resolveEffectivePerfTier('auto', 'high')).toBe('high');
    expect(resolveEffectivePerfTier('high', 'low')).toBe('high');
    expect(resolveEffectivePerfTier('medium', 'high')).toBe('medium');
    expect(resolveEffectivePerfTier('low', 'high')).toBe('low');
  });
});

/* ------------------------------------------------------------------ */
/*  createPerfTracker — 迟滞状态机                                    */
/* ------------------------------------------------------------------ */

/** 构造一个窗口统计；excess 控制超出预算间隔的量。 */
function windowStats(avgFrameMs: number, expectedIntervalMs = 16.7): FrameWindowStats {
  return {
    avgFrameMs,
    expectedIntervalMs,
  };
}

/** 连续喂 n 个窗口，返回每次报告后的档位序列。 */
function feed(tracker: ReturnType<typeof createPerfTracker>, windows: FrameWindowStats[]) {
  return windows.map((stats) => tracker.reportWindow(stats));
}

describe('createPerfTracker', () => {
  it('starts at the ceiling', () => {
    const tracker = createPerfTracker({ ceiling: 'medium' });
    expect(tracker.getTier()).toBe('medium');
  });

  it('downgrades after three consecutive slow windows (60fps budget ≈ <35fps)', () => {
    const tracker = createPerfTracker({ ceiling: 'high' });
    const slow = windowStats(30.7, 16.7); // 超出预算 14ms
    expect(feed(tracker, [slow, slow])).toEqual(['high', 'high']);
    expect(tracker.reportWindow(slow)).toBe('medium');
  });

  it('downgrades again with three more slow windows, down to low', () => {
    let clock = 0;
    const tracker = createPerfTracker({ ceiling: 'high', now: () => clock });
    const slow = windowStats(40, 16.7);
    feed(tracker, [slow, slow, slow]);
    expect(tracker.getTier()).toBe('medium');
    clock = 31_000; // 降档冷却（30s）已过
    feed(tracker, [slow, slow, slow]);
    expect(tracker.getTier()).toBe('low');
    clock = 62_000;
    feed(tracker, [slow, slow, slow]);
    expect(tracker.getTier()).toBe('low'); // 不再低于 low
  });

  it('upgrades after six fast windows but never above the ceiling', () => {
    let clock = 0;
    const tracker = createPerfTracker({ ceiling: 'medium', now: () => clock });
    const fast = windowStats(14.5, 16.7); // 低于预算 2.2ms
    const slow = windowStats(40, 16.7);
    // medium → low
    feed(tracker, [slow, slow, slow]);
    expect(tracker.getTier()).toBe('low');
    // 升档冷却（60s）已过：6 个快窗口 → low → medium
    clock = 61_000;
    const results = feed(tracker, [fast, fast, fast, fast, fast, fast]);
    expect(results[5]).toBe('medium');
    // 已到 ceiling，继续快窗口不再升级
    feed(tracker, [fast, fast, fast, fast, fast, fast]);
    expect(tracker.getTier()).toBe('medium');
  });

  it('respects the downgrade cooldown between changes', () => {
    let clock = 0;
    const tracker = createPerfTracker({ ceiling: 'high', now: () => clock });
    const slow = windowStats(40, 16.7);
    feed(tracker, [slow, slow, slow]); // t=0 降为 medium
    expect(tracker.getTier()).toBe('medium');

    // 冷却期（30s）内继续慢窗口：不再降
    clock = 10_000;
    feed(tracker, [slow, slow, slow]);
    expect(tracker.getTier()).toBe('medium');

    // 冷却结束后再降
    clock = 31_000;
    feed(tracker, [slow, slow, slow]);
    expect(tracker.getTier()).toBe('low');
  });

  it('resets both streaks in the neutral zone (no flapping)', () => {
    const tracker = createPerfTracker({ ceiling: 'high' });
    const slow = windowStats(40, 16.7);
    const neutral = windowStats(16.7, 16.7); // excess 0
    feed(tracker, [slow, slow, neutral, slow, slow]);
    expect(tracker.getTier()).toBe('high');
  });

  it('ignores deliberate throttling: excess near zero at a 30fps budget', () => {
    const tracker = createPerfTracker({ ceiling: 'high' });
    // 过渡期节流 30fps：帧耗时 ~33.3ms ≈ 预算间隔，excess ≈ 0 → 不降档
    const throttled = windowStats(33.5, 33.3);
    feed(tracker, [throttled, throttled, throttled, throttled, throttled, throttled]);
    expect(tracker.getTier()).toBe('high');
  });
});

/* ------------------------------------------------------------------ */
/*  createFrameWindowSampler — 采样窗口                                */
/* ------------------------------------------------------------------ */

describe('createFrameWindowSampler', () => {
  it('closes a window only after both duration and frame count thresholds', () => {
    let clock = 0;
    const windows: FrameWindowStats[] = [];
    const sampler = createFrameWindowSampler((stats) => windows.push(stats), {
      windowMs: 2000,
      minFrames: 10,
      now: () => clock,
    });
    // 时长未到：10 帧后仍不闭合
    for (let i = 0; i < 10; i += 1) {
      clock += 100;
      sampler.record(20, 16.7);
    }
    expect(windows).toEqual([]);
    // 时长到达（2000ms）后下一帧闭合
    clock += 1100;
    sampler.record(20, 16.7);
    expect(windows).toEqual([{ avgFrameMs: 20, expectedIntervalMs: 16.7 }]);
  });

  it('keeps the window open until the minimum frame count at low frame rates', () => {
    let clock = 0;
    const windows: FrameWindowStats[] = [];
    const sampler = createFrameWindowSampler((stats) => windows.push(stats), {
      windowMs: 100,
      minFrames: 5,
      now: () => clock,
    });
    // 时长已过但只有 4 帧：不闭合
    for (let i = 0; i < 4; i += 1) {
      clock += 50;
      sampler.record(50, 33.3);
    }
    expect(windows).toEqual([]);
    clock += 50;
    sampler.record(50, 33.3);
    expect(windows).toEqual([{ avgFrameMs: 50, expectedIntervalMs: 33.3 }]);
  });

  it('uses the latest expected interval when the budget frame rate changes mid-window', () => {
    let clock = 0;
    const windows: FrameWindowStats[] = [];
    const sampler = createFrameWindowSampler((stats) => windows.push(stats), {
      windowMs: 2000,
      minFrames: 10,
      now: () => clock,
    });
    for (let i = 0; i < 9; i += 1) {
      clock += 100;
      sampler.record(20, 16.7);
    }
    // 档位降频：预算间隔变为 33.3ms，最后一帧携带新间隔
    clock += 1200;
    sampler.record(33, 33.3);
    expect(windows).toEqual([{ avgFrameMs: (9 * 20 + 33) / 10, expectedIntervalMs: 33.3 }]);
  });

  it('starts a fresh window after closing', () => {
    let clock = 0;
    const windows: FrameWindowStats[] = [];
    const sampler = createFrameWindowSampler((stats) => windows.push(stats), {
      windowMs: 1000,
      minFrames: 5,
      now: () => clock,
    });
    for (let i = 0; i < 12; i += 1) {
      clock += 200;
      sampler.record(10, 16.7);
    }
    expect(windows).toEqual([
      { avgFrameMs: 10, expectedIntervalMs: 16.7 },
      { avgFrameMs: 10, expectedIntervalMs: 16.7 },
    ]);
  });
});
