import { getCollection, render, type CollectionEntry } from 'astro:content';
import { measureReadingText } from '@mhk/site-core/content-model/reading-stats';
import { profile } from '@/data/profile';
import { buildSeriesNav, type SeriesEntry } from './series';
import { countTags } from './tags';
import type {
  ArticleHeading,
  ArticleListItem,
  ArticleRelationItem,
  Post,
  PostNavItem,
  TagCount,
} from './types';

export type BlogEntry = CollectionEntry<'blog'>;

/**
 * All published posts, newest first. Drafts are visible in dev only.
 * Includes unlisted posts (reachable by URL, omitted from public indexes).
 */
export async function getAllPosts(): Promise<BlogEntry[]> {
  const posts = await getCollection('blog', ({ data }) =>
    import.meta.env.PROD ? data.draft !== true : true,
  );
  return posts.sort((a, b) => b.data.publishDate.valueOf() - a.data.publishDate.valueOf());
}

export function isListedPost(entry: BlogEntry): boolean {
  return entry.data.listed !== false;
}

/** Published posts that appear in list / tags / feeds / command search. */
export async function getListedPosts(): Promise<BlogEntry[]> {
  const posts = await getAllPosts();
  return posts.filter(isListedPost);
}

export async function getFeaturedPosts(): Promise<BlogEntry[]> {
  const posts = await getListedPosts();
  return posts.filter((p) => p.data.featured);
}

export async function getPostById(id: string): Promise<BlogEntry | undefined> {
  const posts = await getAllPosts();
  return posts.find((p) => p.id === id);
}

/**
 * Previous (older) and next (newer) posts relative to the given id, for
 * post-page navigation. Returns { prev, next } in reading order.
 */
export async function getAllTags(): Promise<TagCount[]> {
  const posts = await getListedPosts();
  return countTags(posts.map((post) => post.data));
}

export async function getPostsByTag(tag: string): Promise<BlogEntry[]> {
  const posts = await getListedPosts();
  return posts.filter((p) => p.data.tags.some((t) => t.toLowerCase() === tag.toLowerCase()));
}

