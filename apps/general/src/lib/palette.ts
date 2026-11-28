/**
 * Perceptual colour helpers built on OKLab / OKLCh.
 *
 * Section theming interpolates between saturated hues (blue → ochre → teal).
 * Doing that in sRGB drags the midpoint through grey, so every mix, shade and
 * hue rotation here round-trips through OKLab where lightness and chroma stay
 * perceptually independent.
 *
 * Conversion matrices follow Björn Ottosson's OKLab reference implementation.
 */

export interface Oklab {
  /** Perceptual lightness, 0 (black) – 1 (white). */
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

/** Linear-light RGB triple, each channel 0–1 (may exceed the sRGB gamut). */
export type LinearRgb = readonly [number, number, number];

/** Gamma-encoded sRGB triple, each channel 0–1 and gamut-clamped. */
export type Rgb01 = readonly [number, number, number];

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

function clamp01(value: number) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function srgbToLinearChannel(channel: number) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function linearToSrgbChannel(channel: number) {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

/** Parse `#rgb` / `#rrggbb` into gamma-encoded channels. Falls back to black. */
export function parseHex(hex: string): Rgb01 {
  const match = HEX_PATTERN.exec(hex.trim());
  if (!match) return [0, 0, 0];
  const digits = match[1];
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : digits;
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ];
}

export function toHex(rgb: Rgb01): string {
  const channel = (value: number) =>
    Math.round(clamp01(value) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(rgb[0])}${channel(rgb[1])}${channel(rgb[2])}`;
}

export function srgbToLinear(rgb: Rgb01): LinearRgb {
  return [srgbToLinearChannel(rgb[0]), srgbToLinearChannel(rgb[1]), srgbToLinearChannel(rgb[2])];
}

export function linearToSrgb(rgb: LinearRgb): Rgb01 {
  return [
    clamp01(linearToSrgbChannel(rgb[0])),
    clamp01(linearToSrgbChannel(rgb[1])),
    clamp01(linearToSrgbChannel(rgb[2])),
  ];
}

export function linearToOklab([r, g, b]: LinearRgb): Oklab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function oklabToLinear({ l, a, b }: Oklab): LinearRgb {
  const lCube = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mCube = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sCube = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube,
    -1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube,
    -0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube,
  ];
}

export function hexToOklab(hex: string): Oklab {
  return linearToOklab(srgbToLinear(parseHex(hex)));
}

export function oklabToRgb01(lab: Oklab): Rgb01 {
  return linearToSrgb(oklabToLinear(lab));
}

export function oklabToHex(lab: Oklab): string {
  return toHex(oklabToRgb01(lab));
}

export function mixOklab(from: Oklab, to: Oklab, t: number): Oklab {
  return {
    l: from.l + (to.l - from.l) * t,
    a: from.a + (to.a - from.a) * t,
    b: from.b + (to.b - from.b) * t,
  };
}

/** Perceptual blend of two CSS hex colours. `t = 0` returns `from`. */
export function mixHex(from: string, to: string, t: number): string {
  return oklabToHex(mixOklab(hexToOklab(from), hexToOklab(to), t));
}

/**
 * Shift lightness while holding hue and chroma.
 * `amount > 0` lightens toward white, `amount < 0` darkens toward black.
 */
export function shade(hex: string, amount: number): string {
  const lab = hexToOklab(hex);
  const target = amount >= 0 ? 1 : 0;
  const t = Math.abs(amount);
  return oklabToHex({
    l: lab.l + (target - lab.l) * t,
    // Chroma naturally collapses near the extremes; taper it so pushed colours
    // do not clip outside the sRGB gamut and turn muddy.
    a: lab.a * (1 - t * 0.35),
    b: lab.b * (1 - t * 0.35),
  });
}

/** Scale chroma (0 = greyscale, 1 = unchanged, >1 = more saturated). */
export function saturate(hex: string, factor: number): string {
  const lab = hexToOklab(hex);
  return oklabToHex({ l: lab.l, a: lab.a * factor, b: lab.b * factor });
}

/** Rotate hue by `degrees` in the OKLCh plane. */
export function rotateHue(hex: string, degrees: number): string {
  const { l, a, b } = hexToOklab(hex);
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return oklabToHex({ l, a: a * cos - b * sin, b: a * sin + b * cos });
}

/** `rgba()` string for a hex colour — for gradient stops and glows. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  const channel = (value: number) => Math.round(clamp01(value) * 255);
  return `rgba(${channel(r)}, ${channel(g)}, ${channel(b)}, ${clamp01(alpha)})`;
}

/** OKLab lightness of a colour — used to pick readable foregrounds. */
export function lightnessOf(hex: string): number {
  return hexToOklab(hex).l;
}
