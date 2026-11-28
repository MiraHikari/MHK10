import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { chooseMenu, clickPixel } from './helpers';

async function openApp(page: Page, app: string): Promise<Locator> {
  await page.goto(`/apps/${app}/`);
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(async () => Number(await canvas.getAttribute('width'))).toBeGreaterThan(300);
  await canvas.focus();
  return canvas;
}

async function pixelColor(canvas: Locator, x: number, y: number): Promise<string> {
  return canvas.evaluate(
    (element: HTMLCanvasElement, point) => {
      const color = element.getContext('2d')!.getImageData(point.x, point.y, 1, 1).data;
      return `${color[0]},${color[1]},${color[2]}`;
    },
    { x, y },
  );
}

async function dragPixel(
  page: Page,
  canvas: Locator,
  from: [number, number],
  to: [number, number],
) {
  const box = await canvas.boundingBox();
  const size = await canvas.evaluate((element: HTMLCanvasElement) => ({
    width: element.width,
    height: element.height,
  }));
  if (!box) throw new Error('Canvas is not visible');
  const move = (point: [number, number], steps = 1) =>
    page.mouse.move(
      box.x + (point[0] * box.width) / size.width,
      box.y + (point[1] * box.height) / size.height,
      { steps },
    );
  await move(from);
  await page.mouse.down();
  await move(to, 12);
  await page.mouse.up();
}

async function capture(canvas: Locator, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await canvas.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function enterRecoveryReview(page: Page): Promise<Locator> {
  const canvas = await openApp(page, 'recovery');
  await clickPixel(canvas, 74, 205);
  await clickPixel(canvas, 74, 205);
  await expect.poll(() => pixelColor(canvas, 0, 0)).toBe('0,0,128');
  await canvas.focus();
  return canvas;
}

test('PIXEL draws and fills, cancels saving, reopens a saved image and applies wallpaper', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const canvas = await openApp(page, 'pixel');
  const paletteY = Number(await canvas.getAttribute('height')) - 13;
  await clickPixel(canvas, 285, paletteY);
  await clickPixel(canvas, 30, 68);
  await dragPixel(page, canvas, [101, 31], [301, 151]);
  await expect.poll(() => pixelColor(canvas, 200, 90)).toBe('255,0,0');
  await clickPixel(canvas, 400, paletteY);
  await clickPixel(canvas, 30, 42);
  await clickPixel(canvas, 430, 40);
  await expect.poll(() => pixelColor(canvas, 430, 40)).toBe('0,255,255');
  await chooseMenu(page, 'Edit', 'Undo');
  await expect.poll(() => pixelColor(canvas, 430, 40)).toBe('255,255,255');
  await chooseMenu(page, 'File', 'Save As...');
  const picker = page.getByRole('dialog', { name: 'Save As', exact: true });
  await picker.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveTitle(/Untitled\.pixel \*/);
  await expect.poll(() => pixelColor(canvas, 200, 90)).toBe('255,0,0');
  await chooseMenu(page, 'File', 'Save As...');
  await picker.getByLabel('File name', { exact: true }).fill('Red line.pixel');
  await picker.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveTitle('Red line.pixel - PIXEL.EXE · MHK10');
  await chooseMenu(page, 'File', 'Set as wallpaper');
  await expect(page.locator('[data-app-status]')).toHaveText('Desktop wallpaper updated.');
  const download = page.waitForEvent('download');
  await chooseMenu(page, 'File', 'Export image');
  const saved = await download;
  const content = await readFile((await saved.path())!, 'utf8');
  expect(JSON.parse(content)).toMatchObject({ format: 'MHK10-PIXEL', width: 192, height: 100 });
  await page.reload();
  await expect(page.locator('[data-app-status]')).toContainText('192 x 100');
  await chooseMenu(page, 'File', 'Open...');
  await clickPixel(canvas, 190, 64);
  await expect(page).toHaveTitle('Red line.pixel - PIXEL.EXE · MHK10');
  await expect.poll(() => pixelColor(canvas, 200, 90)).toBe('255,0,0');
  await capture(canvas, testInfo, 'pixel-saved-image');
  expect(errors).toEqual([]);
});

