import blogCssUrl from '@/styles/features/blog/index.css?url';

const LINK_ID = 'injected-blog-css';

/**
 * 博客样式只随服务端渲染的博客路由（/blog/*）加载。SPA 内从其他章节进入
 * 博客（列表或文章）时按需注入一次；幂等，BlogSection 与 ArticleView 共用。
 */
export function ensureBlogStyles() {
  if (typeof document === 'undefined' || !blogCssUrl) return;
  if (document.getElementById(LINK_ID)) return;
  const pathname = new URL(blogCssUrl, document.baseURI).pathname;
  if (
    Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]')).some(
      (link) => new URL(link.href, document.baseURI).pathname === pathname,
    )
  )
    return;

  const link = document.createElement('link');
  link.id = LINK_ID;
  link.rel = 'stylesheet';
  link.href = blogCssUrl;
  document.head.appendChild(link);
}
