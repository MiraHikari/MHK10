import { expect, test } from '@playwright/test';
import { bootDesktop, clickPixel } from './helpers';

test('MHK10 boots with MiraHikari content and preserves article navigation inside a window', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const canvas = await bootDesktop(page);
  await expect(page).toHaveTitle(/MHK10/);
  const home = page.frameLocator('iframe[data-html-window="home"]');
  await expect(home.getByRole('heading', { level: 1 })).toContainText('MiraHikari');
  await expect(home.locator('[data-personal-explorer]')).toHaveClass(/explorer-ready/);
  await home.getByRole('treeitem', { name: 'Recent', exact: true }).click();
  await home.locator('a[href="/blog/advx-2026-hangzhou/"]').click();
  await home.getByRole('toolbar').getByRole('button', { name: 'Open', exact: true }).click();
  const article = page.frameLocator('iframe[src$="/blog/advx-2026-hangzhou/"]');
  await expect(article.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page).toHaveURL('/');
  await canvas.focus();
  await page.keyboard.press('Control+F4');
  await expect(page.locator('iframe[src$="/blog/advx-2026-hangzhou/"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('canvas window controls minimize, restore and close the initial HTML client', async ({
  page,
}) => {
  const canvas = await bootDesktop(page);
  const frame = page.locator('iframe[data-html-window="home"]');
  const size = await canvas.evaluate((element: HTMLCanvasElement) => ({
    w: element.width,
    h: element.height,
  }));
  const width = await frame.evaluate((element) => element.getBoundingClientRect().width);
  // Initial Home is x=92, y=16, w=540; controls use shared Win95 chrome.
  await clickPixel(canvas, 600, 26);
  await expect
    .poll(async () => frame.evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(width);
  await clickPixel(canvas, size.w - 32, 10);
  await expect
    .poll(async () => frame.evaluate((element) => element.getBoundingClientRect().width))
    .toBe(width);
  await clickPixel(canvas, 584, 26);
  await expect(frame).toBeHidden();
  await clickPixel(canvas, 140, size.h - 11);
  await expect(frame).toBeVisible();
  await canvas.focus();
  await page.keyboard.press('Control+F4');
  await expect(frame).toHaveCount(0);
});

test('Display applies a theme and standalone app reload restores the selection', async ({
  page,
}) => {
  await page.goto('/apps/display/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(async () => canvas.getAttribute('width')).toBe('358');
  await clickPixel(canvas, 180, 60);
  await clickPixel(canvas, 314, 224);
  await expect(page.locator('#app-host')).toHaveCSS('--app-title', '#800080');
  await page.reload();
  await expect(page.locator('#app-host')).toHaveCSS('--app-title', '#800080');
});

test('Canvas desktop and help retain keyboard and mobile monitor controls', async ({
  page,
  isMobile,
}) => {
  await bootDesktop(page, '/lab/');
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('MHK10');
  await page.getByRole('button', { name: 'Return to desktop', exact: true }).click();
  await page.getByRole('button', { name: 'Keyboard', exact: true }).click();
  await expect(page.locator('#keyboard-panel')).toBeVisible();
  if (isMobile) {
    await expect(page.locator('#touch-controls')).toBeVisible();
    await page.locator('#right-click-toggle').click();
    await expect(page.locator('#right-click-toggle')).toHaveAttribute('aria-pressed', 'true');
    await page
      .locator('#touch-controls')
      .getByRole('button', { name: 'Start', exact: true })
      .click();
    await page.locator('#touch-controls').getByRole('button', { name: 'Esc', exact: true }).click();
  }
});
