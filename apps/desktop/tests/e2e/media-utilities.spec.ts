import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { bootDesktop, chooseMenu, clickPixel } from './helpers';

test('Calculator supports arithmetic, memory, keyboard editing and error recovery', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/apps/calculator/');
  const canvas = page.locator('canvas');
  const status = page.locator('[data-app-status]');
  await expect(status).toHaveText('Standard | 0');
  await canvas.focus();
  await page.keyboard.type('200+10%=');
  await expect(status).toHaveText('200 + 20 = | 220');
  await canvas.press('m');
  await expect(status).toContainText('| 220');
  await canvas.press('Escape');
  await expect(status).toHaveText('Standard | 0');
  await canvas.press('i');
  await expect(status).toContainText('| 220');
  await canvas.screenshot({ path: info.outputPath('calculator-memory.png') });
  await canvas.press('Escape');
  await expect(status).toHaveText('Standard | 0');
  await page.keyboard.type('81');
  await canvas.press('F8');
  await expect(status).toContainText('| 9');
  await page.keyboard.type('/0=');
  await expect(status).toContainText('Cannot divide by zero');
  await canvas.press('Delete');
  await expect(status).toContainText('| 0');
  await page.keyboard.type('12');
  await canvas.press('Backspace');
  await page.keyboard.type('+9=');
  await expect(status).toHaveText('1 + 9 = | 10');
  await canvas.press('F6');
  await page.screenshot({ path: info.outputPath('calculator-keyboard-focus.png') });
  expect(errors).toEqual([]);
});

test('Clock navigates dates and runs stopwatch and countdown through real controls', async ({
  page,
}, info) => {
  await page.goto('/apps/clock/');
  const canvas = page.locator('canvas');
  const status = page.locator('[data-app-status]');
  await expect(status).toContainText('Local time | 24-hour');
  await canvas.screenshot({ path: info.outputPath('clock-face.png') });
  await canvas.press('u');
  await canvas.press('t');
  await expect(status).toContainText('UTC | 12-hour');
  await canvas.press('2');
  await expect(status).toContainText('Home: today');
  const month = await status.textContent();
  await canvas.press('ArrowLeft');
  await expect(status).not.toHaveText(month!);
  await canvas.press('Home');
  await expect(status).toHaveText(month!);
  await page.screenshot({ path: info.outputPath('clock-calendar.png') });
  await clickPixel(canvas, 190, 14);
  await expect(status).toHaveText('Stopwatch paused | 00:00:00.00');
  await canvas.press('Space');
  await expect(status).toContainText('Stopwatch running');
  await expect(status).not.toContainText('00:00:00.');
  await canvas.press('l');
  await canvas.press('Space');
  await expect(status).toContainText('Stopwatch paused');
  await canvas.screenshot({ path: info.outputPath('clock-stopwatch.png') });
  await canvas.press('r');
  await expect(status).toHaveText('Stopwatch paused | 00:00:00.00');
  await canvas.press('c');
  await expect(status).toHaveText('Countdown ready | 00:05:00');
  for (let index = 0; index < 5; index += 1) {
    await canvas.press('-');
    await expect(status).toHaveText(
      index === 4 ? 'Countdown ready | 00:00:01' : `Countdown ready | 00:0${4 - index}:00`,
    );
  }
  await expect(status).toHaveText('Countdown ready | 00:00:01');
  await canvas.press('Space');
  await expect(status).toContainText('Timer finished');
  await page.screenshot({ path: info.outputPath('clock-countdown-finished.png') });
  await canvas.press('r');
  await expect(status).toHaveText('Countdown ready | 00:00:01');
});

test('Task Manager switches to and closes a real desktop window with keyboard input', async ({
  page,
}, info) => {
  const canvas = await bootDesktop(page);
  const home = page.locator('iframe[data-html-window="home"]');
  await expect(home).toBeVisible();
  await canvas.focus();
  await canvas.press('Control+Shift+Escape');
  await canvas.press('m');
  await page.screenshot({ path: info.outputPath('task-manager-roster.png') });
  await canvas.press('Enter');
  await expect(home).toBeVisible();
  await canvas.press('Control+Shift+Escape');
  await canvas.press('m');
  await canvas.press('Delete');
  await expect(home).toHaveCount(0);
  await canvas.press('F6');
  await canvas.press('Space');
  await expect
    .poll(() =>
      canvas.evaluate((element: HTMLCanvasElement) => {
        const color = element.getContext('2d')!.getImageData(87, 169, 1, 1).data;
        return Array.from(color.slice(0, 3));
      }),
    )
    .toEqual([0, 0, 0]);
  await page.screenshot({ path: info.outputPath('task-manager-activity.png') });
});

test('Task Manager stays interactive and error-free with Run and modal Help dialogs open', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.location().url.startsWith('http://127.0.0.1:9')) return;
    if (message.text().includes('ERR_UNSAFE_PORT')) return;
    errors.push(message.text());
  });
  const canvas = await bootDesktop(page);
  await canvas.focus();
  await canvas.press('Alt+F2');
  await expect(canvas).toHaveAttribute('aria-label', /Run/);
  await canvas.press('Control+Shift+Escape');
  await expect(canvas).toHaveAttribute('aria-label', /Task Manager/);
  await canvas.press('F1');
  await expect(canvas).toHaveAttribute('aria-label', /MHK10 Help/);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  // Taskbar at bottom-right stays painted (not aborted mid-frame).
  await expect
    .poll(() =>
      canvas.evaluate((element: HTMLCanvasElement) =>
        Array.from(
          element.getContext('2d')!.getImageData(element.width - 4, element.height - 4, 1, 1).data,
        ).slice(0, 3),
      ),
    )
    .not.toEqual([0, 128, 128]);
  await page.screenshot({ path: info.outputPath('task-manager-with-help-dialog.png') });
  await canvas.press('Escape');
  await expect(canvas).toHaveAttribute('aria-label', /Task Manager/);
  await canvas.press('F10');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await canvas.press('ArrowRight');
  await canvas.press('ArrowRight');
  await canvas.press('ArrowDown');
  await canvas.press('Enter');
  await expect(canvas).toHaveAttribute('aria-label', /Task Manager keyboard help/);
  await canvas.press('Escape');
  await expect(canvas).toHaveAttribute('aria-label', /Task Manager/);
  await canvas.press('Control+F4');
  await expect(canvas).toHaveAttribute('aria-label', /Run/);
  await canvas.press('Escape');
  expect(errors).toEqual([]);
});

