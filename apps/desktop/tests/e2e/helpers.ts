import { expect, type Locator, type Page } from '@playwright/test';

/** CSS scaling changes with the viewport; app coordinates remain integer pixels. */
export async function clickPixel(canvas: Locator, x: number, y: number) {
  const size = await canvas.evaluate((element: HTMLCanvasElement) => ({
    width: element.width,
    height: element.height,
  }));
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas is not visible');
  await canvas.click({
    position: { x: (x * box.width) / size.width, y: (y * box.height) / size.height },
  });
}

export async function bootDesktop(page: Page, path = '/') {
  await page.goto(path);
  const canvas = page.locator('#screen');
  await expect(canvas).toBeVisible();
  await expect(page.locator('#boot-hint')).toHaveCount(0);
  await canvas.focus();
  await page.keyboard.press('Escape');
  await expect(canvas).toHaveAttribute('aria-busy', 'false');
  // A reduced-motion boot is brief, but the shell still completes the splash.
  if (path !== '/lab/') {
    await expect(page.locator('iframe[data-html-window]')).toBeVisible();
  }
  return canvas;
}

export async function chooseMenu(page: Page, group: string, command: string) {
  await page.locator('[data-app-menu]').getByText(group, { exact: true }).click();
  await page.locator('[data-app-menu]').getByLabel(command, { exact: true }).click();
}

export async function openNotepad(page: Page) {
  await page.goto('/apps/notepad/');
  const canvas = page.locator('canvas');
  await expect(page.locator('[data-app-status]')).toContainText('characters');
  await clickPixel(canvas, 24, 12);
  await canvas.focus();
  return canvas;
}
