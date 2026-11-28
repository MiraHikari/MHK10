import { describe, expect, it } from 'vite-plus/test';
import { BITMAP_FONTS, bitmapGlyph } from './bitmap-font';

describe('original 11px FontStruct glyphs', () => {
  it('retains regular H stems and crossbar as exact source pixels', () => {
    expect(bitmapGlyph('H', 'ui')).toEqual({
      advance: 7,
      x: 0,
      y: -9,
      rows: [
        0b100001, 0b100001, 0b100001, 0b100001, 0b111111, 0b100001, 0b100001, 0b100001, 0b100001,
      ],
    });
  });

  it('retains a separated i dot and the two-pixel bold stems', () => {
    expect(bitmapGlyph('i', 'ui')?.rows).toEqual([1, 0, 0, 1, 1, 1, 1, 1, 1]);
    expect(bitmapGlyph('H', 'bold')?.rows).toEqual([99, 99, 99, 99, 127, 99, 99, 99, 99]);
  });

  it('keeps glyph ink inside its integer advance, leaving a clear gap between letters', () => {
    for (const font of Object.values(BITMAP_FONTS))
      for (const glyph of Object.values(font)) {
        expect(Number.isInteger(glyph.advance)).toBe(true);
        for (const row of glyph.rows) {
          const inkWidth = row ? Math.floor(Math.log2(row)) + 1 : 0;
          expect(glyph.x + inkWidth).toBeLessThan(glyph.advance);
        }
      }
  });

  it('uses original regular punctuation when the bold source omits it', () => {
    expect(bitmapGlyph('.', 'bold')).toBe(BITMAP_FONTS.ui[46]);
    expect(bitmapGlyph('中', 'ui')).toBeUndefined();
    expect(bitmapGlyph('H', 'dos')).toBeUndefined();
  });
});
