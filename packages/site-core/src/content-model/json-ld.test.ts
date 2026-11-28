import { describe, expect, it } from 'vite-plus/test';
import { blogPostingJsonLd, breadcrumbJsonLd, type JsonLdEntity } from './json-ld';

const person = {
  '@type': 'Person' as const,
  name: 'MiraHikari',
  url: 'https://www.example.com',
};

describe('BlogPosting JSON-LD', () => {
  it('emits the complete entity with the existing field names', () => {
    expect(
      blogPostingJsonLd({
        id: 'https://www.example.com/blog/a/#article',
        url: 'https://www.example.com/blog/a/',
        headline: '文章',
        description: '描述',
        datePublished: '2026-01-01T00:00:00.000Z',
        dateModified: '2026-02-01T00:00:00.000Z',
        image: ['https://www.example.com/og.webp'],
        inLanguage: 'zh-CN',
        keywords: '设计, 工程',
        author: person,
        publisher: { '@id': 'https://www.example.com/about/#person' },
        mainEntityOfPage: 'https://www.example.com/blog/a/',
        articleSection: 'Notes',
        license: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
        copyrightYear: 2026,
        copyrightHolder: { '@type': 'Person', name: 'MiraHikari' },
        copyrightNotice: '© 2026 MiraHikari',
        creditText: '创作来源：AI 辅助润色',
        isPartOf: { '@id': 'https://www.example.com/#website' },
      }),
    ).toEqual({
      '@type': 'BlogPosting',
      '@id': 'https://www.example.com/blog/a/#article',
      url: 'https://www.example.com/blog/a/',
      headline: '文章',
      description: '描述',
      datePublished: '2026-01-01T00:00:00.000Z',
      dateModified: '2026-02-01T00:00:00.000Z',
      image: ['https://www.example.com/og.webp'],
      inLanguage: 'zh-CN',
      keywords: '设计, 工程',
      author: person,
      publisher: { '@id': 'https://www.example.com/about/#person' },
      mainEntityOfPage: 'https://www.example.com/blog/a/',
      articleSection: 'Notes',
      license: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
      copyrightYear: 2026,
      copyrightHolder: { '@type': 'Person', name: 'MiraHikari' },
      copyrightNotice: '© 2026 MiraHikari',
      creditText: '创作来源：AI 辅助润色',
      isPartOf: { '@id': 'https://www.example.com/#website' },
    });
  });

  it('omits every undefined optional and never adds @context', () => {
    expect(blogPostingJsonLd({ headline: 'Only headline' })).toEqual({
      '@type': 'BlogPosting',
      headline: 'Only headline',
    });
  });

  it('accepts reference and Person shapes for author, publisher and page identity', () => {
    const entity = blogPostingJsonLd({
      headline: 'Title',
      author: { '@id': 'https://mhk10.example.com/about/#person' },
      publisher: { '@id': 'https://mhk10.example.com/about/#person' },
      mainEntityOfPage: { '@id': 'https://mhk10.example.com/blog/a/#webpage' },
    });
    expect(entity).toMatchObject({
      author: { '@id': 'https://mhk10.example.com/about/#person' },
      publisher: { '@id': 'https://mhk10.example.com/about/#person' },
      mainEntityOfPage: { '@id': 'https://mhk10.example.com/blog/a/#webpage' },
    });
    expect('@context' in entity).toBe(false);
  });

  it('keeps one BlogPosting core when the two apps use their own reference shapes', () => {
    const shared = {
      headline: '文章',
      description: '描述',
      datePublished: '2026-01-01T00:00:00.000Z',
      dateModified: '2026-02-01T00:00:00.000Z',
      image: 'https://www.example.com/og.webp',
      inLanguage: 'zh-CN',
      keywords: ['设计', '工程'],
      articleSection: 'Notes',
    };
    const general = blogPostingJsonLd({
      ...shared,
      url: 'https://www.example.com/blog/a/',
      mainEntityOfPage: 'https://www.example.com/blog/a/',
      author: person,
      publisher: person,
    });
    const desktop = blogPostingJsonLd({
      ...shared,
      id: 'https://mhk10.example.com/blog/a/#article',
      mainEntityOfPage: { '@id': 'https://mhk10.example.com/blog/a/#webpage' },
      author: { '@id': 'https://mhk10.example.com/about/#person' },
      publisher: { '@id': 'https://mhk10.example.com/about/#person' },
      isPartOf: { '@id': 'https://mhk10.example.com/#website' },
    });
    const coreKeys = [
      '@type',
      'headline',
      'description',
      'datePublished',
      'dateModified',
      'image',
      'inLanguage',
      'keywords',
      'articleSection',
    ] as const;
    const core = (entity: JsonLdEntity) =>
      Object.fromEntries(coreKeys.map((key) => [key, entity[key]]));
    expect(core(general)).toEqual(core(desktop));
  });
});

describe('breadcrumb JSON-LD', () => {
  it('numbers breadcrumb items from one and keeps their names and URLs', () => {
    expect(
      breadcrumbJsonLd([
        { name: '首页', item: 'https://www.example.com/' },
        { name: 'Blog', item: 'https://www.example.com/blog/' },
        { name: '文章', item: 'https://www.example.com/blog/a/' },
      ]),
    ).toEqual({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: 'https://www.example.com/' },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://www.example.com/blog/' },
        {
          '@type': 'ListItem',
          position: 3,
          name: '文章',
          item: 'https://www.example.com/blog/a/',
        },
      ],
    });
  });
});
