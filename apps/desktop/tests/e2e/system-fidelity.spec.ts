import { expect, test, type Locator } from '@playwright/test';
import { bootDesktop, clickPixel, openNotepad } from './helpers';

async function pixel(canvas: Locator, x: number, y: number): Promise<number[]> {
  return canvas.evaluate(
    (element: HTMLCanvasElement, point) =>
      Array.from(element.getContext('2d')!.getImageData(point.x, point.y, 1, 1).data),
    { x, y },
  );
}

test('a maximized window renders Restore and returns to its Maximize caption', async ({
  page,
}, info) => {
  const canvas = await bootDesktop(page);
  const home = page.locator('iframe[data-html-window="home"]');
  const originalWidth = await home.evaluate((frame) => frame.getBoundingClientRect().width);
  // Home starts at (92, 16), width 540. Caption buttons use 16 by 14 pixels.
  const foreground = await pixel(canvas, 596, 23);
  const face = await pixel(canvas, 598, 32);
  expect(foreground).not.toEqual(face);
  await clickPixel(canvas, 600, 26);
  await expect
    .poll(() => home.evaluate((frame) => frame.getBoundingClientRect().width))
    .toBeGreaterThan(originalWidth);
  const width = await canvas.evaluate((element: HTMLCanvasElement) => element.width);
  // Restore shows overlapping windows: the old top-left Maximize stroke is
  // now face colour, while the rear window begins two pixels farther right.
  await expect.poll(() => pixel(canvas, width - 36, 7)).toEqual(face);
  await expect.poll(() => pixel(canvas, width - 34, 7)).toEqual(foreground);
  await canvas.screenshot({ path: info.outputPath('restore-caption.png') });
  await clickPixel(canvas, width - 32, 10);
  await expect
    .poll(() => home.evaluate((frame) => frame.getBoundingClientRect().width))
    .toBe(originalWidth);
  await expect.poll(() => pixel(canvas, 596, 23)).toEqual(foreground);
  await canvas.press('Alt+Space');
  await canvas.screenshot({ path: info.outputPath('default-close-system-menu.png') });
  await canvas.press('Escape');
});

test('Ctrl+Escape opens Start while F10 and menu mnemonics keep Canvas editor text intact', async ({
  page,
}, info) => {
  const canvas = await bootDesktop(page, '/lab/');
  await canvas.press('Control+Escape');
  await canvas.press('r');
  await expect(canvas).toHaveAttribute('aria-label', /Run/);
  await page.keyboard.type('notepad');
  await canvas.press('Enter');
  await expect(canvas).toHaveAttribute('aria-label', /Notepad/);
  await clickPixel(canvas, 214, 112);
  await canvas.press('Control+a');
  const marker = 'Menu commands keep editor text.';
  await page.keyboard.type(marker);
  await canvas.press('Control+s');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('doom95.files.v1')))
    .toContain(JSON.stringify(marker));
  await canvas.press('F10');
  // File and Format share F, so the first F selects Format without activation.
  await canvas.press('f');
  await canvas.press('ArrowDown');
  await expect
    .poll(() =>
      canvas.evaluate((element: HTMLCanvasElement) => {
        const context = element.getContext('2d')!;
        // Notepad's first popup row starts at y=107. Read the final raster rather
        // than menu state: a late overlay must retain both highlight and check.
        const row = context.getImageData(200, 107, element.width - 200, 1).data;
        let selected = -1;
        for (let index = 0; index < row.length; index += 4) {
          if (row[index] === 0 && row[index + 1] === 0 && row[index + 2] === 128) {
            selected = 200 + index / 4;
            break;
          }
        }
        if (selected < 0) return false;
        const gutter = context.getImageData(selected + 2, 112, 12, 9).data;
        for (let index = 0; index < gutter.length; index += 4)
          if (gutter[index] === 255 && gutter[index + 1] === 255 && gutter[index + 2] === 255)
            return true;
        return false;
      }),
    )
    .toBe(true);
  await canvas.screenshot({ path: info.outputPath('canvas-format-menu.png') });
  await canvas.press('w');
  await canvas.press('Control+s');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('doom95.files.v1')))
    .toContain(JSON.stringify(marker));
  await expect(canvas).toHaveAttribute('aria-label', /Notepad/);
});

test('native application menus expose current check and radio state with stable labels', async ({
  page,
}, info) => {
  await openNotepad(page);
  const format = page.locator('[data-app-menu] summary').filter({ hasText: /^Format$/ });
  await format.click();
  const wrap = page.getByRole('menuitemcheckbox', { name: 'Word Wrap', exact: true });
  await expect(wrap).toHaveAttribute('aria-checked', 'true');
  await wrap.click();
  await format.click();
  await expect(wrap).toHaveAttribute('aria-checked', 'false');
  await wrap.click();
  await format.click();
  await expect(wrap).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: info.outputPath('word-wrap-check.png') });

  await page.goto('/apps/clock/');
  const view = page.locator('[data-app-menu] summary').filter({ hasText: /^View$/ });
  await view.click();
  const clock = page.getByRole('menuitemradio', { name: 'Clock', exact: true });
  const calendar = page.getByRole('menuitemradio', { name: 'Calendar', exact: true });
  await expect(clock).toHaveAttribute('aria-checked', 'true');
  await expect(calendar).toHaveAttribute('aria-checked', 'false');
  await calendar.click();
  await view.click();
  await expect(clock).toHaveAttribute('aria-checked', 'false');
  await expect(calendar).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: info.outputPath('clock-radio.png') });
});

test('native F10 activates the application menu and duplicate mnemonics wait for Enter', async ({
  page,
}, info) => {
  const canvas = await openNotepad(page);
  await canvas.press('F10');
  const file = page.locator('[data-app-menu] summary').filter({ hasText: /^File$/ });
  await expect(file).toBeFocused();
  await file.press('ArrowDown');
  await page.keyboard.press('s');
  await expect(page.getByRole('menuitem', { name: 'Save', exact: true })).toBeFocused();
  await expect(page.getByRole('dialog', { name: 'Save As', exact: true })).not.toBeVisible();
  await page.keyboard.press('s');
  const saveAs = page.getByRole('menuitem', { name: 'Save As...', exact: true });
  await expect(saveAs).toBeFocused();
  await expect(page.getByRole('dialog', { name: 'Save As', exact: true })).not.toBeVisible();
  await page.screenshot({ path: info.outputPath('duplicate-save-mnemonic.png') });
  await saveAs.press('Enter');
  const picker = page.getByRole('dialog', { name: 'Save As', exact: true });
  await expect(picker).toBeVisible();
  const filename = picker.getByLabel('File name', { exact: true });
  await filename.press('Alt+f');
  await expect(picker).toBeVisible();
  await expect(filename).toBeFocused();
  await expect(page.locator('[data-app-menu] details[open]')).toHaveCount(0);
  await picker.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(canvas).toBeFocused();
  await canvas.press('Control+a');
  const resumed = 'Typing after cancelled Save As';
  await page.keyboard.type(resumed);
  await expect(page.locator('[data-app-status]')).toContainText(`${resumed.length} characters`);
});
