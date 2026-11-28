import { expect, test, type Locator, type Page } from '@playwright/test';
import { bootDesktop } from './helpers';

async function movePixel(page: Page, canvas: Locator, x: number, y: number, steps = 1) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas is not visible');
  const size = await canvas.evaluate((element: HTMLCanvasElement) => ({
    w: element.width,
    h: element.height,
  }));
  await page.mouse.move(box.x + (x * box.width) / size.w, box.y + (y * box.height) / size.h, {
    steps,
  });
}

async function paintedFrame(canvas: Locator) {
  await canvas.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function stamp(canvas: Locator, x: number, y: number, width = 32, height = 32) {
  return canvas.evaluate(
    (element: HTMLCanvasElement, rect) => {
      const pixels = element
        .getContext('2d')!
        .getImageData(rect.x, rect.y, rect.width, rect.height).data;
      let hash = 2166136261;
      for (const value of pixels) hash = Math.imul(hash ^ value, 16777619);
      return hash >>> 0;
    },
    { x, y, width, height },
  );
}

test('marquee highlights icon pixels and labels live, retains them on release, and restores Ctrl/Esc selection', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const canvas = await bootDesktop(page, '/lab/');
  await canvas.focus();
  await page.keyboard.press('Control+F4');
  await paintedFrame(canvas);
  const first = await stamp(canvas, 28, 6);
  const second = await stamp(canvas, 28, 68);
  const third = await stamp(canvas, 28, 130);
  const label = await stamp(canvas, 14, 40, 60, 13);

  // Press in empty space, then cross the first icon before an animation frame may run.
  await movePixel(page, canvas, 1, 1);
  await page.mouse.down();
  await movePixel(page, canvas, 86, 118, 20);
  await paintedFrame(canvas);
  expect(await stamp(canvas, 28, 6)).not.toBe(first);
  expect(await stamp(canvas, 28, 68)).not.toBe(second);
  expect(await stamp(canvas, 28, 130)).toBe(third);
  expect(await stamp(canvas, 14, 40, 60, 13)).not.toBe(label);
  const selectedFirst = await stamp(canvas, 28, 6);
  const selectedSecond = await stamp(canvas, 28, 68);
  await page.mouse.up();
  await paintedFrame(canvas);
  expect(await stamp(canvas, 28, 6)).toBe(selectedFirst);
  expect(await stamp(canvas, 28, 68)).toBe(selectedSecond);

  await page.keyboard.down('Control');
  await movePixel(page, canvas, 1, 125);
  await page.mouse.down();
  await movePixel(page, canvas, 86, 180, 10);
  await page.mouse.up();
  await page.keyboard.up('Control');
  await paintedFrame(canvas);
  expect(await stamp(canvas, 28, 6)).toBe(selectedFirst);
  expect(await stamp(canvas, 28, 68)).toBe(selectedSecond);
  const selectedThird = await stamp(canvas, 28, 130);
  expect(selectedThird).not.toBe(third);

  // Replacing the group during a drag is transactional; Escape restores all previous icons.
  await movePixel(page, canvas, 200, 200);
  await page.mouse.down();
  await movePixel(page, canvas, 95, 125, 10);
  await paintedFrame(canvas);
  expect(await stamp(canvas, 28, 6)).toBe(first);
  await page.keyboard.press('Escape');
  await paintedFrame(canvas);
  expect(await stamp(canvas, 28, 6)).toBe(selectedFirst);
  expect(await stamp(canvas, 28, 68)).toBe(selectedSecond);
  expect(await stamp(canvas, 28, 130)).toBe(selectedThird);
  await page.mouse.up();
  await paintedFrame(canvas);
  expect(await stamp(canvas, 28, 6)).toBe(selectedFirst);
  await canvas.screenshot({ path: testInfo.outputPath('desktop-selection.png') });
  expect(errors).toEqual([]);
});
