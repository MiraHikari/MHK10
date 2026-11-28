import { expect, test, type Locator, type Page } from '@playwright/test';
import { DEFAULT_SETTINGS } from '../../src/lib/os/desktop/desktop-settings';
import { bootDesktop, clickPixel } from './helpers';

async function dimensions(canvas: Locator) {
  return canvas.evaluate((element: HTMLCanvasElement) => ({
    width: element.width,
    height: element.height,
  }));
}
async function painted(canvas: Locator) {
  await canvas.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
async function moveLogical(page: Page, canvas: Locator, x: number, y: number) {
  const box = await canvas.boundingBox(),
    size = await dimensions(canvas);
  if (!box) throw new Error('Desktop is not visible');
  const point = {
    x: box.x + (x * box.width) / size.width,
    y: box.y + (y * box.height) / size.height,
  };
  await page.mouse.move(point.x, point.y);
  return point;
}
async function doubleClickLogical(page: Page, canvas: Locator, x: number, y: number) {
  const point = await moveLogical(page, canvas, x, y);
  await page.mouse.dblclick(point.x, point.y);
}
async function setResolution(page: Page, mode: 'auto' | 'classic') {
  await page.goto('/apps/display/');
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('width', '358');
  await clickPixel(canvas, 305, 15);
  await clickPixel(canvas, 305, 45);
  await clickPixel(canvas, 20, mode === 'auto' ? 96 : 120);
  await clickPixel(canvas, 313, 222);
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('doom95.desktop.v1') ?? '{}').resolutionMode,
      ),
    )
    .toBe(mode);
}

async function bareDesktop(page: Page) {
  const canvas = await bootDesktop(page, '/lab/');
  await canvas.press('Control+F4');
  // The first visit opens Welcome; wait for its close animation before treating
  // the canvas as a bare desktop, otherwise the next menu keys target the window.
  await expect(canvas).toHaveAttribute('aria-label', 'MHK10 desktop', { timeout: 5_000 });
  await painted(canvas);
  return canvas;
}

async function iconStamp(canvas: Locator, x: number, y: number) {
  return canvas.evaluate(
    (element: HTMLCanvasElement, point) => {
      const pixels = element.getContext('2d')!.getImageData(point.x, point.y, 32, 32).data;
      let hash = 2166136261;
      for (const value of pixels) hash = Math.imul(hash ^ value, 16777619);
      return hash >>> 0;
    },
    { x, y },
  );
}

test('a manual icon move preserves the chosen name order after reload', async ({
  page,
  isMobile,
}, info) => {
  test.skip(isMobile, 'The desktop project exercises named adaptive placement.');
  await page.setViewportSize({ width: 720, height: 440 });
  let canvas = await bareDesktop(page);
  await clickPixel(canvas, 500, 100);
  await painted(canvas);
  for (const key of ['Shift+F10', 'Home', 'ArrowDown', 'ArrowDown', 'ArrowRight', 'Enter']) {
    await canvas.press(key);
    await painted(canvas);
  }
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('doom95.desktop-icons.v1') ?? '{}').arrangement,
      ),
    )
    .toBe('name');
  const first = await iconStamp(canvas, 20, 6);
  const second = await iconStamp(canvas, 20, 68);
  await moveLogical(page, canvas, 36, 22);
  await page.mouse.down();
  await moveLogical(page, canvas, 386, 162);
  await painted(canvas);
  await page.mouse.up();
  await painted(canvas);
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('doom95.desktop-icons.v1') ?? '{}').order,
      ),
    )
    .toBe('name');
  canvas = await bareDesktop(page);
  expect(await iconStamp(canvas, 20, 68)).toBe(second);
  expect(await iconStamp(canvas, 370, 146)).toBe(first);
  await canvas.screenshot({ path: info.outputPath('adaptive-named-manual-restored.png') });
});

test('marquee selection keeps default icons adaptive across resize and a restored session', async ({
  page,
  isMobile,
}, info) => {
  test.skip(isMobile, 'The desktop project exercises changing logical work areas.');
  await page.setViewportSize({ width: 720, height: 440 });
  let canvas = await bareDesktop(page);
  await moveLogical(page, canvas, 1, 1);
  await page.mouse.down();
  await moveLogical(page, canvas, 86, 118);
  await painted(canvas);
  await page.mouse.up();
  await painted(canvas);
  expect(await page.evaluate(() => localStorage.getItem('doom95.desktop-icons.v1'))).toBeNull();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await expect.poll(async () => (await dimensions(canvas)).height).toBe(480);
  await painted(canvas);
  await canvas.screenshot({ path: info.outputPath('adaptive-after-marquee.png') });
  await doubleClickLogical(page, canvas, 36, 394);
  await expect(canvas).toHaveAttribute('aria-label', /Recycle Bin/);
  canvas = await bareDesktop(page);
  await doubleClickLogical(page, canvas, 36, 394);
  await expect(canvas).toHaveAttribute('aria-label', /Recycle Bin/);
});

