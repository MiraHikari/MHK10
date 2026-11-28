import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { chooseMenu, clickPixel, openNotepad } from './helpers';

test('standalone Notepad loads only its requested Canvas application', async ({ page }) => {
  const modules: string[] = [];
  page.on('request', (request) => {
    const name = new URL(request.url()).pathname.split('/').at(-1) ?? '';
    if (name.includes('.app.')) modules.push(name);
  });
  await openNotepad(page);
  expect(modules.some((name) => name.startsWith('notepad.app.'))).toBe(true);
  expect(modules.filter((name) => !name.startsWith('notepad.app.'))).toEqual([]);
});

test('standalone Notepad saves edits under a new name and exports the same text', async ({
  page,
}) => {
  await openNotepad(page);
  const content = 'MHK10 browser regression — MiraHikari';
  await page.getByLabel('Text input', { exact: true }).fill(content);
  await page.getByRole('button', { name: 'Insert', exact: true }).click();
  await expect(page.locator('[data-app-status]')).toContainText('Modified');
  await chooseMenu(page, 'File', 'Save As...');
  const picker = page.getByRole('dialog', { name: 'Save As', exact: true });
  await expect(picker).toBeVisible();
  await picker.getByLabel('File name', { exact: true }).fill('MiraHikari.txt');
  await picker.getByRole('combobox', { name: 'Save in', exact: true }).click();
  await expect(picker.getByRole('option').filter({ hasText: 'Library' })).toHaveCount(0);
  await picker.getByRole('option', { name: 'Notes', exact: true }).click();
  await picker.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(picker).not.toBeVisible();
  await expect(page).toHaveTitle('MiraHikari.txt - Notepad · MHK10');
  const download = page.waitForEvent('download');
  await chooseMenu(page, 'File', 'Export this document');
  const saved = await download;
  expect(saved.suggestedFilename()).toBe('MiraHikari.txt');
  expect(await readFile((await saved.path())!, 'utf8')).toContain(content);
  await chooseMenu(page, 'File', 'Exit');
  await expect(page.locator('[data-app-status]')).toHaveText('Application closed.');
  await expect(page.getByRole('link', { name: 'Return to MHK10', exact: true })).toBeVisible();
});

test('cancelling Save As preserves unsaved edits and independent navigation opens My Computer', async ({
  page,
}) => {
  await openNotepad(page);
  await page.keyboard.type('Keep these edits');
  await expect(page.locator('[data-app-status]')).toContainText('Modified');
  await chooseMenu(page, 'File', 'Save As...');
  const picker = page.getByRole('dialog', { name: 'Save As', exact: true });
  await picker.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(picker).not.toBeVisible();
  await expect(page.locator('[data-app-status]')).toContainText('Modified');
  await chooseMenu(page, 'File', 'Open My Documents');
  await expect(page).toHaveURL('/apps/computer/');
  await expect(page.locator('canvas')).toBeVisible();
});

test('Save As requires an explicit replacement and remains cancellable', async ({ page }) => {
  await openNotepad(page);
  await chooseMenu(page, 'File', 'Save As...');
  const picker = page.getByRole('dialog', { name: 'Save As', exact: true });
  await picker.getByLabel('File name', { exact: true }).fill('diary.txt');
  await picker.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(picker.getByRole('status')).toContainText('already exists');
  await expect(picker.getByRole('button', { name: 'Replace', exact: true })).toBeVisible();
  await picker.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(picker).not.toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
});

test('My Computer opens the selected saved file in standalone Notepad', async ({ page }) => {
  await openNotepad(page);
  const marker = 'Selected file for MiraHikari';
  await page.keyboard.type(marker);
  await chooseMenu(page, 'File', 'Save As...');
  const picker = page.getByRole('dialog', { name: 'Save As', exact: true });
  await picker.getByLabel('File name', { exact: true }).fill('Selected.txt');
  await picker.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveTitle('Selected.txt - Notepad · MHK10');
  await chooseMenu(page, 'File', 'Open My Documents');
  await expect(page).toHaveURL('/apps/computer/');
  const canvas = page.locator('canvas');
  await expect(page.locator('[data-app-status]')).not.toBeEmpty();
  // My Documents is the third root row; folders occupy its first three rows.
  await clickPixel(canvas, 80, 110);
  await canvas.press('Enter');
  await expect(
    page.getByRole('menuitem', { name: 'New Text Document', exact: true, includeHidden: true }),
  ).toBeEnabled();
  // The saved file follows the three folders and the default diary record.
  await clickPixel(canvas, 80, 152);
  await canvas.press('Enter');
  await expect(page).toHaveURL(/\/apps\/notepad\/\?file=/);
  await expect(page).toHaveTitle('Selected.txt - Notepad · MHK10');
  await canvas.focus();
  await page.keyboard.type(' + reopened');
  await canvas.press('Control+s');
  await expect(page.locator('[data-app-status]')).toContainText('Saved on this computer.');
  const download = page.waitForEvent('download');
  await chooseMenu(page, 'File', 'Export this document');
  const saved = await download;
  expect(saved.suggestedFilename()).toBe('Selected.txt');
  const content = await readFile((await saved.path())!, 'utf8');
  expect(content).toContain(marker);
  expect(content).toContain(' + reopened');
});

test('reloading Notepad preserves the latest unsaved keyboard input', async ({ page }) => {
  await openNotepad(page);
  const marker = 'MHK10 reload keeps this edit';
  await page.keyboard.type(marker);
  await expect(page.locator('[data-app-status]')).toContainText('Modified');
  await page.reload();
  await expect(page.locator('[data-app-status]')).toContainText('characters');
  await expect(page.locator('[data-app-status]')).not.toContainText('Modified');
  const download = page.waitForEvent('download');
  await chooseMenu(page, 'File', 'Export this document');
  expect(await readFile((await (await download).path())!, 'utf8')).toContain(marker);
});
