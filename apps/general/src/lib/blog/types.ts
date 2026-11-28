/**
 * Blog domain types.
 *
 * `Post` is the normalized shape used across blog UI components and pages.
 * It mirrors the `blog` content collection schema (see `src/content.config.ts`)
 * plus a few derived fields (slug, reading time, formatted date).
 */

import type { AILevel } from './ai';
import type { ArticleMetadata } from '@mhk/site-core/content-model/article';

export interface Post extends ArticleMetadata {
  /** Collection entry id (path relative to base, no extension). Used as the URL slug. */
  id: string;
  title: string;
  description: string;
  publishDate: Date;
  updatedDate?: Date;
  tags: string[];
  category?: string;
  heroImage?: string;
  heroAlt?: string;
  draft: boolean;
  /** false：可直达但不出现在列表 / 标签 / 订阅 / 命令面板文章搜索。 */
  listed: boolean;
  featured: boolean;
  /** false：不挂载评论区。 */
  comments: boolean;
  author: string;
  /** AI 创作参与级别，frontmatter 缺省时为 human。 */
  aiLevel: AILevel;
  /** 参与的 AI 模型名，如 "Claude Fable 5"；仅 aiLevel 非 human 时有意义。 */
  aiModel?: string;
  /** Explicitly related article ids declared in frontmatter. */
  relatedIds: string[];
  /** 系列名（如「杭州行记」），同系列文章在文末展示系列导航。 */
  series?: string;
  /** 系列内序号；缺省按 publishDate 排序。 */
  seriesOrder?: number;
  /** Current editorial version shown beside the article metadata. */
  version?: string;
  /** Newest-first editorial change history. */
  updates: ArticleUpdate[];
  /** Estimated reading time in minutes. */
  readingTime: number;
  /** ISO string of publishDate, handy for SEO. */
  publishedTimeISO: string;
  /** ISO string of updatedDate (if any). */
  modifiedTimeISO?: string;
}

export interface ArticleUpdate {
  version: string;
  dateISO: string;
  summary: string;
}

export interface PostNavItem {
  id: string;
  title: string;
  category?: string;
}

export interface ArticleRelationItem extends PostNavItem {
  description: string;
}

/** 系列文章导航（buildSeriesNav 的产物）。 */
export interface ArticleSeriesNav {
  /** 系列名。 */
  name: string;
  /** 系列总篇数。 */
  total: number;
  /** 组内按 seriesOrder 升序（缺省按 publishDate）排列的全部条目。 */
  items: Array<{ id: string; title: string; current: boolean }>;
  /** 组内上一篇（首篇无）。 */
  prev?: PostNavItem;
  /** 组内下一篇（末篇无）。 */
  next?: PostNavItem;
}

export interface ArticleRelations {
  /** Articles linked from this article's body. */
  references: ArticleRelationItem[];
  /** Articles that link to, or explicitly relate to, this article. */
  backlinks: ArticleRelationItem[];
  /** Explicit and automatically scored follow-up reading. */
  related: ArticleRelationItem[];
}

export interface TagCount {
  tag: string;
  count: number;
}

/** A markdown heading produced by Astro's `render()`. */
export interface ArticleHeading {
  depth: number;
  slug: string;
  text: string;
}

/**
 * An article's metadata plus the derived data the SPA needs to render it,
 * WITHOUT the body HTML. Direct article routes provide the active body as
 * server children; in-app navigation loads a static article fragment through
 * a small bounded client cache.
 *
 * This shape is serializable, so it can be passed from Astro pages into the
 * `client:load` React `App` as a prop.
 */
export interface ArticleListItem extends Post {
  headings: ArticleHeading[];
  prev?: PostNavItem;
  next?: PostNavItem;
  relations: ArticleRelations;
  /** 当前文章所属系列的导航；非系列文章为 undefined。 */
  seriesNav?: ArticleSeriesNav;
}
