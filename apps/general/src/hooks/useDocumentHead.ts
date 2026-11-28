import { profile } from '@/data/profile';
import { resolveImageSrc } from '@/lib/images/url';
import { SITE_ORIGIN } from '@/data/site-origin';
import { canonicalUrl } from '@/lib/canonical-url';
import type { BlogHead } from '@/lib/blog/head-model';
import { faviconHref } from '@/data/favicon';
import type { DisplayMode } from '@/hooks/useDisplayMode';

const DEFAULT_OG_IMAGE = new URL(resolveImageSrc('/images/og/default.webp'), SITE_ORIGIN).href;

function setMeta(selector: string, attribute: 'content', value?: string) {
  const elements = document.head.querySelectorAll<HTMLMetaElement>(selector);
  const element = elements[0];
  elements.forEach((meta, index) => {
    if (index > 0) meta.remove();
  });
  if (!value) {
    element?.remove();
    return;
  }
  if (element) {
    element.setAttribute(attribute, value);
    return;
  }
  const meta = document.createElement('meta');
  const propertyMatch = selector.match(/^meta\[property="([^"]+)"\]$/);
  const nameMatch = selector.match(/^meta\[name="([^"]+)"\]$/);
  if (propertyMatch) meta.setAttribute('property', propertyMatch[1]);
  if (nameMatch) meta.setAttribute('name', nameMatch[1]);
  meta.setAttribute(attribute, value);
  document.head.append(meta);
}

function setCanonical(url: string) {
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.append(canonical);
  }
  canonical.href = url;
}

function setJsonLd(entries: readonly Record<string, unknown>[]) {
  document.head.querySelectorAll('script[data-site-json-ld]').forEach((script) => script.remove());
  for (const entry of entries) {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.siteJsonLd = '';
    script.textContent = JSON.stringify(entry);
    document.head.append(script);
  }
}

/**
 * 双模式 favicon：classic = 品牌字标（favicon.webp），win95 = 像素化头像。
 * `@/data/favicon` 是变体的单一来源，`?v=` 携带模式名以击穿同 href 缓存。
 * 切换显示模式时同步 head 里的站点图标（BaseHead 以 data-site-favicon 标识）。
 */
export function syncFavicon(mode: DisplayMode) {
  const icon = document.head.querySelector<HTMLLinkElement>('link[data-site-favicon="icon"]');
  const apple = document.head.querySelector<HTMLLinkElement>('link[data-site-favicon="apple"]');
  if (icon) icon.href = faviconHref(mode);
  if (apple) apple.href = faviconHref(mode, 'apple');
}

function blogMeta(head: BlogHead): Readonly<Record<string, string | undefined>> {
  return {
    'meta[name="description"]': head.description,
    'meta[name="author"]': head.authors.join(', '),
    'meta[name="keywords"]': head.keywords.join(', ') || undefined,
    'meta[property="og:type"]': head.type,
    'meta[property="og:title"]': head.title,
    'meta[property="og:description"]': head.description,
    'meta[property="og:url"]': head.canonical,
    'meta[property="og:image"]': head.image,
    'meta[name="twitter:title"]': head.title,
    'meta[name="twitter:description"]': head.description,
    'meta[name="twitter:image"]': head.image,
    'meta[property="article:published_time"]': head.publishedTime,
    'meta[property="article:modified_time"]': head.modifiedTime,
  };
}

function articleProperties(head: BlogHead): Readonly<Record<string, readonly string[]>> {
  return {
    'article:author': head.type === 'article' ? head.authors : [],
    'article:tag': head.type === 'article' ? head.tags : [],
  };
}

/** Preserve the SSR nodes only when their complete authored state is current. */
function matchesBlogHead(head: BlogHead): boolean {
  if (document.title !== head.title) return false;
  if (
    document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href !== head.canonical
  )
    return false;
  for (const [selector, value] of Object.entries(blogMeta(head))) {
    const elements = document.head.querySelectorAll<HTMLMetaElement>(selector);
    if (value ? elements.length !== 1 || elements[0].content !== value : elements.length !== 0)
      return false;
  }
  for (const [property, values] of Object.entries(articleProperties(head))) {
    const actual = Array.from(
      document.head.querySelectorAll<HTMLMetaElement>(`meta[property="${property}"]`),
      (meta) => meta.content,
    );
    if (JSON.stringify(actual) !== JSON.stringify(values)) return false;
  }
  const scripts = Array.from(document.head.querySelectorAll('script[data-site-json-ld]'));
  if (scripts.length !== head.jsonLd.length) return false;
  try {
    return scripts.every(
      (script, index) =>
        JSON.stringify(JSON.parse(script.textContent ?? '') as unknown) ===
        JSON.stringify(head.jsonLd[index]),
    );
  } catch {
    return false;
  }
}

export function applyBlogHead(head: BlogHead) {
  if (matchesBlogHead(head)) return;
  document.title = head.title;
  setCanonical(head.canonical);
  for (const [selector, value] of Object.entries(blogMeta(head)))
    setMeta(selector, 'content', value);
  for (const [property, values] of Object.entries(articleProperties(head))) {
    document.head.querySelectorAll(`meta[property="${property}"]`).forEach((meta) => meta.remove());
    for (const value of values) {
      const meta = document.createElement('meta');
      meta.setAttribute('property', property);
      meta.content = value;
      document.head.append(meta);
    }
  }
  setJsonLd(head.jsonLd);
}
export function syncSectionHead(title: string) {
  const canonical = canonicalUrl(window.location.pathname);
  document.title = title;
  setCanonical(canonical);
  setMeta('meta[name="description"]', 'content', profile.summary);
  setMeta('meta[name="author"]', 'content', profile.name);
  setMeta('meta[name="keywords"]', 'content', undefined);
  setMeta('meta[property="og:type"]', 'content', 'website');
  setMeta('meta[property="og:title"]', 'content', title);
  setMeta('meta[property="og:description"]', 'content', profile.summary);
  setMeta('meta[property="og:url"]', 'content', canonical);
  setMeta('meta[property="og:image"]', 'content', DEFAULT_OG_IMAGE);
  setMeta('meta[name="twitter:title"]', 'content', title);
  setMeta('meta[name="twitter:description"]', 'content', profile.summary);
  setMeta('meta[name="twitter:image"]', 'content', DEFAULT_OG_IMAGE);
  setMeta('meta[property="article:published_time"]', 'content', undefined);
  setMeta('meta[property="article:modified_time"]', 'content', undefined);
  document.head
    .querySelectorAll('meta[property="article:author"], meta[property="article:tag"]')
    .forEach((meta) => meta.remove());
  setJsonLd([]);
}
