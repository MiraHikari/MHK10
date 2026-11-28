import type { APIRoute } from 'astro';
import { profile } from '@/data/profile';
import { getListedPosts } from '@/lib/blog';
import { SITE_ORIGIN } from '@/lib/blog/legal';

function toAbsoluteUrl(path: string, site: URL): string {
  return new URL(path, site).href;
}

export const GET: APIRoute = async ({ site }) => {
  const baseUrl = site ?? new URL(SITE_ORIGIN);
  const posts = await getListedPosts();
  const articleLines = posts.map((post) => {
    const sourceUrl = toAbsoluteUrl(`/blog/${post.id}.md`, baseUrl);
    const details = [
      post.data.description.replace(/[。；;\s]+$/u, ''),
      post.data.tags.length > 0 ? `标签：${post.data.tags.join('、')}` : undefined,
      `发布于 ${post.data.publishDate.toISOString().slice(0, 10)}`,
      post.data.updatedDate
        ? `更新于 ${post.data.updatedDate.toISOString().slice(0, 10)}`
        : undefined,
    ]
      .filter(Boolean)
      .join('；');

    return `- [${post.data.title}](${sourceUrl}): ${details}`;
  });

  const content = [
    `# ${profile.name}`,
    '',
    `> ${profile.summary}`,
    '',
    '这是 MiraHikari 的个人作品集与博客，内容主要围绕全栈开发、开源工具、Web 技术、产品设计与工程实践。',
    '',
    '## 主要入口',
    '',
    `- [站点首页](${toAbsoluteUrl('/', baseUrl)}): 个人介绍、项目、技能、荣誉与联系信息。`,
    `- [博客首页](${toAbsoluteUrl('/blog/', baseUrl)}): 全部已发布文章及标签入口。`,
    `- [RSS](${toAbsoluteUrl('/rss.xml', baseUrl)}): 博客 RSS 2.0 订阅源。`,
    `- [Atom](${toAbsoluteUrl('/atom.xml', baseUrl)}): 博客 Atom 订阅源。`,
    '',
    '## 文章',
    '',
    ...(articleLines.length > 0 ? articleLines : ['暂无已发布文章。']),
    '',
    '## 使用说明',
    '',
    '- 上述文章链接返回 UTF-8 编码的原始 Markdown 或 MDX 源文件，并保留 YAML frontmatter。',
    '- 面向读者的规范页面位于相同路径的目录形式，例如 `/blog/example/`。',
    '- 引用内容时，请优先保留文章标题、作者与规范页面 URL。',
    '- 除另有说明外，博客文章采用 CC BY-NC-SA 4.0 许可（署名-非商业性使用-相同方式共享，https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans）。',
    '- 文章 frontmatter 的 aiLevel 字段标识创作来源：generated（AI 完全创作）、assisted（AI 辅助润色）、human（纯人工创作）；aiModel 为参与模型名。AI 参与生成的内容未必代表作者本人观点。',
    '',
  ].join('\n');

  return new Response(content, {
    headers: {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Content-Type': 'text/plain; charset=utf-8',
      Link: `<${toAbsoluteUrl('/', baseUrl)}>; rel="canonical"; type="text/html"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
