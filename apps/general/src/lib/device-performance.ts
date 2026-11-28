/**
 * 设备性能轴：在用户意图档位（MotionLevel）之上叠加的自动性能档位。
 *
 * 双轴模型：
 * - 意图轴 `MotionLevel`（full / mobile / reduced）：用户可见、命令面板可控、
 *   localStorage 持久化，语义与行为保持不变。
 * - 性能轴 `DevicePerfTier`（high / medium / low）：从完整预算开始，
 *   仅持续的实测掉帧减少装饰渲染，永不超出用户选择；
 *   `reduced` 为终态，性能轴不触碰。
 *
 * 表现不降级边界：性能轴只下调预算表内的杠杆。low 档含两个「可见」降级——
 * 章节过渡 blur 与滚动呼吸（与 mobile 档同一语义），其余（像素预算、帧率、
 * 速度、粒子数）观感不可辨。过渡乐谱（transitionScore / typewriterScore）与
 * 弹簧手感不随性能轴变化。
 *
 * 动态降档：DarkVeil 渲染循环按窗口上报实测帧耗时（`FrameWindowStats`），
 * `createPerfTracker` 带迟滞与冷却地调整当前档位（热降频场景自适应），
 * 且永不越过完整预算的 ceiling。
 */

import type { MotionLevel } from './motion';

export type DevicePerfTier = 'high' | 'medium' | 'low';

const TIER_RANK: Record<DevicePerfTier, number> = { low: 0, medium: 1, high: 2 };

export function tierRank(tier: DevicePerfTier): number {
  return TIER_RANK[tier];
}

export function tierFromRank(rank: number): DevicePerfTier {
  if (rank <= 0) return 'low';
  if (rank >= 2) return 'high';
  return 'medium';
}

export interface MotionBudget {
  /** Veil 绘制缓冲相对父元素的缩放。 */
  readonly resolutionScale: number;
  /** WebGL 渲染器的设备像素比上限。 */
  readonly dprCap: number;
  /** 帷幕渲染循环目标帧率（阅读模式 / 过渡节流由 App 叠加处理）。 */
  readonly frameRate: number;
  /** 帷幕场速系数（慢速漂移在低系数下肉眼不可辨）。 */
  readonly veilSpeedFactor: number;
  /**
   * 章节过渡的容器级全屏 blur（散焦 · 聚焦签名）。low 档关闭——大屏弱机
   * 过渡期 blur 与 WebGL morph / 盖层脉冲三方争 GPU，掉帧即卡顿；与
   * mobile 档「无 blur」同一语义，是 low 档唯一的可见降级。
   */
  readonly transitionBlur: boolean;
  /**
   * 章节内 Lenis 平滑滚动。low 档回原生滚动（复用 createNativeScroller），
   * 省去常驻 lenis.raf 循环；与 coarsePointer / reducedMotion 同级降级。
   */
  readonly smoothScroll: boolean;
  /**
   * 「墨与光的呼吸」滚动呼吸（useScrollBreath）。low 档停用——与 blur 同为
   * low 档的可见降级，省去常驻 wheel 监听与唤醒 rAF 链路；仅 full 意图档
   * 有意义（mobile/reduced 本就关闭）。
   */
  readonly scrollBreath: boolean;
}

/** full 档以现有桌面数值为 high 基准，medium/low 只下调不可见项。 */
const FULL_HIGH: MotionBudget = {
  resolutionScale: 0.55,
  dprCap: 1.75,
  frameRate: 60,
  veilSpeedFactor: 1,
  transitionBlur: true,
  smoothScroll: true,
  scrollBreath: true,
};
const FULL_MEDIUM: MotionBudget = {
  resolutionScale: 0.45,
  dprCap: 1.5,
  frameRate: 60,
  veilSpeedFactor: 0.9,
  transitionBlur: true,
  smoothScroll: true,
  scrollBreath: true,
};
const FULL_LOW: MotionBudget = {
  resolutionScale: 0.36,
  dprCap: 1.25,
  frameRate: 30,
  veilSpeedFactor: 0.8,
  transitionBlur: false,
  smoothScroll: false,
  scrollBreath: false,
};

/**
 * mobile 档已有基础降级（App 侧 0.72 速度、无 blur），性能轴再压像素。
 * high = medium 同一行；30fps 预算下的持续慢窗口才进入 low。
 */
