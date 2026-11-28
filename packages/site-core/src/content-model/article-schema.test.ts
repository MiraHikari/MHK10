import { describe, expect, it } from 'vite-plus/test';
import { z } from 'zod';
import { articleSchema } from './article-schema';

const generalSchema = articleSchema({
  published: 'publishDate',
  updated: 'updatedDate',
  commentsDefault: true,
  aiLevelDefault: 'human',
});

const desktopSchema = articleSchema({
  published: 'published',
  updated: 'updated',
  extra: { sourceArchive: z.string().optional() },
});

const authored = {
  title: '文章',
  description: '描述',
  tags: ['设计', '工程'],
  category: 'Notes',
  heroImage: '/images/blog/a.webp',
  heroAlt: '配图',
  draft: true,
  listed: false,
  featured: true,
  comments: false,
  author: 'MiraHikari',
  aiLevel: 'assisted',
  aiModel: 'Claude Fable 5',
  related: ['other'],
  series: '杭州行记',
  seriesOrder: 2,
  version: 'v2',
  updates: [{ version: 'v1', date: '2026-01-01', summary: '初稿' }],
};

describe('shared article schema', () => {
  it('parses the complete general publication with converted dates and shared fields', () => {
    const parsed = generalSchema.parse({
      ...authored,
      publishDate: '2026-01-02',
      updatedDate: '2026-02-03',
    });
    expect(parsed).toEqual({
      ...authored,
      updates: [{ version: 'v1', date: new Date('2026-01-01'), summary: '初稿' }],
      publishDate: new Date('2026-01-02'),
      updatedDate: new Date('2026-02-03'),
    });
  });

  it('parses the complete desktop publication with converted dates and extra fields', () => {
    const parsed = desktopSchema.parse({
      ...authored,
      published: '2026-01-02',
      updated: '2026-02-03',
      sourceArchive: 'archive/2026/a.mdx',
    });
    expect(parsed).toEqual({
      ...authored,
      updates: [{ version: 'v1', date: new Date('2026-01-01'), summary: '初稿' }],
      published: new Date('2026-01-02'),
      updated: new Date('2026-02-03'),
      sourceArchive: 'archive/2026/a.mdx',
    });
  });

  it('applies the complete general defaults', () => {
    const parsed = generalSchema.parse({
      title: 'Title',
      description: 'Description',
      publishDate: '2026-01-01',
    });
    expect(parsed).toEqual({
      title: 'Title',
      description: 'Description',
      tags: [],
      draft: false,
      listed: true,
      featured: false,
      comments: true,
      aiLevel: 'human',
      related: [],
      updates: [],
      publishDate: new Date('2026-01-01'),
    });
  });

  it('leaves optional desktop fields and AI defaults absent', () => {
    const parsed = desktopSchema.parse({
      title: 'Title',
      description: 'Description',
      published: '2026-01-01',
    });
    expect(parsed).toEqual({
      title: 'Title',
      description: 'Description',
      tags: [],
      draft: false,
      listed: true,
      featured: false,
      related: [],
      updates: [],
      published: new Date('2026-01-01'),
    });
  });

  it('keeps the app-specific date keys distinct', () => {
    const general = generalSchema.parse({
      title: 'Title',
      description: 'Description',
      publishDate: '2026-01-01',
    });
    const desktop = desktopSchema.parse({
      title: 'Title',
      description: 'Description',
      published: '2026-01-01',
    });
    expect(Object.keys(general)).toContain('publishDate');
    expect(Object.keys(general)).not.toContain('published');
    expect(Object.keys(desktop)).toContain('published');
    expect(Object.keys(desktop)).not.toContain('publishDate');
  });

  it('rejects a missing title or publication date', () => {
    expect(
      generalSchema.safeParse({ description: 'Description', publishDate: '2026-01-01' }).success,
    ).toBe(false);
    expect(generalSchema.safeParse({ title: 'Title', description: 'Description' }).success).toBe(
      false,
    );
    expect(
      desktopSchema.safeParse({
        title: 'Title',
        description: 'Description',
        publishDate: '2026-01-01',
      }).success,
    ).toBe(false);
    expect(desktopSchema.safeParse({ title: 'Title', description: 'Description' }).success).toBe(
      false,
    );
  });
});
