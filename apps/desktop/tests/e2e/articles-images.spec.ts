import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { bootDesktop } from './helpers';

test('all source articles are accessible and the travelogue retains its complete text and photographs', async ({
  page,
}) => {
  await bootDesktop(page, '/blog/');
  let blog = page.frameLocator('iframe[data-html-window="blog"]');
  await expect(blog.locator('[data-post]')).toHaveCount(4);
  await expect(blog.locator('a[href="/blog/privacy/"]')).toBeVisible();
  await blog.locator('.reader-book h2 a[href="/blog/advx-2026-hangzhou/"]').click();
  blog = page.frameLocator('iframe[data-html-window="blog"]');
  await expect(blog.locator('.prose .photo-figure')).toHaveCount(44);
  await expect(blog.locator('.prose h2')).toHaveCount(7);
  await expect(blog.locator('.prose')).toContainText('明年再见吧示例市，还有 创客聚会 2027。');
  const image = blog.locator('.photo-figure img').first();
  await image.scrollIntoViewIfNeeded();
  await expect(image).toHaveAttribute('src', '/images/blog/advx-2026/ray-message-display.webp');
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBeGreaterThan(0);
  await image.click();
  const viewer = page.frameLocator('iframe[data-html-window="acdsee"]');
  await expect(viewer.locator('#image-original')).toHaveAttribute(
    'href',
    '/images/blog/advx-2026/ray-message.jpg',
  );
});

