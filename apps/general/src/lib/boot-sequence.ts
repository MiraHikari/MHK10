/**
 * Single jurisdiction over "the boot loader has finished".
 *
 * The inline loader script, the hydrated content bundle and this module's own
 * timeout observe different signals. Funnelling them into one sequence keeps
 * mask dismissal and the content hand-off from racing each other: the first
 * completion wins and every later signal is ignored.
 *
 * The module is deliberately DOM-free. Callers inject timer functions and wire
 * DOM events themselves (see `hooks/fullpage/useBootLoader.ts` and the inline
 * script in `components/effects/BootLoader.astro`).
 */

/** Who observed completion first. Only the two owners that exist today. */
export type BootOwner = 'inline' | 'app';

/**
 * Dispatched by the inline loader script once the mask may hand off.
 * The constant is owned here; the inline script cannot import it, so
 * `BootLoader.astro` stamps it onto the loader element as `data-loader-ready-event`.
 */
export const BOOT_READY_EVENT = 'portfolio:loader-ready';

/**
 * Inline-script guard for "the inline script armed but nothing ever completed
 * it". This covers a bundle that never hydrated as well as a hydrated bundle
 * whose own readiness signal never arrived.
 *
 * It must stay above `BOOT_CONTENT_TIMEOUT_MS + BOOT_READY_BUFFER_MS`: the
 * module hands content over first, the inline script then owns the final mask
 * removal. The gap between them is the hydration allowance available before
 * the two budgets can cross.
 */
export const BOOT_LAST_RESORT_MS = 3000;

/**
 * Adapter guard for "the bundle hydrated but the loader never announced
 * completion". Short enough to hand content over while the mask exits.
 */
export const BOOT_CONTENT_TIMEOUT_MS = 1500;

/** Cross-fade between the loader exiting and the content entering. */
export const BOOT_READY_BUFFER_MS = 300;

/**
 * Slowest inline exit tail: `BootLoader.astro` holds 300 ms after completion
 * and then removes the element no later than a 700 ms transition fallback
 * (classic path; win95 and reduced motion are shorter). The mask safety
 * deadline must clear both.
 */
export const BOOT_INLINE_EXIT_TAIL_MS = 1000;

/**
 * Last-resort mask release owned by the module. Strictly after the inline
 * completion deadline **and** its longest exit transition, so every working
 * path has already removed the element and this is a no-op. It only fires when
 * the inline script itself never ran — a CSP without `unsafe-inline`, or a
 * blocker that dropped an `is:inline` payload no parser validated.
 */
export const BOOT_MASK_SAFETY_MS = 5000;

/**
 * Environment-neutral timer port. The sequence never inspects the handle, so
 * it stays opaque and the browser and test adapters can each supply their own.
 */
export interface BootTimers {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface BootSequenceOptions {
  timers?: BootTimers;
}

export interface BootSequence {
  /** The first caller wins; later calls are ignored. Idempotent. */
  complete(owner: BootOwner): void;
  readonly completed: boolean;
  /** Who completed it, once complete. `undefined` while it is still open. */
  readonly owner: BootOwner | undefined;
  /** Fires once when complete; a late subscriber fires immediately. */
  subscribe(listener: () => void): () => void;
  /** Releases listeners and the content timeout. Idempotent. */
  dispose(): void;
}

/**
 * Call the global timers through wrappers, never as methods of this object.
 * A stored `window.setTimeout` invoked as `timers.setTimeout(...)` receives
 * `timers` as its receiver, which browsers reject with "Illegal invocation".
 */
const defaultTimers: BootTimers = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createBootSequence(options: BootSequenceOptions = {}): BootSequence {
  const timers = options.timers ?? defaultTimers;
  const listeners = new Set<() => void>();
  let completed = false;
  let winner: BootOwner | undefined;
  let disposed = false;
  let timeoutId: ReturnType<BootTimers['setTimeout']> | null = null;

  const settle = (owner: BootOwner) => {
    completed = true;
    winner = owner;
    if (timeoutId !== null) {
      timers.clearTimeout(timeoutId);
      timeoutId = null;
    }

    // Snapshot, then clear: a listener that subscribes during fan-out observes
    // the completed state and fires immediately instead of joining this round.
    const pending = [...listeners];
    listeners.clear();
    for (const listener of pending) {
      try {
        listener();
      } catch {
        // One failing subscriber must not hide completion from the others.
      }
    }
  };

  timeoutId = timers.setTimeout(() => {
    timeoutId = null;
    if (!disposed) settle('app');
  }, BOOT_CONTENT_TIMEOUT_MS);

  return {
    complete(owner) {
      if (completed || disposed) return;
      settle(owner);
    },
    get completed() {
      return completed;
    },
    get owner() {
      return winner;
    },
    subscribe(listener) {
      if (disposed) return () => {};
      if (completed) {
        listener();
        return () => {};
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      if (timeoutId !== null) {
        timers.clearTimeout(timeoutId);
        timeoutId = null;
      }
    },
  };
}
