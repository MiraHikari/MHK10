import { z } from 'zod';
import type { AILevel } from './article';

/** Frontmatter key used by an app for the original publication date. */
export type ArticlePublishedKey = 'publishDate' | 'published';
/** Frontmatter key used by an app for the latest revision date. */
export type ArticleUpdatedKey = 'updatedDate' | 'updated';

export interface ArticleSchemaOptions<
  TPublished extends ArticlePublishedKey = ArticlePublishedKey,
  TUpdated extends ArticleUpdatedKey = ArticleUpdatedKey,
  TCommentsDefault extends boolean = false,
  TAiLevelDefault extends 'human' | undefined = undefined,
  TExtra extends z.ZodRawShape = {},
> {
  readonly published: TPublished;
  readonly updated: TUpdated;
  /** `true` makes comments default on; omitted leaves the field optional. */
  readonly commentsDefault?: TCommentsDefault;
  /** `'human'` makes AI participation default to human; omitted leaves it optional. */
  readonly aiLevelDefault?: TAiLevelDefault;
  /** App-specific frontmatter fields such as the desktop `sourceArchive`. */
  readonly extra?: TExtra;
}

export interface ArticleUpdateRecord {
  readonly version: string;
  readonly date: Date;
  readonly summary: string;
}

/**
 * Validated frontmatter shared by both presentations. Date keys and the
 * comments/AI defaults vary per app, so the caller chooses them through the
 * factory rather than duplicating the other twenty field definitions.
 */
export type ArticleData<
  TPublished extends ArticlePublishedKey = ArticlePublishedKey,
  TUpdated extends ArticleUpdatedKey = ArticleUpdatedKey,
  TCommentsDefault extends boolean = false,
  TAiLevelDefault extends 'human' | undefined = undefined,
  TExtra extends z.ZodRawShape = {},
> = {
  title: string;
  description: string;
  tags: string[];
  category?: string;
  heroImage?: string;
  heroAlt?: string;
  draft: boolean;
  listed: boolean;
  featured: boolean;
  comments: TCommentsDefault extends true ? boolean : boolean | undefined;
  author?: string;
  aiLevel: TAiLevelDefault extends 'human' ? AILevel : AILevel | undefined;
  aiModel?: string;
  related: string[];
  series?: string;
  seriesOrder?: number;
  version?: string;
  updates: ArticleUpdateRecord[];
} & { [K in TPublished]: Date } & { [K in TUpdated]?: Date } & {
  [K in keyof TExtra]: z.infer<TExtra[K]>;
};

const AI_LEVELS = ['generated', 'assisted', 'human'] as const;

/** Build the publication schema both Astro content collections validate against. */
export function articleSchema<
  TPublished extends ArticlePublishedKey,
  TUpdated extends ArticleUpdatedKey,
  TCommentsDefault extends boolean = false,
  TAiLevelDefault extends 'human' | undefined = undefined,
  TExtra extends z.ZodRawShape = {},
>(
  options: ArticleSchemaOptions<TPublished, TUpdated, TCommentsDefault, TAiLevelDefault, TExtra>,
): z.ZodType<ArticleData<TPublished, TUpdated, TCommentsDefault, TAiLevelDefault, TExtra>> {
  const shape: Record<string, z.ZodType> = {
    title: z.string(),
    description: z.string(),
    tags: z.array(z.string()).default([]),
    category: z.string().optional(),
    heroImage: z.string().optional(),
    heroAlt: z.string().optional(),
    draft: z.boolean().default(false),
    /** false：可直达但不出现在博客列表、标签、订阅源与命令面板搜索。 */
    listed: z.boolean().default(true),
    featured: z.boolean().default(false),
    /** false：不挂载评论区（如法律说明页）。 */
    comments: options.commentsDefault === true ? z.boolean().default(true) : z.boolean().optional(),
    author: z.string().optional(),
    /** AI 创作参与级别：generated=AI 完全生成，assisted=AI 辅助润色，human=纯人工创作。 */
    aiLevel:
      options.aiLevelDefault === 'human'
        ? z.enum(AI_LEVELS).default('human')
        : z.enum(AI_LEVELS).optional(),
    /** 参与的 AI 模型名（如 "Claude Fable 5"），aiLevel 非 human 时展示。 */
    aiModel: z.string().optional(),
    related: z.array(z.string()).default([]),
    /** 系列名（如「杭州行记」），同系列文章在文末展示系列导航。 */
    series: z.string().optional(),
    /** 系列内序号；缺省按 publishDate 排序。 */
    seriesOrder: z.number().optional(),
    version: z.string().optional(),
    updates: z
      .array(
        z.object({
          version: z.string(),
          date: z.coerce.date(),
          summary: z.string(),
        }),
      )
      .default([]),
  };
  shape[options.published] = z.coerce.date();
  shape[options.updated] = z.coerce.date().optional();
  if (options.extra) Object.assign(shape, options.extra);
  return z.object(shape) as unknown as z.ZodType<
    ArticleData<TPublished, TUpdated, TCommentsDefault, TAiLevelDefault, TExtra>
  >;
}
