/**
 * Time-of-day atmosphere.
 *
 * The same section reads slightly differently in the morning than at midnight:
 * the veil tint is nudged in OKLCh so hue and chroma shift while the section's
 * identity colour stays recognisable.
 */

import { rotateHue, saturate, shade } from '@/lib/palette';

export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';

interface PhaseNudge {
  /** OKLCh hue rotation in degrees. */
  readonly hue: number;
  /** Chroma multiplier. */
  readonly chroma: number;
  /** Lightness offset passed to `shade`. */
  readonly lightness: number;
}

const PHASE_NUDGES: Record<DayPhase, PhaseNudge> = {
  dawn: { hue: 14, chroma: 0.94, lightness: 0.05 },
  day: { hue: 0, chroma: 1, lightness: 0 },
  dusk: { hue: -18, chroma: 1.12, lightness: 0.02 },
  night: { hue: 6, chroma: 0.9, lightness: -0.06 },
};

export function currentDayPhase(date: Date = new Date()): DayPhase {
  const hour = date.getHours();
  if (hour >= 5 && hour < 9) return 'dawn';
  if (hour >= 9 && hour < 17) return 'day';
  if (hour >= 17 && hour < 21) return 'dusk';
  return 'night';
}

/** Apply a day-phase nudge to a section's veil tint. */
export function tintForPhase(hex: string, phase: DayPhase): string {
  const nudge = PHASE_NUDGES[phase];
  if (phase === 'day') return hex;
  const rotated = rotateHue(hex, nudge.hue);
  const chromaAdjusted = nudge.chroma === 1 ? rotated : saturate(rotated, nudge.chroma);
  return nudge.lightness === 0 ? chromaAdjusted : shade(chromaAdjusted, nudge.lightness);
}
