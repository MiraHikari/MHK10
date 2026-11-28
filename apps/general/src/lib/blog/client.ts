/**
 * Client-safe blog helpers — no `astro:content` imports, so they're safe to
 * bundle into the React SPA. The server-only query/render helpers live in
 * `@/lib/blog`; this module is what client components (App, ArticleView,
 * BlogSection, navigation hooks) import from.
 */
import { normalizeSectionPath } from '@/lib/sections';
import { toEnglishCategory } from '@/lib/category-map';
import { SITE_ORIGIN } from './legal';
import { canonicalUrl } from '@/lib/canonical-url';

/** Unlisted privacy notice — opened from footer / mobile drawer via SPA nav. */
export const PRIVACY_ARTICLE_SLUG = 'privacy';

/** True for an unmodified primary click (Cmd/Ctrl-click keeps native new-tab). */
export function isUnmodifiedPrimaryClick(
  event: Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/**
 * Intercept a same-origin article `<a>` click for SPA open.
 * Returns true when the default navigation was prevented.
 */
export function openArticleFromClick(
  event: Pick<
    MouseEvent,
    'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'preventDefault'
  >,
  onOpenArticle: ((slug: string) => void) | undefined,
  slug: string,
  beforeOpen?: () => void,
): boolean {
  if (!onOpenArticle || !isUnmodifiedPrimaryClick(event)) return false;
  event.preventDefault();
  beforeOpen?.();
  onOpenArticle(slug);
  return true;
}

/** Extract the article slug from a `/blog/<slug>` pathname, or null otherwise. */
export function getArticleSlugFromPath(pathname: string): string | null {
  const norm = normalizeSectionPath(pathname);
  if (norm === '/blog' || !norm.startsWith('/blog/')) return null;
  try {
    return decodeURIComponent(norm.slice('/blog/'.length));
  } catch {
    return null;
  }
}

/**
 * The watermark text used during the article enter/return transition — the
 * post's category when available, else "READ". Keeps the 打字特效 consistent
 * with section switches (which use each section's `watermark` field).
 */
export function articleWatermarkFor(post?: { category?: string }): string {
  return toEnglishCategory(post?.category);
}

const DATE_FMT = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Stable zh-CN date string for display, e.g. 2024-07-08. */
export function formatPostDate(date: Date): string {
  return DATE_FMT.format(date).replace(/\//g, '-');
}

/** Build an absolute URL for a blog post given its slug. */
export function postUrl(slug: string, base = SITE_ORIGIN): string {
  return canonicalUrl(`/blog/${slug}`, base);
}

/** Build an absolute URL for the blog index. */
export const blogIndexUrl = (base = SITE_ORIGIN) => canonicalUrl('/blog/', base);
