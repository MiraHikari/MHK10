import { describe, expect, it } from 'vite-plus/test';
import { canonicalUrl } from './canonical-url';
import { blogIndexUrl, postUrl } from './blog/client';

describe('canonical URLs', () => {
  it('uses trailing slashes for public directories and strips temporary state', () => {
    expect(canonicalUrl('/blog/hello?item=x#heading', 'https://site.example')).toBe(
      'https://site.example/blog/hello/',
    );
    expect(canonicalUrl('/', 'https://site.example')).toBe('https://site.example/');
    expect(postUrl('hello', 'https://site.example')).toBe('https://site.example/blog/hello/');
    expect(blogIndexUrl('https://site.example')).toBe('https://site.example/blog/');
  });

  it('preserves file endpoints and encoded content names', () => {
    expect(canonicalUrl('/atom.xml?preview=1', 'https://site.example')).toBe(
      'https://site.example/atom.xml',
    );
    expect(canonicalUrl('/blog/hello.md#source', 'https://site.example')).toBe(
      'https://site.example/blog/hello.md',
    );
    expect(canonicalUrl('/blog/tag/设计', 'https://site.example')).toBe(
      'https://site.example/blog/tag/%E8%AE%BE%E8%AE%A1/',
    );
  });
});