test('PIXEL cancellation keeps an unsaved image open and only explicit discard closes it', async ({
  page,
}) => {
  const canvas = await openApp(page, 'pixel');
  await clickPixel(canvas, 111, 61);
  await expect(page).toHaveTitle(/\*/);
  await chooseMenu(page, 'File', 'Exit');
  const prompt = page.getByRole('dialog', { name: 'PIXEL.EXE', exact: true });
  await expect(prompt).toContainText('Save changes');
  await page.keyboard.press('Escape');
  await expect(prompt).not.toBeVisible();
  await chooseMenu(page, 'File', 'Exit');
  await prompt.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(canvas).toBeVisible();
  await expect.poll(() => pixelColor(canvas, 110, 60)).toBe('0,0,0');
  await chooseMenu(page, 'File', 'Exit');
  await prompt.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(page.locator('[data-app-status]')).toHaveText('Application closed.');
});

test('Diagnostics renders its DOS monitor and Recovery preserves confirmation across the register change', async ({
  page,
}, testInfo) => {
  const canvas = await openApp(page, 'diagnostics');
  await expect(page.locator('[data-app-status]')).toBeHidden();
  await expect.poll(() => pixelColor(canvas, 0, 0)).toBe('0,0,128');
  await page.keyboard.type('status');
  await page.keyboard.press('Enter');
  await page.keyboard.press('F3');
  const graphX = 16 + Math.round((Number(await canvas.getAttribute('width')) - 16) * 0.43);
  await expect.poll(() => pixelColor(canvas, graphX, 62)).toBe('0,255,255');
  await capture(canvas, testInfo, 'diagnostics-signal-monitor');
  await page.keyboard.press('F5');
  await expect(page).toHaveURL('/apps/recovery/');
  const recovery = page.locator('canvas');
  await expect(recovery).toHaveAttribute('width', '438');
  await expect(page.locator('[data-app-status]')).toBeVisible();
  await clickPixel(recovery, 74, 205);
  await clickPixel(recovery, 74, 205);
  await expect.poll(() => pixelColor(recovery, 0, 0)).toBe('0,0,128');
  await expect(page.locator('[data-app-status]')).toBeHidden();
  await recovery.focus();
  await page.keyboard.press('h');
  const prompt = page.getByRole('dialog', { name: 'Restore human control', exact: true });
  await prompt.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect.poll(() => pixelColor(recovery, 0, 0)).toBe('0,0,128');
  await capture(recovery, testInfo, 'recovery-text-mode');
  await recovery.press('h');
  await prompt.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.locator('[data-app-status]')).toBeVisible();
  await expect.poll(() => pixelColor(recovery, 0, 0)).toBe('192,192,192');
  await capture(recovery, testInfo, 'recovery-human-ending');
});

test('Solitaire deals real cards, undoes drawing and refuses a new deal after delegation', async ({
  page,
}, testInfo) => {
  const canvas = await openApp(page, 'solitaire');
  await expect(page.locator('[data-app-status]')).toHaveText('0 moves | 0 / 52 cards home');
  await clickPixel(canvas, 28, 26);
  await expect(page.locator('[data-app-status]')).toHaveText('1 moves | 0 / 52 cards home');
  await expect.poll(() => pixelColor(canvas, 87, 7)).toBe('255,255,255');
  await capture(canvas, testInfo, 'solitaire-stock-drawn');
  await chooseMenu(page, 'Game', 'Undo');
  await expect(page.locator('[data-app-status]')).toHaveText('0 moves | 0 / 52 cards home');
  const recovery = await enterRecoveryReview(page);
  await recovery.press('d');
  await page
    .getByRole('dialog', { name: 'Delegate all authority', exact: true })
    .getByRole('button', { name: 'Delegate', exact: true })
    .click();
  const refused = await openApp(page, 'solitaire');
  await expect(page.locator('[data-app-status]')).toHaveText('AGI.EXE has declined to deal.');
  await chooseMenu(page, 'Game', 'Deal');
  await expect(page.getByRole('dialog', { name: 'Solitaire', exact: true })).toContainText(
    'There are no more hands to play.',
  );
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await capture(refused, testInfo, 'solitaire-deal-refused');
});
