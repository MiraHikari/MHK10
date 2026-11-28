import { describe, expect, it, vi } from 'vite-plus/test';
import { canvasFixture } from './canvas-fixture';
import { createWallpaper } from './wallpaper';

function wallpaperFixture() {
  const main = canvasFixture(640, 360);
  const surfaces: ReturnType<typeof canvasFixture>[] = [];
  const createCanvas = vi.fn(() => {
    const surface = canvasFixture(640, 360);
    surfaces.push(surface);
    return surface.canvas;
  });
  const wallpaper = createWallpaper({
    W: 640,
    H: 360,
    getCtx: () => main.context as unknown as CanvasRenderingContext2D,
    createCanvas,
    rect: vi.fn(),
    line: vi.fn(),
  });
  return { wallpaper, main, surfaces, createCanvas };
}

describe('desktop wallpaper layer', () => {
  it('rasterizes the scenery once and blits the cached layer afterwards', () => {
    const { wallpaper, main, surfaces, createCanvas } = wallpaperFixture();
    wallpaper.setWallpaper(1);

    wallpaper.drawDesktopWallpaper();
    const painted = surfaces[0].context.fillRect.mock.calls.length;
    expect(painted).toBeGreaterThan(0);

    wallpaper.drawDesktopWallpaper();
    expect(createCanvas).toHaveBeenCalledTimes(1);
    expect(surfaces[0].context.fillRect).toHaveBeenCalledTimes(painted);
    expect(main.context.drawImage).toHaveBeenCalledTimes(2);
    expect(main.context.drawImage).toHaveBeenCalledWith(surfaces[0].canvas, 0, 0);
  });

  it('rebuilds when the wallpaper mode or picture changes', () => {
    const { wallpaper, createCanvas } = wallpaperFixture();
    wallpaper.setWallpaper(1);
    wallpaper.drawDesktopWallpaper();
    wallpaper.drawDesktopWallpaper();
    expect(createCanvas).toHaveBeenCalledTimes(1);

    wallpaper.setWallpaper(2);
    wallpaper.drawDesktopWallpaper();
    expect(createCanvas).toHaveBeenCalledTimes(2);

    wallpaper.setWallpaper(3);
    wallpaper.setPixelWallpaper({ width: 2, height: 1, pixels: [1, 2] });
    wallpaper.drawDesktopWallpaper();
    wallpaper.drawDesktopWallpaper();
    expect(createCanvas).toHaveBeenCalledTimes(3);

    wallpaper.setPixelWallpaper({ width: 2, height: 1, pixels: [3, 4] });
    wallpaper.drawDesktopWallpaper();
    expect(createCanvas).toHaveBeenCalledTimes(4);
  });

  it('draws nothing for the solid colour mode', () => {
    const { wallpaper, main, createCanvas } = wallpaperFixture();
    wallpaper.setWallpaper(0);
    wallpaper.drawDesktopWallpaper();
    expect(createCanvas).not.toHaveBeenCalled();
    expect(main.context.drawImage).not.toHaveBeenCalled();
  });

  it('does not blit an empty layer when the custom picture is missing', () => {
    const { wallpaper, main, createCanvas } = wallpaperFixture();
    wallpaper.setWallpaper(3);
    wallpaper.drawDesktopWallpaper();
    expect(createCanvas).not.toHaveBeenCalled();
    expect(main.context.drawImage).not.toHaveBeenCalled();
  });
});
