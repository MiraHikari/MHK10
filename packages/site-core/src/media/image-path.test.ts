import { describe, expect, it } from 'vite-plus/test';
import {
  CANONICAL_IMAGE_PREFIX,
  createImageResolver,
  DESKTOP_IMAGE_PREFIX,
  DESKTOP_PREVIEW_PREFIX,
  canonicalizeImageInput,
  canonicalUploadPath,
  imagePathParts,
  isCanonicalImagePath,
  normalizeImageBase,
} from './image-path';

describe('publication image identity', () => {
  it('normalizes deployment bases and preserves unrelated resources', () => {
    const general = createImageResolver({
      localPrefix: CANONICAL_IMAGE_PREFIX,
      base: ' https://img.example/ ',
    });
    expect(normalizeImageBase(' https://img.example/// ')).toBe('https://img.example');
    expect(general.public('/images/gallery/a.webp')).toBe(
      'https://img.example/images/gallery/a.webp',
    );
    expect(
      canonicalizeImageInput('https://img.example/images/gallery/a.webp', 'https://img.example'),
    ).toBe('/images/gallery/a.webp');
    expect(canonicalizeImageInput('/portfolio/gallery/a.webp')).toBe('/images/gallery/a.webp');
    expect(canonicalizeImageInput('/portfolio/previews/gallery/a.png')).toBe(
      '/images/previews/gallery/a.png',
    );
    expect(general.public('blob:https://site.example/id')).toBe('blob:https://site.example/id');
  });
  it('rejects malformed, encoded traversal and noncanonical authored paths', () => {
    for (const path of [
      '/images/../secret',
      '/images/%2e%2e/x',
      '/images/gallery/%2fsecret',
      '/images//a.png',
      '/images/gallery/a.png?x=1',
      '/images/\\x',
      '/images/%zz',
    ])
      expect(isCanonicalImagePath(path)).toBe(false);
    expect(isCanonicalImagePath('/images/gallery/照片.webp')).toBe(true);
  });
  it('keeps uploads canonical and parses the same identity for generators', () => {
    const path = canonicalUploadPath('gallery', 'photo-display', 'WEBP');
    expect(path).toBe('/images/gallery/photo-display.webp');
    expect(imagePathParts(path)).toEqual({
      folder: 'gallery',
      stem: 'photo-display',
      extension: 'webp',
    });
    expect(() => canonicalUploadPath('private', 'x', 'webp')).toThrow();
    expect(() => canonicalUploadPath('gallery', '../x', 'png')).toThrow();
  });
});

