import { R } from './primitives';
import { bitmapGlyph } from './bitmap-font';

export type FontName = 'ui' | 'bold' | 'dos' | 'cjk';

export interface TextOpts {
  font?: FontName;
  color?: string;
  scale?: number;
  align?: 'left' | 'center' | 'right';
}
const FONT_DEFINITIONS = {
  ui: { css: '11px MSS, sans-serif', px: 11 },
  bold: { css: 'bold 11px MSS, sans-serif', px: 11 },
  dos: { css: '8px PS2P, monospace', px: 8 },
  cjk: { css: '12px "MHK CJK", monospace', px: 12 },
} as const;
export const fontCss: readonly string[] = Object.freeze(
  Object.values(FONT_DEFINITIONS).map((font) => font.css),
);
export function createFontRasterizer(
  createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas'),
) {
  const FONTS = {
    ui: { ...FONT_DEFINITIONS.ui, top: 0, cap: 11 },
    bold: { ...FONT_DEFINITIONS.bold, top: 0, cap: 11 },
    dos: { ...FONT_DEFINITIONS.dos, top: 0, cap: 8 },
    cjk: { ...FONT_DEFINITIONS.cjk, top: 0, cap: 12 },
  };

  let measurement: CanvasRenderingContext2D | undefined;
  const measure = () =>
    (measurement ??= createCanvas().getContext('2d', { willReadFrequently: true })!);
  let disposed = false;
  const assertActive = () => {
    if (disposed) throw new Error('Font rasterizer is disposed');
  };
  const _tc = new Map<string, HTMLCanvasElement>();
  const _advances = new Map<string, number>();
  // Bound retained pixels as well as entries: long labels cost much more than
  // short controls, and clocks/editing continuously generate fresh strings.
  const MAX_RASTER_PIXELS = 1024 * 1024;
  const MAX_RASTERS = 1024;
  let cachedPixels = 0;
  const clearRasters = () => {
    _tc.clear();
    cachedPixels = 0;
  };
  // Rasterize well above the font's native size to avoid platform-specific small
  // font hinting. Sampling the centre of each native pixel preserves its outline.
  const SAMPLE = 8;
  /** Changes whenever font rasters and baseline metrics are recalibrated. */
  let fontRevision = 0;

  const rgb = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];

  /** Missing UI glyphs share one native 12px source; synthetic 11px CJK bold blurs its grid. */
  function fallbackFont(char: string, font: FontName): FontName {
    return font === 'ui' ||
      font === 'bold' ||
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff00-\uffef]/u.test(
        char,
      )
      ? 'cjk'
      : font;
  }

  function advance(char: string, font: FontName): number {
    assertActive();
    const glyph = bitmapGlyph(char, font);
    if (glyph) return glyph.advance;
    const key = font + char;
    const cached = _advances.get(key);
    if (cached !== undefined) return cached;
    measure().font = FONTS[fallbackFont(char, font)].css;
    measure().fontKerning = 'none';
    const width = Math.round(measure().measureText(char).width);
    if (_advances.size >= 4096) _advances.delete(_advances.keys().next().value!);
    _advances.set(key, width);
    return width;
  }

  function textCanvas(str: string, font: FontName, color: string): HTMLCanvasElement {
    assertActive();
    const key = font + color + str;
    let c = _tc.get(key);
    if (c) {
      _tc.delete(key);
      _tc.set(key, c);
      return c;
    }
    const f = FONTS[font];
    const chars = Array.from(str);
    const w = Math.max(1, chars.reduce((sum, char) => sum + advance(char, font), 0) + 2),
      h = f.px * 2 + 8;
    c = createCanvas();
    c.width = w;
    c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    const d = g.createImageData(w, h),
      [r, gr, b] = rgb(color);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        d.data[i] = r;
        d.data[i + 1] = gr;
        d.data[i + 2] = b;
      }
    // Only glyphs absent from the original pixel fonts (e.g. CJK) use browser
    // rasterization. Known UI glyphs never pass through fillText or font hinting.
    if (chars.some((char) => !bitmapGlyph(char, font))) {
      const sample = createCanvas();
      sample.width = w * SAMPLE;
      sample.height = h * SAMPLE;
      const sg = sample.getContext('2d', { willReadFrequently: true })!;
      sg.textBaseline = 'alphabetic';
      sg.fillStyle = '#fff';
      sg.fontKerning = 'none';
      let x = 0;
      for (const char of chars) {
        if (!bitmapGlyph(char, font)) {
          const sourceFont = FONTS[fallbackFont(char, font)];
          sg.font = sourceFont.css.replace(`${sourceFont.px}px`, `${sourceFont.px * SAMPLE}px`);
          const baseline = Math.max(f.px, sourceFont.px) + 4;
          sg.fillText(char, x * SAMPLE, baseline * SAMPLE);
        }
        x += advance(char, font);
      }
      const source = sg.getImageData(0, 0, sample.width, sample.height).data;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const at = ((y * SAMPLE + SAMPLE / 2) * sample.width + x * SAMPLE + SAMPLE / 2) * 4;
          d.data[(y * w + x) * 4 + 3] = source[at + 3] >= 128 ? 255 : 0;
        }
    }
    let penX = 0;
    for (const char of chars) {
      const glyph = bitmapGlyph(char, font);
      if (glyph) {
        glyph.rows.forEach((row, index) => {
          const y = f.px + 4 + glyph.y + index;
          for (let bit = 0; row >>> bit; bit++) {
            const x = penX + glyph.x + bit;
            if (row & (1 << bit) && x >= 0 && x < w && y >= 0 && y < h)
              d.data[(y * w + x) * 4 + 3] = 255;
          }
        });
      }
      penX += advance(char, font);
    }
    g.putImageData(d, 0, 0);
    const pixels = w * h;
    if (pixels <= MAX_RASTER_PIXELS) {
      while (_tc.size && (cachedPixels + pixels > MAX_RASTER_PIXELS || _tc.size >= MAX_RASTERS)) {
        const oldest = _tc.keys().next().value!;
        const raster = _tc.get(oldest)!;
        cachedPixels -= raster.width * raster.height;
        _tc.delete(oldest);
      }
      _tc.set(key, c);
      cachedPixels += pixels;
    }
    return c;
  }

  /** Measure where capitals sit so text() can place them exactly. Call after the fonts load. */
  function initFonts(): void {
    if (disposed) return;
    // A late font load must never reuse rasters made with a fallback font.
    clearRasters();
    _advances.clear();
    for (const k of Object.keys(FONTS) as FontName[]) {
      const c = textCanvas(k === 'cjk' ? '国' : 'H', k, '#ffffff');
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let top = -1,
        bot = -1;
      for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++)
          if (d[(y * c.width + x) * 4 + 3]) {
            if (top < 0) top = y;
            bot = y;
          }
      FONTS[k].top = Math.max(0, top);
      FONTS[k].cap = top < 0 ? FONTS[k].px : bot - top + 1;
    }
    clearRasters();
    fontRevision++;
  }

  const tw = (str: string, font: FontName = 'ui', scale = 1): number => {
    return Array.from(str).reduce((sum, char) => sum + advance(char, font), 0) * scale;
  };
  /** Fit a label without cutting through a Unicode code point. */
  function fitText(str: string, width: number, font: FontName = 'ui', scale = 1): string {
    if (width <= 0) return '';
    if (tw(str, font, scale) <= width) return str;
    const suffix = '...';
    if (tw(suffix, font, scale) > width) return '';
    const chars = Array.from(str);
    let lo = 0,
      hi = chars.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (tw(chars.slice(0, mid).join('') + suffix, font, scale) <= width) lo = mid;
      else hi = mid - 1;
    }
    return chars.slice(0, lo).join('') + suffix;
  }
  const capH = (font: FontName = 'ui', scale = 1): number => FONTS[font].cap * scale;
  /** text(str, x, y, opts) -> width. align: 'left' | 'center' | 'right' around x. */
  function text(
    context: CanvasRenderingContext2D,
    defaultColor: string,
    str: string | number,
    x: number,
    y: number,
    o: TextOpts = {},
  ): number {
    str = String(str);
    const font = o.font || 'ui',
      s = o.scale || 1;
    const c = textCanvas(str, font, o.color || defaultColor),
      w = tw(str, font, s);
    const x0 = R(o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x);
    context.drawImage(c, x0, R(y) - FONTS[font].top * s, c.width * s, c.height * s);
    return w;
  }

  /** The white raster of a string, for effects that recolour it (WordArt). */
  function textSource(str: string, font: FontName = 'bold'): HTMLCanvasElement {
    return textCanvas(str, font, '#ffffff');
  }
  const fontTop = (font: FontName) => FONTS[font].top;
  const fontCap = (font: FontName) => FONTS[font].cap;
  return {
    initFonts,
    fontCss,
    get fontRevision() {
      return fontRevision;
    },
    tw,
    fitText,
    capH,
    text,
    textSource,
    fontTop,
    fontCap,
    dispose() {
      if (disposed) return;
      disposed = true;
      clearRasters();
      _advances.clear();
      measurement = undefined;
    },
  };
}
export type FontRasterizer = ReturnType<typeof createFontRasterizer>;