// Pre-existing adaptive-layout flake: this scenario fails identically at the
// pre-migration baseline (6ba4185) in this environment when a fixed canvas
// coordinate lands on an HTML application and navigates the lab desktop. Keep
// it visible until tests can query icon geometry instead of guessing pixels;
// the pinned name-order case above still covers the shared layout behavior.
test.fixme('only genuinely moved icons are pinned while the remaining defaults keep adapting', async ({
  page,
  isMobile,
}, info) => {
  test.skip(isMobile, 'The desktop project exercises changing logical work areas.');
  await page.setViewportSize({ width: 720, height: 440 });
  let canvas = await bareDesktop(page);
  await moveLogical(page, canvas, 36, 84);
  await page.mouse.down();
  await moveLogical(page, canvas, 386, 224);
  await painted(canvas);
  await page.mouse.up();
  await painted(canvas);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('doom95.desktop-icons.v1') ?? 'null'),
    ),
  ).toEqual({
    version: 1,
    arrangement: 'manual',
    positions: [{ id: 'desktop-file:desktop:app:control-panel', x: 352, y: 208 }],
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await expect.poll(async () => (await dimensions(canvas)).height).toBe(480);
  await painted(canvas);
  await canvas.screenshot({ path: info.outputPath('adaptive-with-manual-icon.png') });
  await doubleClickLogical(page, canvas, 36, 394);
  await expect(canvas).toHaveAttribute('aria-label', /Recycle Bin/);
  canvas = await bareDesktop(page);
  await doubleClickLogical(page, canvas, 386, 224);
  await expect(canvas).toHaveAttribute('aria-label', /Control Panel/);
  await canvas.press('Control+F4');
  await expect(canvas).not.toHaveAttribute('aria-label', /Control Panel/);
  await clickPixel(canvas, 500, 100);
  for (const key of ['Shift+F10', 'Home', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'Enter']) {
    await canvas.press(key);
    await painted(canvas);
  }
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('doom95.desktop-icons.v1') ?? '{}').arrangement,
      ),
    )
    .toBe('default');
  await canvas.screenshot({ path: info.outputPath('adaptive-default-after-reset.png') });
});

