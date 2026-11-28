import { describe, expect, it } from 'vite-plus/test';
import { computeMonthlyArticleTrend } from '@/lib/article-trend';

const NOW = new Date(2026, 7, 1, 12, 0, 0); // 2026-08-01 正午,避免月末边界

describe('computeMonthlyArticleTrend', () => {
  it('returns `months` ascending buckets ending at the current month', () => {
    const trend = computeMonthlyArticleTrend([], 12, NOW);
    expect(trend).toHaveLength(12);
    expect(trend[0].key).toBe('2025-09');
    expect(trend[11].key).toBe('2026-08');
    expect(trend.every((b) => b.count === 0)).toBe(true);
  });

  it('counts articles into their calendar month buckets', () => {
    const trend = computeMonthlyArticleTrend(
      [
        { publishDate: new Date(2026, 6, 3) },
        { publishDate: new Date(2026, 6, 20) },
        { publishDate: new Date(2026, 7, 1) },
        { publishDate: new Date(2025, 8, 15) },
        // 超出 12 个月窗口,忽略
        { publishDate: new Date(2024, 0, 10) },
      ],
      12,
      NOW,
    );
    expect(trend.find((b) => b.key === '2026-07')?.count).toBe(2);
    expect(trend.find((b) => b.key === '2026-08')?.count).toBe(1);
    expect(trend.find((b) => b.key === '2025-09')?.count).toBe(1);
    expect(trend.reduce((sum, b) => sum + b.count, 0)).toBe(4);
  });

  it('accepts ISO string dates (island props serialization)', () => {
    const trend = computeMonthlyArticleTrend(
      [{ publishDate: '2026-07-10T08:00:00.000Z' as unknown as Date }],
      12,
      NOW,
    );
    expect(trend.find((b) => b.key === '2026-07')?.count).toBe(1);
  });

  it('ignores future-dated and invalid articles', () => {
    const trend = computeMonthlyArticleTrend(
      [{ publishDate: new Date(2027, 0, 1) }, { publishDate: 'not-a-date' as unknown as Date }],
      12,
      NOW,
    );
    expect(trend.every((b) => b.count === 0)).toBe(true);
  });

  it('formats labels as YY.MM', () => {
    const trend = computeMonthlyArticleTrend([], 2, NOW);
    expect(trend.map((b) => b.label)).toEqual(['26.07', '26.08']);
  });
});
