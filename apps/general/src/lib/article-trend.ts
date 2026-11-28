import type { ArticleListItem } from '@/lib/blog/types';

export interface MonthlyBucket {
  /** yyyy-MM,用于 key。 */
  readonly key: string;
  /** 展示标签,如 "25.07"。 */
  readonly label: string;
  readonly count: number;
}

/**
 * 以 now 所在月为末桶,统计最近 months 个月的发文数(时间升序)。
 * 岛屿 props 序列化后 publishDate 可能是字符串,这里统一归一化;
 * 未来日期与无效日期忽略。
 */
export function computeMonthlyArticleTrend(
  articles: readonly Pick<ArticleListItem, 'publishDate'>[],
  months = 12,
  now: Date = new Date(),
): MonthlyBucket[] {
  const buckets: { key: string; label: string; count: number }[] = [];
  const index = new Map<string, number>();

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}`;
    index.set(key, buckets.length);
    buckets.push({ key, label, count: 0 });
  }

  for (const article of articles) {
    const raw = article.publishDate as Date | string;
    const date = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(date.getTime()) || date > now) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const at = index.get(key);
    if (at !== undefined) {
      buckets[at].count += 1;
    }
  }

  return buckets;
}
