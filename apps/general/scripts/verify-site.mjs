import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { SITE_ORIGIN } from '../src/data/site-origin.ts';

// Generated-site validation for the classic presentation. The desktop has its
// own stricter validator; this one covers route, metadata and local-link
// integrity without requiring the R2 image mirror in a fresh checkout.
const root = resolve(process.env.MHK_SITE_DIST ?? 'dist');
const origin = SITE_ORIGIN;
const skippedPrefixes = ['/images/', '/admin', '/article-fragments/'];

async function exists(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? files(path) : [path];
      }),
    )
  ).flat();
}

function localTarget(pathname) {
  return resolve(root, `.${pathname}`);
}

const pages = (await files(root)).filter((file) => file.endsWith('.html'));
const canonicalPages = new Set();
for (const file of pages) {
  const html = await readFile(file, 'utf8');
  const relativeFile = file.replaceAll('\\', '/');
  // Article fragments are body-only endpoints; redirect stubs are not documents.
  if (relativeFile.includes('/article-fragments/')) continue;
  if (html.includes('http-equiv="refresh"')) continue;
  const admin = /(?:^|\/)admin(?:\/|\.html$)/.test(relativeFile);
  const notFound = /(?:^|\/)404(?:\.html$|\/)/.test(relativeFile);
  assert(html.includes('lang="zh-CN"'), `${file}: missing content language`);
  assert(/<title>[^<]+<\/title>/.test(html), `${file}: missing title`);
  if (!admin && !notFound) {
    const route = `/${relative(root, file)
      .replaceAll('\\', '/')
      .replace(/index\.html$/, '')}`;
    const canonical = new URL(route, origin).href;
    assert.equal(
      html.match(/<link rel="canonical" href="([^"]+)"/)?.[1],
      canonical,
      `${file}: canonical must exactly match its generated route`,
    );
    canonicalPages.add(canonical);
    const jsonLd = [...html.matchAll(/<script[^>]*data-site-json-ld[^>]*>(.*?)<\/script>/gs)].map(
      (match) => JSON.parse(match[1]),
    );
    if (route.startsWith('/blog/tag/')) {
      const tag = decodeURIComponent(route.slice('/blog/tag/'.length, -1));
      assert(
        html.includes(`<title>#${tag} · Blog · MiraHikari</title>`),
        `${file}: missing tag title`,
      );
      assert(
        jsonLd.some((entry) => entry['@type'] === 'CollectionPage' && entry.url === canonical),
        `${file}: missing tag collection schema`,
      );
      assert(
        jsonLd.some((entry) => entry['@type'] === 'BreadcrumbList'),
        `${file}: missing breadcrumbs`,
      );
    } else if (route === '/blog/') {
      assert(
        jsonLd.some((entry) => entry['@type'] === 'Blog' && entry.url === canonical),
        `${file}: missing blog index schema`,
      );
    } else if (route.startsWith('/blog/')) {
      const article = jsonLd.find((entry) => entry['@type'] === 'BlogPosting');
      assert(
        article?.url === canonical && article.license && article.copyrightNotice,
        `${file}: missing complete article schema`,
      );
      assert(
        jsonLd.some((entry) => entry['@type'] === 'BreadcrumbList'),
        `${file}: missing breadcrumbs`,
      );
    }
  }
  for (const match of html.matchAll(/(?:src|href)="(\/[^"#?]*)(?:[?#][^"]*)?"/g)) {
    const pathname = decodeURIComponent(match[1]);
    if (skippedPrefixes.some((prefix) => pathname.startsWith(prefix))) continue;
    const target = localTarget(pathname);
    assert(target.startsWith(root), `${file}: invalid local path ${pathname}`);
    assert(
      (await exists(target)) || (await exists(join(target, 'index.html'))),
      `${file}: missing local target ${pathname}`,
    );
  }
}

const sitemap = await readFile(join(root, 'sitemap-0.xml'), 'utf8');
const rss = await readFile(join(root, 'rss.xml'), 'utf8');
const atom = await readFile(join(root, 'atom.xml'), 'utf8');
const sitemapUrls = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]));
for (const canonical of canonicalPages) {
  assert(sitemapUrls.has(canonical), `Sitemap canonical mismatch: ${canonical}`);
}
for (const url of sitemapUrls) {
  if (url === `${origin}/privacy/`) continue; // Published redirect to the canonical notice.
  assert(canonicalPages.has(url), `Sitemap references no canonical document: ${url}`);
}
for (const feed of [rss, atom]) {
  for (const match of feed.matchAll(/https:\/\/[^<"\s]+\/blog\/[^<"\s]+/g)) {
    const url = match[0];
    assert(url.endsWith('/'), `Feed article URL must end in a slash: ${url}`);
    assert(sitemapUrls.has(url), `Feed URL is missing from sitemap: ${url}`);
  }
}
for (const slug of ['advx-2026-hangzhou', 'colophon', 'privacy']) {
  assert(sitemap.includes(`${origin}/blog/${slug}/`), `Sitemap is missing ${slug}`);
}
// Privacy is intentionally unlisted: reachable and indexable, but absent from RSS.
for (const slug of ['advx-2026-hangzhou', 'colophon']) {
  assert(rss.includes(`${origin}/blog/${slug}/`), `RSS is missing ${slug}`);
}
assert(!rss.includes(`${origin}/blog/privacy/`), 'Unlisted privacy article must stay out of RSS');
assert((await readFile(join(root, 'robots.txt'), 'utf8')).includes(`${origin}/sitemap`));
assert((await readFile(join(root, '404.html'), 'utf8')).includes('noindex'));

console.log(`Verified ${pages.length} general pages, canonical metadata and local links.`);
