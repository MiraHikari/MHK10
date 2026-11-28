/**
 * Idle scheduling for deferred, non-critical work (chunk preloading, image
 * prefetch, palette warm-up).
 *
 * `requestIdleCallback` runs the task only when the main thread has slack and
 * still guarantees a run inside `timeout`; browsers without it (Firefox) fall
 * back to a plain timer, matching the previous hand-rolled blocks.
 *
 * Returns a disposer that cancels a pending run. The task itself is not
 * cancelled once started — callers that need to abort in-flight work keep
 * their own flag (see `prefetchImagesOnIdle`).
 */
interface IdleOptions {
  /** Hard deadline: run even if the page never goes idle, in milliseconds. */
  readonly timeout: number;
  /** Timer delay used where `requestIdleCallback` is unavailable. */
  readonly fallbackDelay: number;
}

export function whenIdle(task: () => void, { timeout, fallbackDelay }: IdleOptions): () => void {
  if (typeof window === 'undefined') return () => {};

  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(task, { timeout });
    return () => window.cancelIdleCallback?.(id);
  }

  const id = window.setTimeout(task, fallbackDelay);
  return () => window.clearTimeout(id);
}
