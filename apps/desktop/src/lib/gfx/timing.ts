/** Seconds on the desktop clock. Motion consumers receive the host's live preference. */
export const TIMING = {
  tick: 0.09,
  blink: 0.35,
  open: 0.18,
  sweep: 0.6,
  scene: 1.5,
  tooltip: 0.5,
  splash: 2.76,
} as const;
export const motionTime = (seconds: number, reducedMotion = false): number =>
  reducedMotion ? 0 : seconds;

/** A tooltip is tied to a target, not merely to the last pointer movement. */
export function createTooltipDelay() {
  let target: string | null = null;
  let since = 0;
  return {
    visible(id: string | null, now: number): boolean {
      if (id !== target) {
        target = id;
        since = now;
      }
      return id !== null && now - since >= TIMING.tooltip;
    },
  };
}
