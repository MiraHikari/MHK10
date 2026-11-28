export type FullpageTransitionPhase = 'idle' | 'exit' | 'bridge' | 'enter';

export const wheelThreshold = 80;
export const wheelResetMs = 200;
export const touchDistanceThreshold = 120;
export const touchTimeThreshold = 400;

export function delay(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve(true);
    }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
