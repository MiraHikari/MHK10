import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test('resizing an open menu releases the modal and section input', async ({ page }) => {
  await page.goto('/about/');
  await expect(page.locator('#boot-loader')).toBeHidden({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Section menu' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole('dialog', { name: 'Section menu' })).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
  await page
    .locator('nav[aria-label="Desktop navigation"]')
    .getByRole('link', { name: /技能/ })
    .click();
  await expect(page).toHaveURL(/\/skills\/?$/);
  await page.screenshot({ path: test.info().outputPath('resized-menu.png') });
});

test('resizing an open article TOC releases the modal and body lock', async ({ page }) => {
  await page.goto('/blog/colophon/');
  await expect(page.locator('#boot-loader')).toBeHidden({ timeout: 30_000 });
  await page.getByRole('button', { name: '目录', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '文章目录' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole('dialog', { name: '文章目录' })).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
  await page.screenshot({ path: test.info().outputPath('resized-toc.png') });
});
