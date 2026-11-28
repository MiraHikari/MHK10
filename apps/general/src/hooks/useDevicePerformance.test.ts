import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

// 模块是模块级单例（state/tracker/listeners 均为模块级变量）：beforeEach
// 经 resetDevicePerformanceForTesting 复位后，在 stubbed window 下重新惰性
// init。mock 掉 react：node 环境无需真正加载 React，仅保证模块可解析。
vi.mock('react', () => ({
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
}));

import {
  getPerfOverride,
  reportFrameWindow,
  resetDevicePerformanceForTesting,
  setPerfOverride,
  useDevicePerformance,
} from '@/hooks/useDevicePerformance';
import { STORAGE_KEYS } from '@/lib/storage/keys';

/** 内存版 Storage（node 环境无 localStorage）。 */
class MockStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

let storage: MockStorage;

function stubEnvironment(hardwareConcurrency = 8): void {
  vi.stubGlobal('window', { localStorage: storage, sessionStorage: storage });
  vi.stubGlobal('navigator', { hardwareConcurrency });
}

beforeEach(() => {
  storage = new MockStorage();
  stubEnvironment();
  resetDevicePerformanceForTesting();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useDevicePerformance store', () => {
  it('defaults to high/auto without weak signals', () => {
    expect(useDevicePerformance()).toEqual({
      ceiling: 'high',
      current: 'high',
      override: 'auto',
    });
    expect(getPerfOverride()).toBe('auto');
  });

  it('keeps full rendering until sustained measurements show a problem', () => {
    stubEnvironment(2);
    resetDevicePerformanceForTesting();
    expect(useDevicePerformance()).toEqual({
      ceiling: 'high',
      current: 'high',
      override: 'auto',
    });
  });

  it('hydrates a stored override on first init', () => {
    storage.setItem(STORAGE_KEYS.perfTier, 'medium');
    resetDevicePerformanceForTesting();
    expect(getPerfOverride()).toBe('medium');
    expect(useDevicePerformance().current).toBe('medium');
  });

  it('setPerfOverride persists and beats the measured tier', () => {
    stubEnvironment(2);
    resetDevicePerformanceForTesting();
    expect(useDevicePerformance().current).toBe('high');

    setPerfOverride('high');
    expect(storage.getItem(STORAGE_KEYS.perfTier)).toBe('high');
    expect(getPerfOverride()).toBe('high');
    expect(useDevicePerformance().current).toBe('high');
  });

  it('setPerfOverride(auto) removes the stored key', () => {
    storage.setItem(STORAGE_KEYS.perfTier, 'high');
    resetDevicePerformanceForTesting();
    setPerfOverride('auto');
    expect(storage.getItem(STORAGE_KEYS.perfTier)).toBeNull();
    expect(getPerfOverride()).toBe('auto');
  });

  it('reportFrameWindow drives dynamic downgrades', () => {
    const slow = { avgFrameMs: 40, expectedIntervalMs: 16.7 };
    expect(useDevicePerformance().current).toBe('high');
    reportFrameWindow(slow);
    reportFrameWindow(slow);
    expect(useDevicePerformance().current).toBe('high');
    reportFrameWindow(slow);
    expect(useDevicePerformance().current).toBe('medium');
  });

  it('starts a fresh full budget after a previous measured reduction', () => {
    stubEnvironment(2);
    resetDevicePerformanceForTesting();
    const slow = { avgFrameMs: 40, expectedIntervalMs: 16.7 };
    reportFrameWindow(slow);
    reportFrameWindow(slow);
    reportFrameWindow(slow);
    expect(useDevicePerformance().current).toBe('medium');
    stubEnvironment(8);
    resetDevicePerformanceForTesting();
    expect(useDevicePerformance().current).toBe('high');
  });
});
