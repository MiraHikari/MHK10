import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { SITE_ORIGIN } from '../data/site-origin';

export const prerender = true;

const escapeXml = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (character) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]!,
  );

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL(SITE_ORIGIN);
  // Only public library entries belong in search indexes. Drafts and source-site
  // records can still keep a compatibility route, but they are not publications.
  const posts = await getCollection('posts', ({ data }) => !data.draft && data.listed);
  const paths = [
    ...['/', '/about/', '/skills/', '/gallery/', '/blog/'].map((path) => ({
      path,
      modified: undefined as string | undefined,
    })),
    ...posts.map((post) => ({
      path: `/blog/${post.id}/`,
      modified: (post.data.updated ?? post.data.published).toISOString(),
    })),
  ];
  const entries = paths
    .map(
      ({ path, modified }) =>
        `<url><loc>${escapeXml(new URL(path, base).href)}</loc>${modified ? `<lastmod>${modified}</lastmod>` : ''}</url>`,
    )
    .join('');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
};
