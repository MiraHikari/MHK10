export const WALLPAPERS = ['Solid colour', 'Blueprint', 'Neon skyline', 'My picture'] as const;
import type { RendererCore } from './context';
import { C, VGA_COLORS } from './palette';
import { TASKBAR_HEIGHT } from './display-metrics';
import { createPrimitives } from './primitives';

export type Wallpaper = 0 | 1 | 2 | 3;

type WallpaperTarget = Pick<RendererCore, 'rect' | 'line'>;

export function createWallpaper(
  draw: Pick<RendererCore, 'W' | 'H' | 'rect' | 'line' | 'getCtx' | 'createCanvas'>,
) {
  let current: Wallpaper = 0;
  let picture: { width: number; height: number; pixels: readonly number[] } | undefined;
  let pictureRevision = 0;
  /** Cached desktop-sized wallpaper; see drawDesktopWallpaper(). */
  let desktopCache: { key: string; canvas: HTMLCanvasElement } | null = null;

  const getWallpaper = (): Wallpaper => current;
  function setWallpaper(value: Wallpaper): void {
    current = value;
  }
  function setPixelWallpaper(bitmap: {
    width: number;
    height: number;
    pixels: readonly number[];
  }): void {
    picture = { ...bitmap, pixels: [...bitmap.pixels] };
    pictureRevision++;
  }

  /** Static VGA scenery: no glow filters, gradients or fractional pixel geometry. */
  function paint(
    target: WallpaperTarget,
    x: number,
    y: number,
    w: number,
    h: number,
    mode: Wallpaper,
  ): void {
    const { rect, line } = target;
    if (!mode) return;
    if (mode === 3) {
      if (!picture) return;
      const palette = VGA_COLORS;
      const scale = Math.max(1, Math.floor(Math.min(w / picture.width, h / picture.height)));
      const left = x + Math.floor((w - picture.width * scale) / 2),
        top = y + Math.floor((h - picture.height * scale) / 2);
      for (let py = 0; py < picture.height; py++)
        for (let px = 0; px < picture.width; px++)
          rect(
            left + px * scale,
            top + py * scale,
            scale,
            scale,
            palette[picture.pixels[py * picture.width + px]],
          );
      return;
    }
    const sx = (n: number) => x + Math.round((n * w) / 640);
    const sy = (n: number) => y + Math.round((n * h) / 338);
    const box = (a: number, b: number, cw: number, ch: number, color: string) =>
      rect(
        sx(a),
        sy(b),
        Math.max(1, Math.round((cw * w) / 640)),
        Math.max(1, Math.round((ch * h) / 338)),
        color,
      );
    rect(x, y, w, h, C.navy);
    if (mode === 1) {
      for (let gx = 0; gx < 640; gx += 32) line(sx(gx), y, sx(gx), y + h - 1, C.blue);
      for (let gy = 0; gy < 338; gy += 32) line(x, sy(gy), x + w - 1, sy(gy), C.blue);
      for (let i = 0; i < 8; i++) {
        const bx = 180 + i * 44,
          by = 82 + (i % 3) * 36;
        box(bx, by, 28, 2, C.aqua);
        box(bx, by, 2, 40, C.aqua);
        box(bx, by + 38, 28, 2, C.aqua);
        box(bx + 28, by + 18, 17, 2, C.gray);
      }
      return;
    }
    for (let i = 0; i < 44; i++)
      box((i * 97 + 29) % 640, (i * 43 + 17) % 200, 1, 1, i % 3 ? C.gray : C.aqua);
    // Dithered, striped sunset and a silhouette built from hard-edged blocks.
    for (let row = -35; row <= 35; row++) {
      const half = Math.round(Math.sqrt(35 * 35 - row * row));
      if (row < 0 || row % 5 < 3)
        box(453 - half, 122 + row, half * 2 + 1, 1, row < 0 ? C.fuchsia : C.red);
    }
    for (let i = 0; i < 19; i++) {
      const bx = i * 37,
        top = 179 + ((i * 29) % 89);
      box(bx, top, 31, 338 - top, C.black);
      box(bx + 1, top, 29, 1, i % 3 ? C.blue : C.fuchsia);
      for (let wy = top + 9; wy < 315; wy += 13)
        for (let wx = 5; wx < 28; wx += 9)
          if ((wy + wx + i) % 4) box(bx + wx, wy, 3, 4, i % 2 ? C.aqua : C.blue);
    }
    box(0, 318, 640, 20, C.black);
    for (let i = 0; i < 8; i++) line(sx(320), sy(282), sx(i * 100 - 20), sy(338), C.fuchsia);
    box(0, 320, 640, 1, C.aqua);
  }

  function drawWallpaper(x: number, y: number, w: number, h: number, mode: Wallpaper): void {
    paint(draw, x, y, w, h, mode);
  }

  /**
   * 桌面壁纸是一个确定性静态层，但每次重画都是几百到 6.4 万次 fillRect。
   * 按 (尺寸, 模式, 图片版本) 缓存成一张离屏画布，逐帧只剩一次 drawImage。
   */
  function cachedDesktopWallpaper(mode: Wallpaper): HTMLCanvasElement | null {
    if (!mode) return null;
    // A custom wallpaper without a picture paints nothing; blitting an empty
    // cache canvas would erase the layer beneath it instead.
    if (mode === 3 && !picture) return null;
    const w = draw.W;
    const h = draw.H - TASKBAR_HEIGHT;
    if (w < 1 || h < 1) return null;
    const key = `${w}x${h}:${mode}:${mode === 3 ? pictureRevision : 0}`;
    if (desktopCache?.key === key) return desktopCache.canvas;

    const canvas = draw.createCanvas();
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.imageSmoothingEnabled = false;
    const primitives = createPrimitives({
      getCtx: () => context,
      createCanvas: draw.createCanvas,
    });
    paint(primitives, 0, 0, w, h, mode);
    primitives.dispose();
    desktopCache = { key, canvas };
    return canvas;
  }

  function drawDesktopWallpaper(): void {
    const canvas = cachedDesktopWallpaper(getWallpaper());
    if (!canvas) return;
    const context = draw.getCtx();
    context.imageSmoothingEnabled = false;
    context.drawImage(canvas, 0, 0);
  }

  return {
    getWallpaper,
    setWallpaper,
    setPixelWallpaper,
    drawWallpaper,
    drawDesktopWallpaper,
    dispose() {
      picture = undefined;
      desktopCache = null;
    },
  };
}
export type WallpaperDrawing = ReturnType<typeof createWallpaper>;