const MOBILE_BASE: MotionBudget = {
  resolutionScale: 0.36,
  dprCap: 1.25,
  frameRate: 30,
  veilSpeedFactor: 1,
  transitionBlur: false,
  smoothScroll: true,
  scrollBreath: false,
};
const MOBILE_LOW: MotionBudget = {
  resolutionScale: 0.3,
  dprCap: 1,
  frameRate: 30,
  veilSpeedFactor: 1,
  transitionBlur: false,
  smoothScroll: false,
  scrollBreath: false,
};

/** reduced 为终态：静态帧，性能轴不触碰。 */
const REDUCED: MotionBudget = {
  resolutionScale: 0.36,
  dprCap: 1.25,
  frameRate: 30,
  veilSpeedFactor: 1,
  transitionBlur: false,
  smoothScroll: false,
  scrollBreath: false,
};

const BUDGETS: Record<MotionLevel, Record<DevicePerfTier, MotionBudget>> = {
  full: { high: FULL_HIGH, medium: FULL_MEDIUM, low: FULL_LOW },
  mobile: { high: MOBILE_BASE, medium: MOBILE_BASE, low: MOBILE_LOW },
  reduced: { high: REDUCED, medium: REDUCED, low: REDUCED },
};

/** 意图档 × 性能档 → 动效预算。同意图档下性能档只降不升（测试断言）。 */
export function resolveMotionBudget(
  motionLevel: MotionLevel,
  perfTier: DevicePerfTier,
): MotionBudget {
  return BUDGETS[motionLevel][perfTier];
}

/** DarkVeil 渲染循环上报的一个采样窗口。 */
export interface FrameWindowStats {
  /** 窗口内实际渲染帧的平均帧耗时（ms）。 */
  readonly avgFrameMs: number;
  /** 当前预算下的帧间隔（ms），由 DarkVeil 按 live.frameRate 计算。 */
  readonly expectedIntervalMs: number;
}

/**
 * 性能轴手动覆盖：'auto' = 自动（默认）；'high' | 'medium' | 'low' =
 * 固定档位（用户在命令面板显式选择）。手动
 * 覆盖优先于测量档位——与 motion 档位覆盖同一先例
 * （显式选择赢过自动推断）。
 */
export type PerfOverride = 'auto' | DevicePerfTier;

const PERF_OVERRIDE_VALUES: readonly PerfOverride[] = ['auto', 'high', 'medium', 'low'];

/** 解析存储值；非法或缺省一律回落 'auto'。 */
export function parsePerfOverride(raw: string | null): PerfOverride {
  return PERF_OVERRIDE_VALUES.includes(raw as PerfOverride) ? (raw as PerfOverride) : 'auto';
}

/** 生效档位：手动覆盖优先；'auto' 回落动态测量档位。 */
export function resolveEffectivePerfTier(
  override: PerfOverride,
  trackerTier: DevicePerfTier,
): DevicePerfTier {
  return override === 'auto' ? trackerTier : override;
}

export interface PerfTrackerOptions {
  /** 当前完整预算的上限。 */
  readonly ceiling: DevicePerfTier;
  /** 平均帧耗时超出预算间隔 ≥ 该值（ms）→ 计一次降档窗口。 */
  readonly downgradeExcessMs?: number;
  /** 平均帧耗时低于预算间隔 ≥ 该值（ms）→ 计一次升档窗口。 */
  readonly upgradeExcessMs?: number;
  readonly downgradeWindows?: number;
  readonly upgradeWindows?: number;
  readonly downgradeCooldownMs?: number;
  readonly upgradeCooldownMs?: number;
  /** 可注入时钟（测试用）；默认 performance.now。 */
  readonly now?: () => number;
}

export interface PerfTracker {
  readonly getTier: () => DevicePerfTier;
  /** 喂入一个实测窗口，返回（可能更新的）当前档位。 */
  readonly reportWindow: (stats: FrameWindowStats) => DevicePerfTier;
}

/**
 * 迟滞默认值（事实来源：docs/motion-language.md「门控 · 设备性能轴」）：
 * 降档 —— 平均帧耗时超出预算间隔 ≥14ms（60fps 档即持续 <35fps）连续 3 窗口；
 * 升档 —— 低于预算间隔 ≥2ms 连续 6 窗口；变更间冷却 30s / 60s。
 * 以「超出预算间隔」而非绝对帧耗时判定，刻意节流（过渡期 30fps）时
 * excess ≈ 0，不会误报。
 */
const DOWNGRADE_EXCESS_MS = 14;
const UPGRADE_EXCESS_MS = -2;
const DOWNGRADE_WINDOWS = 3;
const UPGRADE_WINDOWS = 6;
const DOWNGRADE_COOLDOWN_MS = 30_000;
const UPGRADE_COOLDOWN_MS = 60_000;
/** 帧耗时采样窗口：时长（ms）与最小帧数，两者都达到才闭合一个窗口。 */
const SAMPLER_WINDOW_MS = 2000;
const SAMPLER_MIN_FRAMES = 10;

