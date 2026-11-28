/**
 * Intercept same-origin `/blog/<slug>` links inside article prose so SPA
 * navigation (fragment prefetch + section transition) replaces a full reload.
 */
import { getArticleSlugFromPath, isUnmodifiedPrimaryClick } from '@/lib/blog/client';

export function enhanceArticleLinks(
  container: HTMLElement,
  onOpenArticle: (slug: string) => void,
): () => void {
  const handleClick = (event: MouseEvent) => {
    if (event.defaultPrevented || !isUnmodifiedPrimaryClick(event)) return;

    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest('a');
    if (!anchor || !container.contains(anchor)) return;

    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('#')) return;

    let url: URL;
    try {
      url = new URL(href, window.location.origin);
    } catch {
      return;
    }
    if (url.origin !== window.location.origin) return;

    // Raw markdown export endpoints stay as full navigations.
    if (url.pathname.endsWith('.md')) return;

    const slug = getArticleSlugFromPath(url.pathname);
    if (!slug) return;

    event.preventDefault();
    onOpenArticle(slug);
  };

  container.addEventListener('click', handleClick);
  return () => container.removeEventListener('click', handleClick);
}
