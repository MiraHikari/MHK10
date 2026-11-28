import { afterEach, expect, it, vi } from 'vite-plus/test';
import { createFontRasterizer } from '../../gfx/text';
import { makeTestCanvas } from '../../gfx/canvas-fixture';
import { createLifetime } from '../../ui/browser/lifetime';
import { prepareFonts } from './browser-fonts';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('clears the fallback timer after readiness and keeps late font callbacks within their owner', async () => {
  vi.useFakeTimers();
  const fontSet = Object.assign(new EventTarget(), { load: vi.fn(async () => []) });
  const add = vi.spyOn(fontSet, 'addEventListener');
  vi.stubGlobal('document', { fonts: fontSet });
  const firstLifetime = createLifetime();
  const secondLifetime = createLifetime();
  const first = createFontRasterizer(makeTestCanvas);
  const second = createFontRasterizer(makeTestCanvas);
  const firstInit = vi.spyOn(first, 'initFonts');
  const secondInit = vi.spyOn(second, 'initFonts');
  expect(await prepareFonts(firstLifetime, first)).toBe(true);
  const oldRefresh = add.mock.calls[0][1] as EventListener;
  expect(await prepareFonts(secondLifetime, second)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  firstLifetime.dispose();
  first.dispose();
  oldRefresh(new Event('loadingdone'));
  fontSet.dispatchEvent(new Event('loadingdone'));
  expect(firstInit).toHaveBeenCalledOnce();
  expect(secondInit).toHaveBeenCalledTimes(2);
  secondLifetime.dispose();
  second.dispose();
});

it('settles disposal while a font never responds and never initializes the abandoned rasterizer', async () => {
  vi.useFakeTimers();
  let resolve!: () => void;
  const fontSet = Object.assign(new EventTarget(), {
    load: () =>
      new Promise<void>((accept) => {
        resolve = accept;
      }),
  });
  vi.stubGlobal('document', { fonts: fontSet });
  const lifetime = createLifetime();
  const fonts = createFontRasterizer(makeTestCanvas);
  const initialize = vi.spyOn(fonts, 'initFonts');
  const pending = prepareFonts(lifetime, fonts);
  lifetime.dispose();
  expect(await pending).toBe(false);
  resolve();
  await Promise.resolve();
  fontSet.dispatchEvent(new Event('loadingdone'));
  expect(initialize).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  expect(await prepareFonts(lifetime, fonts)).toBe(false);
  fonts.dispose();
});