describe('image resolver configurations', () => {
  const general = createImageResolver({
    localPrefix: CANONICAL_IMAGE_PREFIX,
    base: 'https://img.example.com/',
  });
  const generalLocal = createImageResolver({ localPrefix: CANONICAL_IMAGE_PREFIX });
  const desktop = createImageResolver({
    localPrefix: DESKTOP_IMAGE_PREFIX,
    previewPrefix: DESKTOP_PREVIEW_PREFIX,
    base: 'https://img.example.com',
  });
  const desktopLocal = createImageResolver({
    localPrefix: DESKTOP_IMAGE_PREFIX,
    previewPrefix: DESKTOP_PREVIEW_PREFIX,
  });

  it.each([
    {
      name: 'general canonical path',
      resolver: general,
      source: '/images/gallery/a.webp',
      local: '/images/gallery/a.webp',
      canonical: '/images/gallery/a.webp',
      public: 'https://img.example.com/images/gallery/a.webp',
      preview: '/images/gallery/a.webp',
    },
    {
      name: 'general CDN URL',
      resolver: general,
      source: 'https://img.example.com/images/gallery/a.webp',
      local: '/images/gallery/a.webp',
      canonical: '/images/gallery/a.webp',
      public: 'https://img.example.com/images/gallery/a.webp',
      preview: '/images/gallery/a.webp',
    },
    {
      name: 'desktop canonical path',
      resolver: desktop,
      source: '/images/gallery/a.webp',
      local: '/images/gallery/a.webp',
      canonical: '/images/gallery/a.webp',
      public: 'https://img.example.com/images/gallery/a.webp',
      preview: '/images/previews/gallery/a.png',
    },
    {
      name: 'desktop bundled path',
      resolver: desktop,
      source: '/portfolio/gallery/a.webp',
      local: '/images/gallery/a.webp',
      canonical: '/images/gallery/a.webp',
      public: 'https://img.example.com/images/gallery/a.webp',
      preview: '/images/previews/gallery/a.png',
    },
    {
      name: 'desktop preview passthrough',
      resolver: desktop,
      source: '/portfolio/previews/gallery/a.png',
      local: '/images/previews/gallery/a.png',
      canonical: '/images/previews/gallery/a.png',
      public: '/images/previews/gallery/a.png',
      preview: '/images/previews/gallery/a.png',
    },
    {
      name: 'external URL',
      resolver: desktop,
      source: 'https://other.example/images/a.webp',
      local: 'https://other.example/images/a.webp',
      canonical: 'https://other.example/images/a.webp',
      public: 'https://other.example/images/a.webp',
      preview: 'https://other.example/images/a.webp',
    },
    {
      name: 'unrelated local resource',
      resolver: general,
      source: '/og-image.webp',
      local: '/og-image.webp',
      canonical: '/og-image.webp',
      public: '/og-image.webp',
      preview: '/og-image.webp',
    },
    {
      name: 'general uppercase extension',
      resolver: general,
      source: '/images/gallery/A.WEBP',
      local: '/images/gallery/A.WEBP',
      canonical: '/images/gallery/A.WEBP',
      public: 'https://img.example.com/images/gallery/A.WEBP',
      preview: '/images/gallery/A.WEBP',
    },
    {
      name: 'general SVG extension',
      resolver: general,
      source: '/images/gallery/a.svg',
      local: '/images/gallery/a.svg',
      canonical: '/images/gallery/a.svg',
      public: 'https://img.example.com/images/gallery/a.svg',
      preview: '/images/gallery/a.svg',
    },
    {
      name: 'general display copy',
      resolver: general,
      source: '/images/gallery/photo-display.webp',
      local: '/images/gallery/photo-display.webp',
      canonical: '/images/gallery/photo-display.webp',
      public: 'https://img.example.com/images/gallery/photo-display.webp',
      preview: '/images/gallery/photo-display.webp',
    },
    {
      name: 'general query suffix',
      resolver: general,
      source: '/images/gallery/a.webp?x=1',
      local: '/images/gallery/a.webp?x=1',
      canonical: '/images/gallery/a.webp?x=1',
      public: 'https://img.example.com/images/gallery/a.webp?x=1',
      preview: '/images/gallery/a.webp?x=1',
    },
    {
      name: 'general hash suffix',
      resolver: general,
      source: '/images/gallery/a.webp#frag',
      local: '/images/gallery/a.webp#frag',
      canonical: '/images/gallery/a.webp#frag',
      public: 'https://img.example.com/images/gallery/a.webp#frag',
      preview: '/images/gallery/a.webp#frag',
    },
    {
      name: 'general doubled slash',
      resolver: general,
      source: '/images//a.png',
      local: '/images//a.png',
      canonical: '/images//a.png',
      public: 'https://img.example.com/images//a.png',
      preview: '/images//a.png',
    },
    {
      name: 'general trailing empty segment',
      resolver: general,
      source: '/images/gallery/',
      local: '/images/gallery/',
      canonical: '/images/gallery/',
      public: 'https://img.example.com/images/gallery/',
      preview: '/images/gallery/',
    },
    {
      name: 'general protocol-relative URL',
      resolver: general,
      source: '//cdn.example/images/a.webp',
      local: '//cdn.example/images/a.webp',
      canonical: '//cdn.example/images/a.webp',
      public: '//cdn.example/images/a.webp',
      preview: '//cdn.example/images/a.webp',
    },
    {
      name: 'general blob URL',
      resolver: general,
      source: 'blob:https://site.example/id',
      local: 'blob:https://site.example/id',
      canonical: 'blob:https://site.example/id',
      public: 'blob:https://site.example/id',
      preview: 'blob:https://site.example/id',
    },
    {
      name: 'general data URL',
      resolver: general,
      source: 'data:image/png;base64,AAAA',
      local: 'data:image/png;base64,AAAA',
      canonical: 'data:image/png;base64,AAAA',
      public: 'data:image/png;base64,AAAA',
      preview: 'data:image/png;base64,AAAA',
    },
    {
      name: 'desktop query suffix',
      resolver: desktop,
      source: '/images/gallery/a.webp?x=1',
      local: '/images/gallery/a.webp?x=1',
      canonical: '/images/gallery/a.webp?x=1',
      public: 'https://img.example.com/images/gallery/a.webp?x=1',
      preview: '/images/previews/gallery/a.png?x=1',
    },
    {
      name: 'desktop hash suffix',
      resolver: desktop,
      source: '/images/gallery/a.webp#frag',
      local: '/images/gallery/a.webp#frag',
      canonical: '/images/gallery/a.webp#frag',
      public: 'https://img.example.com/images/gallery/a.webp#frag',
      preview: '/images/previews/gallery/a.png#frag',
    },
    {
      name: 'desktop uppercase extension',
      resolver: desktop,
      source: '/images/gallery/A.WEBP',
      local: '/images/gallery/A.WEBP',
      canonical: '/images/gallery/A.WEBP',
      public: 'https://img.example.com/images/gallery/A.WEBP',
      preview: '/images/previews/gallery/A.png',
    },
    {
      name: 'desktop SVG extension',
      resolver: desktop,
      source: '/images/gallery/a.svg',
      local: '/images/gallery/a.svg',
      canonical: '/images/gallery/a.svg',
      public: 'https://img.example.com/images/gallery/a.svg',
      preview: '/images/previews/gallery/a.png',
    },
    {
      name: 'desktop display copy',
      resolver: desktop,
      source: '/images/gallery/photo-display.webp',
      local: '/images/gallery/photo-display.webp',
      canonical: '/images/gallery/photo-display.webp',
      public: 'https://img.example.com/images/gallery/photo-display.webp',
      preview: '/images/previews/gallery/photo-display.png',
    },
    {
      name: 'desktop doubled slash',
      resolver: desktop,
      source: '/images//a.png',
      local: '/images//a.png',
      canonical: '/images//a.png',
      public: 'https://img.example.com/images//a.png',
      preview: '/images/previews//a.png',
    },
    {
      name: 'desktop trailing empty segment',
      resolver: desktop,
      source: '/images/gallery/',
      local: '/images/gallery/',
      canonical: '/images/gallery/',
      public: 'https://img.example.com/images/gallery/',
      preview: '/images/previews/gallery/',
    },
    {
      name: 'desktop protocol-relative URL',
      resolver: desktop,
      source: '//cdn.example/images/a.webp',
      local: '//cdn.example/images/a.webp',
      canonical: '//cdn.example/images/a.webp',
      public: '//cdn.example/images/a.webp',
      preview: '//cdn.example/images/a.webp',
    },
    {
      name: 'desktop blob URL',
      resolver: desktop,
      source: 'blob:https://site.example/id',
      local: 'blob:https://site.example/id',
      canonical: 'blob:https://site.example/id',
      public: 'blob:https://site.example/id',
      preview: 'blob:https://site.example/id',
    },
    {
      name: 'desktop data URL',
      resolver: desktop,
      source: 'data:image/png;base64,AAAA',
      local: 'data:image/png;base64,AAAA',
      canonical: 'data:image/png;base64,AAAA',
      public: 'data:image/png;base64,AAAA',
      preview: 'data:image/png;base64,AAAA',
    },
    {
      name: 'noncanonical images path',
      resolver: desktop,
      source: '/images/../secret.webp',
      local: '/images/../secret.webp',
      canonical: '/images/../secret.webp',
      public: '/images/../secret.webp',
      preview: '/images/../secret.webp',
    },
  ])('resolves $name through every entry point', ({ resolver, source, ...expected }) => {
    expect(resolver.local(source)).toBe(expected.local);
    expect(resolver.canonical(source)).toBe(expected.canonical);
    expect(resolver.public(source)).toBe(expected.public);
    expect(resolver.preview(source)).toBe(expected.preview);
  });

  it('keeps local deployment paths when no CDN base is configured', () => {
    expect(generalLocal.public('/images/gallery/a.webp')).toBe('/images/gallery/a.webp');
    expect(generalLocal.public('/images/gallery/a.webp#frag')).toBe('/images/gallery/a.webp#frag');
    expect(desktopLocal.public('/images/gallery/a.webp')).toBe('/images/gallery/a.webp');
    expect(desktopLocal.public('/images/gallery/a.webp?x=1')).toBe('/images/gallery/a.webp?x=1');
    expect(desktopLocal.public('/portfolio/previews/gallery/a.png')).toBe(
      '/images/previews/gallery/a.png',
    );
    expect(desktopLocal.preview('/images/gallery/a.svg')).toBe('/images/previews/gallery/a.png');
  });

  it('treats an absent preview prefix as "no preview tree"', () => {
    expect(general.local('/portfolio/previews/gallery/a.png')).toBe(
      '/images/previews/gallery/a.png',
    );
    expect(general.preview('/images/gallery/a.webp')).toBe('/images/gallery/a.webp');
  });

  it('returns an empty string for empty public input', () => {
    expect(general.public(undefined)).toBe('');
    expect(general.public(null)).toBe('');
    expect(general.public('')).toBe('');
    expect(desktop.preview(undefined)).toBe('');
    expect(desktop.preview(null)).toBe('');
  });
});
