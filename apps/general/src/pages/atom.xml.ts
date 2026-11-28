import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';
import { profile } from '@/data/profile';
import { SITE_ORIGIN, articleLicenseSummary } from '@/lib/blog/legal';
import { blogIndexUrl, postUrl } from '@/lib/blog/client';

export const GET: APIRoute = async (context) => {
  // Astro 7 的 context.site 为 URL | undefined，回退站点常量。
  const posts = await getCollection('blog', ({ data }) => !data.draft && data.listed !== false);
  posts.sort((a, b) => b.data.publishDate.valueOf() - a.data.publishDate.valueOf());

  const { origin } = new URL(context.site ?? SITE_ORIGIN);

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="zh-CN">
  <id>${blogIndexUrl(origin)}</id>
  <title>${profile.name} · Blog</title>
  <subtitle>${profile.name} 的博客：关于工程、设计与创造的过程记录。</subtitle>
  <link href="${origin}/atom.xml" rel="self" type="application/atom+xml"/>
  <link href="${blogIndexUrl(origin)}" rel="alternate" type="text/html"/>
  <updated>${posts[0]?.data.publishDate.toISOString() ?? new Date().toISOString()}</updated>
  <author>
    <name>${profile.name}</name>
  </author>
  <generator>Astro</generator>
  <rights>${articleLicenseSummary()}</rights>
${posts
  .map(
    (post) => `  <entry>
    <id>${postUrl(post.id, origin)}</id>
    <title>${escapeXml(post.data.title)}</title>
    <link href="${postUrl(post.id, origin)}" rel="alternate" type="text/html"/>
    <published>${post.data.publishDate.toISOString()}</published>
    <updated>${(post.data.updatedDate ?? post.data.publishDate).toISOString()}</updated>
    <summary>${escapeXml(post.data.description)}</summary>
    ${post.data.tags.map((t) => `    <category term="${escapeXml(t)}" />`).join('\n    ')}
  </entry>`,
  )
  .join('\n')}
</feed>`.trim(),
    {
      headers: {
        'Content-Type': 'application/atom+xml; charset=utf-8',
      },
    },
  );
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