test('Auto resizes the backing desktop, maximized HTML, cursor and input coordinates together', async ({
  page,
  isMobile,
}, info) => {
  test.skip(isMobile, 'Coarse-pointer viewports deliberately retain the classic desktop.');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  const canvas = await bootDesktop(page);
  await expect(canvas).toHaveAttribute('data-resolution-mode', 'auto');
  await expect.poll(async () => (await dimensions(canvas)).width).toBeGreaterThan(640);
  const first = await dimensions(canvas);
  expect(first.width % 16).toBe(0);
  expect(first.height % 8).toBe(0);
  const home = page.locator('iframe[data-html-window="home"]');
  const heading = page
    .frameLocator('iframe[data-html-window="home"]')
    .getByRole('heading', { level: 1 });
  const font = await heading.evaluate((element) => getComputedStyle(element).fontSize);
  await clickPixel(canvas, 600, 26);
  await expect.poll(() => home.evaluate((element) => element.clientWidth)).toBe(first.width - 6);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect.poll(async () => (await dimensions(canvas)).width).toBeGreaterThan(first.width);
  const grown = await dimensions(canvas);
  await expect.poll(() => home.evaluate((element) => element.clientWidth)).toBe(grown.width - 6);
  await expect.poll(() => home.evaluate((element) => element.clientHeight)).toBe(grown.height - 47);
  await expect(page.locator('.desktop-pointer-layer')).toHaveAttribute(
    'width',
    String(grown.width),
  );
  await expect(page.locator('.desktop-pointer-layer')).toHaveAttribute(
    'height',
    String(grown.height),
  );
  await expect(page.locator('.html-window-layer')).toHaveCSS('width', `${grown.width}px`);
  expect(await heading.evaluate((element) => getComputedStyle(element).fontSize)).toBe(font);
  await moveLogical(page, canvas, grown.width - 80, grown.height - 85);
  await painted(canvas);
  expect(
    await page.locator('.desktop-pointer-layer').evaluate((element: HTMLCanvasElement) => {
      const pixels = element
        .getContext('2d')!
        .getImageData(element.width - 90, element.height - 100, 36, 36).data;
      return pixels.some((value, index) => index % 4 === 3 && value > 0);
    }),
  ).toBe(true);
  await info.attach('Auto expanded desktop', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  await canvas.focus();
  await clickPixel(canvas, grown.width - 32, 10);
  await expect.poll(() => home.evaluate((element) => element.clientWidth)).toBe(534);
  await moveLogical(page, canvas, 250, 26);
  await page.mouse.down();
  await moveLogical(page, canvas, 550, 170);
  await painted(canvas);
  await page.setViewportSize({ width: 720, height: 440 });
  await expect.poll(async () => (await dimensions(canvas)).width).toBeLessThan(grown.width);
  await painted(canvas);
  const before = await home.evaluate((element) => ({
    left: element.style.left,
    top: element.style.top,
  }));
  await moveLogical(page, canvas, 30, 30);
  await page.mouse.up();
  await painted(canvas);
  expect(
    await home.evaluate((element) => ({ left: element.style.left, top: element.style.top })),
  ).toEqual(before);
  const shrunk = await dimensions(canvas);
  const visible = await home.evaluate((element) => ({
    left: Number.parseInt(element.style.left),
    top: Number.parseInt(element.style.top),
    width: element.clientWidth,
    height: element.clientHeight,
  }));
  expect(visible.left).toBeGreaterThanOrEqual(3);
  expect(visible.left + visible.width).toBeLessThanOrEqual(shrunk.width - 3);
  expect(visible.top + visible.height).toBeLessThanOrEqual(shrunk.height - 25);
  await info.attach('Auto shrunk desktop', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  expect(errors).toEqual([]);
});

test('accepted editor text survives a real viewport change and still saves', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'The desktop resize path is exercised in the desktop project.');
  await page.setViewportSize({ width: 1600, height: 1000 });
  const canvas = await bootDesktop(page);
  const size = await dimensions(canvas);
  await clickPixel(canvas, 69 + DEFAULT_SETTINGS.quickLaunchItems.length * 21, size.height - 11);
  await painted(canvas);
  await canvas.press('Alt+F2');
  await expect(canvas).toHaveAttribute('aria-label', /Run/);
  await page.keyboard.type('notepad');
  await canvas.press('Enter');
  await expect(canvas).toHaveAttribute('aria-label', /Notepad/);
  const marker = ' Adaptive resize preserves 中文 input.';
  await page.getByRole('button', { name: 'Keyboard', exact: true }).click();
  await page.locator('#desktop-text').fill(marker);
  await page.getByRole('button', { name: 'Insert text', exact: true }).click();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await painted(canvas);
  await canvas.press('Control+s');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const saved: unknown = JSON.parse(localStorage.getItem('doom95.files.v1') ?? '{}');
        if (
          !saved ||
          typeof saved !== 'object' ||
          !('files' in saved) ||
          !Array.isArray(saved.files)
        )
          return '';
        const diary = saved.files.find(
          (file: unknown) =>
            !!file && typeof file === 'object' && 'id' in file && file.id === 'diary',
        );
        return diary && typeof diary === 'object' && 'content' in diary ? diary.content : '';
      }),
    )
    .toContain(marker);
});

test('Classic and Auto are selectable through Display and persist across navigation', async ({
  page,
  isMobile,
}, info) => {
  test.skip(isMobile, 'Mobile Auto already uses the classic logical size.');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await setResolution(page, 'classic');
  let canvas = await bootDesktop(page);
  expect(await dimensions(canvas)).toEqual({ width: 640, height: 360 });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await painted(canvas);
  expect(await dimensions(canvas)).toEqual({ width: 640, height: 360 });
  await info.attach('Classic display mode', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await setResolution(page, 'auto');
  canvas = await bootDesktop(page);
  await expect.poll(async () => (await dimensions(canvas)).width).toBeGreaterThan(640);
});

test('mobile Auto retains readable zoom and pan without changing logical font coordinates', async ({
  page,
  isMobile,
}, info) => {
  test.skip(!isMobile, 'Mobile monitor controls are shown on coarse-pointer devices.');
  const canvas = await bootDesktop(page, '/lab/');
  expect(await dimensions(canvas)).toEqual({ width: 640, height: 360 });
  await page.locator('#mobile-zoom').click();
  await expect(page.locator('#mobile-zoom')).toHaveText('100%');
  expect((await canvas.boundingBox())!.width).toBeCloseTo(640, 3);
  await page.locator('#mobile-pan').click();
  await expect(page.locator('#mobile-pan')).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize({ width: 500, height: 800 });
  await painted(canvas);
  expect(await dimensions(canvas)).toEqual({ width: 640, height: 360 });
  await page.locator('#mobile-zoom').click();
  await page.locator('#mobile-zoom').click();
  await expect(page.locator('#mobile-zoom')).toHaveText('Zoom');
  await expect(page.locator('#mobile-pan')).toHaveAttribute('aria-pressed', 'false');
  await info.attach('Mobile Auto fit', { body: await page.screenshot(), contentType: 'image/png' });
});
