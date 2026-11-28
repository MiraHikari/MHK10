import { describe, expect, it } from 'vite-plus/test';
import { countTags } from './tags';

describe('countTags', () => {
  it('counts occurrences across posts', () => {
    expect(countTags([{ tags: ['a', 'b'] }, { tags: ['a'] }, { tags: ['c', 'a'] }])).toEqual([
      { tag: 'a', count: 3 },
      { tag: 'b', count: 1 },
      { tag: 'c', count: 1 },
    ]);
  });

  it('breaks ties alphabetically regardless of input order', () => {
    expect(countTags([{ tags: ['zeta'] }, { tags: ['alpha'] }])).toEqual([
      { tag: 'alpha', count: 1 },
      { tag: 'zeta', count: 1 },
    ]);
  });

  it('orders mixed-script ties by code unit, not the runtime locale', () => {
    expect(countTags([{ tags: ['文学'] }, { tags: ['Tech'] }])).toEqual([
      { tag: 'Tech', count: 1 },
      { tag: '文学', count: 1 },
    ]);
  });

  it('returns an empty list for no posts', () => {
    expect(countTags([])).toEqual([]);
  });
});
