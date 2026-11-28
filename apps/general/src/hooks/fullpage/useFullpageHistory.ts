import { useEffect, type RefObject } from 'react';
import {
  SECTIONS,
  getSectionIdFromPath,
  getSectionIndex,
  normalizeSectionPath,
  type SectionId,
} from '@/lib/sections';
import { getArticleSlugFromPath } from '@/lib/blog/client';
import { destinationFromUrl, type FusionDestination } from '@mhk/site-core/fusion/protocol-model';

interface UseFullpageHistoryArgs {
  readonly initialSectionId: SectionId;
  readonly activeIndexRef: RefObject<number>;
  readonly activeArticleRef: RefObject<string | null>;
  readonly navigateToSection: (targetIndex: number, syncHistory?: boolean) => void;
  readonly navigateToArticle: (slug: string, syncHistory?: boolean) => void;
  readonly navigateBackFromArticle: (syncHistory?: boolean) => void;
  readonly handleNavigate: (sectionId: string) => void;
  readonly onDeepLink?: (destination: FusionDestination | null) => void;
}

export function useFullpageHistory({
  initialSectionId,
  activeIndexRef,
  activeArticleRef,
  navigateToSection,
  navigateToArticle,
  navigateBackFromArticle,
  handleNavigate,
  onDeepLink,
}: UseFullpageHistoryArgs) {
  useEffect(() => {
    const state: { sectionId: string; articleSlug?: string } = {
      sectionId: SECTIONS[activeIndexRef.current]?.id ?? initialSectionId,
    };
    if (activeArticleRef.current) state.articleSlug = activeArticleRef.current;
    window.history.replaceState(state, '', window.location.href);

    const handlePopState = () => {
      onDeepLink?.(destinationFromUrl(new URL(window.location.href), 'general'));
      const normalizedPath = normalizeSectionPath(window.location.pathname);
      // `/blog/tag/*` is a list route, not an article whose slug happens to be
      // `tag/*`. Classify the special list routes before parsing article slugs.
      const isBlogListPath = normalizedPath === '/blog' || normalizedPath.startsWith('/blog/tag/');
      const slug = isBlogListPath ? null : getArticleSlugFromPath(normalizedPath);
      if (slug) {
        // Target is an article. runTransition handles the from-state (list or
        // another article) via activeArticleRef internally.
        if (activeArticleRef.current !== slug) {
          navigateToArticle(slug, false);
        }
        return;
      }

      // Target is a section page. If we're reading an article and the target
      // is the blog list, return to it; for any other section, navigate to it
      // (navigateToSection clears article mode in its commit and uses the
      // correct from-watermark via currentWatermark()).
      const targetSectionId = isBlogListPath ? 'blog' : getSectionIdFromPath(normalizedPath);
      if (targetSectionId === 'blog' && activeArticleRef.current) {
        navigateBackFromArticle(false);
        return;
      }
      const targetIndex = getSectionIndex(targetSectionId);
      if (targetIndex >= 0) {
        navigateToSection(targetIndex, false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [
    activeIndexRef,
    activeArticleRef,
    initialSectionId,
    navigateToSection,
    navigateToArticle,
    navigateBackFromArticle,
    onDeepLink,
  ]);

  useEffect(() => {
    const handler = (event: Event) => {
      if (!(event instanceof CustomEvent) || typeof event.detail !== 'string') return;
      handleNavigate(event.detail);
    };

    window.addEventListener('navigate-section', handler);
    return () => window.removeEventListener('navigate-section', handler);
  }, [handleNavigate]);
}
