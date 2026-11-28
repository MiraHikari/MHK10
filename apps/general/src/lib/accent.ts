import { lightnessOf, parseHex, shade, srgbToLinear } from '@/lib/palette';

export interface DerivedAccent {
  readonly base: string;
  readonly ink: string;
  readonly on: string;
}

const RELATIVE_LUMINANCE = ([r, g, b]: readonly [number, number, number]) =>
  0.2126 * r + 0.7152 * g + 0.0722 * b;

/** WCAG 2.x contrast ratio between two CSS hex colours. */
export function contrastRatio(fg: string, bg: string): number {
  const L1 = RELATIVE_LUMINANCE(srgbToLinear(parseHex(fg)));
  const L2 = RELATIVE_LUMINANCE(srgbToLinear(parseHex(bg)));
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

const INK_FLOOR_DARK = 0.68;
const INK_CEIL_LIGHT = 0.46;
const STEP = 0.06;
const MAX_STEPS = 24;

function pushInk(start: string, isDark: boolean): string {
  let hex = start;
  for (let i = 0; i < MAX_STEPS; i += 1) {
    const l = lightnessOf(hex);
    if (isDark && l >= INK_FLOOR_DARK) return hex;
    if (!isDark && l <= INK_CEIL_LIGHT) return hex;
    hex = shade(hex, isDark ? STEP : -STEP);
  }
  return hex;
}

export function deriveAccent(accent: string, accentSoft: string, isDark: boolean): DerivedAccent {
  const base = accent;
  const ink = pushInk(isDark ? accentSoft : accent, isDark);
  const on = lightnessOf(base) > 0.62 ? '#0A0A0A' : '#FFFFFF';
  return { base, ink, on };
}
