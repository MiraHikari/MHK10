import type { APIRoute, GetStaticPaths } from 'astro';
import { getAllPosts, getPostById } from '@/lib/blog';
import { getBlogSource } from '@/lib/blog/source';
import { aiDisclosure, aiLevelLabel } from '@/lib/blog/ai';
import { BLOG_LICENSE, REPRINT_NOTE, SITE_ORIGIN, copyrightLine } from '@/lib/blog/legal';

export const getStaticPaths = (async () => {
  const posts = await getAllPosts();

  return posts.map((post) => ({
    params: { slug: post.id },
    props: { id: post.id },
  }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props, site }) => {
  const id = String(props.id);
  const source = getBlogSource(id);

  if (source === undefined) {
    return new Response('Article source not found.\n', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const canonicalUrl = new URL(`/blog/${id}/`, site ?? SITE_ORIGIN);
  const filename = `${id.split('/').at(-1) ?? 'article'}.md`;

  // 追加版权与 AI 创作来源声明，让抓取 Markdown 的读者与 LLM 都能看到许可要求。
  const post = await getPostById(id);
  const noticeLines = [
    '',
    '---',
    '',
    `> ${copyrightLine()} · 本文采用 ${BLOG_LICENSE.id} 许可（${BLOG_LICENSE.url}）`,
    `> ${REPRINT_NOTE}`,
    `> 规范页面：${canonicalUrl.href}`,
  ];
  if (post && post.data.aiLevel !== 'human') {
    const level = post.data.aiLevel;
    noticeLines.push(
      `> 创作来源：${aiLevelLabel(level, post.data.aiModel)} — ${aiDisclosure(level, post.data.aiModel)}`,
    );
  }
  const bodyWithNotice = `${source.trimEnd()}\n${noticeLines.join('\n')}\n`;

  return new Response(bodyWithNotice, {
    headers: {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Content-Disposition': `inline; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '-')}"`,
      'Content-Type': 'text/markdown; charset=utf-8',
      Link: `<${canonicalUrl.href}>; rel="canonical"; type="text/html"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
