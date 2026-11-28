import { describe, expect, it } from 'vite-plus/test';
import { highlightSegments, matchScore } from '@/lib/command-match';

describe('matchScore', () => {
  it('returns null when query is not a subsequence of target', () => {
    expect(matchScore('xyz', 'GitHub')).toBeNull();
    expect(matchScore('abc', 'acb')).toBeNull();
  });

  it('matches case-insensitively and returns 0 for empty query', () => {
    expect(matchScore('', 'anything')).toBe(0);
    expect(matchScore('   ', 'anything')).toBe(0);
    expect(matchScore('git', 'GitHub / 代码仓库')).not.toBeNull();
  });

  it('prefers matches starting earlier', () => {
    const early = matchScore('blog', 'Blog / 博客');
    const late = matchScore('blog', '阅读 Blog');
    expect(early).not.toBeNull();
    expect(late).not.toBeNull();
    expect(early!).toBeLessThan(late!);
  });

  it('prefers compact (consecutive) matches over scattered ones', () => {
    const compact = matchScore('abc', 'abc——');
    const scattered = matchScore('abc', 'a—b—c—');
    expect(compact!).toBeLessThan(scattered!);
  });

  it('slightly prefers shorter targets at equal alignment', () => {
    const short = matchScore('git', 'Git');
    const long = matchScore('git', 'GitHub / 代码仓库');
    expect(short!).toBeLessThan(long!);
  });
});

describe('highlightSegments', () => {
  it('returns a single unmatched segment for empty query or empty text', () => {
    expect(highlightSegments('GitHub', '')).toEqual([{ text: 'GitHub', matched: false }]);
    expect(highlightSegments('', 'git')).toEqual([{ text: '', matched: false }]);
  });

  it('marks the full text when query covers it entirely', () => {
    expect(highlightSegments('Git', 'git')).toEqual([{ text: 'Git', matched: true }]);
  });

  it('splits partial matches into matched and unmatched runs', () => {
    expect(highlightSegments('GitHub', 'gh')).toEqual([
      { text: 'G', matched: true },
      { text: 'it', matched: false },
      { text: 'H', matched: true },
      { text: 'ub', matched: false },
    ]);
  });

  it('handles non-ASCII text and mid-word hits', () => {
    expect(highlightSegments('回到首页 / Back to Start', 'bt')).toEqual([
      { text: '回到首页 / ', matched: false },
      { text: 'B', matched: true },
      { text: 'ack ', matched: false },
      { text: 't', matched: true },
      { text: 'o Start', matched: false },
    ]);
  });

  it('falls back to plain text when the sequential match cannot cover the query', () => {
    expect(highlightSegments('GitHub', 'hub!')).toEqual([{ text: 'GitHub', matched: false }]);
  });
});
