import { expect, test, type FrameLocator, type Page } from '@playwright/test';
import { GISCUS_CONFIG } from '@mhk/site-core/config/giscus';
import { bootDesktop } from './helpers';

// The fake widget must emit the same repository the production comments host
// validates against; the discussion link derives from the shared giscus config.
const DISCUSSION_URL = `https://github.com/${GISCUS_CONFIG.repo}/discussions/42`;
const FAKE_GISCUS = `<!doctype html><html><head><script>
  const theme = new URL(location.href).searchParams.get('theme');
  if (theme) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = theme;
    document.head.append(link);
  }
</script></head><body>
  <textarea aria-label="Comment"></textarea>
  <script>
    parent.postMessage({
      giscus: {
        discussion: { url: ${JSON.stringify(DISCUSSION_URL)} },
        resizeHeight: 240
      }
    }, '*');
  </script>
</body></html>`;

async function mockGiscus(page: Page, requests: string[] = []): Promise<void> {
  await page.route('https://giscus.app/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/widget?')) requests.push(url);
    await route.fulfill({
      contentType: 'text/html',
      headers: { 'Cache-Control': 'no-store' },
      body: FAKE_GISCUS,
    });
  });
}

async function choose(frame: FrameLocator, label: string, option: string): Promise<void> {
  await frame
    .getByRole('combobox', { name: label, exact: true })
    .and(frame.locator('button'))
    .click();
  await frame.getByRole('option', { name: option, exact: true }).click();
}

async function frameTheme(reader: FrameLocator): Promise<string> {
  const source = await reader.locator('iframe.comments-frame').getAttribute('src');
  return decodeURIComponent(new URL(source!).searchParams.get('theme')!);
}

test('Discussion window follows the desktop theme and keeps its frame while closed', async ({
  page,
}, info) => {
  const widgetRequests: string[] = [];
  await mockGiscus(page, widgetRequests);
  await bootDesktop(page, '/blog/colophon/');
  const reader = page.frameLocator('iframe[data-html-window="blog"]');
  const host = reader.locator('#reader-comments');
  await expect(host).toHaveAttribute('data-comments-bound', 'true');
  await reader.locator('[data-comments-open="reader-comments"]').click();
  const dialog = reader.locator('#reader-comments-dialog');
  await expect(dialog).toBeVisible();
  await expect(host).toHaveAttribute('data-phase', 'ready');
  await expect(reader.locator('[data-comments-status]')).toHaveText('Connected');
  await expect(reader.locator('.comments-caution')).toBeVisible();
  const github = reader.locator('[data-comments-github]');
  await expect(github).toBeVisible();
  await expect(github).toHaveAttribute('href', DISCUSSION_URL);
  const iframe = reader.locator('iframe.comments-frame');
  await expect(iframe).toHaveCount(1);
  await expect(iframe).toHaveAttribute('title', 'GitHub Discussions');
  await expect(iframe).toHaveCSS('height', '240px');
  const css = await frameTheme(reader);
  expect(css).toContain('--color-canvas-default: #ffffff');
  expect(css).toContain('--color-fg-default: #000000');
  expect(css).toContain('color-scheme: light');
  const giscus = page.frames().find((frame) => frame.url().startsWith('https://giscus.app/'));
  expect(giscus).toBeTruthy();
  const textCursor = () =>
    giscus!.evaluate(() => getComputedStyle(document.querySelector('textarea')!).cursor);
  await expect
    .poll(() => giscus!.evaluate(() => getComputedStyle(document.body).cursor))
    .toContain('data:image/svg+xml');
  await expect.poll(textCursor).toContain('data:image/svg+xml');
  expect(await textCursor()).toContain('text');
  await info.attach('Themed Discussion window', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await reader.locator('[data-comments-close]').click();
  await expect(dialog).not.toBeVisible();
  await reader.locator('[data-comments-open="reader-comments"]').click();
  await expect(dialog).toBeVisible();
  await expect(iframe).toHaveCount(1);
  expect(widgetRequests).toHaveLength(1);
  await reader.locator('[data-comments-reload]').click();
  await expect(reader.locator('[data-comments-reload-prompt]')).toBeVisible();
  await reader.locator('[data-comments-confirm-reload]').click();
  await expect.poll(() => widgetRequests.length).toBe(2);
  await expect(host).toHaveAttribute('data-phase', 'ready');
});

async function pointerPixels(page: Page): Promise<number> {
  return page.locator('canvas.desktop-pointer-layer').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext('2d');
    if (!context) return -1;
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let pixels = 0;
    for (let index = 3; index < data.length; index += 4) if (data[index]) pixels++;
    return pixels;
  });
}

test('the desktop cursor leaves the cross-origin discussion frame to its own pixel cursor', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'chromium', 'Desktop pointer scenario');
  await mockGiscus(page);
  await bootDesktop(page, '/blog/colophon/');
  const reader = page.frameLocator('iframe[data-html-window="blog"]');
  const host = reader.locator('#reader-comments');
  await expect(host).toHaveAttribute('data-comments-bound', 'true');
  await reader.locator('[data-comments-open="reader-comments"]').click();
  await expect(host).toHaveAttribute('data-phase', 'ready');
  const title = await reader.locator('#reader-comments-dialog-title').boundingBox();
  const frame = await reader.locator('iframe.comments-frame').boundingBox();
  if (!title || !frame) throw new Error('Missing discussion geometry');
  await page.mouse.move(title.x + title.width / 2, title.y + title.height / 2);
  await expect.poll(() => pointerPixels(page)).toBeGreaterThan(0);
  await page.mouse.move(frame.x + frame.width / 2, frame.y + 30);
  await expect.poll(() => pointerPixels(page)).toBe(0);
  await page.mouse.move(title.x + title.width / 2, title.y + title.height / 2);
  await expect.poll(() => pointerPixels(page)).toBeGreaterThan(0);
});

test('Discussion follows the Reader reading theme', async ({ page }) => {
  await mockGiscus(page);
  await bootDesktop(page, '/blog/colophon/');
  const reader = page.frameLocator('iframe[data-html-window="blog"]');
  await reader.locator('[data-hybrid-menubar] summary').filter({ hasText: 'View' }).click();
  await reader.locator('[data-hybrid-menubar] [data-reader-command="options"]').click();
  await choose(reader, 'Theme', 'Night');
  await reader.locator('[data-reader-command="close-options"]').click();
  await expect(reader.locator('#microsoft-reader')).toHaveAttribute('data-reading-theme', 'night');
  const host = reader.locator('#reader-comments');
  await expect(host).toHaveAttribute('data-comments-bound', 'true');
  await reader.locator('[data-comments-open="reader-comments"]').click();
  await expect(host).toHaveAttribute('data-phase', 'ready');
  const css = await frameTheme(reader);
  expect(css).toContain('--color-canvas-default: #008080');
  expect(css).toContain('--color-fg-default: #ffffff');
  expect(css).toContain('color-scheme: dark');
});
