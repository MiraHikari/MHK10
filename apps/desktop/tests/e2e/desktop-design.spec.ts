import { expect, test, type Locator } from '@playwright/test';
import { bootDesktop, clickPixel } from './helpers';

const pixel = (canvas: Locator, x: number, y: number) =>
  canvas.evaluate(
    (element: HTMLCanvasElement, point) =>
      Array.from(element.getContext('2d')!.getImageData(point.x, point.y, 1, 1).data)
        .slice(0, 3)
        .join(','),
    { x, y },
  );

test('Home is the foremost startup window and closes through the active-window command', async ({
  page,
}, info) => {
  const canvas = await bootDesktop(page);
  const home = page.locator('iframe[data-html-window="home"]');
  await expect(home).toBeVisible();
  await expect(
    page.frameLocator('iframe[data-html-window="home"]').getByRole('heading', { level: 1 }),
  ).toContainText('MiraHikari');
  await info.attach('Home in front', { body: await page.screenshot(), contentType: 'image/png' });
  await canvas.focus();
  await page.keyboard.press('Control+F4');
  await expect(home).toHaveCount(0);
});

test('Phosphor survives desktop remount and screensaver preview wakes on pointer movement', async ({
  page,
}, info) => {
  await page.goto('/apps/display/');
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('width', '358');
  await clickPixel(canvas, 175, 132);
  await clickPixel(canvas, 314, 220);
  await expect(page.locator('#app-host')).toHaveCSS('--app-title', '#00ff00');
  await info.attach('Phosphor Display', {
    body: await canvas.screenshot(),
    contentType: 'image/png',
  });
  await clickPixel(canvas, 224, 15);
  await clickPixel(canvas, 180, 76);
  await clickPixel(canvas, 44, 167);
  await expect.poll(() => pixel(canvas, 0, 0)).toBe('0,0,0');
  const preview = await canvas.screenshot();
  const box = await canvas.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect.poll(async () => Buffer.compare(await canvas.screenshot(), preview)).not.toBe(0);
  await bootDesktop(page, '/lab/');
  await expect
    .poll(() =>
      page.locator('#screen').evaluate((element: HTMLCanvasElement) =>
        Array.from(
          element.getContext('2d')!.getImageData(element.width - 1, element.height - 23, 1, 1).data,
        )
          .slice(0, 3)
          .join(','),
      ),
    )
    .toBe('0,0,0');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'phosphor');
});

test('the final authority decision descends to functional L0 Help and can restart', async ({
  page,
}, info) => {
  await page.goto('/apps/recovery/');
  let canvas = page.locator('canvas');
  await expect(page.locator('[data-app-status]')).toBeVisible();
  await clickPixel(canvas, 48, 203);
  await clickPixel(canvas, 48, 203);
  await expect(page.locator('[data-app-status]')).toBeHidden();
  await canvas.focus();
  await page.keyboard.press('d');
  await page.getByRole('dialog').getByRole('button', { name: 'Delegate', exact: true }).click();
  await page.goto('/lab/');
  canvas = page.locator('#screen');
  await expect(page.locator('#boot-hint')).toHaveCount(0);
  await canvas.focus();
  await page.keyboard.press('Escape');
  await expect
    .poll(() =>
      canvas.evaluate((element: HTMLCanvasElement) =>
        Array.from(element.getContext('2d')!.getImageData(0, element.height - 20, 1, 1).data)
          .slice(0, 3)
          .join(','),
      ),
    )
    .toBe('192,192,192');
  await page.keyboard.press('F1');
  await info.attach('Firmware Help', { body: await canvas.screenshot(), contentType: 'image/png' });
  await page.keyboard.press('F4');
  await expect
    .poll(() =>
      canvas.evaluate((element: HTMLCanvasElement) =>
        Array.from(
          element.getContext('2d')!.getImageData(element.width - 1, element.height - 23, 1, 1).data,
        )
          .slice(0, 3)
          .join(','),
      ),
    )
    .toBe('0,128,128');
});

test('screen saver preview consumes close shortcuts and right-button wake input', async ({
  page,
}) => {
  await page.goto('/apps/display/');
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('width', '358');
  await clickPixel(canvas, 224, 15);
  await clickPixel(canvas, 180, 76);
  const display = await canvas.screenshot();
  await clickPixel(canvas, 44, 167);
  await expect.poll(async () => Buffer.compare(await canvas.screenshot(), display)).not.toBe(0);
  await canvas.focus();
  await page.keyboard.press('Control+F4');
  await expect.poll(async () => Buffer.compare(await canvas.screenshot(), display)).toBe(0);
  await expect(canvas).toBeVisible();
  await clickPixel(canvas, 44, 167);
  await expect.poll(async () => Buffer.compare(await canvas.screenshot(), display)).not.toBe(0);
  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });
  await expect.poll(async () => Buffer.compare(await canvas.screenshot(), display)).toBe(0);
});
