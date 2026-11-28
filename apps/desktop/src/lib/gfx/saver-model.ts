export const SAVERS = [
  'None',
  'Starfield',
  'Mystify',
  'Flying Windows',
  'Pipes',
  'Marquee',
  'P(DOOM).SCR',
] as const;
export type Saver = (typeof SAVERS)[number];
export interface SaverPoint {
  x: number;
  y: number;
}
const wrap = (value: number, limit: number) => ((value % limit) + limit) % limit;
/** Triangle wave reflection keeps every frame on the integer pixel grid. */
export function bounce(position: number, speed: number, seconds: number, limit: number): number {
  if (limit <= 0) return 0;
  const phase = wrap(position + speed * seconds, limit * 2);
  return Math.round(phase > limit ? limit * 2 - phase : phase);
}
export function saverPoints(
  seconds: number,
  count: number,
  width: number,
  height: number,
  reduced = false,
): SaverPoint[] {
  const t = reduced ? 0 : Math.max(0, seconds);
  return Array.from({ length: count }, (_, i) => ({
    x: bounce(i * i * 137 + i * 83 + 17, 19 + (i % 7) * 9, t, width - 1),
    y: bounce(i * i * 31 + i * 47 + 23, 13 + (i % 5) * 7, t, height - 1),
  }));
}
export function starPoint(
  index: number,
  seconds: number,
  width: number,
  height: number,
): SaverPoint & { size: number } {
  const depth = 1 - wrap(seconds * 0.16 + index * 0.173, 1);
  const angle = index * 2.399963;
  const distance = 0.03 + (1 - depth) ** 2 * 0.72;
  return {
    x: Math.round(width / 2 + Math.cos(angle) * width * distance),
    y: Math.round(height / 2 + Math.sin(angle) * height * distance),
    size: depth < 0.2 ? 3 : depth < 0.5 ? 2 : 1,
  };
}
/** Idle wake input is consumed by the host before any application sees it. */
export function createSaverIdle() {
  let last = 0;
  let active = false;
  let started = 0;
  return {
    preview(now: number) {
      active = true;
      started = now;
    },
    frame(now: number, input: boolean, waitSeconds: number, allowed = true) {
      let consumed = false;
      if (input) {
        consumed = active;
        active = false;
        last = now;
      }
      if (!allowed) {
        active = false;
        last = now;
      }
      if (!active && allowed && !input && now - last >= waitSeconds) {
        active = true;
        started = now;
      }
      return { active, elapsed: now - started, consumed };
    },
  };
}
