import type { GalleryItem } from '@/data/profile';

export type GallerySort = 'custom' | 'newest' | 'oldest';

/**
 * Gallery dates are authored as ISO values where known, or a year-only value
 * for legacy frames. Invalid values stay deterministic instead of making the
 * sort callback return NaN.
 */
export function galleryTimestamp(date: string): number {
  const timestamp = Date.parse(date);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function sortGalleryItems(items: readonly GalleryItem[], sort: GallerySort): GalleryItem[] {
  return items.toSorted((a, b) => {
    if (sort === 'custom') return a.order - b.order;
    const dateDelta = galleryTimestamp(a.date) - galleryTimestamp(b.date);
    if (dateDelta !== 0) return sort === 'newest' ? -dateDelta : dateDelta;
    return a.order - b.order;
  });
}

export function galleryCategories(items: readonly GalleryItem[]): string[] {
  return Array.from(new Set(items.map((item) => item.category))).toSorted((a, b) =>
    a.localeCompare(b),
  );
}

/**
 * 瀑布流分列：按图片宽高比（height / width）估算每张图在等宽列中的占位高度，
 * 贪心地把每张图放进当前最短的列，让各列底部基本对齐。
 * 返回每列包含的原始索引（保持传入顺序的稳定分配，不重排数据）。
 */
export function balanceMasonry(items: readonly GalleryItem[], columnCount: number): number[][] {
  const count = Math.max(1, Math.floor(columnCount));
  const columns = Array.from({ length: count }, () => ({
    indices: [] as number[],
    height: 0,
  }));

  items.forEach((item, index) => {
    let shortest = columns[0];
    for (const column of columns) {
      if (column.height < shortest.height) shortest = column;
    }
    shortest.indices.push(index);
    // 缺失尺寸时按 4:3 竖图估计，避免 NaN 污染列高。
    const ratio = item.width > 0 && item.height > 0 ? item.height / item.width : 0.75;
    shortest.height += ratio;
  });

  return columns.map((column) => column.indices);
}
