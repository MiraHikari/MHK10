import { expect, test } from '@playwright/test';
import { SITE_ORIGIN } from '../../src/data/site-origin';

test('published content remains readable without JavaScript and shares its canonical identity', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  try {
    await page.goto('/blog/mhk10-technical/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'MHK10 技术说明：像素桌面与可阅读的网页',
    );
    await expect(page.locator('.prose')).toContainText('桌面就是一个文件夹');
    await expect(page.locator('#reader-prose:lang(zh-CN)')).toHaveCount(1);
    await expect(page.locator('.reader-book-header h1:lang(zh-CN)')).toHaveCount(1);
    await expect(page.locator('[data-hybrid-menubar]:lang(en)')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${SITE_ORIGIN}/blog/mhk10-technical/`,
    );
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      'content',
      `${SITE_ORIGIN}/blog/mhk10-technical/`,
    );
    await expect(page.locator('meta[property="article:modified_time"]')).toHaveAttribute(
      'content',
      '2026-10-10T00:00:00.000Z',
    );
    await expect(page.locator('meta[name="twitter:image:alt"]')).toHaveAttribute(
      'content',
      /MHK10/,
    );
    const graph = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}',
    ) as { '@graph': { '@type': string; dateModified?: string }[] };
    expect(
      graph['@graph'].some(
        (entity) =>
          entity['@type'] === 'BlogPosting' && entity.dateModified === '2026-10-10T00:00:00.000Z',
      ),
    ).toBe(true);
    await page.goto('/blog/');
    await expect(page.locator('.reader-book h2:lang(zh-CN)').first()).toBeVisible();
    await expect(page.locator('.reader-book p:lang(zh-CN)').first()).toBeVisible();
    await expect(page.locator('.library-tools:lang(en)')).toHaveCount(1);
  } finally {
    await context.close();
  }
});

test('RSS and sitemap publish only current articles while retired routes remain noindex redirects', async ({
  request,
}) => {
  const sitemap = await (await request.get('/sitemap.xml')).text();
  const rss = await (await request.get('/rss.xml')).text();
  for (const slug of ['advx-2026-hangzhou', 'colophon', 'mhk10-technical', 'privacy']) {
    expect(sitemap).toContain(`/blog/${slug}/`);
    expect(rss).toContain(`/blog/${slug}/`);
  }
  for (const slug of ['site-update']) {
    expect(sitemap).not.toContain(`/blog/${slug}/`);
    expect(rss).not.toContain(`/blog/${slug}/`);
    const response = await request.get(`/blog/${slug}/`);
    expect(response.ok()).toBe(true);
    const html = await response.text();
    expect(html).toContain('noindex, follow');
    expect(html).toContain('0;url=/blog/colophon/');
    expect(html).toContain(`${SITE_ORIGIN}/blog/colophon/`);
  }
  expect(sitemap).toContain('<lastmod>2026-10-10');
});
