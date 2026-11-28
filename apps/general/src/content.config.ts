import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';
import { articleSchema } from '@mhk/site-core/content-model/article-schema';

const projectsCollection = defineCollection({
  loader: glob({
    pattern: '**/*.md',
    base: new URL('../../../packages/site-core/content/projects/', import.meta.url),
  }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    image: z.string().optional(),
    tags: z.array(z.string()),
    link: z.string().optional(),
    github: z.string().optional(),
    date: z.string().regex(/^\d{4}(-\d{2}){0,2}$/),
    featured: z.boolean().default(false),
    active: z.boolean().default(true),
    order: z.number().default(0),
  }),
});

const blogCollection = defineCollection({
  loader: glob({
    pattern: '**/*.{md,mdx}',
    base: new URL('../../../packages/site-core/content/blog/', import.meta.url),
  }),
  schema: articleSchema({
    published: 'publishDate',
    updated: 'updatedDate',
    commentsDefault: true,
    aiLevelDefault: 'human',
  }),
});

export const collections = {
  projects: projectsCollection,
  blog: blogCollection,
};
