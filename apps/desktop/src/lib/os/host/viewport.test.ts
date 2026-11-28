import { describe, expect, it } from 'vite-plus/test';
import { chooseDisplayMetrics, desktopScale } from './viewport';

describe('desktop zoom', () => {
  it('fits the whole desktop on a portrait phone', () => {
    expect(desktopScale(360, 450, true)).toBe(360 / 640);
  });
  it('offers readable actual pixels without changing logical coordinates', () => {
    expect(desktopScale(360, 450, true, 'actual')).toBe(1);
    expect(desktopScale(360, 450, true, 'double')).toBe(2);
  });
  it('uses whole pixels for desktop displays and respects available height', () => {
    expect(desktopScale(1800, 900, true)).toBe(2);
    expect(desktopScale(1800, 900, false)).toBe(2.5);
  });
});

describe('adaptive logical display', () => {
  const auto = (width: number, height: number) =>
    chooseDisplayMetrics({ width, height, mode: 'auto', pixelScale: true });
  it('spends additional monitor space on an aligned workspace at readable whole-pixel scale', () => {
    expect(auto(1600, 900)).toMatchObject({
      width: 800,
      height: 448,
      scale: 2,
      workArea: { w: 800, h: 426 },
    });
    expect(auto(1920, 1080)).toMatchObject({ width: 960, height: 536, scale: 2 });
    expect(auto(2560, 1440)).toMatchObject({ width: 1280, height: 720, scale: 2 });
  });
  it('caps allocation and preserves Classic and the phone fit/pan baseline', () => {
    expect(auto(5000, 3000)).toMatchObject({ width: 1280, height: 720 });
    expect(
      chooseDisplayMetrics({ width: 1920, height: 1080, mode: 'classic', pixelScale: true }),
    ).toMatchObject({ width: 640, height: 360, scale: 3 });
    expect(
      chooseDisplayMetrics({
        width: 390,
        height: 700,
        mode: 'auto',
        pixelScale: true,
        coarsePointer: true,
      }),
    ).toMatchObject({ width: 640, height: 360, scale: 390 / 640 });
    expect(
      chooseDisplayMetrics({
        width: 390,
        height: 700,
        mode: 'auto',
        pixelScale: true,
        coarsePointer: true,
        zoom: 'actual',
      }).scale,
    ).toBe(1);
  });
  it('aligns physical pixels on fractional device scales when space permits', () => {
    const metrics = chooseDisplayMetrics({
      width: 1920,
      height: 1080,
      mode: 'auto',
      pixelScale: true,
      devicePixelRatio: 1.25,
    });
    expect(metrics.width % 16).toBe(0);
    expect(metrics.height % 8).toBe(0);
    expect(Number.isInteger(metrics.scale * 1.25)).toBe(true);
    expect(metrics.cssWidth).toBeLessThanOrEqual(1920);
    expect(metrics.cssHeight).toBeLessThanOrEqual(1080);
  });
  it('changes presentation zoom without changing the selected work area', () => {
    const fit = auto(1600, 900);
    const actual = chooseDisplayMetrics({
      width: 1600,
      height: 900,
      mode: 'auto',
      pixelScale: true,
      zoom: 'actual',
    });
    expect(actual.workArea).toEqual(fit.workArea);
    expect(actual.scale).toBe(1);
  });
  it('keeps a readable zoom floor instead of stretching a 1024 desktop to scale 1', () => {
    const metrics = auto(1024, 768);
    expect(metrics.scale).toBeGreaterThanOrEqual(1.5);
    expect(metrics.width).toBeLessThan(1024);
    expect(metrics.width).toBeGreaterThanOrEqual(640);
    expect(metrics.cssWidth).toBeLessThanOrEqual(1024);
  });
});
