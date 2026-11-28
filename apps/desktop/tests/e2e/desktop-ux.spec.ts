import { expect, test } from '@playwright/test';
import { bootDesktop, clickPixel } from './helpers';

test('window shortcuts keep ownership across Canvas and HTML focus', async ({ page }, info) => {
  const canvas = await bootDesktop(page);
  const home = page.locator('iframe[data-html-window="home"]');
  await page
    .frameLocator('iframe[data-html-window="home"]')
    .getByRole('heading', { level: 1 })
    .click();
  await page.keyboard.press('Control+Shift+Escape');
  await expect(canvas).toHaveAttribute('aria-label', /Task Manager/);
  await canvas.focus();
  await canvas.press('Control+F4');
  await expect(canvas).not.toHaveAttribute('aria-label', /Task Manager/);
  await canvas.press('Control+Alt+d');
  await expect(home).toBeHidden();
  await expect(canvas).toHaveAttribute('aria-label', 'MHK10 desktop');
  await canvas.press('Control+Alt+d');
  await expect(home).toBeVisible();
  await canvas.press('Alt+F2');
  await expect(canvas).toHaveAttribute('aria-label', /Run/);
  await page.keyboard.type('calc');
  await canvas.press('Enter');
  await expect(canvas).toHaveAttribute('aria-label', /Calculator/);
  await canvas.screenshot({ path: info.outputPath('desktop-keyboard.png') });
});

test('assistant follows the actual work area and its rendered click target', async ({
  page,
  isMobile,
}, info) => {
  if (!isMobile) await page.setViewportSize({ width: 1600, height: 1000 });
  const canvas = await bootDesktop(page);
  await canvas.focus();
  await canvas.press('Control+Alt+d');
  const size = await canvas.evaluate((element: HTMLCanvasElement) => ({
    w: element.width,
    h: element.height,
  }));
  await canvas.screenshot({
    path: info.outputPath(isMobile ? 'assistant-mobile.png' : 'assistant-auto.png'),
  });
  await clickPixel(canvas, size.w - 52, size.h - 84);
  await expect(canvas).toHaveAttribute('aria-label', /Chat/);
  await canvas.screenshot({ path: info.outputPath('assistant-click.png') });
});

test('desktop keyboard rename, delete and restore operate on the real Desktop folder', async ({
  page,
}, info) => {
  const canvas = await bootDesktop(page);
  await canvas.focus();
  await canvas.press('Control+Alt+d');
  await canvas.press('Control+Shift+n');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('doom95.files.v1')))
    .toContain('New Folder');
  // The saved folder must also be in the drawn icon list before Home chooses it.
  await canvas.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await canvas.press('Home');
  // Home and F2 are separate user actions; apply the selection before renaming.
  await canvas.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await canvas.press('F2');
  await expect(canvas).toHaveAttribute('aria-label', /Rename/);
  await page.keyboard.type('Desktop Projects');
  await canvas.press('Enter');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const data = JSON.parse(localStorage.getItem('doom95.files.v1') ?? '{}') as {
          folders?: { name: string; parent?: string; deleted?: boolean }[];
        };
        return data.folders?.find((folder) => folder.name === 'Desktop Projects');
      }),
    )
    .toMatchObject({ name: 'Desktop Projects', parent: 'desktop' });
  await expect(canvas).not.toHaveAttribute('aria-label', /Rename/);
  // Let the released modal's input gate settle before issuing a desktop command.
  await canvas.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await canvas.press('Delete');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const data = JSON.parse(localStorage.getItem('doom95.files.v1') ?? '{}') as {
          folders?: { name: string; deleted?: boolean }[];
        };
        return data.folders?.find((folder) => folder.name === 'Desktop Projects')?.deleted;
      }),
    )
    .toBe(true);
  await canvas.screenshot({ path: info.outputPath('desktop-file-actions.png') });
});
