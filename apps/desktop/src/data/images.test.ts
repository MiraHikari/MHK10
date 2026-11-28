import { describe, expect, it } from 'vite-plus/test';
import {
  canonicalImageSrc,
  imageBaseUrl,
  localImageSrc,
  portfolioAsset,
  portfolioPreview,
  previewImageSrc,
  resolveImageSrc,
} from './images';

describe('publication image paths', () => {
  it('keeps canonical /images paths on the bundled /images tree', () => {
    expect(portfolioAsset('/images/profile/avatar.webp')).toBe('/images/profile/avatar.webp');
    expect(portfolioPreview('/images/profile/avatar.webp')).toBe(
      '/images/previews/profile/avatar.png',
    );
  });

  it('accepts paths that are already public and does not nest previews', () => {
    expect(resolveImageSrc('/portfolio/projects/xengine.webp', '')).toBe(
      '/images/projects/xengine.webp',
    );
    expect(portfolioPreview('/portfolio/projects/xengine.webp')).toBe(
      '/images/previews/projects/xengine.png',
    );
    expect(portfolioPreview('/portfolio/previews/profile/avatar.png')).toBe(
      '/images/previews/profile/avatar.png',
    );
  });

  it('prefixes only publication paths when a base URL is configured', () => {
    expect(imageBaseUrl('https://img.example.com/')).toBe('https://img.example.com');
    expect(resolveImageSrc('/images/gallery/a.webp', 'https://img.example.com/')).toBe(
      'https://img.example.com/images/gallery/a.webp',
    );
    expect(resolveImageSrc('https://other.example/a.webp', 'https://img.example.com')).toBe(
      'https://other.example/a.webp',
    );
    expect(resolveImageSrc('/favicon.svg', 'https://img.example.com')).toBe('/favicon.svg');
    expect(resolveImageSrc('blob:https://example/y', 'https://img.example.com')).toBe(
      'blob:https://example/y',
    );
  });

  it('uses canonical CDN keys while keeping bundled files and previews stable', () => {
    const base = 'https://static.example.com';
    const canonical = '/images/gallery/west-lake-vista-display.webp';
    const local = '/images/gallery/west-lake-vista-display.webp';
    const remote = `${base}${canonical}`;
    expect(resolveImageSrc(local, base)).toBe(remote);
    expect(localImageSrc(remote, base)).toBe(local);
    expect(canonicalImageSrc(remote, base)).toBe(canonical);
    expect(canonicalImageSrc(local, '')).toBe(canonical);
    expect(resolveImageSrc('/portfolio/previews/profile/avatar.png', base)).toBe(
      '/images/previews/profile/avatar.png',
    );
    expect(localImageSrc('https://other.example/images/private.png', base)).toBe(
      'https://other.example/images/private.png',
    );
  });

  it('returns an empty string for empty input', () => {
    expect(resolveImageSrc(undefined)).toBe('');
    expect(resolveImageSrc(null)).toBe('');
    expect(resolveImageSrc('')).toBe('');
    expect(imageBaseUrl('')).toBe('');
    expect(imageBaseUrl(undefined)).toBe('');
  });

  it.each([
    {
      name: 'query suffix',
      source: '/images/gallery/a.webp?x=1',
      local: '/images/gallery/a.webp?x=1',
      canonical: '/images/gallery/a.webp?x=1',
      public: 'https://static.example.com/images/gallery/a.webp?x=1',
      preview: '/images/previews/gallery/a.png?x=1',
    },
    {
      name: 'hash suffix',
      source: '/images/gallery/a.webp#frag',
      local: '/images/gallery/a.webp#frag',
      canonical: '/images/gallery/a.webp#frag',
      public: 'https://static.example.com/images/gallery/a.webp#frag',
      preview: '/images/previews/gallery/a.png#frag',
    },
    {
      name: 'uppercase extension',
      source: '/images/gallery/A.WEBP',
      local: '/images/gallery/A.WEBP',
      canonical: '/images/gallery/A.WEBP',
      public: 'https://static.example.com/images/gallery/A.WEBP',
      preview: '/images/previews/gallery/A.png',
    },
    {
      name: 'SVG extension',
      source: '/images/gallery/a.svg',
      local: '/images/gallery/a.svg',
      canonical: '/images/gallery/a.svg',
      public: 'https://static.example.com/images/gallery/a.svg',
      preview: '/images/previews/gallery/a.png',
    },
    {
      name: 'display copy',
      source: '/images/gallery/photo-display.webp',
      local: '/images/gallery/photo-display.webp',
      canonical: '/images/gallery/photo-display.webp',
      public: 'https://static.example.com/images/gallery/photo-display.webp',
      preview: '/images/previews/gallery/photo-display.png',
    },
    {
      name: 'doubled slash',
      source: '/images//a.png',
      local: '/images//a.png',
      canonical: '/images//a.png',
      public: 'https://static.example.com/images//a.png',
      preview: '/images/previews//a.png',
    },
    {
      name: 'empty trailing segment',
      source: '/images/gallery/',
      local: '/images/gallery/',
      canonical: '/images/gallery/',
      public: 'https://static.example.com/images/gallery/',
      preview: '/images/previews/gallery/',
    },
    {
      name: 'protocol-relative URL',
      source: '//cdn.example/images/a.webp',
      local: '//cdn.example/images/a.webp',
      canonical: '//cdn.example/images/a.webp',
      public: '//cdn.example/images/a.webp',
      preview: '//cdn.example/images/a.webp',
    },
    {
      name: 'blob URL',
      source: 'blob:https://example/y',
      local: 'blob:https://example/y',
      canonical: 'blob:https://example/y',
      public: 'blob:https://example/y',
      preview: 'blob:https://example/y',
    },
    {
      name: 'data URL',
      source: 'data:image/png;base64,AAAA',
      local: 'data:image/png;base64,AAAA',
      canonical: 'data:image/png;base64,AAAA',
      public: 'data:image/png;base64,AAAA',
      preview: 'data:image/png;base64,AAAA',
    },
  ])('preserves $name through every exported adapter', ({ source, ...expected }) => {
    const base = 'https://static.example.com';
    expect(localImageSrc(source, base)).toBe(expected.local);
    expect(canonicalImageSrc(source, base)).toBe(expected.canonical);
    expect(resolveImageSrc(source, base)).toBe(expected.public);
    expect(previewImageSrc(source)).toBe(expected.preview);
  });
});
