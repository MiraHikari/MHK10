import { describe, expect, it } from 'vite-plus/test';
import { resolveAppHref } from './desktop-state';

describe('desktop app navigation', () => {
  const origin = 'https://www.example.com';
  it('opens registered apps and preserves explicit article deep links', () => {
    expect(resolveAppHref('gallery', undefined, origin)).toBe(`${origin}/gallery/`);
    expect(resolveAppHref('blog', '/blog/site-update/#notes', origin)).toBe(
      `${origin}/blog/site-update/#notes`,
    );
    expect(resolveAppHref('pdoom', '/apps/pdoom/', origin)).toBe(`${origin}/apps/pdoom/`);
    expect(resolveAppHref('postcard', undefined, origin)).toBe(`${origin}/apps/postcard/`);
  });
  it('rejects external origins, executable URLs and routes outside the selected app', () => {
    for (const href of [
      'https://evil.example/blog/',
      '//evil.example/blog/',
      'javascript:alert(1)',
      '/blogger/',
      '/blog/../skills/',
      '/apps/notepad/',
    ]) {
      expect(resolveAppHref('blog', href, origin)).toBeNull();
    }
    expect(resolveAppHref('home', '/gallery/', origin)).toBeNull();
    expect(resolveAppHref('gallery', '/gallery/arbitrary/', origin)).toBeNull();
    expect(resolveAppHref('unknown', '/', origin)).toBeNull();
    expect(
      resolveAppHref('blog', 'https://user:password@www.example.com/blog/', origin),
    ).toBeNull();
  });
});
