import { describe, expect, it } from 'vite-plus/test';
import { C } from '../../gfx/palette';
import {
  DEFAULT_IMAGE_ADJUSTMENTS,
  applyImageAdjustments,
  applyImagePalette,
  imageTransformGeometry,
  normalizeImageAdjustments,
  planImageCopy,
} from './image-processing-model';

const identity = { rotation: 0, flipX: false, flipY: false };

describe('image copy geometry', () => {
  it('uses integer source-axis flips followed by quarter turns for a 2 by 3 image', () => {
    expect(imageTransformGeometry(2, 3, identity)).toEqual({
      width: 2,
      height: 3,
      matrix: [1, 0, -0, 1, 0, 0],
    });
    const clockwise = imageTransformGeometry(2, 3, { ...identity, rotation: 90 });
    expect(clockwise).toEqual({ width: 3, height: 2, matrix: [0, 1, -1, 0, 3, 0] });
    const flipped = imageTransformGeometry(2, 3, { ...identity, rotation: 90, flipX: true });
    const [a, b, c, d, e, f] = flipped.matrix;
    const point = (x: number, y: number) => [a * x + c * y + e, b * x + d * y + f];
    expect(point(0.5, 0.5)).toEqual([2.5, 1.5]);
    expect(point(1.5, 2.5)).toEqual([0.5, 0.5]);
    for (const rotation of [0, 90, 180, 270])
      for (const flipX of [false, true])
        for (const flipY of [false, true]) {
          const geometry = imageTransformGeometry(2, 3, { rotation, flipX, flipY });
          expect(geometry.matrix.every(Number.isInteger)).toBe(true);
          expect(geometry.width * geometry.height).toBe(6);
        }
  });

  it('limits output pixels and longest edge without enlarging a source', () => {
    expect(planImageCopy(2, 3, identity)).toMatchObject({
      width: 2,
      height: 3,
      drawWidth: 2,
      drawHeight: 3,
      scaled: false,
    });
    const portrait = planImageCopy(6000, 8000, { ...identity, rotation: 90 });
    expect(portrait.width * portrait.height).toBeLessThanOrEqual(8_000_000);
    expect(Math.max(portrait.width, portrait.height)).toBeLessThanOrEqual(4096);
    expect(portrait.drawWidth / portrait.drawHeight).toBeCloseTo(0.75, 3);
    expect(portrait.scaled).toBe(true);
    expect(planImageCopy(9000, 100, identity)).toMatchObject({ width: 4096, height: 45 });
    expect(planImageCopy(100, 100, identity, { maxPixels: 100 })).toMatchObject({
      width: 10,
      height: 10,
    });
    expect(planImageCopy(10000, 1, identity, { maxPixels: 4 })).toMatchObject({
      width: 4,
      height: 1,
    });
    expect(planImageCopy(1, 10000, identity, { maxPixels: 4 })).toMatchObject({
      width: 1,
      height: 4,
    });
  });

  it('rejects invalid dimensions and allocation budgets before rendering', () => {
    for (const dimension of [0, -1, NaN, Infinity, 1.5]) {
      expect(() => planImageCopy(dimension, 3, identity)).toThrow(RangeError);
      expect(() => planImageCopy(2, dimension, identity)).toThrow(RangeError);
    }
    expect(() => planImageCopy(2, 3, identity, { maxPixels: 0 })).toThrow(RangeError);
    expect(() => planImageCopy(2, 3, identity, { maxEdge: Infinity })).toThrow(RangeError);
  });
});

describe('image colour adjustments', () => {
  it('keeps identity bytes and transparency unchanged', () => {
    const pixels = new Uint8ClampedArray([45, 89, 127, 128, 12, 34, 56, 0]);
    const original = pixels.slice();
    applyImageAdjustments(pixels, DEFAULT_IMAGE_ADJUSTMENTS);
    expect(pixels).toEqual(original);
    applyImageAdjustments(pixels, { brightness: 20, contrast: 100, saturation: 100 });
    expect([...pixels]).toEqual([96, 140, 178, 128, 12, 34, 56, 0]);
  });

  it('produces known grayscale and contrast values instead of changing alpha', () => {
    const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 255]);
    applyImageAdjustments(pixels, { brightness: 0, contrast: 100, saturation: 0 });
    expect([...pixels]).toEqual([54, 54, 54, 255, 182, 182, 182, 128, 18, 18, 18, 255]);
    const neutral = new Uint8ClampedArray([0, 255, 64, 90]);
    applyImageAdjustments(neutral, { brightness: 0, contrast: 0, saturation: 100 });
    expect([...neutral]).toEqual([128, 128, 128, 90]);
  });

  it('bounds control values and preserves unknown values at their current setting', () => {
    expect(normalizeImageAdjustments({ brightness: 300, contrast: -1, saturation: 100.6 })).toEqual(
      {
        brightness: 100,
        contrast: 0,
        saturation: 101,
      },
    );
    expect(
      normalizeImageAdjustments(
        { brightness: NaN },
        { brightness: 12, contrast: 90, saturation: 70 },
      ),
    ).toEqual({
      brightness: 12,
      contrast: 90,
      saturation: 70,
    });
    expect(() =>
      applyImageAdjustments(new Uint8ClampedArray(3), DEFAULT_IMAGE_ADJUSTMENTS),
    ).toThrow(RangeError);
  });

  it('keeps the optional pixel preview within its existing 16-colour palette', () => {
    const pixels = new Uint8ClampedArray([33, 99, 201, 255, 45, 78, 34, 120]);
    applyImagePalette(pixels, 2);
    for (let i = 0; i < pixels.length; i += 4)
      expect(pixels.slice(i, i + 3).every((channel) => [0, 128, 192, 255].includes(channel))).toBe(
        true,
      );
    expect(pixels[3]).toBe(255);
    expect(pixels[7]).toBe(120);
    expect([...pixels]).toEqual([0, 128, 128, 255, 0, 128, 0, 120]);
    const colours = [...new Set(Object.values(C))];
    expect(colours).toHaveLength(16);
    const palettePixels = new Uint8ClampedArray(
      colours.flatMap((colour) => {
        const rgb = Number.parseInt(colour.slice(1), 16);
        return [rgb >> 16, (rgb >> 8) & 255, rgb & 255, 255];
      }),
    );
    const unchanged = palettePixels.slice();
    applyImagePalette(palettePixels, 4);
    expect(palettePixels).toEqual(unchanged);
  });
});
