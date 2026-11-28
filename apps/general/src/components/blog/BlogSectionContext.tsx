import { createContext, useContext, type ReactNode } from 'react';
import type { ArticleListItem } from '@/lib/blog/types';

/**
 * Blog-only slice of the section render data. Provided by `SectionViewport`
 * for the whole section tree; `BlogSection` / `ArticleView` (and the router
 * that picks between them) consume it.
 *
 * Splitting blog fields out of the generic section props means non-blog
 * sections never receive article data, and blog consumers subscribe exactly
 * to the state they use.
 */
export interface BlogSectionContextValue {
  /** Full article list (meta + TOC + prev/next). */
  readonly articles: readonly ArticleListItem[];
  /** Slug of the article open in reading mode, or null. */
  readonly activeArticle: string | null;
  readonly blogActiveTag: string | null;
  readonly onBlogActiveTagChange: (tag: string | null) => void;
  /** Open an article in the SPA reading mode. */
  readonly onOpenArticle: (slug: string) => void;
  /** Return from article reading mode to the blog list. */
  readonly onBackFromArticle: () => void;
  /** Server-rendered article body for direct-load of `/blog/[slug]`. */
  readonly articleBody: ReactNode;
  /** Slug that owns `articleBody`; prevents stale SSR children after SPA navigation. */
  readonly articleBodySlug: string | null;
  /** Mobile TOC sheet open state. */
  readonly tocOpen: boolean;
  /** Mobile TOC sheet open state changer. */
  readonly onTocOpenChange: (open: boolean) => void;
}

const BlogSectionContext = createContext<BlogSectionContextValue | null>(null);

export function BlogSectionProvider({
  value,
  children,
}: {
  readonly value: BlogSectionContextValue;
  readonly children: ReactNode;
}) {
  return <BlogSectionContext.Provider value={value}>{children}</BlogSectionContext.Provider>;
}

/** Blog data for the enclosing section. Must be used inside the blog section tree. */
export function useBlogSection(): BlogSectionContextValue {
  const value = useContext(BlogSectionContext);
  if (!value) {
    throw new Error('useBlogSection() used outside a BlogSectionProvider');
  }
  return value;
}
