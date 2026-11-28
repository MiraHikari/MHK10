import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { SITE_ORIGIN } from '../data/site-origin';

const escapeXml = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]!,
  );

export const GET: APIRoute = async ({ site }) => {
  const origin = site ?? new URL(SITE_ORIGIN);
  const posts = (await getCollection('posts', ({ data }) => !data.draft && data.listed)).sort(
    (a, b) => b.data.published.valueOf() - a.data.published.valueOf() || a.id.localeCompare(b.id),
  );
  const items = posts
    .map((post) => {
      const url = new URL(`/blog/${post.id}/`, origin).href;
      return `<item><title>${escapeXml(post.data.title)}</title><link>${escapeXml(url)}</link><guid isPermaLink="true">${escapeXml(url)}</guid><description>${escapeXml(post.data.description)}</description><pubDate>${post.data.published.toUTCString()}</pubDate>${post.data.tags.map((tag) => `<category>${escapeXml(tag)}</category>`).join('')}</item>`;
    })
    .join('');
  const updated = posts
    .map((post) => post.data.updated ?? post.data.published)
    .sort((a, b) => b.valueOf() - a.valueOf())[0];
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>MiraHikari · 文章</title><link>${escapeXml(origin.href)}</link><description>MiraHikari 的旅行随笔与 MHK10 技术说明。</description><language>zh-CN</language>${updated ? `<lastBuildDate>${updated.toUTCString()}</lastBuildDate>` : ''}<atom:link href="${escapeXml(new URL('/rss.xml', origin).href)}" rel="self" type="application/rss+xml"/>${items}</channel></rss>`,
    { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } },
  );
};
