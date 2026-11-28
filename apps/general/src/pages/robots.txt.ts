import type { APIRoute } from 'astro';
import { SITE_ORIGIN } from '@/lib/blog/legal';

const getRobotsTxt = (sitemapURL: URL) => `\
User-agent: *
Allow: /
Disallow: /article-fragments/
Disallow: /admin

Sitemap: ${sitemapURL.href}
`;

export const GET: APIRoute = ({ site }) => {
  // `site` 在 Astro 7 中类型为 URL | undefined；未配置时回退站点常量。
  const sitemapURL = new URL('sitemap-index.xml', site ?? SITE_ORIGIN);
  return new Response(getRobotsTxt(sitemapURL), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
