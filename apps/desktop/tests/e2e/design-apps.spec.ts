import { expect, test } from '@playwright/test';
import { chooseMenu, clickPixel } from './helpers';

test('Control Panel launches an applet and applies a sound scheme', async ({ page }, info) => {
  await page.goto('/apps/control-panel/');
  const canvas = page.locator('canvas');
  await expect(page.locator('[data-app-status]')).toContainText('object(s)');
  await canvas.screenshot({ path: info.outputPath('control-panel.png') });
  await canvas.focus();
  await canvas.press('Enter');
  await expect(page).toHaveURL('/apps/sounds/');
  await expect(page.locator('[data-app-status]')).toHaveText('Ready');
  await clickPixel(page.locator('canvas'), 25, 59);
  await expect(page.locator('[data-app-status]')).toContainText('Singularity Night selected.');
  await page.locator('canvas').screenshot({ path: info.outputPath('sounds.png') });
});

test('Dial-Up cancels cleanly and opens the existing Home without a duplicate site', async ({
  page,
}, info) => {
  await page.goto('/apps/dialup/');
  const canvas = page.locator('canvas');
  await expect(page.locator('[data-app-status]')).toHaveText('Disconnected');
  const height = await canvas.evaluate((element: HTMLCanvasElement) => element.height);
  await clickPixel(canvas, 54, height - 23);
  await expect(page.locator('[data-app-status]')).toContainText('Dialing');
  await clickPixel(canvas, 54, height - 23);
  await expect(page.locator('[data-app-status]')).toHaveText('Disconnected');
  await clickPixel(canvas, 54, height - 23);
  await expect(page.locator('[data-app-status]')).toHaveText('Connected at 33600 bps');
  await canvas.screenshot({ path: info.outputPath('dialup.png') });
  await clickPixel(canvas, 168, height - 23);
  await expect(page).toHaveURL('/');
  await expect(page.locator('#boot-hint')).toHaveCount(0);
  await page.locator('#screen').focus();
  await page.keyboard.press('Escape');
  await expect(
    page.frameLocator('iframe[data-html-window="home"]').getByRole('heading', { level: 1 }),
  ).toContainText('MiraHikari');
  await expect(page.locator('iframe[data-html-window="network-home"]')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('dialup-home.png'), fullPage: true });
});

test('My Computer creates and names a folder that is available to Save As', async ({
  page,
}, info) => {
  await page.goto('/apps/computer/');
  const canvas = page.locator('canvas');
  await expect(page.locator('[data-app-status]')).toContainText('object(s)');
  await clickPixel(canvas, 80, 110);
  await canvas.press('Enter');
  await chooseMenu(page, 'File', 'New Folder');
  await canvas.focus();
  await canvas.press('Control+a');
  await page.keyboard.type('Radio Projects');
  await canvas.press('Enter');
  await canvas.screenshot({ path: info.outputPath('custom-folder.png') });
  await page.goto('/apps/notepad/');
  await expect(page.locator('[data-app-status]')).not.toBeEmpty();
  await chooseMenu(page, 'File', 'Save As...');
  const picker = page.getByRole('dialog', { name: 'Save As', exact: true });
  await expect(picker).toBeVisible();
  await picker.getByRole('combobox', { name: 'Save in', exact: true }).click();
  await picker.getByRole('option', { name: 'Radio Projects', exact: true }).click();
  await picker.getByLabel('File name', { exact: true }).fill('parts.txt');
  await picker.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(picker).not.toBeVisible();
  await expect(page).toHaveTitle('parts.txt - Notepad · MHK10');
});

test('Mouse shape preview follows the selected pointer scheme', async ({ page }, info) => {
  await page.goto('/apps/mouse/');
  const canvas = page.locator('canvas');
  await expect(page.locator('[data-app-status]')).toHaveText('Ready');
  const sample = () =>
    canvas.evaluate((element: HTMLCanvasElement) => {
      const pixel = element.getContext('2d')!.getImageData(245, 61, 1, 1).data;
      return [pixel[0], pixel[1], pixel[2], pixel[3]];
    });
  const standard = await sample();
  await clickPixel(canvas, 30, 76);
  await expect.poll(sample).not.toEqual(standard);
  await canvas.screenshot({ path: info.outputPath('mouse-inverted-preview.png') });
  expect(
    await page.evaluate(() => {
      const stored = localStorage.getItem('doom95.desktop.v1');
      return stored ? (JSON.parse(stored) as { cursorSet?: string }).cursorSet : undefined;
    }),
  ).not.toBe('inverted');
  await clickPixel(canvas, 30, 104);
  const phosphor = await sample();
  expect(phosphor).not.toEqual(standard);
  const size = await canvas.evaluate((element: HTMLCanvasElement) => ({
    width: element.width,
    height: element.height,
  }));
  await clickPixel(canvas, size.width - 68, size.height - 21);
  await expect(page.locator('[data-app-status]')).toHaveText('Preferences applied.');
  expect(
    await page.evaluate(
      () =>
        (JSON.parse(localStorage.getItem('doom95.desktop.v1') ?? '{}') as { cursorSet?: string })
          .cursorSet,
    ),
  ).toBe('phosphor');
});

test('system utilities render their registered client surfaces', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const id of [
    'progman',
    'charmap',
    'welcome',
    'components',
    'mouse',
    'date-time',
    'accessibility',
    'modems',
    'system',
  ]) {
    await page.goto(`/apps/${id}/`);
    await expect(page.locator('[data-app-status]')).not.toBeEmpty();
    await page.locator('canvas').screenshot({ path: info.outputPath(`${id}.png`) });
  }
  expect(errors).toEqual([]);
});
