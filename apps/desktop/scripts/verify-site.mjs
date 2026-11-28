import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { SITE_ORIGIN } from '../src/data/site-origin.ts';

const root = resolve(process.env.MHK_SITE_DIST ?? 'dist');
const origin = SITE_ORIGIN;
async function exists(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)],
      ),
    )
  ).flat();
}
const pages = (await files(root)).filter((file) => file.endsWith('.html'));
for (const file of pages) {
  const html = await readFile(file, 'utf8');
  assert(/<title>[^<]*MHK10[^<]*<\/title>/.test(html), `${file}: missing MHK10 page title`);
  for (const match of html.matchAll(/(?:src|href)="(\/[^"#?]*)(?:[?#][^"]*)?"/g)) {
    const pathname = decodeURIComponent(match[1]);
    const target = resolve(root, `.${pathname}`);
    assert(target.startsWith(root), `Invalid asset path: ${pathname}`);
    assert(
      (await exists(target)) || (await exists(join(target, 'index.html'))),
      `${file}: missing ${pathname}`,
    );
  }
}
const articles = ['/blog/advx-2026-hangzhou/', '/blog/colophon/', '/blog/mhk10-technical/'];
const revisions = {
  '/blog/advx-2026-hangzhou/': '2026-10-10',
  '/blog/colophon/': '2026-08-03',
  '/blog/mhk10-technical/': '2026-10-10',
};
const privacy = '/blog/privacy/';
for (const path of ['/', '/about/', '/skills/', '/gallery/', '/blog/', ...articles, privacy]) {
  const html = await readFile(join(root, path, 'index.html'), 'utf8');
  assert(html.includes(`rel="canonical" href="${origin}${path}"`), `Missing canonical: ${path}`);
  assert(html.includes('application/ld+json'), `Missing structured data: ${path}`);
  assert(/<h1\b/.test(html), `Missing server-rendered heading: ${path}`);
  assert(html.includes('lang="zh-CN"'), `Missing content language: ${path}`);
  assert(html.includes('property="og:image:alt"'), `Missing share-image alternative: ${path}`);
  assert(html.includes('property="og:image:type"'), `Missing share-image type: ${path}`);
  assert(html.includes('name="twitter:image:alt"'), `Missing Twitter image alternative: ${path}`);
  assert(
    html.includes('name="robots" content="index, follow, max-image-preview:large"'),
    `Missing indexable robots policy: ${path}`,
  );
  const structured = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  const schema = JSON.parse(structured?.[1] ?? 'null');
  assert(
    schema?.['@graph']?.some((entity) => ['WebPage', 'ProfilePage'].includes(entity['@type'])),
    `Missing page entity: ${path}`,
  );
  assert(
    schema?.['@graph']?.some((entity) => entity['@type'] === 'BreadcrumbList'),
    `Missing breadcrumb entity: ${path}`,
  );
  if (articles.includes(path)) {
    const article = schema['@graph'].find((entity) => entity['@type'] === 'BlogPosting');
    assert(article?.dateModified?.startsWith(revisions[path]), `Missing article revision: ${path}`);
    assert(
      html.includes('property="article:modified_time"'),
      `Missing article share revision: ${path}`,
    );
  }
}
const sitemap = await readFile(join(root, 'sitemap.xml'), 'utf8');
const rss = await readFile(join(root, 'rss.xml'), 'utf8');
for (const path of [...articles, privacy]) {
  assert(sitemap.includes(`${origin}${path}`), `Article absent from sitemap: ${path}`);
  assert(rss.includes(`${origin}${path}`), `Article absent from RSS: ${path}`);
}
for (const path of ['/blog/site-update/']) {
  const html = await readFile(join(root, path, 'index.html'), 'utf8');
  assert(html.includes('noindex'), `Retired article remains indexable: ${path}`);
  assert(
    html.includes(`rel="canonical" href="${origin}/blog/colophon/"`),
    `Retired article canonical drift: ${path}`,
  );
  assert(html.includes('http-equiv="refresh"'), `Missing compatibility redirect: ${path}`);
  assert(!sitemap.includes(`${origin}${path}`), `Retired article in sitemap: ${path}`);
  assert(!rss.includes(`${origin}${path}`), `Retired article in RSS: ${path}`);
}
assert(sitemap.includes('<lastmod>2026-10-10'));
assert(!sitemap.includes('example.org'));
assert(sitemap.includes('/blog/privacy/') && !sitemap.includes('/blog/site-update/'));
assert((await readFile(join(root, 'robots.txt'), 'utf8')).includes(`${origin}/sitemap.xml`));
assert((await readFile(join(root, '404.html'), 'utf8')).includes('noindex'));
console.log(
  `Verified ${pages.length} generated pages, local links/assets, canonical URLs, structured data, sitemap and RSS.`,
);
