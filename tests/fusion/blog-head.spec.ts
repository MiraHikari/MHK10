import { expect, test, type Page } from '@playwright/test';
import { FUSION_GENERAL_ORIGIN } from '../../scripts/verify-config.mjs';

const ORIGIN = 'https://www.example.com';

async function boot(page: Page) {
  await expect(page.locator('#boot-loader')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('[data-classic-root]')).toHaveJSProperty('inert', false);
}

async function headState(page: Page) {
  return page.evaluate(() => ({
    title: document.title,
    canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href,
    metadata: Array.from(document.head.querySelectorAll('meta[name], meta[property]'), (meta) => [
      meta.getAttribute('name') ?? meta.getAttribute('property'),
      meta.getAttribute('content'),
    ]),
    jsonLd: Array.from(
      document.querySelectorAll('script[data-site-json-ld]'),
      (script) => JSON.parse(script.textContent ?? '{}') as Record<string, unknown>,
    ),
  }));
}

for (const route of ['/blog/', '/blog/tag/设计/', '/blog/colophon/']) {
  test(`SSR head survives hydration at ${route}`, async ({ browser, page }) => {
    const ssr = await browser.newContext({ javaScriptEnabled: false });
    const ssrPage = await ssr.newPage();
    await ssrPage.goto(`${FUSION_GENERAL_ORIGIN}${route}`);
    const expected = await headState(ssrPage);
    await ssr.close();
    await page.goto(route);
    await boot(page);
    expect(await headState(page)).toEqual(expected);
    expect(expected.canonical).toBe(new URL(route, ORIGIN).href);
    if (route.includes('/tag/')) {
      expect(expected.title).toContain('#设计');
      expect(expected.jsonLd.map((entry) => entry['@type'])).toEqual([
        'CollectionPage',
        'BreadcrumbList',
      ]);
    }
    if (route.includes('/colophon/')) {
      expect(expected.jsonLd[0]).toMatchObject({
        '@type': 'BlogPosting',
        license: expect.any(String),
        copyrightNotice: expect.any(String),
      });
    }
  });
}

test('SPA tag, article and index navigation applies the complete head', async ({ page }) => {
  await page.goto('/blog/');
  await boot(page);
  await page.getByRole('button', { name: '设计 · 2', exact: true }).click();
  await expect(page).toHaveURL(/\/blog\/tag\/%E8%AE%BE%E8%AE%A1\/$/);
  await expect(page).toHaveTitle('#设计 · Blog · MiraHikari');
  await page.locator('[data-article-slug="colophon"]').click();
  await expect(page).toHaveURL(/\/blog\/colophon\/$/);
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
  await expect
    .poll(async () => (await headState(page)).jsonLd.map((entry) => entry['@type']))
    .toEqual(['BlogPosting', 'BreadcrumbList']);
  await page.goBack();
  await expect(page).toHaveTitle('#设计 · Blog · MiraHikari');
  await page.goBack();
  await expect(page).toHaveTitle('Blog · MiraHikari');
  await expect(page.locator('.blog-tags button').first()).toHaveText('ALL · 3');
  await page.screenshot({ path: test.info().outputPath('blog-index.png') });
});

test('an unknown history article returns to the blog list', async ({ page }) => {
  await page.goto('/blog/');
  await boot(page);
  await page.evaluate(() => {
    window.history.pushState(null, '', '/blog/missing-article/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page).toHaveURL(/\/blog\/$/);
  await expect(page).toHaveTitle('Blog · MiraHikari');
  await expect(page.locator('.blog-list')).toBeVisible();
});

test('hydration repairs a stale full head even when its canonical is already correct', async ({
  page,
}) => {
  await page.route('**/blog/colophon/', async (route) => {
    const response = await route.fetch();
    const html = (await response.text())
      .replace(/<title>[^<]*<\/title>/, '<title>Stale article title</title>')
      .replace(
        /<meta name="description" content="[^"]*"/,
        '<meta name="description" content="Stale description"',
      )
      .replace(
        /<script[^>]*data-site-json-ld[^>]*>[^<]*"@type":"BreadcrumbList"[^<]*<\/script>/,
        '',
      );
    await route.fulfill({ response, body: html });
  });
  await page.goto('/blog/colophon/');
  await boot(page);
  const head = await headState(page);
  expect(head.title).not.toBe('Stale article title');
  expect(head.canonical).toBe(`${ORIGIN}/blog/colophon/`);
  expect(head.jsonLd.map((entry) => entry['@type'])).toEqual(['BlogPosting', 'BreadcrumbList']);
  await expect(page.locator('meta[name="description"]')).not.toHaveAttribute(
    'content',
    'Stale description',
  );
});
