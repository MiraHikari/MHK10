import { useSyncExternalStore } from 'react';
import { DESK_EMBED_ENABLED, PUBLIC_DESK_URL, getPresentation } from './presentation-controller';
import { INITIAL_PRESENTATION_STATE, type PresentationState } from './presentation-model';
import { parseDisplayMode, type DisplayMode } from './display-mode-model';

export { DESK_EMBED_ENABLED, PUBLIC_DESK_URL };
export { parseDisplayMode, type DisplayMode } from './display-mode-model';

/**
 * Public facade over the single `PresentationController` instance.
 *
 * Before the controller starts (SSR, and the render that precedes the first
 * subscription) reads hydrate lazily from the prehydration dataset exactly as
 * before. Every mutation and every subsequent read goes through the one
 * controller, so only the reducer decides the target/visible mode. The
 * controller owns the started flag, so disposing and recreating it (App
 * remount) naturally falls back to dataset hydration again.
 */
function ensureStarted(): void {
  if (typeof document === 'undefined') return;
  getPresentation().start();
}

/** Subscribe the controller; the first browser subscription starts boot. */
function subscribe(listener: () => void): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const controller = getPresentation();
  const unsubscribe = controller.subscribe(listener);
  ensureStarted();
  return unsubscribe;
}

export function getDisplayMode(): DisplayMode {
  const controller = getPresentation();
  if (!controller.isStarted()) {
    const target =
      typeof document !== 'undefined'
        ? parseDisplayMode(
            document.documentElement.dataset.displayTarget ??
              document.documentElement.dataset.displayMode,
          )
        : null;
    return DESK_EMBED_ENABLED && target === 'win95' ? 'win95' : 'classic';
  }
  return controller.getSnapshot().target;
}

export function getVisibleDisplayMode(): DisplayMode {
  const controller = getPresentation();
  return controller.isStarted() ? controller.getSnapshot().visible : 'classic';
}

/** Commit only after the target presentation acknowledges readiness. */
export function commitDisplayMode(next: DisplayMode): void {
  if (typeof document === 'undefined') return;
  ensureStarted();
  getPresentation().send({ type: 'commit', target: next });
}

export function setDisplayMode(next: DisplayMode, options: { persist?: boolean } = {}): void {
  if (typeof document === 'undefined') return;
  ensureStarted();
  getPresentation().send(
    options.persist === undefined
      ? { type: 'request', target: next }
      : { type: 'request', target: next, persist: options.persist },
  );
}

export function failDisplayMode(): void {
  if (typeof document === 'undefined') return;
  ensureStarted();
  getPresentation().send({ type: 'fail' });
}

/**
 * Release the boot mask. All boot owners call this instead of dispatching
 * `portfolio:boot-ready` directly: the reducer guarantees the DOM event fires
 * at most once per controller lifetime, whether the mask is released by the
 * classic preload, the desktop startup, a reload, or a failure.
 */
export function markBootReady(): void {
  if (typeof document === 'undefined') return;
  ensureStarted();
  getPresentation().send({ type: 'mark-boot-ready' });
}

export function useDisplayMode(): DisplayMode {
  return useSyncExternalStore(subscribe, getDisplayMode, () => 'classic');
}

export function useVisibleDisplayMode(): DisplayMode {
  return useSyncExternalStore(subscribe, getVisibleDisplayMode, () => 'classic');
}

/** The full controller snapshot, for adapters that own transport state such as
 * the handoff phase, generation and pending overlay. The snapshot object is
 * stable between transitions, so it is safe as an external-store value. */
function getPresentationState(): PresentationState {
  return getPresentation().getSnapshot();
}

export function usePresentationState(): PresentationState {
  return useSyncExternalStore(subscribe, getPresentationState, () => INITIAL_PRESENTATION_STATE);
}
