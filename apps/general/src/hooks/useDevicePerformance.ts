import { useSyncExternalStore } from 'react';
import { STORAGE_KEYS, readStorage, removeStorage, writeStorage } from '@/lib/storage/keys';
import {
  createPerfTracker,
  parsePerfOverride,
  resolveEffectivePerfTier,
  type DevicePerfTier,
  type FrameWindowStats,
  type PerfOverride,
} from '@/lib/device-performance';

/**
 * 设备性能轴的运行时 store（模块级 + `useSyncExternalStore`，模式对齐
 * `useMotionPreference`）：每次会话从完整预算开始，DarkVeil 经
 * `reportFrameWindow` 上报实测帧耗时，连续慢窗口才减少装饰渲染。
 *
 * 手动覆盖（`setPerfOverride`）：命令面板的 Perf: Full / Perf: Auto
 * 持久化用户选择，优先于测量结果。正文上不显示性能提示。
 *
 * 自动结果不跨会话持久化，硬件与网络声明不替代实际帧耗时。
 */

interface PerfState {
  /** 完整预算的上限。 */
  readonly ceiling: DevicePerfTier;
  /** 当前生效档位（手动覆盖优先，否则为动态降 / 升档结果）。 */
  readonly current: DevicePerfTier;
  /** 手动覆盖：'auto'（默认）或固定档位。 */
  readonly override: PerfOverride;
}

/** SSR / 水合前快照：与引入性能轴前的行为一致（无降级、无覆盖）。 */
const SSR_STATE: PerfState = { ceiling: 'high', current: 'high', override: 'auto' };

const listeners = new Set<() => void>();
let state: PerfState | null = null;
let tracker: ReturnType<typeof createPerfTracker> | null = null;

function readStoredOverride(): PerfOverride {
  return parsePerfOverride(readStorage(STORAGE_KEYS.perfTier));
}

function init(): PerfState {
  if (state) return state;
  const ceiling: DevicePerfTier = 'high';
  tracker = createPerfTracker({ ceiling });
  const override = readStoredOverride();
  state = {
    ceiling,
    current: resolveEffectivePerfTier(override, ceiling),
    override,
  };
  return state;
}

function getPerfState(): PerfState {
  if (state) return state;
  if (typeof window === 'undefined') return SSR_STATE;
  return init();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 订阅当前性能档位（变化时触发订阅者重渲染）。 */
export function useDevicePerformance(): PerfState {
  return useSyncExternalStore(subscribe, getPerfState, () => SSR_STATE);
}

/**
 * DarkVeil 渲染循环的窗口采样入口（App 接线到 `onFrameWindow`）。
 * 迟滞与冷却逻辑在 `createPerfTracker` 内；档位变化时通知订阅者。
 * 手动覆盖生效期间，测量结果不再改变生效档位（tracker 继续校准）。
 */
export function reportFrameWindow(stats: FrameWindowStats): void {
  if (typeof window === 'undefined') return;
  const currentState = init();
  // init 已保证 tracker 就绪。
  const nextTrackerTier = tracker!.reportWindow(stats);
  const next = resolveEffectivePerfTier(currentState.override, nextTrackerTier);
  if (next !== currentState.current) {
    state = { ...currentState, current: next };
    listeners.forEach((listener) => listener());
  }
}

/** 读取当前手动覆盖（'auto' 或固定档位）。 */
export function getPerfOverride(): PerfOverride {
  return getPerfState().override;
}

/**
 * 设置手动覆盖并持久化（localStorage `mirahikari-portfolio:pref:perf-tier`）：
 * 命令面板「Perf: Full」→ 'high'；「Perf: Auto」→ 'auto'。
 * 显式选择优先于测量结果。
 */
export function setPerfOverride(next: PerfOverride): void {
  if (typeof window === 'undefined') return;
  const currentState = init();
  if (currentState.override === next) return;
  if (next === 'auto') {
    removeStorage(STORAGE_KEYS.perfTier);
  } else {
    writeStorage(STORAGE_KEYS.perfTier, next);
  }
  state = {
    ...currentState,
    override: next,
    current: resolveEffectivePerfTier(next, tracker!.getTier()),
  };
  listeners.forEach((listener) => listener());
}

/** 测试辅助：重置模块级状态（浏览器环境手工 QA 亦可调用）。 */
export function resetDevicePerformanceForTesting(): void {
  state = null;
  tracker = null;
}
