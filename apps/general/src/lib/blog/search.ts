import Fuse from 'fuse.js';

/** Minimal article shape needed for full-text search. */
export interface SearchableArticle {
  id: string;
  title: string;
  description?: string;
  tags?: string[];
}

let fuseInstance: Fuse<SearchableArticle> | null = null;
let lastArticleSignature = '';

function articleSignature(articles: readonly SearchableArticle[]): string {
  return articles
    .map(
      (article) =>
        `${article.id}\u0000${article.title}\u0000${article.description ?? ''}\u0000${article.tags?.join(',') ?? ''}`,
    )
    .join('\u0001');
}

function getBlogSearch(articles: readonly SearchableArticle[]): Fuse<SearchableArticle> {
  const signature = articleSignature(articles);
  if (!fuseInstance || signature !== lastArticleSignature) {
    fuseInstance = new Fuse(articles as SearchableArticle[], {
      keys: [
        { name: 'title', weight: 2 },
        { name: 'description', weight: 1.5 },
        { name: 'tags', weight: 1 },
      ],
      threshold: 0.4,
      includeScore: true,
      minMatchCharLength: 1,
    });
    lastArticleSignature = signature;
  }
  return fuseInstance;
}

export function searchArticles(
  articles: readonly SearchableArticle[],
  query: string,
): { item: SearchableArticle; score: number }[] {
  if (!query.trim()) return [];
  const fuse = getBlogSearch(articles);
  return fuse.search(query.trim()).map((r) => ({ item: r.item, score: r.score ?? 1 }));
}

export function resetSearch(): void {
  fuseInstance = null;
  lastArticleSignature = '';
}
