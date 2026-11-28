import { describe, expect, it } from 'vite-plus/test';
import { articleHead, blogIndexHead, blogTagHead } from './head-model';
import { SITE_ORIGIN } from '@/data/site-origin';
import { BLOG_LICENSE, copyrightLine } from './legal';
import type { Post } from './types';

function post(id: string, overrides: Partial<Post> = {}): Post {
  return {
    id,
    title: id,
    description: `${id} description`,
    publishDate: new Date('2026-01-01'),
    publishedTimeISO: '2026-01-01T00:00:00.000Z',
    author: 'MiraHikari',
    tags: ['设计'],
    draft: false,
    listed: true,
    featured: false,
    comments: true,
    aiLevel: 'human',
    relatedIds: [],
    updates: [],
    readingTime: 1,
    ...overrides,
  };
}

describe('blog head descriptors', () => {
  it('retains article license, credit and breadcrumbs with canonical article URLs', () => {
    const head = articleHead(post('hello', { aiLevel: 'assisted', aiModel: 'Test model' }));
    expect(head.canonical).toBe(`${SITE_ORIGIN}/blog/hello/`);
    expect(head.jsonLd[0]).toMatchObject({
      '@type': 'BlogPosting',
      license: BLOG_LICENSE.url,
      copyrightYear: 2026,
      copyrightNotice: expect.any(String),
      creditText: expect.stringContaining('Test model'),
    });
    expect(head.jsonLd[1]['@type']).toBe('BreadcrumbList');
  });

  it('emits the complete app-level BlogPosting and BreadcrumbList entities', () => {
    const head = articleHead(
      post('hello', {
        updatedDate: new Date('2026-01-02T00:00:00.000Z'),
        modifiedTimeISO: '2026-01-02T00:00:00.000Z',
        category: 'Engineering',
        heroImage: 'https://static.example.test/hero.webp',
        aiLevel: 'assisted',
        aiModel: 'Test model',
      }),
    );
    expect(head.jsonLd).toEqual([
      {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        url: `${SITE_ORIGIN}/blog/hello/`,
        headline: 'hello',
        description: 'hello description',
        datePublished: '2026-01-01T00:00:00.000Z',
        dateModified: '2026-01-02T00:00:00.000Z',
        image: ['https://static.example.test/hero.webp'],
        keywords: '设计',
        author: { '@type': 'Person', name: 'MiraHikari', url: SITE_ORIGIN },
        publisher: { '@type': 'Person', name: 'MiraHikari', url: SITE_ORIGIN },
        mainEntityOfPage: `${SITE_ORIGIN}/blog/hello/`,
        articleSection: 'Engineering',
        license: BLOG_LICENSE.url,
        copyrightYear: 2026,
        copyrightHolder: { '@type': 'Person', name: 'MiraHikari' },
        copyrightNotice: `${copyrightLine()}，采用 ${BLOG_LICENSE.id} 许可（${BLOG_LICENSE.url}）`,
        creditText: '创作来源：AI 辅助润色 · Test model',
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首页', item: `${SITE_ORIGIN}/` },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Blog',
            item: `${SITE_ORIGIN}/blog/`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: 'hello',
            item: `${SITE_ORIGIN}/blog/hello/`,
          },
        ],
      },
    ]);
  });

  it('limits listed index posts and keeps tag identity independent from the index', () => {
    const posts = [
      post('privacy', { listed: false }),
      ...Array.from({ length: 15 }, (_, i) => post(`p${i}`)),
    ];
    const index = blogIndexHead(posts);
    const schema = index.jsonLd[0];
    expect(schema.blogPost).toHaveLength(12);
    expect(JSON.stringify(schema)).not.toContain('/blog/privacy/');
    const tag = blogTagHead('设计', posts);
    expect(tag.title).toBe('#设计 · Blog · MiraHikari');
    expect(tag.canonical).toBe(`${SITE_ORIGIN}/blog/tag/%E8%AE%BE%E8%AE%A1/`);
    expect(tag.description).toContain('15 篇文章');
    expect(tag.jsonLd.map((entry) => entry['@type'])).toEqual(['CollectionPage', 'BreadcrumbList']);
  });
});
