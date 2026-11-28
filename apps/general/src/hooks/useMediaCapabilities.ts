import { useSyncExternalStore } from 'react';
import { useMotionOverride } from '@/hooks/useMotionPreference';
import { useDevicePerformance } from '@/hooks/useDevicePerformance';
import type { MotionLevel } from '@/lib/motion';
import type { DevicePerfTier } from '@/lib/device-performance';

interface MediaCapabilities {
  /** Motion should be suppressed — OS preference, or a manual `reduced` override. */
  reducedMotion: boolean;
  /** pointer: fine (mouse/trackpad vs touch) */
  finePointer: boolean;
  /** min-width: 1024px */
  isDesktop: boolean;
  /** pointer: coarse */
  coarsePointer: boolean;
  /** Shared visual-motion budget for the current device. */
  motionLevel: MotionLevel;
  /** 设备性能轴：自动档位（high / medium / low），只降不升，不越意图档。 */
  perfTier: DevicePerfTier;
}

interface MediaQueryEntry {
  readonly media: MediaQueryList;
  readonly listeners: Set<() => void>;
  readonly notify: () => void;
}

const mediaQueries = new Map<string, MediaQueryEntry>();

function getMediaQuery(query: string) {
  let entry = mediaQueries.get(query);
  if (entry || typeof window === 'undefined') return entry;

  const media = window.matchMedia(query);
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  entry = { media, listeners, notify };
  mediaQueries.set(query, entry);
  return entry;
}

function subscribe(query: string, listener: () => void) {
  const entry = getMediaQuery(query);
  if (!entry) return () => undefined;

  if (entry.listeners.size === 0) {
    entry.media.addEventListener('change', entry.notify);
  }
  entry.listeners.add(listener);

  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size === 0) {
      entry.media.removeEventListener('change', entry.notify);
    }
  };
}

/**
 * Shared `matchMedia` subscription backed by one module-level
 * `MediaQueryList` per query. Reading through `useSyncExternalStore` means the
 * first client render already sees the real value instead of a `useState`
 * default flipped by an effect (which rearranges layouts after paint).
 */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (listener) => subscribe(query, listener),
    () => getMediaQuery(query)?.media.matches ?? false,
    () => false,
  );
}

export function useMediaCapabilities(): MediaCapabilities {
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const finePointer = useMediaQuery('(pointer: fine)');
  const coarsePointer = useMediaQuery('(pointer: coarse)');
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const override = useMotionOverride();
  const { current: perfTier } = useDevicePerformance();

  const inferred: MotionLevel = prefersReducedMotion ? 'reduced' : 'full';
  // An explicit choice from the command palette wins over the inferred tier,
  // including over the OS preference — the visitor asked for it directly.
  const motionLevel = override ?? inferred;

  return {
    reducedMotion: motionLevel === 'reduced',
    finePointer,
    coarsePointer,
    isDesktop,
    motionLevel,
    perfTier,
  };
}
