import { expect, test } from '@playwright/test';
import { STORAGE_KEYS } from '../../apps/general/src/lib/storage/keys';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, 'classic'), STORAGE_KEYS.displayMode);
});

test('the author entry leads to selected work and the full biography remains reachable', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#boot-loader')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'MiraHikari', exact: true })).toBeVisible();
  const work = page.getByRole('link', { name: /查看精选项目：/ });
  await expect(work).toHaveAttribute('href', /\/projects\/\?item=/);
  await page.getByRole('link', { name: '完整介绍', exact: true }).click();
  await expect(page.locator('#about-biography')).toBeFocused();
  await expect(page.getByRole('heading', { name: '关于我', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('biography-desktop.png') });
});

test('rapid and reversed section navigation settles at the latest destination', async ({
  page,
}) => {
  await page.goto('/projects/');
  await expect(page.locator('#boot-loader')).toBeHidden();
  const nav = page.getByLabel('Desktop navigation');
  await nav.getByRole('link', { name: /SKILLS/ }).click();
  await nav.getByRole('link', { name: /GALLERY/ }).click();
  await nav.getByRole('link', { name: /ABOUT/ }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'MiraHikari', exact: true })).toBeVisible();
  await expect(page.locator('.section-scroll:not([aria-hidden="true"])')).toContainText(
    'MiraHikari',
  );
  await expect(page.locator('.section-scroll:not([aria-hidden="true"])')).toBeFocused();
  await expect(page.getByRole('region', { name: '设备性能提示' })).toHaveCount(0);
});

test('rapid project selection keeps the image, title, description and queue on the same work', async ({
  page,
}) => {
  await page.goto('/projects/');
  await expect(page.locator('#boot-loader')).toBeHidden();
  const queue = page.getByLabel('全部项目，使用上下方向键切换');
  const choices = queue.locator('button[aria-current], button:not([aria-label])');
  await choices.nth(1).click();
  await expect(page.locator('[data-featured-project="xengine"]')).toHaveJSProperty('inert', true);
  await choices.nth(2).click();
  await choices.nth(0).click();
  await expect(page.locator('[data-featured-project]')).toHaveCount(1);
  const featured = page.locator('[data-featured-project]');
  const current = queue.locator('button[aria-current="true"]');
  const selectedId = await current.locator('..').getAttribute('data-command-target');
  await expect(featured).toHaveAttribute('data-featured-project', selectedId ?? '');
  const title = await featured.getByRole('heading').innerText();
  await expect(current).toContainText(title);
  await expect(featured.getByRole('button', { name: `放大查看 ${title}` })).toBeVisible();
  await current.press('End');
  await expect(page.locator('[data-featured-project]')).toHaveCount(1);
  await expect(queue.locator('button[aria-current="true"]')).toBeFocused();
});

test('a phone keeps full motion and the same project views, details and actions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/projects/');
  await expect(page.locator('#boot-loader')).toBeHidden();
  await page.getByRole('button', { name: '全部项目', exact: true }).click();
  await expect(page.locator('[data-project-showcase] article')).toHaveCount(8);
  await expect(page.getByRole('button', { name: '精选视图', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const bounds = await page.getByRole('button', { name: '下一个项目', exact: true }).boundingBox();
  expect(bounds?.width).toBeGreaterThanOrEqual(44);
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
  const viewAnimation = await page
    .locator('[data-project-showcase] > div')
    .last()
    .evaluate((element) => getComputedStyle(element).opacity);
  expect(Number(viewAnimation)).toBeGreaterThan(0);
  await page.screenshot({ path: test.info().outputPath('projects-mobile.png') });
  await page.getByRole('button', { name: '精选视图', exact: true }).click();
  await page.getByRole('button', { name: '下一个项目', exact: true }).click();
  await expect(page.locator('[data-featured-project]')).toHaveCount(1);
  await expect(page.locator('[data-featured-project]')).not.toHaveAttribute(
    'data-featured-project',
    'xengine',
  );
});

test('the gallery closes on the photo currently viewed and returns keyboard focus', async ({
  page,
}) => {
  await page.addInitScript((key) => localStorage.setItem(key, 'reduced'), STORAGE_KEYS.motionLevel);
  await page.goto('/gallery/');
  await expect(page.locator('#boot-loader')).toBeHidden();
  const photos = page.getByRole('button', { name: /^查看大图:/ });
  await photos.first().click();
  const viewer = page.locator('[data-lightbox]');
  await expect(viewer).toBeVisible();
  const viewedTitle = viewer.getByRole('heading', { level: 3 });
  await expect(viewedTitle).toBeVisible();
  const originalPhoto = await viewedTitle.innerText();
  await page.keyboard.press('ArrowRight');
  await expect(viewedTitle).not.toHaveText(originalPhoto);
  const selectedPhoto = await viewedTitle.innerText();
  expect(selectedPhoto.trim()).not.toBe('');
  await page.getByRole('button', { name: 'Close lightbox', exact: true }).click();
  await expect(viewer).toBeHidden();
  // Masonry changes DOM order and failed images may use retry URLs; the
  // current slide title identifies its real gallery control independently.
  await expect(
    page.getByRole('button', { name: `查看大图: ${selectedPhoto}`, exact: true }),
  ).toBeFocused();
});

test('a failed lightbox download exposes retry and can release section input', async ({ page }) => {
  await page.route('**/_astro/lightbox.*.js', (route) => route.abort());
  await page.goto('/gallery/');
  await expect(page.locator('#boot-loader')).toBeHidden();
  await page
    .getByRole('button', { name: /^查看大图:/ })
    .first()
    .click();
  await expect(page.getByRole('button', { name: '重新加载', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '图片查看器' })).toHaveCount(0);
});

test('all phone sections keep their primary controls inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((key) => localStorage.setItem(key, 'reduced'), STORAGE_KEYS.motionLevel);
  for (const path of ['/', '/projects/', '/skills/', '/gallery/', '/blog/', '/friends/']) {
    await page.goto(path);
    await expect(page.locator('#boot-loader')).toBeHidden();
    const active = page.locator('.section-scroll:not([aria-hidden="true"])');
    await expect(active).toBeVisible();
    const overflow = await active.evaluate((element) => {
      const width = window.innerWidth;
      return (
        [...element.querySelectorAll<HTMLElement>('button, a, input, select')]
          .filter((control) => control.getClientRects().length > 0)
          // A deliberate single-row filter tray scrolls horizontally; its
          // off-screen chips are not page overflow.
          .filter((control) => !control.closest('[data-horizontal-scroll]'))
          .filter((control) => {
            const rect = control.getBoundingClientRect();
            return rect.right > width + 1 || rect.left < -1;
          })
          .map((control) => control.textContent?.trim().slice(0, 60))
      );
    });
    expect(overflow, `controls at ${path}`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath(`phone-${path.split('/')[1] || 'entry'}.png`),
    });
  }
});