/** Reading-time estimate using the shared 400 CJK characters or 200 words per minute. */
export function estimateReadingTime(body?: string): number {
  const raw = body ?? '';
  const text = raw
    .replace(/```[\s\S]*?```/g, ' ')
    // MDX \u7ec4\u4ef6/HTML \u6807\u7b7e\u6574\u4f53\u5265\u79bb\uff08\u542b\u591a\u884c\u5c5e\u6027\uff09\uff0c\u56fe\u6ce8\u7b49 props \u6587\u6848\u4e0d\u8ba1\u5165\u6b63\u6587\u65f6\u957f\u3002
    .replace(/<\/?[A-Za-z][^<>]*>/g, ' ')
    .replace(/[#>*_`~\-]/g, ' ')
    .trim();
  return Math.max(1, Math.round(measureReadingText(text).minutes));
}

/** Normalize a collection entry into the `Post` shape used by UI components. */
export function toPost(entry: BlogEntry): Post {
  const { data, body } = entry;
  return {
    id: entry.id,
    title: data.title,
    description: data.description,
    publishDate: data.publishDate,
    updatedDate: data.updatedDate,
    tags: data.tags,
    category: data.category,
    heroImage: data.heroImage,
    heroAlt: data.heroAlt,
    draft: data.draft,
    listed: data.listed !== false,
    featured: data.featured,
    comments: data.comments !== false,
    author: data.author ?? profile.name,
    aiLevel: data.aiLevel ?? 'human',
    aiModel: data.aiModel,
    relatedIds: data.related,
    series: data.series,
    seriesOrder: data.seriesOrder,
    version: data.version,
    updates: data.updates
      .map((update) => ({
        version: update.version,
        dateISO: update.date.toISOString(),
        summary: update.summary,
      }))
      .sort((a, b) => b.dateISO.localeCompare(a.dateISO)),
    readingTime: estimateReadingTime(body),
    publishedTimeISO: data.publishDate.toISOString(),
    modifiedTimeISO: data.updatedDate?.toISOString(),
  };
}

// Client-safe helpers live in `./blog-client` (no `astro:content` import, so
// they can be bundled into the SPA). Re-exported here for server-side callers
// that import everything from `@/lib/blog`.
export {
  articleWatermarkFor,
  blogIndexUrl,
  formatPostDate,
  getArticleSlugFromPath,
  postUrl,
} from './client';

let articleListPromise: Promise<ArticleListItem[]> | undefined;

function navItem(entry?: BlogEntry): PostNavItem | undefined {
  return entry
    ? { id: entry.id, title: entry.data.title, category: entry.data.category }
    : undefined;
}

const BLOG_LINK_RE = /(?:https?:\/\/[^\s)'"<>]+)?\/blog\/([^\s?#)'"<>]+)/g;

function relationItem(entry: BlogEntry): ArticleRelationItem {
  return {
    id: entry.id,
    title: entry.data.title,
    category: entry.data.category,
    description: entry.data.description,
  };
}

function extractReferencedIds(body: string | undefined, knownIds: ReadonlySet<string>): string[] {
  const references = new Set<string>();
  for (const match of (body ?? '').matchAll(BLOG_LINK_RE)) {
    const rawId = match[1]?.replace(/\/$/, '');
    if (!rawId) continue;
    try {
      const id = decodeURIComponent(rawId);
      if (knownIds.has(id)) references.add(id);
    } catch {
      // Ignore malformed URL escapes in prose; content validation should not
      // make the whole collection unavailable for one bad optional link.
    }
  }
  return [...references];
}

export function scoreRelatedPosts(
  entry: BlogEntry,
  candidates: readonly BlogEntry[],
  explicitIds: ReadonlySet<string>,
  referenceIds: ReadonlySet<string>,
  backlinkIds: ReadonlySet<string>,
): BlogEntry[] {
  const sourceTags = new Set(entry.data.tags.map((tag) => tag.toLowerCase()));

  return candidates
    .filter((candidate) => candidate.id !== entry.id)
    .map((candidate) => {
      let score = 0;
      if (explicitIds.has(candidate.id)) score += 100;
      if (referenceIds.has(candidate.id)) score += 24;
      if (backlinkIds.has(candidate.id)) score += 12;
      if (entry.data.category && candidate.data.category === entry.data.category) score += 6;
      for (const tag of candidate.data.tags) {
        if (sourceTags.has(tag.toLowerCase())) score += 3;
      }
      return { candidate, score };
    })
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.candidate.data.publishDate.valueOf() - a.candidate.data.publishDate.valueOf(),
    )
    .slice(0, 3)
    .map(({ candidate }) => candidate);
}

/**
 * Serializable article metadata used by the SPA. Bodies are intentionally not
 * retained here: direct routes render only their active post and in-app reads
 * fetch a static fragment through the bounded client cache.
 */
export function getArticleList(): Promise<ArticleListItem[]> {
  if (articleListPromise) return articleListPromise;

  articleListPromise = (async () => {
    const posts = await getAllPosts();
    const listedPosts = posts.filter(isListedPost);
    const listedIndexById = new Map(listedPosts.map((entry, index) => [entry.id, index]));
    const entriesById = new Map(posts.map((entry) => [entry.id, entry]));
    const knownIds = new Set(entriesById.keys());

    for (const entry of posts) {
      for (const id of entry.data.related) {
        if (!knownIds.has(id)) {
          console.warn(`[blog] Unknown related id "${id}" in frontmatter of "${entry.id}"`);
        }
      }
    }

    const referencesById = new Map(
      posts.map((entry) => [entry.id, extractReferencedIds(entry.body, knownIds)]),
    );
    const backlinksById = new Map(posts.map((entry) => [entry.id, new Set<string>()]));

    for (const entry of posts) {
      const outgoingIds = new Set([
        ...(referencesById.get(entry.id) ?? []),
        ...entry.data.related.filter((id) => knownIds.has(id)),
      ]);
      for (const targetId of outgoingIds) backlinksById.get(targetId)?.add(entry.id);
    }

    const renderedPosts = await Promise.all(posts.map((entry) => render(entry)));
    const seriesEntries: SeriesEntry[] = listedPosts.map((entry) => ({
      id: entry.id,
      title: entry.data.title,
      category: entry.data.category,
      series: entry.data.series,
      seriesOrder: entry.data.seriesOrder,
      publishDate: entry.data.publishDate,
    }));
    return posts.map((entry, index) => {
      const referenceIds = new Set(referencesById.get(entry.id) ?? []);
      const backlinkIds = backlinksById.get(entry.id) ?? new Set<string>();
      const explicitIds = new Set(entry.data.related.filter((id) => knownIds.has(id)));
      const relatedEntries = scoreRelatedPosts(
        entry,
        listedPosts,
        explicitIds,
        referenceIds,
        backlinkIds,
      );
      const resolveRelations = (ids: Iterable<string>) =>
        [...ids]
          .map((id) => entriesById.get(id))
          .filter(
            (candidate): candidate is BlogEntry => candidate != null && isListedPost(candidate),
          )
          .map(relationItem);

      const listedIndex = listedIndexById.get(entry.id);

      return {
        ...toPost(entry),
        headings: renderedPosts[index].headings as ArticleHeading[],
        prev: listedIndex !== undefined ? navItem(listedPosts[listedIndex + 1]) : undefined,
        next: listedIndex !== undefined ? navItem(listedPosts[listedIndex - 1]) : undefined,
        relations: {
          references: resolveRelations(referenceIds),
          backlinks: resolveRelations(backlinkIds),
          related: relatedEntries.map(relationItem),
        },
        seriesNav: buildSeriesNav(seriesEntries, entry.id) ?? undefined,
      };
    });
  })().catch((error) => {
    articleListPromise = undefined;
    throw error;
  });

  return articleListPromise;
}
