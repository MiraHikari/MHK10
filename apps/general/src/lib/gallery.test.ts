import { describe, expect, it } from 'vite-plus/test';
import type { GalleryItem } from '@/data/profile';
import { balanceMasonry, sortGalleryItems } from '@/lib/gallery';

const item = (title: string, date: string, order: number): GalleryItem => ({
  title,
  location: 'Test',
  year: date.slice(0, 4),
  date,
  dateLabel: date,
  datePrecision: date.length === 4 ? 'year' : 'date',
  order,
  category: 'TEST',
  imageSrc: `/${title}.jpg`,
  imageAlt: title,
  width: 100,
  height: 100,
});

describe('sortGalleryItems', () => {
  const items = [
    item('legacy', '2024', 1),
    item('latest', '2026-07-29', 3),
    item('curated-first', '2026-07-20', 2),
  ];

  it('preserves the authored order in custom mode', () => {
    expect(sortGalleryItems(items, 'custom').map((entry) => entry.title)).toEqual([
      'legacy',
      'curated-first',
      'latest',
    ]);
  });

  it('sorts dates in both directions without mutating the source', () => {
    expect(sortGalleryItems(items, 'newest').map((entry) => entry.title)).toEqual([
      'latest',
      'curated-first',
      'legacy',
    ]);
    expect(sortGalleryItems(items, 'oldest').map((entry) => entry.title)).toEqual([
      'legacy',
      'curated-first',
      'latest',
    ]);
    expect(items.map((entry) => entry.title)).toEqual(['legacy', 'latest', 'curated-first']);
  });
});

describe('balanceMasonry', () => {
  const sized = (title: string, width: number, height: number, order: number): GalleryItem => ({
    ...item(title, '2026-01-01', order),
    width,
    height,
  });

  it('distributes every item exactly once across the requested columns', () => {
    const items = [
      sized('a', 100, 200, 1),
      sized('b', 100, 100, 2),
      sized('c', 100, 50, 3),
      sized('d', 100, 300, 4),
    ];
    const columns = balanceMasonry(items, 3);
    expect(columns).toHaveLength(3);
    expect(columns.flat().sort((x, y) => x - y)).toEqual([0, 1, 2, 3]);
  });

  it('keeps column heights balanced via shortest-column-first', () => {
    // 两张高图 + 四张矮图：贪心应把高图分到不同列。
    const items = [
      sized('tall-1', 100, 400, 1),
      sized('tall-2', 100, 400, 2),
      sized('flat-1', 100, 100, 3),
      sized('flat-2', 100, 100, 4),
      sized('flat-3', 100, 100, 5),
      sized('flat-4', 100, 100, 6),
    ];
    const columns = balanceMasonry(items, 2);
    const heights = columns.map((indices) =>
      indices.reduce((sum, i) => sum + items[i].height / items[i].width, 0),
    );
    expect(Math.abs(heights[0] - heights[1])).toBeLessThanOrEqual(2);
    // 高图不在同一列
    expect(columns[0].includes(0)).not.toBe(columns[0].includes(1));
  });

  it('falls back to a single column and clamps invalid column counts', () => {
    const items = [sized('a', 100, 100, 1), sized('b', 100, 200, 2)];
    expect(balanceMasonry(items, 1)).toEqual([[0, 1]]);
    expect(balanceMasonry(items, 0)).toEqual([[0, 1]]);
  });
});
