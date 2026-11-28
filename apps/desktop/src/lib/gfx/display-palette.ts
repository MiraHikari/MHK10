import type { DrawingTarget } from './context';
import type { Theme } from './palette';

/** Quantize the composed raster, including sprites and screensavers, for the Phosphor theme. */
export function applyDisplayPalette(target: DrawingTarget, theme: Readonly<Theme>): void {
  if (theme.cursorSet !== 'phosphor') return;
  const context = target.getCtx(),
    { width, height } = context.canvas;
  const pixels = context.getImageData(0, 0, width, height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const value = Math.max(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]);
    pixels.data[i] = pixels.data[i + 2] = value > 32 && value <= 160 ? 128 : 0;
    pixels.data[i + 1] = value > 160 ? 255 : value > 32 ? 128 : 0;
  }
  context.putImageData(pixels, 0, 0);
}