test('Standalone Task Manager explains host capability limits and disables unavailable actions', async ({
  page,
}, info) => {
  await page.goto('/apps/task-manager/');
  await expect(page.locator('[data-app-status]')).toHaveText(
    'Open on the desktop to manage MHK10 windows.',
  );
  await page.locator('[data-app-menu]').getByText('Task', { exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Switch To', exact: true })).toBeDisabled();
  await expect(page.getByRole('menuitem', { name: 'Close Task', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: info.outputPath('task-manager-standalone.png') });
});

test('Media Player transports generated sound and reports an empty CD drive', async ({
  page,
}, testInfo) => {
  await page.goto('/apps/media-player/');
  const canvas = page.locator('canvas');
  const status = page.locator('[data-app-status]');
  await expect(status).toHaveText('Ready | PC Speaker');
  await clickPixel(canvas, 87, 137);
  await expect(status).toHaveText('Playing | PC Speaker');
  await clickPixel(canvas, 147, 137);
  await expect(status).toHaveText('Paused | PC Speaker');
  await canvas.screenshot({ path: testInfo.outputPath('media-paused.png') });
  await clickPixel(canvas, 208, 137);
  await expect(status).toHaveText('Ready | PC Speaker');
  await clickPixel(canvas, 328, 137);
  await expect(status).toHaveText('Please insert audio CD');
  await page.locator('[data-app-menu]').getByText('Control', { exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Play', exact: true })).toBeDisabled();
});

test('Defrag discovers recoverable fragments without altering personal documents', async ({
  page,
}, testInfo) => {
  await page.goto('/apps/defrag/');
  const canvas = page.locator('canvas');
  await expect(page.locator('[data-app-status]')).toHaveText('DEFRAG 0% | 0 FRAGMENTS');
  await canvas.press('F2');
  await expect(page.locator('[data-app-status]')).toHaveText('DEFRAG 100% | 3 FRAGMENTS', {
    timeout: 15000,
  });
  await canvas.screenshot({ path: testInfo.outputPath('defrag-complete.png') });
  const dimensions = await canvas.evaluate((element: HTMLCanvasElement) => ({ h: element.height }));
  await clickPixel(canvas, 90, dimensions.h - 34);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('doom95.files.v1')))
    .toContain('SAFETY-REVIEW.TXT');
  const saved = await page.evaluate(() => localStorage.getItem('doom95.files.v1'));
  expect(saved).toContain('TUESDAY.TXT');
  expect(saved).toContain('OWNERSHIP.LOG');
  expect(saved).toContain('Dear diary');
});

test('Sound Recorder captures a speaker tone, survives a cancelled save, and exports the saved score', async ({
  page,
}, testInfo) => {
  await page.goto('/apps/sound-recorder/');
  const canvas = page.locator('canvas');
  const status = page.locator('[data-app-status]');
  await expect(status).toHaveText('0 tones | Ready');
  await clickPixel(canvas, 48, 154);
  await expect(status).toHaveText('Recording | 0 tones | PC Speaker');
  await chooseMenu(page, 'Source', 'Test tone');
  await expect(status).toHaveText('Recording | 2 tones | PC Speaker');
  await clickPixel(canvas, 129, 154);
  await expect(status).toHaveText('2 tones | Modified');
  await canvas.screenshot({ path: testInfo.outputPath('sound-recording.png') });
  await chooseMenu(page, 'File', 'Save As...');
  const picker = page.getByRole('dialog', { name: 'Save As', exact: true });
  await picker.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(status).toHaveText('Save cancelled.');
  await chooseMenu(page, 'File', 'Save As...');
  await picker.getByLabel('File name', { exact: true }).fill('Speaker.SND.txt');
  await picker.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(status).toHaveText('Recording saved.');
  const download = page.waitForEvent('download');
  await chooseMenu(page, 'File', 'Export recording');
  const exported = await download;
  const content = JSON.parse(await readFile((await exported.path())!, 'utf8')) as {
    format: string;
    tones: unknown[];
  };
  expect(content.format).toBe('MHK10-PC-SPEAKER');
  expect(content.tones).toHaveLength(2);
  await chooseMenu(page, 'File', 'Exit');
  await expect(status).toHaveText('Application closed.');
});

test('Print Preview renders the article and exports its complete text', async ({
  page,
}, testInfo) => {
  await page.goto('/apps/print-preview/');
  const canvas = page.locator('canvas');
  await expect(page.locator('[data-app-status]')).toContainText('Page 1 of ');
  await canvas.screenshot({ path: testInfo.outputPath('print-preview.png') });
  const download = page.waitForEvent('download');
  await chooseMenu(page, 'File', 'Export text');
  const exported = await download;
  const content = await readFile((await exported.path())!, 'utf8');
  expect(content).toContain('我来，我见，我征服——创客聚会 2026 示例市行');
  expect(content).toContain('明年再见吧示例市，还有 创客聚会 2027。');
});
