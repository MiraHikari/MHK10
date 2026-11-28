import { expect, test, type FrameLocator, type Page } from '@playwright/test';

async function openReader(page: Page, width = 532, height = 280): Promise<FrameLocator> {
  await page.setViewportSize({
    width: Math.max(390, width + 32),
    height: Math.max(400, height + 32),
  });
  await page.route('**/__reader-toolbar-client', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body style="margin:0"><iframe title="Reader" src="/blog/colophon/" style="display:block;width:${width}px;height:${height}px;border:0"></iframe></body></html>`,
    }),
  );
  await page.goto('/__reader-toolbar-client');
  const reader = page.frameLocator('iframe');
  await expect(reader.locator('#reader-estimate')).toHaveText(/^Est\. .* min left$/);
  return reader;
}

for (const [width, height] of [
  [532, 280],
  [320, 360],
  [274, 155],
]) {
  test(`Reader keeps all toolbar commands and page controls within ${width} by ${height}`, async ({
    page,
  }, info) => {
    const reader = await openReader(page, width, height);
    const tools = reader.getByRole('toolbar', { name: 'Reader tools' });
    await expect(tools.locator('button, a')).toHaveCount(11);
    const geometry = await tools.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return {
        scrolls: element.scrollWidth > element.clientWidth,
        fits: [...element.querySelectorAll('button, a')].every((control) => {
          const rect = control.getBoundingClientRect();
          return rect.width >= 24 && rect.left >= box.left && rect.right <= box.right;
        }),
        bottom: document.querySelector('.reader-status')!.getBoundingClientRect().bottom,
        readingHeight: document.querySelector('#reader-viewport')!.getBoundingClientRect().height,
      };
    });
    expect(geometry.scrolls).toBe(false);
    expect(geometry.fits).toBe(true);
    expect(geometry.bottom).toBeLessThanOrEqual(height);
    expect(geometry.readingHeight).toBeGreaterThanOrEqual(60);
    await info.attach('Reader toolbar', {
      body: await page
        .locator('iframe')
        .screenshot({ path: info.outputPath(`reader-toolbar-${width}.png`) }),
      contentType: 'image/png',
    });
    await tools.getByRole('button', { name: 'Reading options…', exact: true }).click();
    await expect(
      reader.getByRole('dialog', { name: 'Reading Options', exact: true }),
    ).toBeVisible();
    await reader.locator('[data-reader-command="close-options"]').click();
    await tools.getByRole('button', { name: 'Jump to', exact: true }).click();
    await expect(reader.locator('#reader-jump-query')).toBeFocused();
    await reader.locator('#reader-jump-query').press('Escape');
    await expect(tools.getByRole('button', { name: 'Jump to', exact: true })).toBeFocused();
  });
}

test('Reader panel toggles and focus reading retain a usable keyboard destination', async ({
  page,
}) => {
  const reader = await openReader(page, 274, 155);
  const tools = reader.getByRole('toolbar', { name: 'Reader tools' });
  const contents = tools.getByRole('button', { name: 'Contents', exact: true });
  const notebook = tools.getByRole('button', { name: 'Notebook', exact: true });
  const viewport = reader.locator('#reader-viewport');
  await contents.click();
  await expect(contents).toHaveAttribute('aria-expanded', 'true');
  await contents.click();
  await expect(reader.locator('#reader-sidebar')).toBeHidden();
  await expect(contents).toHaveAttribute('aria-pressed', 'false');
  await contents.click();
  await notebook.click();
  await expect(contents).toHaveAttribute('aria-expanded', 'false');
  await expect(notebook).toHaveAttribute('aria-expanded', 'true');
  await reader.getByRole('button', { name: 'Close navigation', exact: true }).click();
  await expect(viewport).toBeFocused();
  await expect(notebook).toHaveAttribute('aria-expanded', 'false');
  await contents.click();
  await reader.locator('#reader-contents a').first().press('Escape');
  await expect(viewport).toBeFocused();
  await expect(reader.locator('#reader-sidebar')).toBeHidden();
  await contents.click();
  await reader.getByRole('tab', { name: 'Contents', exact: true }).press('Escape');
  await expect(viewport).toBeFocused();
  await expect(reader.locator('#reader-sidebar')).toBeHidden();
  await tools.getByRole('button', { name: 'Focus reading', exact: true }).click();
  await expect(tools).toBeHidden();
  await expect(viewport).toBeFocused();
  await viewport.press('Escape');
  await expect(tools).toBeVisible();
  await expect(viewport).toBeFocused();
});

test('Reader toolbar navigation skips unavailable commands without turning pages', async ({
  page,
}) => {
  const reader = await openReader(page);
  const tools = reader.getByRole('toolbar', { name: 'Reader tools' });
  const viewport = reader.locator('#reader-viewport');
  await viewport.press('End');
  const progress = reader.locator('#reader-progress');
  await expect(progress).toHaveText('100%');
  const bookmark = tools.getByRole('button', { name: 'Bookmark', exact: true });
  await bookmark.focus();
  await bookmark.press('ArrowRight');
  await expect(tools.getByRole('button', { name: 'Note', exact: true })).toBeFocused();
  await tools.getByRole('button', { name: 'Note', exact: true }).press('Home');
  await expect(tools.getByRole('link', { name: 'Library', exact: true })).toBeFocused();
  await expect(progress).toHaveText('100%');
  await tools.getByRole('link', { name: 'Library', exact: true }).press('End');
  const focus = tools.getByRole('button', { name: 'Focus reading', exact: true });
  await expect(focus).toBeFocused();
  await focus.press('Enter');
  await expect(viewport).toBeFocused();
  await viewport.press('Escape');
  await expect(progress).toHaveText('100%');
});

test('Reader long menus scroll to their last action in a minimum client', async ({ page }) => {
  const reader = await openReader(page, 274, 155);
  const file = reader.locator('[data-hybrid-menubar] summary').filter({ hasText: 'File' });
  await file.click();
  const last = reader.locator('[data-reader-command="import-notebook"]');
  await last.scrollIntoViewIfNeeded();
  const bounds = await last.boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(155);
  const pendingPicker = page.waitForEvent('filechooser');
  await last.click();
  await pendingPicker;
  await expect(reader.locator('[data-hybrid-menubar] details[open]')).toHaveCount(0);
});
