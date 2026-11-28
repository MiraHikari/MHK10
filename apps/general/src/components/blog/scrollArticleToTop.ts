/**
 * Scroll the open article back to the top. The article scrolls inside a
 * `.section-scroll` container when present (see resolveScrollContext in
 * ArticleScrollProvider); resolve it from the caller's element, then fall back
 * to the global `.section-scroll` scroller and finally the window.
 */
export function scrollArticleToTop(from: HTMLElement | null, smooth: boolean): void {
  const behavior: ScrollBehavior = smooth ? 'smooth' : 'auto';
  const container =
    from?.closest<HTMLElement>('.section-scroll') ??
    document.querySelector<HTMLElement>('.section-scroll');
  if (container) {
    container.scrollTo({ top: 0, behavior });
  } else {
    window.scrollTo({ top: 0, behavior });
  }
}
