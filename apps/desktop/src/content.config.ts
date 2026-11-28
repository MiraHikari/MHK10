import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { articleSchema } from '@mhk/site-core/content-model/article-schema';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: articleSchema({
    published: 'published',
    updated: 'updated',
    // Preserve publication metadata when importing archived articles.
    extra: { sourceArchive: z.string().optional() },
  }),
});

export const collections = { posts };
