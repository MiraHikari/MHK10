import { afterAll, describe, expect, it, vi } from 'vite-plus/test';

const measureText = vi.fn(() => ({ width: 12 }));
const fillText = vi.fn();
const fontAssignments: string[] = [];
class RasterCanvas {
  width = 1;
  height = 1;
  pixels: Uint8ClampedArray = new Uint8ClampedArray();
  getContext() {
    return {
      set font(value: string) {
        fontAssignments.push(value);
      },
      measureText,
      fillText,
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: (image: { data: Uint8ClampedArray }) => {
        this.pixels = image.data;
      },
      getImageData: () => ({
        data: this.pixels.length
          ? this.pixels
          : new Uint8ClampedArray(this.width * this.height * 4),
      }),
    };
  }
}
vi.stubGlobal('document', {
  createElement: () => new RasterCanvas(),
  fonts: { addEventListener: vi.fn() },
});
const { createFontRasterizer } = await import('./text');
const { tw, textSource, fitText } = createFontRasterizer();
afterAll(() => vi.unstubAllGlobals());

describe('deterministic UI text rendering', () => {
  it('measures and draws source glyphs without consulting browser fonts', () => {
    measureText.mockClear();
    fillText.mockClear();
    expect(tw('Hi')).toBe(9);
    expect(tw('Hi', 'bold', 3)).toBe(33);
    const raster = textSource('Hi', 'ui') as unknown as RasterCanvas;
    expect(raster.width).toBe(11); // nine advance pixels plus the raster edge allowance
    const row = (y: number) =>
      Array.from({ length: 9 }, (_, x) =>
        raster.pixels[(y * raster.width + x) * 4 + 3] ? '#' : '.',
      ).join('');
    expect(row(6)).toBe('#....#.#.');
    expect(row(7)).toBe('#....#...');
    expect(row(10)).toBe('######.#.');
    expect(measureText).not.toHaveBeenCalled();
    expect(fillText).not.toHaveBeenCalled();
  });

  it('fits labels with the same integer advances used for drawing', () => {
    expect(fitText('HHHH', 20)).toBe('HH...');
    expect(tw(fitText('HHHH', 20))).toBe(20);
  });

  it('uses the licensed native 12px face only for missing glyphs in mixed UI text', () => {
    measureText.mockClear();
    fillText.mockClear();
    fontAssignments.length = 0;
    expect(tw('H中')).toBe(19);
    textSource('H中', 'ui');
    expect(measureText).toHaveBeenCalledOnce();
    expect(measureText).toHaveBeenCalledWith('中');
    expect(fillText).toHaveBeenCalledOnce();
    expect(fillText).toHaveBeenCalledWith('中', 56, 128);
    expect(fontAssignments).toContain('12px "MHK CJK", monospace');
    expect(fontAssignments).toContain('96px "MHK CJK", monospace');
    expect(
      fontAssignments.some((font) => font.includes('YaHei') || font.includes('bold 96px')),
    ).toBe(false);
  });

  it('keeps mixed Chinese punctuation on integer advances at every integer zoom', () => {
    const sample = '中文，MHK10。';
    expect(tw(sample, 'cjk')).toBe(Array.from(sample).length * 12);
    expect(tw(sample, 'cjk', 2)).toBe(tw(sample, 'cjk') * 2);
    expect(Array.from(fitText(sample, 48, 'cjk')).join('')).not.toContain('\ufffd');
  });

  it('evicts old large rasters by pixel cost while retaining frequently used controls', () => {
    const fonts = createFontRasterizer();
    const label = 'H'.repeat(2000);
    const oldest = fonts.textSource(label + '1', 'ui');
    const control = fonts.textSource('OK', 'ui');
    fonts.textSource(label + '2', 'ui');
    expect(fonts.textSource('OK', 'ui')).toBe(control);
    fonts.textSource(label + '3', 'ui');
    expect(fonts.textSource('OK', 'ui')).toBe(control);
    // Compare identity without asking the matcher to traverse equal raster pixels.
    expect(Object.is(fonts.textSource(label + '1', 'ui'), oldest)).toBe(false);
    fonts.dispose();
  });
});