test('retired article links retain the shared colophon while the desktop technical introduction remains readable', async ({
  page,
}) => {
  await page.goto('/blog/site-update/');
  await expect(page).toHaveURL(/\/blog\/colophon\//);
  const canvas = page.locator('#screen');
  await expect(canvas).toBeVisible();
  await canvas.focus();
  await page.keyboard.press('Escape');
  await expect(canvas).toHaveAttribute('aria-busy', 'false');
  const blog = page.frameLocator('iframe[data-html-window="blog"]');
  await expect(blog.getByRole('heading', { level: 1 })).toHaveText(
    '关于这个站点：把一份设计翻译成可运行的作品',
  );
  await expect(blog.locator('.reader-book-header')).toContainText('Updated 2026-08-03');
  await expect(blog.locator('.prose')).toContainText('这个博客的第一篇文章');
  await blog.locator('.reader-tools [data-reader-command="contents"]').click();
  await blog.locator('#reader-contents a').last().click();
  await expect(blog.locator('#reader-sidebar')).toBeVisible();
  await blog.locator('[data-hybrid-menubar] summary').filter({ hasText: 'File' }).click();
  await blog.locator('[data-reader-command="copy-link"]').click();
  await expect(blog.locator('#reader-feedback')).toHaveText(/Link copied|Article link/);
  await bootDesktop(page, '/blog/mhk10-technical/');
  const technical = page.frameLocator('iframe[data-html-window="blog"]');
  await expect(technical.getByRole('heading', { level: 1 })).toHaveText(
    'MHK10 技术说明：像素桌面与可阅读的网页',
  );
  await expect(technical.locator('.prose')).toContainText('640 × 360');
});

test('ACDSee keeps transforms local, supports folders and opens local images', async ({ page }) => {
  await bootDesktop(page, '/acdsee/?media=gallery--west-lake-vista-display');
  const viewer = page.frameLocator('iframe[data-html-window="acdsee"]');
  const view = viewer.locator('#image-view');
  await expect
    .poll(() => view.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  await expect(view).toHaveAttribute('src', /west-lake-vista-display.webp$/);
  await viewer.locator('.image-toolbar [data-command="rotate-right"]').click();
  await expect(view).toHaveAttribute('data-rotation', '90');
  await viewer.locator('.image-menubar summary').filter({ hasText: 'Image' }).click();
  await viewer.locator('[data-command="flip-x"]').click();
  await expect(view).toHaveAttribute('data-flip-x', 'true');
  await viewer.locator('.image-toolbar [data-command="properties"]').click();
  await expect(viewer.locator('#image-properties')).toBeVisible();
  await expect(viewer.locator('#image-property-values')).toContainText('WEBP');
  await viewer.getByRole('button', { name: 'Close image properties', exact: true }).click();
  await viewer.locator('.image-menubar summary').filter({ hasText: 'View' }).click();
  await viewer.locator('[data-command="pixel"]').click();
  await expect(view).toHaveAttribute('src', /previews\/gallery\/west-lake-vista-display.png$/);
  await viewer.locator('.image-toolbar [data-command="next"]').click();
  await expect(view).toHaveAttribute('data-rotation', '0');
  await expect(view).toHaveAttribute('data-flip-x', 'false');
  await viewer.locator('.image-toolbar [data-command="browse"]').click();
  await viewer.locator('[data-folder="Projects"]').click();
  await expect(viewer.locator('#image-list [role="option"]')).toHaveCount(8);
  await expect(viewer.locator('.folder-tree [tabindex="0"]')).toHaveCount(1);
  await viewer.locator('[data-folder="Projects"]').press('Tab');
  await expect(viewer.locator('#image-search')).toBeFocused();
  await viewer.locator('#image-search').press('Shift+Tab');
  await expect(viewer.locator('[data-folder="Projects"]')).toBeFocused();
  await viewer.getByRole('combobox', { name: 'Sort', exact: true }).click();
  await viewer.getByRole('option', { name: 'File size', exact: true }).click();
  await viewer.getByRole('combobox', { name: 'File view', exact: true }).click();
  await viewer.getByRole('option', { name: 'Details', exact: true }).click();
  await expect(viewer.locator('#image-list')).toHaveAttribute('data-view', 'details');
  await viewer.locator('#image-open').setInputFiles({
    name: 'invalid.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image'),
  });
  await expect(viewer.locator('#image-feedback')).toHaveText('0 opened; 1 unreadable');
  await expect(viewer.locator('#image-list [role="option"]')).toHaveCount(8);
  await viewer.locator('#image-open').setInputFiles({
    name: 'sample.png',
    mimeType: 'image/png',
    buffer: readFileSync(
      new URL('../../public/images/previews/profile/avatar.png', import.meta.url),
    ),
  });
  await expect(viewer.locator('#image-list [role="option"]')).toHaveCount(1);
  await expect(viewer.locator('#image-list')).toContainText('sample.png');
  await expect(viewer.locator('#image-original')).toHaveAttribute('href', /^blob:/);
  const blobUrl = await viewer.locator('#image-original').getAttribute('href');
  expect(await page.evaluate(async (url) => (await fetch(url!)).ok, blobUrl)).toBe(true);
  await viewer.locator('#image-stage').focus();
  await page.keyboard.press('Control+F4');
  await expect(page.locator('iframe[data-html-window="acdsee"]')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(async (url) => {
        try {
          await fetch(url!);
          return true;
        } catch {
          return false;
        }
      }, blobUrl),
    )
    .toBe(false);
});

test('ACDSee slideshow respects reduced motion and stops on Escape', async ({ page }) => {
  await bootDesktop(page, '/acdsee/');
  const viewer = page.frameLocator('iframe[data-html-window="acdsee"]');
  const slideshow = viewer.locator('.image-toolbar [data-command="slideshow"]');
  await expect(slideshow).toBeDisabled();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(slideshow).toBeEnabled();
  const before = await viewer.locator('#image-position').textContent();
  await slideshow.click();
  await expect(slideshow).toHaveAttribute('aria-pressed', 'true');
  await expect(viewer.locator('#image-position')).not.toHaveText(before!);
  await viewer.locator('#image-stage').press('Escape');
  await expect(slideshow).toHaveAttribute('aria-pressed', 'false');
  await expect(viewer.locator('.image-body')).toHaveAttribute('data-mode', 'browse');
});
