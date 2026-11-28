import { expect, test } from '@playwright/test';
import { bootDesktop, clickPixel, openNotepad } from './helpers';

test('a Canvas application resumes after cached page restoration and later releases on exit', async ({
  page,
}) => {
  const canvas = await openNotepad(page);
  await canvas.press('Control+a');
  await page.keyboard.type('Before cached navigation');
  await expect(page.locator('[data-app-status]')).toContainText('24 characters');
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })),
  );
  await expect(canvas).toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  );
  await canvas.focus();
  await page.keyboard.type(' resumed');
  await expect(page.locator('[data-app-status]')).toContainText('32 characters');
  await canvas.press('Control+F4');
  await expect(page.locator('[data-app-status]')).toHaveText('Application closed.');
  await expect(canvas).toBeHidden();
});

test('the desktop resumes frame input after cached page restoration', async ({ page }, info) => {
  const canvas = await bootDesktop(page, '/lab/');
  await canvas.press('Alt+F2');
  await expect(canvas).toHaveAttribute('aria-label', /Run/);
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })),
  );
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  );
  await canvas.focus();
  await page.keyboard.type('notepad');
  await canvas.press('Enter');
  await expect(canvas).toHaveAttribute('aria-label', /Notepad/);
  // Default registration puts the editor at (200, 65), with a 40px chrome inset.
  await clickPixel(canvas, 214, 112);
  await canvas.press('Control+a');
  await page.keyboard.type('Restored desktop');
  await canvas.press('Control+s');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('doom95.files.v1')))
    .toContain('Restored desktop');
  await info.attach('Restored desktop editor', {
    body: await canvas.screenshot(),
    contentType: 'image/png',
  });
});
