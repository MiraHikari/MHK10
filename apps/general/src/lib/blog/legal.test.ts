import { describe, expect, it } from 'vite-plus/test';

import {
  BLOG_LICENSE,
  COPYRIGHT_START_YEAR,
  articleLicenseSummary,
  copyrightLine,
} from '@/lib/blog/legal';

describe('copyrightLine', () => {
  it('uses a single year when still in the start year', () => {
    expect(copyrightLine(new Date(COPYRIGHT_START_YEAR, 5, 1))).toBe(
      `© ${COPYRIGHT_START_YEAR} MiraHikari`,
    );
  });

  it('expands to a range in later years', () => {
    expect(copyrightLine(new Date(COPYRIGHT_START_YEAR + 2, 0, 1))).toBe(
      `© ${COPYRIGHT_START_YEAR}–${COPYRIGHT_START_YEAR + 2} MiraHikari`,
    );
  });
});

describe('articleLicenseSummary', () => {
  it('embeds the license id and canonical URL', () => {
    const summary = articleLicenseSummary();
    expect(summary).toContain(BLOG_LICENSE.id);
    expect(summary).toContain(BLOG_LICENSE.url);
    expect(summary).toContain('MiraHikari');
  });
});
