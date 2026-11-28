import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { bootDesktop, chooseMenu, clickPixel } from './helpers';

async function insertMessage(page: Page, message: string) {
  const field = page.getByRole('textbox', { name: 'Message', exact: true });
  await field.fill(message);
  await field.press('Enter');
}

test('offline questions, Chinese app requests and transcript export work through real controls', async ({
  page,
  context,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/apps/chat/');
  const canvas = page.locator('canvas');
  const status = page.locator('[data-app-status]');
  await expect(canvas).toHaveAttribute('width', '394');
  await expect(status).toContainText('Desktop guide');

  await page.getByRole('button', { name: 'Guide', exact: true }).click();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(status).toHaveText('Desktop guide answered offline.');
  await page
    .locator('#app-host')
    .screenshot({ path: info.outputPath('assistant-offline-projects.png') });
  await chooseMenu(page, 'File', 'Save transcript');
  await expect(status).toHaveText('Transcript saved in My Documents.');
  const saved = await page.evaluate(() => localStorage.getItem('doom95.files.v1'));
  expect(saved).toContain('You: projects');
  expect(saved).toContain('Assistant:');

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await chooseMenu(page, 'Edit', 'Copy latest reply');
  await expect
    .poll(() => page.evaluate(async () => (await navigator.clipboard.readText()).length))
    .toBeGreaterThan(50);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).not.toContain('You: projects');

  await insertMessage(page, '打开计算器');
  const dialog = page.getByRole('dialog', { name: 'MHK10 Assistant' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Calculator');
  await page.screenshot({ path: info.outputPath('assistant-chinese-confirmation.png') });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(status).toContainText('cancelled');
  await expect(page).toHaveURL(/\/apps\/chat\/$/);

  await insertMessage(page, '打开个人资料');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('MiraHikari');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(status).toContainText('cancelled');

  await page.evaluate(() => navigator.clipboard.writeText('你好'));
  await chooseMenu(page, 'Edit', 'Paste into message');
  await expect(status).toHaveText('Pasted into message. Press Enter to send.');
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await expect(input).toHaveValue('你好');
  await page
    .locator('#app-host')
    .screenshot({ path: info.outputPath('assistant-pasted-input.png') });
  await input.press('Enter');
  await expect(status).toHaveText('Desktop guide answered offline.');
  await chooseMenu(page, 'File', 'Save transcript');
  await expect(status).toHaveText('Transcript saved in My Documents.');
  const updated = await page.evaluate(() => localStorage.getItem('doom95.files.v1'));
  expect(updated).toContain('You: 你好');
  expect(updated).toContain('Assistant: 你好');

  const downloadPromise = page.waitForEvent('download');
  await chooseMenu(page, 'File', 'Export transcript...');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Chat transcript.txt');
  const path = await download.path();
  if (!path) throw new Error('Transcript download has no local file');
  const exported = await readFile(path, 'utf8');
  expect(exported).toContain('You: projects');
  expect(exported).toContain('You: 打开计算器');
  expect(exported).toMatch(/cancelled/i);

  await insertMessage(page, '打开计算器');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page).toHaveURL(/\/apps\/calculator\/$/);
  expect(errors).toEqual([]);
});

test('the paperclip opens a native message field and a Chinese app proposal without staging text', async ({
  page,
}, info) => {
  const canvas = await bootDesktop(page);
  await canvas.press('Control+Alt+d');
  const size = await canvas.evaluate((element: HTMLCanvasElement) => ({
    w: element.width,
    h: element.height,
  }));
  await clickPixel(canvas, size.w - 52, size.h - 84);
  await expect(canvas).toHaveAttribute('aria-label', /Chat/);
  const field = page.getByRole('textbox', { name: 'Message', exact: true });
  await expect(field).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guide', exact: true })).toHaveCSS(
    'background-color',
    'rgb(192, 192, 192)',
  );
  await page.screenshot({ path: info.outputPath('assistant-desktop-chat.png') });
  await page.getByRole('button', { name: 'Keyboard', exact: true }).click();
  await expect(field).toBeFocused();
  await field.fill('打开计算器');
  await field.dispatchEvent('compositionstart');
  await field.press('Enter');
  await expect(field).toHaveValue('打开计算器');
  await expect(canvas).toHaveAttribute('aria-label', /— Chat/);
  await field.dispatchEvent('compositionend');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(canvas).toHaveAttribute('aria-label', /MHK10 Assistant/);
  await canvas.screenshot({ path: info.outputPath('assistant-desktop-confirmation.png') });
  await canvas.press('ArrowLeft');
  await canvas.press('Enter');
  await expect(canvas).toHaveAttribute('aria-label', /Calculator/);
  await expect(field).toBeHidden();
  await canvas.screenshot({ path: info.outputPath('assistant-desktop-navigation.png') });
});

test('the keyboard guide and transcript preserve an unfinished message and clear only after confirmation', async ({
  page,
}) => {
  await page.goto('/apps/chat/');
  const field = page.getByRole('textbox', { name: 'Message', exact: true });
  await field.fill('这是一份草稿');
  const guide = page.getByRole('button', { name: 'Guide', exact: true });
  await guide.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Projects' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(field).toHaveValue('这是一份草稿');
  const log = page.getByRole('button', { name: 'Log', exact: true });
  await log.click();
  await expect(page.getByRole('region', { name: 'Conversation log' })).toContainText(
    'You: projects',
  );
  await page.keyboard.press('Escape');
  await expect(log).toBeFocused();
  await chooseMenu(page, 'File', 'Clear conversation');
  const dialog = page.getByRole('dialog', { name: 'Clear conversation?' });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await log.click();
  await expect(page.getByRole('region', { name: 'Conversation log' })).toContainText(
    'You: projects',
  );
  await log.click();
  await chooseMenu(page, 'File', 'Clear conversation');
  await dialog.getByRole('button', { name: 'Clear', exact: true }).click();
  await log.click();
  await expect(page.getByRole('region', { name: 'Conversation log' })).not.toContainText(
    'You: projects',
  );
  await expect(field).toHaveValue('这是一份草稿');
});
