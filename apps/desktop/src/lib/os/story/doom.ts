// doom.ts: the P(doom) meter and the doomsday clock — pure logic, no drawing.
// In the video these climb with the song; here the user hammers the up-arrow and
// the story of the song plays out as thresholds are crossed.

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

/** P(doom) after crossing each story beat. The user can only go up (this is the joke). */
export const PD_STEPS = [5, 34, 61, 86, 99.9];

export interface DoomState {
  /** exact value 0..100 */
  v: number;
  /** crossed thresholds already fired (indexes into PD_STEPS) */
  fired: Set<number>;
}

export const createDoom = (): DoomState => ({ v: PD_STEPS[0], fired: new Set() });

/** A click of the up-arrow. ~20 clicks carry the whole story; hold-to-repeat makes it a choice. */
export const UP_STEP = 5.5;

export function doomUp(d: DoomState, times = 1): void {
  d.v = clamp(d.v + UP_STEP * times, 0, 99.9);
}

/** Down works only before the first threshold; after that the parameter is managed by AGI.EXE. */
export function doomDown(d: DoomState): boolean {
  if (d.v >= PD_STEPS[1]) return false;
  d.v = clamp(d.v - UP_STEP, PD_STEPS[0], 100);
  return true;
}

export const pdoomText = (v: number): string =>
  (v > 99 ? v.toFixed(1) : String(Math.round(v))) + '%';
export const pdoomColor = (v: number): string =>
  v >= 80 ? '#ff0000' : v >= 50 ? '#800000' : '#000080';

/** Real local minutes drift along the shortest path to midnight as authority transfers. */
export function systemClock(
  v: number,
  localMinutes: number,
  options: { hour24?: boolean; seconds?: number } = {},
): string {
  const actual = ((Math.floor(localMinutes) % 1440) + 1440) % 1440;
  let minutes = actual;
  if (v >= 99.9) minutes = 0;
  else if (v >= 61) minutes = 1437 + Math.min(2, Math.floor((v - 61) / 13));
  else if (v >= 34) {
    const weight = (v - 34) / 27;
    const distance = ((1437 - actual + 2160) % 1440) - 720;
    minutes = ((Math.round(actual + distance * weight) % 1440) + 1440) % 1440;
  }
  const hour = Math.floor(minutes / 60),
    minute = minutes % 60;
  const seconds =
    options.seconds === undefined
      ? ''
      : ':' +
        String(v >= 99.9 ? 0 : Math.max(0, Math.min(59, Math.floor(options.seconds)))).padStart(
          2,
          '0',
        );
  return options.hour24
    ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}${seconds}`
    : `${hour % 12 || 12}:${String(minute).padStart(2, '0')}${seconds} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** Assistant mood from P(doom). */
export const doomMood = (v: number): 'happy' | 'sparks' | 'evil' =>
  v >= PD_STEPS[3] - 1e-9 ? 'evil' : v >= PD_STEPS[1] ? 'sparks' : 'happy';
