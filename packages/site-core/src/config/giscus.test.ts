import { describe, expect, it } from 'vite-plus/test';
import { SHARED_SERVICE_KEYS } from '../storage/keys';
import {
  GISCUS_CONFIG,
  GISCUS_ORIGIN,
  GISCUS_SESSION_KEY,
  GISCUS_SLOW_MS,
  GISCUS_WIDGET_DEFAULTS,
  giscusWidgetUrl,
  isGiscusConfigured,
  type GiscusWidgetRequest,
} from './giscus';

const request: GiscusWidgetRequest = {
  ...GISCUS_CONFIG,
  term: 'colophon',
  session: '',
  origin: 'https://www.example.com/blog/colophon/',
  description: '说明',
  backLink: 'https://www.example.com/blog/colophon/',
};

describe('shared Giscus configuration', () => {
  it('keeps the repository, category and session identity shared by both presentations', () => {
    expect(GISCUS_CONFIG).toEqual({
      repo: 'example-user/blog-comments',
      repoId: 'R_kgXXXXXXXXXX',
      category: 'Announcements',
      categoryId: 'DIC_kwXXXXXXXXXXXX',
    });
    expect(GISCUS_ORIGIN).toBe('https://giscus.app');
    expect(GISCUS_SESSION_KEY).toBe(SHARED_SERVICE_KEYS.giscusSession);
    expect(GISCUS_SLOW_MS).toBe(6000);
    expect(isGiscusConfigured()).toBe(true);
    expect(isGiscusConfigured({ ...GISCUS_CONFIG, categoryId: '' })).toBe(false);
  });

  it('exposes the one widget policy adopted by both presentations', () => {
    expect(GISCUS_WIDGET_DEFAULTS).toEqual({
      mapping: 'specific',
      strict: '0',
      reactionsEnabled: '1',
      emitMetadata: '1',
      inputPosition: 'top',
      lang: 'zh-CN',
      theme: 'transparent_dark',
    });
  });

  it('builds the canonical zh-CN widget URL with every default and the specific term', () => {
    const url = new URL(giscusWidgetUrl(request));
    expect(url.origin).toBe(GISCUS_ORIGIN);
    expect(url.pathname).toBe('/zh-CN/widget');
    for (const [key, value] of Object.entries({
      repo: GISCUS_CONFIG.repo,
      repoId: GISCUS_CONFIG.repoId,
      category: GISCUS_CONFIG.category,
      categoryId: GISCUS_CONFIG.categoryId,
      term: 'colophon',
      mapping: 'specific',
      strict: '0',
      reactionsEnabled: '1',
      emitMetadata: '1',
      inputPosition: 'top',
      theme: 'transparent_dark',
      origin: request.origin,
      session: '',
      description: request.description,
      backLink: request.backLink,
    })) {
      expect(url.searchParams.get(key)).toBe(value);
    }
  });

  it('allows only language and theme overrides without losing the specific mapping', () => {
    const url = new URL(
      giscusWidgetUrl({ ...request, lang: 'en', theme: 'data:text/css,body%7Bcolor:red%7D' }),
    );
    expect(url.pathname).toBe('/en/widget');
    expect(url.searchParams.get('mapping')).toBe('specific');
    expect(url.searchParams.get('term')).toBe('colophon');
    expect(url.searchParams.get('theme')).toBe('data:text/css,body%7Bcolor:red%7D');
  });

  it('encodes the term rather than dropping the discussion identity', () => {
    const url = new URL(giscusWidgetUrl({ ...request, term: '文章 & notes' }));
    expect(url.searchParams.get('term')).toBe('文章 & notes');
    expect(url.toString()).not.toContain('term=文章');
  });
});
