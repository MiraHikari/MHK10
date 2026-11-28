import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';
import { getBlogSource } from './source';

describe('shared authored article source', () => {
  it('serves exact MDX for every public article slug after the workspace migration', () => {
    for (const id of ['advx-2026-hangzhou', 'colophon', 'privacy']) {
      const authored = readFileSync(
        new URL(`../../../../../packages/site-core/content/blog/${id}.mdx`, import.meta.url),
        'utf8',
      );
      expect(getBlogSource(id)).toBe(authored);
    }
  });

  it('does not invent a source for an unknown slug', () => {
    expect(getBlogSource('unknown-article')).toBeUndefined();
  });
  it('keeps the complete desktop technical explanation available as its own shared article', () => {
    const authored = readFileSync(
      new URL('../../../../../packages/site-core/content/blog/mhk10-technical.md', import.meta.url),
      'utf8',
    );
    expect(getBlogSource('mhk10-technical')).toBe(authored);
    expect(authored).toContain('## 桌面就是一个文件夹');
    expect(authored).toContain('updatedDate: 2026-10-10');
  });
});
