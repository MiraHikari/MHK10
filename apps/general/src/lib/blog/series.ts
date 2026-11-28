import type { ArticleSeriesNav, PostNavItem } from './types';

/** 参与系列分组的最小文章形状。 */
export interface SeriesEntry {
  id: string;
  title: string;
  category?: string;
  series?: string;
  seriesOrder?: number;
  publishDate: Date;
}

function toNavItem(entry: SeriesEntry): PostNavItem {
  return { id: entry.id, title: entry.title, category: entry.category };
}

/**
 * 为当前文章构建系列导航：按 series 分组，组内按 seriesOrder 升序
 * （缺省按 publishDate 升序，同序同日期按 id 稳定排序）；返回当前文章
 * 所在组的名称 / 篇数 / 列表与相邻篇目。无 series 或缺组返回 null。
 */
export function buildSeriesNav(
  entries: ReadonlyArray<SeriesEntry>,
  currentId: string,
): ArticleSeriesNav | null {
  const current = entries.find((entry) => entry.id === currentId);
  if (!current?.series) return null;

  const group = entries
    .filter((entry) => entry.series === current.series)
    .sort(
      (a, b) =>
        (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0) ||
        a.publishDate.valueOf() - b.publishDate.valueOf() ||
        a.id.localeCompare(b.id),
    );
  const index = group.findIndex((entry) => entry.id === currentId);
  if (index < 0) return null;

  return {
    name: current.series,
    total: group.length,
    items: group.map((entry) => ({
      id: entry.id,
      title: entry.title,
      current: entry.id === currentId,
    })),
    prev: index > 0 ? toNavItem(group[index - 1]) : undefined,
    next: index < group.length - 1 ? toNavItem(group[index + 1]) : undefined,
  };
}
