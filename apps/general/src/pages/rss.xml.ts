import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';
import { profile } from '@/data/profile';
import { SITE_ORIGIN, articleLicenseSummary } from '@/lib/blog/legal';
import { postUrl } from '@/lib/blog/client';

export const GET: APIRoute = async (context) => {
  // Astro 7 的 context.site 为 URL | undefined；`rss()` 接受 string | URL。
  const site = context.site ?? SITE_ORIGIN;
  const posts = await getCollection('blog', ({ data }) => !data.draft && data.listed !== false);
  posts.sort((a, b) => b.data.publishDate.valueOf() - a.data.publishDate.valueOf());

  return rss({
    title: `${profile.name} · Blog`,
    description: `${profile.name} 的博客：关于工程、设计与创造的过程记录。`,
    site,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.publishDate,
      description: post.data.description,
      link: postUrl(post.id, new URL(site).origin),
      categories: post.data.tags,
    })),
    xmlns: { atom: 'http://www.w3.org/2005/Atom' },
    customData: `<language>zh-CN</language><copyright>${articleLicenseSummary()}</copyright><atom:link href="${new URL('/rss.xml', site).href}" rel="self" type="application/rss+xml"/>`,
  });
};
