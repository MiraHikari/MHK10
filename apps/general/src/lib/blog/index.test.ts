import { describe, expect, it, vi } from 'vite-plus/test';

vi.mock('astro:content', () => ({
  getCollection: () => Promise.resolve([]),
  render: () =>
    Promise.resolve({
      Content: () => null,
      headings: [],
      remarkPluginFrontmatter: {},
    }),
}));

import { estimateReadingTime, toPost, scoreRelatedPosts } from '@/lib/blog';
import type { BlogEntry } from '@/lib/blog';

function entry(
  id: string,
  overrides: Partial<BlogEntry['data']> & { body?: string } = {},
): BlogEntry {
  const {
    body = '',
    publishDate = new Date('2026-01-01'),
    updatedDate,
    tags = [],
    related = [],
    updates = [],
    ...rest
  } = overrides;
  return {
    id,
    collection: 'blog',
    body,
    data: {
      title: id,
      description: `${id} description`,
      publishDate,
      updatedDate,
      tags,
      related,
      updates,
      draft: false,
      listed: true,
      featured: false,
      comments: true,
      ...rest,
    } as BlogEntry['data'],
  };
}

describe('estimateReadingTime', () => {
  it('returns at least 1 minute for any body', () => {
    expect(estimateReadingTime('')).toBe(1);
    expect(estimateReadingTime('hi')).toBe(1);
  });

  it('counts Han characters at exactly 400 per minute', () => {
    // 1200 Han = 3 minutes at 400/min; the old 300/min pace would report 4.
    expect(estimateReadingTime('字'.repeat(1200))).toBe(3);
  });

  it('counts kana and Hangul with Han as CJK characters', () => {
    // 800 kana = 2 minutes at 400/min; the old 300/min pace would report 3.
    expect(estimateReadingTime('かな'.repeat(400))).toBe(2);
    expect(estimateReadingTime('한글'.repeat(400))).toBe(2);
  });

  it('strips code blocks and markdown syntax', () => {
    const body = '```ts\nconst x = 1;\n```\n# Hello world\n**bold** and *italic*';
    expect(estimateReadingTime(body)).toBe(1);
  });

  it('counts Latin words at exactly 200 per minute', () => {
    // 500 words = 2.5 minutes at 200/min, rounded to 3; the old 220/min would report 2.
    expect(estimateReadingTime('word '.repeat(500))).toBe(3);
  });

  it('strips MDX component tags so photo props do not inflate the estimate', () => {
    // 300 个正文汉字 = 0.75 分钟 → 1 分钟；组件 props 里的 600 个汉字不应计入。
    const props = `alt="${'图'.repeat(300)}" caption="${'注'.repeat(300)}"`;
    const body = `${'字'.repeat(300)}\n<PhotoFigure src="/images/blog/x-display.webp"\n  ${props}\n  width={1920} height={1440}\n/>`;
    expect(estimateReadingTime(body)).toBe(1);
  });
});

describe('toPost', () => {
  it('normalizes a collection entry into a Post', () => {
    const e = entry('hello-world', {
      title: 'Hello World',
      description: 'A test post',
      publishDate: new Date('2026-07-26'),
      tags: ['astro', 'react'],
      category: 'Engineering',
      related: ['another-post'],
    });

    const post = toPost(e);

    expect(post.id).toBe('hello-world');
    expect(post.title).toBe('Hello World');
    expect(post.tags).toEqual(['astro', 'react']);
    expect(post.category).toBe('Engineering');
    expect(post.relatedIds).toEqual(['another-post']);
    expect(post.readingTime).toBeGreaterThanOrEqual(1);
    expect(post.publishedTimeISO).toBe(e.data.publishDate.toISOString());
  });

  it('falls back to profile name as author', () => {
    const e = entry('anon');
    expect(toPost(e).author).toBe('MiraHikari');
  });

  it('defaults aiLevel to human when frontmatter omits it', () => {
    const post = toPost(entry('plain'));
    expect(post.aiLevel).toBe('human');
    expect(post.aiModel).toBeUndefined();
  });

  it('passes through aiLevel and aiModel from frontmatter', () => {
    const post = toPost(
      entry('ai-post', {
        aiLevel: 'generated',
        aiModel: 'Claude Fable 5',
      }),
    );
    expect(post.aiLevel).toBe('generated');
    expect(post.aiModel).toBe('Claude Fable 5');
  });

  it('sorts updates newest first', () => {
    const e = entry('versions', {
      updates: [
        { version: '1.0.0', date: new Date('2024-01-01'), summary: 'Initial' },
        { version: '2.0.0', date: new Date('2026-01-01'), summary: 'Latest' },
      ],
    });

    const post = toPost(e);
    expect(post.updates.map((u) => u.version)).toEqual(['2.0.0', '1.0.0']);
  });
});

describe('scoreRelatedPosts', () => {
  it('excludes the source article', () => {
    const source = entry('source', { tags: ['astro'] });
    const candidate = entry('other', { tags: ['astro'] });

    const result = scoreRelatedPosts(source, [source, candidate], new Set(), new Set(), new Set());

    expect(result.map((e) => e.id)).toEqual(['other']);
  });

  it('prioritises explicit related ids', () => {
    const source = entry('source', { tags: ['astro'] });
    const related = entry('related', { tags: [] });
    const tagged = entry('tagged', { tags: ['astro'] });

    const result = scoreRelatedPosts(
      source,
      [related, tagged],
      new Set(['related']),
      new Set(),
      new Set(),
    );

    expect(result[0].id).toBe('related');
  });

  it('scores references and backlinks lower than explicit ids', () => {
    const source = entry('source', { tags: [] });
    const explicit = entry('explicit', { tags: [] });
    const referenced = entry('referenced', { tags: [] });
    const backlinked = entry('backlinked', { tags: [] });

    const result = scoreRelatedPosts(
      source,
      [explicit, referenced, backlinked],
      new Set(['explicit']),
      new Set(['referenced']),
      new Set(['backlinked']),
    );

    expect(result.map((e) => e.id)).toEqual(['explicit', 'referenced', 'backlinked']);
  });

  it('breaks ties by publish date (newer first)', () => {
    const source = entry('source', { tags: ['astro'] });
    const older = entry('older', {
      tags: ['astro'],
      publishDate: new Date('2024-01-01'),
    });
    const newer = entry('newer', {
      tags: ['astro'],
      publishDate: new Date('2026-01-01'),
    });

    const result = scoreRelatedPosts(source, [older, newer], new Set(), new Set(), new Set());

    expect(result.map((e) => e.id)).toEqual(['newer', 'older']);
  });

  it('returns at most three results', () => {
    const source = entry('source', { tags: ['astro'] });
    const candidates = Array.from({ length: 5 }, (_, i) =>
      entry(`post-${i}`, { tags: ['astro'], publishDate: new Date(2026 - i, 0, 1) }),
    );

    const result = scoreRelatedPosts(source, candidates, new Set(), new Set(), new Set());

    expect(result).toHaveLength(3);
  });
});
