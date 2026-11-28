import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { bootDesktop } from './helpers';
import { FUSION_EVENTS } from '@mhk/site-core/fusion/protocol-model';

test('closing the Reader checkpoints reading synchronously before removing its iframe', async ({
  page,
}) => {
  const canvas = await bootDesktop(page, '/blog/colophon/');
  const reader = page.frameLocator('iframe[data-html-window="blog"]');
  await reader.locator('#microsoft-reader').evaluate((_root, eventName) => {
    window.addEventListener(eventName, () =>
      localStorage.setItem('reader-close-checkpoint', 'saved'),
    );
  }, FUSION_EVENTS.flushReading);
  await canvas.focus();
  await page.keyboard.press('Alt+F4');
  await expect(page.locator('iframe[data-html-window="blog"]')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('reader-close-checkpoint'))).toBe('saved');
});

async function addNote(page: Page, text: string): Promise<void> {
  const reader = page.frameLocator('iframe[data-html-window="blog"]');
  await reader.locator('.reader-tools [data-reader-command="note"]').click();
  await reader.locator('#reader-note-text').fill(text);
  await reader.locator('[data-reader-command="save-note"]').click();
  await expect(reader.locator('#reader-notes')).toContainText(text);
}

test('Reader preserves notes from articles opened in separate browser pages', async ({
  page,
  context,
}, info) => {
  await bootDesktop(page, '/blog/colophon/');
  const other = await context.newPage();
  await bootDesktop(other, '/blog/advx-2026-hangzhou/');
  await addNote(page, 'Notes from the first article');
  await addNote(other, 'Notes from the second article');
  await page.reload();
  await page.locator('#screen').focus();
  await page.keyboard.press('Escape');
  const reader = page.frameLocator('iframe[data-html-window="blog"]');
  await reader.locator('.reader-tools [data-reader-command="note"]').click();
  await reader.locator('#reader-note').press('Escape');
  await reader.locator('[data-hybrid-menubar] summary').filter({ hasText: 'View' }).click();
  await reader.locator('[data-hybrid-menubar] [data-reader-command="notebook"]').click();
  await expect(reader.locator('#reader-notes')).toContainText('Notes from the first article');
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('doom95.reader.v2') ?? '{}'),
  );
  expect(saved.documents['advx-2026-hangzhou'].notes[0].text).toBe('Notes from the second article');
  await page.screenshot({ path: info.outputPath('reader-shared-notebook.png') });
  await other.close();
});

test('Reader retains a damaged saved notebook and exports both recovery and current notes', async ({
  page,
}, info) => {
  const damaged = '{"version":99,"futureNotebook":"retain raw content"}';
  await page.addInitScript((raw) => {
    if (localStorage.getItem('doom95.reader.v2') === null)
      localStorage.setItem('doom95.reader.v2', raw);
  }, damaged);
  await bootDesktop(page, '/blog/colophon/');
  await addNote(page, 'Keep these new session notes');
  const reader = page.frameLocator('iframe[data-html-window="blog"]');
  await expect(reader.locator('#reader-notes')).toContainText('newer format');
  expect(await page.evaluate(() => localStorage.getItem('doom95.reader.v2'))).toBe(damaged);
  const recoveryDownload = page.waitForEvent('download');
  await reader.getByRole('button', { name: 'Export recovery backup…' }).click();
  expect(await readFile((await (await recoveryDownload).path())!, 'utf8')).toBe(damaged);
  await reader.locator('[data-hybrid-menubar] summary').filter({ hasText: 'File' }).click();
  const notebookDownload = page.waitForEvent('download');
  await reader.locator('[data-reader-command="backup-notebook"]').click();
  const backup = JSON.parse(await readFile((await (await notebookDownload).path())!, 'utf8'));
  expect(backup.recoveryRaw).toBe(damaged);
  expect(backup.documents.colophon.notes[0].text).toBe('Keep these new session notes');
  await page.screenshot({ path: info.outputPath('reader-recovery-notebook.png') });
});
