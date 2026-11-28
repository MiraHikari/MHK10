import { VGA_COLORS } from '../../gfx/palette';

export interface ImageAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
}

export const DEFAULT_IMAGE_ADJUSTMENTS: Readonly<ImageAdjustments> = {
  brightness: 0,
  contrast: 100,
  saturation: 100,
};

export interface ImageTransform {
  rotation: number;
  flipX: boolean;
  flipY: boolean;
}
export interface ImageEdit extends ImageTransform {
  adjustments: Readonly<ImageAdjustments>;
}
export interface ImageCopyLimits {
  maxPixels?: number;
  maxEdge?: number;
}
export interface ImageGeometry {
  width: number;
  height: number;
  matrix: readonly [number, number, number, number, number, number];
}
export interface ImageCopyPlan extends ImageGeometry {
  drawWidth: number;
  drawHeight: number;
  scaled: boolean;
}

export function normalizeImageAdjustments(
  patch: Partial<ImageAdjustments>,
  current: Readonly<ImageAdjustments> = DEFAULT_IMAGE_ADJUSTMENTS,
): ImageAdjustments {
  const value = (key: keyof ImageAdjustments, minimum: number) => {
    const candidate = patch[key];
    return candidate !== undefined && Number.isFinite(candidate)
      ? Math.max(minimum, Math.min(key === 'brightness' ? 100 : 200, Math.round(candidate)))
      : current[key];
  };
  return {
    brightness: value('brightness', -100),
    contrast: value('contrast', 0),
    saturation: value('saturation', 0),
  };
}

export function hasImageAdjustments(adjustments: Readonly<ImageAdjustments>): boolean {
  return (
    adjustments.brightness !== 0 || adjustments.contrast !== 100 || adjustments.saturation !== 100
  );
}

function dimension(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError('Invalid image dimensions.');
}

/** The same source-axis flips followed by rotation used by the image viewer. */
export function imageTransformGeometry(
  width: number,
  height: number,
  transform: ImageTransform,
): ImageGeometry {
  dimension(width);
  dimension(height);
  if (!Number.isFinite(transform.rotation)) throw new RangeError('Invalid image rotation.');
  const turn = ((Math.round(transform.rotation / 90) % 4) + 4) % 4;
  const cosine = [1, 0, -1, 0][turn];
  const sine = [0, 1, 0, -1][turn];
  const a = cosine * (transform.flipX ? -1 : 1);
  const b = sine * (transform.flipX ? -1 : 1);
  const c = -sine * (transform.flipY ? -1 : 1);
  const d = cosine * (transform.flipY ? -1 : 1);
  const outputWidth = turn % 2 ? height : width;
  const outputHeight = turn % 2 ? width : height;
  return {
    width: outputWidth,
    height: outputHeight,
    matrix: [
      a,
      b,
      c,
      d,
      (outputWidth - a * width - c * height) / 2,
      (outputHeight - b * width - d * height) / 2,
    ],
  };
}

export function planImageCopy(
  width: number,
  height: number,
  transform: ImageTransform,
  limits: ImageCopyLimits = {},
): ImageCopyPlan {
  dimension(width);
  dimension(height);
  const maxPixels = limits.maxPixels ?? 8_000_000;
  const maxEdge = limits.maxEdge ?? 4096;
  dimension(maxPixels);
  dimension(maxEdge);
  const scale = Math.min(
    1,
    Math.sqrt(maxPixels / width / height),
    maxEdge / Math.max(width, height),
  );
  let drawWidth = Math.max(1, Math.floor(width * scale));
  let drawHeight = Math.max(1, Math.floor(height * scale));
  // A minimum one-pixel edge must not defeat a smaller caller-supplied pixel budget.
  if (drawWidth * drawHeight > maxPixels) {
    if (drawWidth >= drawHeight) drawWidth = Math.max(1, Math.floor(maxPixels / drawHeight));
    else drawHeight = Math.max(1, Math.floor(maxPixels / drawWidth));
  }
  return {
    ...imageTransformGeometry(drawWidth, drawHeight, transform),
    drawWidth,
    drawHeight,
    scaled: drawWidth !== width || drawHeight !== height,
  };
}

/** Edits the caller's RGBA buffer; transparent pixels and the alpha channel stay intact. */
export function applyImageAdjustments(
  pixels: Uint8ClampedArray,
  settings: Readonly<ImageAdjustments>,
): void {
  if (pixels.length % 4) throw new RangeError('Expected complete RGBA pixels.');
  const adjustment = normalizeImageAdjustments(settings);
  if (!hasImageAdjustments(adjustment)) return;
  const contrast = adjustment.contrast / 100;
  const saturation = adjustment.saturation / 100;
  const brightness = adjustment.brightness * 2.55;
  const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;
    const red = (pixels[index] - 127.5) * contrast + 127.5 + brightness;
    const green = (pixels[index + 1] - 127.5) * contrast + 127.5 + brightness;
    const blue = (pixels[index + 2] - 127.5) * contrast + 127.5 + brightness;
    const light = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    pixels[index] = channel(light + (red - light) * saturation);
    pixels[index + 1] = channel(light + (green - light) * saturation);
    pixels[index + 2] = channel(light + (blue - light) * saturation);
  }
}

const VGA = VGA_COLORS.map((colour) => Number.parseInt(colour.slice(1), 16));
const DITHER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** The optional 16-colour display mode never changes an exported full-colour copy. */
export function applyImagePalette(pixels: Uint8ClampedArray, width: number): void {
  dimension(width);
  if (pixels.length % (width * 4)) throw new RangeError('Expected complete image rows.');
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;
    const pixel = index / 4;
    const offset = (DITHER[(Math.floor(pixel / width) % 4) * 4 + ((pixel % width) % 4)] - 7.5) * 3;
    let best = 0;
    let distance = Infinity;
    for (const colour of VGA) {
      const red = pixels[index] + offset - (colour >> 16);
      const green = pixels[index + 1] + offset - ((colour >> 8) & 255);
      const blue = pixels[index + 2] + offset - (colour & 255);
      const candidate = red * red + green * green + blue * blue;
      if (candidate < distance) {
        best = colour;
        distance = candidate;
      }
    }
    pixels[index] = best >> 16;
    pixels[index + 1] = (best >> 8) & 255;
    pixels[index + 2] = best & 255;
  }
}
