import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { chooseMenu, clickPixel, openNotepad } from './helpers';

test('Notepad paints a bounded CJK long line, follows its caret and retains the full export', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const canvas = await openNotepad(page);
  await canvas.press('Control+a');
  const content = `开始${'中文长行'.repeat(3000)}结尾`;
  await page.getByLabel('Text input', { exact: true }).fill(content);
  await page.getByRole('button', { name: 'Insert', exact: true }).click();
  await expect(page.locator('[data-app-status]')).toContainText(`${content.length} characters`);
  await chooseMenu(page, 'Format', 'Word Wrap');
  await canvas.focus();
  await canvas.press('End');
  await page.getByLabel('Text input', { exact: true }).fill('末');
  await page.getByRole('button', { name: 'Insert', exact: true }).click();
  await expect(page.locator('[data-app-status]')).toContainText(`${content.length + 1} characters`);
  const tail = testInfo.outputPath('notepad-cjk-long-line-tail.png');
  await canvas.screenshot({ path: tail });
  await testInfo.attach('CJK long line with visible end caret', {
    path: tail,
    contentType: 'image/png',
  });
  await canvas.focus();
  await canvas.press('Control+Home');
  await page.getByLabel('Text input', { exact: true }).fill('首');
  await page.getByRole('button', { name: 'Insert', exact: true }).click();
  await expect(page.locator('[data-app-status]')).toContainText(`${content.length + 2} characters`);
  const start = testInfo.outputPath('notepad-cjk-long-line-start.png');
  await canvas.screenshot({ path: start });
  await testInfo.attach('CJK long line returns to first caret', {
    path: start,
    contentType: 'image/png',
  });
  const download = page.waitForEvent('download');
  await chooseMenu(page, 'File', 'Export this document');
  const result = await download;
  expect(await readFile((await result.path())!, 'utf8')).toBe(`首${content}末`);
  expect(errors).toEqual([]);
});

test('Notepad Find returns focus to the text and Ctrl+Shift+S opens Save As', async ({ page }) => {
  const canvas = await openNotepad(page);
  await canvas.press('Control+a');
  // Apply selection before the native input field takes focus from the canvas.
  await canvas.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.getByLabel('Text input', { exact: true }).fill('hello world');
  await page.getByRole('button', { name: 'Insert', exact: true }).click();
  await expect(page.locator('[data-app-status]')).toContainText('11 characters');
  await canvas.focus();
  await canvas.press('Control+f');
  await page.keyboard.type('query');
  await clickPixel(canvas, 5, 9);
  await page.keyboard.type('X');
  await expect(page.locator('[data-app-status]')).toContainText('12 characters');
  await canvas.press('Control+Shift+s');
  const picker = page.getByRole('dialog', { name: 'Save As', exact: true });
  await expect(picker).toBeVisible();
  await picker.getByRole('button', { name: 'Cancel', exact: true }).click();
  const download = page.waitForEvent('download');
  await chooseMenu(page, 'File', 'Export this document');
  const result = await download;
  expect(await readFile((await result.path())!, 'utf8')).toBe('Xhello world');
});
