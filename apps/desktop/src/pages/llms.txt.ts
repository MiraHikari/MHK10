import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { profile } from '../data/profile';
import { SITE_ORIGIN } from '../data/site-origin';

export const GET: APIRoute = async ({ site }) => {
  const baseUrl = site ?? new URL(SITE_ORIGIN);
  // Same visibility rule as sitemap/rss: drafts and source-site records stay out.
  const posts = await getCollection('posts', ({ data }) => !data.draft && data.listed);
  const articleLines = posts
    .sort(
      (a, b) => b.data.published.valueOf() - a.data.published.valueOf() || a.id.localeCompare(b.id),
    )
    .map((post) => {
      const details = [
        post.data.description.replace(/[。；;\s]+$/u, ''),
        post.data.tags.length > 0 ? `标签：${post.data.tags.join('、')}` : undefined,
        `发布于 ${post.data.published.toISOString().slice(0, 10)}`,
        post.data.updated ? `更新于 ${post.data.updated.toISOString().slice(0, 10)}` : undefined,
      ]
        .filter(Boolean)
        .join('；');
      return `- [${post.data.title}](${new URL(`/blog/${post.id}/`, baseUrl).href}): ${details}`;
    });

  const content = [
    `# ${profile.name}`,
    '',
    `> ${profile.summary}`,
    '',
    '这是 MiraHikari 的个人站点 MHK10：一个 Win95 风格的像素桌面，个人介绍、项目、技能、相册与博客都以桌面窗口和应用的形式呈现。',
    '',
    '## 主要入口',
    '',
    `- [站点首页](${new URL('/', baseUrl).href}): 像素桌面（桌面图标、窗口、任务栏与小应用）。`,
    `- [About](${new URL('/about/', baseUrl).href}): 个人介绍、项目与联系方式。`,
    `- [Skills](${new URL('/skills/', baseUrl).href}): 技能列表。`,
    `- [Pictures](${new URL('/gallery/', baseUrl).href}): 相册。`,
    `- [Journal](${new URL('/blog/', baseUrl).href}): 全部已发布文章。`,
    `- [RSS](${new URL('/rss.xml', baseUrl).href}): 博客 RSS 2.0 订阅源。`,
    '',
    '## 文章',
    '',
    ...(articleLines.length > 0 ? articleLines : ['暂无已发布文章。']),
    '',
    '## 使用说明',
    '',
    '- 文章链接返回面向读者的 HTML 页面；正文为中文。',
    '- 桌面（首页）依赖客户端脚本渲染；抓取正文内容请优先使用 About、Journal 等静态页面。',
    '- 引用内容时，请保留文章标题、作者与规范页面 URL。',
    '- 站点由 iframe 嵌入通用站（www.example.com）提供桌面模式展示，本站规范地址为独立子域名。',
    '',
  ].join('\n');

  return new Response(content, {
    headers: {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Content-Type': 'text/plain; charset=utf-8',
      Link: `<${new URL('/', baseUrl).href}>; rel="canonical"; type="text/html"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
