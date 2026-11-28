import { useSyncExternalStore } from 'react';
import {
  changeSharedReading,
  readSharedReading,
  subscribeSharedReadingSelector,
} from '@mhk/site-core/fusion/browser-reading';
import {
  DEFAULT_READER_PREFERENCES,
  type ReaderPreferences,
} from '@mhk/site-core/fusion/reading-model';

/**
 * 阅读偏好（行宽 + 专注模式）。共享阅读笔记本（`@mhk/site-core/fusion/browser-reading`）
 * 是唯一事实来源：模块级 store 惰性 hydrate + useSyncExternalStore + 写入后
 * listeners 通知。笔记本与其他呈现共享，SSR 时使用默认值，损坏的笔记本回退到默认值。
 */

export type LineWidth = 'compact' | 'comfortable' | 'wide';

export const LINE_WIDTHS: readonly LineWidth[] = ['compact', 'comfortable', 'wide'];

/** 三档行宽映射（ch）。 */
export const LINE_WIDTH_CHAR: Record<LineWidth, number> = {
  compact: 58,
  comfortable: 70,
  wide: 84,
} as const;

/**
 * 同一偏好的响应式解释：窄视口下行宽被视口钳制，档位改为表达
 * 阅读密度（正文字号 / 行高），保证任何视口下切换都有真实效果。
 */
export const LINE_WIDTH_PROSE: Record<LineWidth, { size: string; lineHeight: number }> = {
  compact: { size: '0.9375rem', lineHeight: 1.8 },
  comfortable: { size: '1rem', lineHeight: 1.85 },
  wide: { size: '1.0625rem', lineHeight: 1.9 },
} as const;

const DEFAULT_LINE_WIDTH: LineWidth =
  DEFAULT_READER_PREFERENCES.width === 'narrow' ? 'compact' : DEFAULT_READER_PREFERENCES.width;

const listeners = new Set<() => void>();
let stopShared: (() => void) | undefined;
/** undefined 表示尚未从存储 hydrate。 */
let lineWidth: LineWidth | undefined;
let zen: boolean | undefined;

export function isLineWidth(value: unknown): value is LineWidth {
  return typeof value === 'string' && (LINE_WIDTHS as readonly string[]).includes(value);
}

/** Apply durable preferences; returns whether the rendered values actually changed. */
function applyPreferences(preferences: ReaderPreferences): boolean {
  const nextWidth = preferences.width === 'narrow' ? 'compact' : preferences.width;
  const changed = lineWidth !== nextWidth || zen !== preferences.focus;
  lineWidth = nextWidth;
  zen = preferences.focus;
  return changed;
}
function hydrate(): void {
  if (lineWidth !== undefined && zen !== undefined) return;
  try {
    applyPreferences(readSharedReading().preferences);
  } catch {
    /* A damaged notebook stays intact; reading falls back to defaults. */
    lineWidth = DEFAULT_LINE_WIDTH;
    zen = DEFAULT_READER_PREFERENCES.focus;
  }
}

export function getLineWidth(): LineWidth {
  hydrate();
  return lineWidth ?? DEFAULT_LINE_WIDTH;
}

export function getZenMode(): boolean {
  hydrate();
  return zen ?? DEFAULT_READER_PREFERENCES.focus;
}

export function setLineWidth(next: LineWidth): void {
  if (!isLineWidth(next) || getLineWidth() === next) return;
  lineWidth = next;
  changeSharedReading((state) => {
    state.preferences.width = next === 'compact' ? 'narrow' : next;
  });
  listeners.forEach((listener) => listener());
}

export function setZenMode(next: boolean): void {
  if (getZenMode() === next) return;
  zen = next;
  changeSharedReading((state) => {
    state.preferences.focus = next;
  });
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void) {
  hydrate();
  const reactivated = listeners.size === 0;
  listeners.add(listener);
  if (!stopShared && typeof window !== 'undefined') {
    if (reactivated) {
      // With no mounted subscriber left, a peer change may have landed while
      // the storage subscription was torn down. Adopt the durable value on the
      // next mount. No listener was mounted to contradict, and React re-reads
      // the snapshot after subscribing, so this does not need a notification.
      try {
        applyPreferences(readSharedReading().preferences);
      } catch {
        /* Keep the last usable preferences while the notebook is unavailable. */
      }
    }
    stopShared = subscribeSharedReadingSelector(
      (state) => state.preferences,
      (shared) => {
        // Notify only on a real change; repeated identical storage events must not re-render.
        if (applyPreferences(shared)) listeners.forEach((item) => item());
      },
      (left, right) => left.width === right.width && left.focus === right.focus,
    );
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      stopShared?.();
      stopShared = undefined;
    }
  };
}

export function useLineWidth(): LineWidth {
  return useSyncExternalStore(subscribe, getLineWidth, () => DEFAULT_LINE_WIDTH);
}

export function useZenMode(): boolean {
  return useSyncExternalStore(subscribe, getZenMode, () => false);
}