export function createPerfTracker(options: PerfTrackerOptions): PerfTracker {
  const ceiling = options.ceiling;
  const downgradeExcessMs = options.downgradeExcessMs ?? DOWNGRADE_EXCESS_MS;
  const upgradeExcessMs = options.upgradeExcessMs ?? UPGRADE_EXCESS_MS;
  const downgradeWindows = options.downgradeWindows ?? DOWNGRADE_WINDOWS;
  const upgradeWindows = options.upgradeWindows ?? UPGRADE_WINDOWS;
  const downgradeCooldownMs = options.downgradeCooldownMs ?? DOWNGRADE_COOLDOWN_MS;
  const upgradeCooldownMs = options.upgradeCooldownMs ?? UPGRADE_COOLDOWN_MS;
  const now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : 0));

  let tier = ceiling;
  let downgradeStreak = 0;
  let upgradeStreak = 0;
  let lastChangeAt = Number.NEGATIVE_INFINITY;

  const getTier = () => tier;

  const reportWindow = (stats: FrameWindowStats): DevicePerfTier => {
    const excessMs = stats.avgFrameMs - stats.expectedIntervalMs;
    const currentTime = now();

    if (excessMs >= downgradeExcessMs) {
      downgradeStreak += 1;
      upgradeStreak = 0;
    } else if (excessMs <= upgradeExcessMs) {
      upgradeStreak += 1;
      downgradeStreak = 0;
    } else {
      // 中性区间：两种趋势都中断，防抖动。
      downgradeStreak = 0;
      upgradeStreak = 0;
    }

    if (downgradeStreak >= downgradeWindows && currentTime - lastChangeAt >= downgradeCooldownMs) {
      if (tierRank(tier) > 0) {
        tier = tierFromRank(tierRank(tier) - 1);
        lastChangeAt = currentTime;
      }
      downgradeStreak = 0;
      upgradeStreak = 0;
    } else if (upgradeStreak >= upgradeWindows && currentTime - lastChangeAt >= upgradeCooldownMs) {
      if (tierRank(tier) < tierRank(ceiling)) {
        tier = tierFromRank(tierRank(tier) + 1);
        lastChangeAt = currentTime;
      }
      downgradeStreak = 0;
      upgradeStreak = 0;
    }

    return tier;
  };

  return { getTier, reportWindow };
}

export interface FrameWindowSamplerOptions {
  /** 窗口时长（ms）。 */
  readonly windowMs?: number;
  /** 窗口最小帧数（低帧率下防窗口拖得过长）。 */
  readonly minFrames?: number;
  /** 可注入时钟（测试用）；默认 performance.now。 */
  readonly now?: () => number;
}

export interface FrameWindowSampler {
  /** 每渲染一帧调用一次；窗口闭合时回调 onWindow。 */
  readonly record: (frameMs: number, expectedIntervalMs: number) => void;
}

/**
 * 帧耗时采样窗口：DarkVeil 渲染循环每帧 `record(帧间隔, 预算间隔)`，累计
 * 到「时长 ≥ windowMs 且帧数 ≥ minFrames」时闭合并回调一次窗口统计。
 * expectedIntervalMs 取窗口内最后一次记录值——与闭合并行的预算帧率一致
 * （档位降频发生在两帧之间时，新间隔立即生效）。
 */
export function createFrameWindowSampler(
  onWindow: (stats: FrameWindowStats) => void,
  options: FrameWindowSamplerOptions = {},
): FrameWindowSampler {
  const windowMs = options.windowMs ?? SAMPLER_WINDOW_MS;
  const minFrames = options.minFrames ?? SAMPLER_MIN_FRAMES;
  const now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : 0));

  let windowStart: number | null = null;
  let frames = 0;
  let totalMs = 0;
  let expectedIntervalMs = 0;

  const record = (frameMs: number, intervalMs: number): void => {
    const currentTime = now();
    if (windowStart === null) windowStart = currentTime;
    frames += 1;
    totalMs += frameMs;
    expectedIntervalMs = intervalMs;
    if (currentTime - windowStart >= windowMs && frames >= minFrames) {
      onWindow({ avgFrameMs: totalMs / frames, expectedIntervalMs });
      windowStart = currentTime;
      frames = 0;
      totalMs = 0;
      expectedIntervalMs = 0;
    }
  };

  return { record };
}
