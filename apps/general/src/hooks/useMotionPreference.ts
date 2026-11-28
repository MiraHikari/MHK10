import { useSyncExternalStore } from 'react';
import type { MotionLevel } from '@/lib/motion';
import { STORAGE_KEYS, readStorage, removeStorage, writeStorage } from '@/lib/storage/keys';

/**
 * Manual motion-budget override.
 *
 * `useMediaCapabilities` normally infers a tier from viewport and pointer, but
 * that guess is wrong on, say, a low-powered large-screen device. This store
 * lets the command palette pin a tier and remembers it across visits.
 *
 * It lives outside React (module scope + `useSyncExternalStore`) so the palette
 * can flip it from a command handler without threading state through App.
 */

export type MotionOverride = MotionLevel | null;

const STORAGE_KEY = STORAGE_KEYS.motionLevel;
const VALID: readonly MotionLevel[] = ['full', 'mobile', 'reduced'];

const listeners = new Set<() => void>();
/** `undefined` until the first read hydrates it from storage. */
let override: MotionOverride | undefined;

function readStored(): MotionOverride {
  if (typeof window === 'undefined') return null;
  const raw = readStorage(STORAGE_KEY);
  return VALID.includes(raw as MotionLevel) ? (raw as MotionLevel) : null;
}

export function getMotionOverride(): MotionOverride {
  if (override === undefined) override = readStored();
  return override;
}

/**
 * Effective reduced-motion decision for non-React callers (module functions,
 * event handlers). A manual tier wins over the OS preference — the same rule
 * `useMediaCapabilities` applies — so imperative scrolling never animates for
 * someone who chose「静态」in the command palette.
 */
export function effectiveReducedMotion(): boolean {
  const stored = getMotionOverride();
  if (stored) return stored === 'reduced';
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function setMotionOverride(next: MotionOverride) {
  if (getMotionOverride() === next) return;
  override = next;
  if (next) {
    writeStorage(STORAGE_KEY, next);
  } else {
    removeStorage(STORAGE_KEY);
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMotionOverride(): MotionOverride {
  return useSyncExternalStore(subscribe, getMotionOverride, () => null);
}
