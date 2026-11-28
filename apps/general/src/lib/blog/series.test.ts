import { describe, expect, it } from 'vite-plus/test';

import { buildSeriesNav, type SeriesEntry } from '@/lib/blog/series';

function entry(id: string, overrides: Partial<SeriesEntry> = {}): SeriesEntry {
  return {
    id,
    title: id,
    publishDate: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('buildSeriesNav', () => {
  const entries: SeriesEntry[] = [
    entry('day-1', {
      title: '第一天',
      series: '杭州行记',
      seriesOrder: 1,
      publishDate: new Date('2026-03-01'),
    }),
    entry('day-2', {
      title: '第二天',
      series: '杭州行记',
      seriesOrder: 2,
      publishDate: new Date('2026-03-02'),
    }),
    entry('day-3', {
      title: '第三天',
      series: '杭州行记',
      seriesOrder: 3,
      publishDate: new Date('2026-03-03'),
    }),
    entry('solo', { title: '独立文章', publishDate: new Date('2026-04-01') }),
    entry('other-series', {
      title: '别处',
      series: '北京札记',
      publishDate: new Date('2026-05-01'),
    }),
  ];

  it('按 seriesOrder 升序输出系列列表', () => {
    const nav = buildSeriesNav(entries, 'day-2');
    expect(nav).not.toBeNull();
    expect(nav!.name).toBe('杭州行记');
    expect(nav!.total).toBe(3);
    expect(nav!.items.map((item) => item.id)).toEqual(['day-1', 'day-2', 'day-3']);
    expect(nav!.items.map((item) => item.current)).toEqual([false, true, false]);
  });

  it('给出组内相邻篇目（中间篇）', () => {
    const nav = buildSeriesNav(entries, 'day-2');
    expect(nav!.prev).toEqual({ id: 'day-1', title: '第一天' });
    expect(nav!.next).toEqual({ id: 'day-3', title: '第三天' });
  });

  it('首篇没有 prev、末篇没有 next', () => {
    const first = buildSeriesNav(entries, 'day-1');
    expect(first!.prev).toBeUndefined();
    expect(first!.next!.id).toBe('day-2');

    const last = buildSeriesNav(entries, 'day-3');
    expect(last!.prev!.id).toBe('day-2');
    expect(last!.next).toBeUndefined();
  });

  it('seriesOrder 缺省时按 publishDate 升序回退', () => {
    const dateOrdered = [
      entry('late', { series: '旧系列', publishDate: new Date('2026-02-10') }),
      entry('early', { series: '旧系列', publishDate: new Date('2026-01-10') }),
      entry('mid', { series: '旧系列', publishDate: new Date('2026-01-20') }),
    ];
    const nav = buildSeriesNav(dateOrdered, 'late');
    expect(nav!.items.map((item) => item.id)).toEqual(['early', 'mid', 'late']);
  });

  it('seriesOrder 相同再按 publishDate 排序', () => {
    const tied = [
      entry('b', { series: '并列', seriesOrder: 1, publishDate: new Date('2026-01-02') }),
      entry('a', { series: '并列', seriesOrder: 1, publishDate: new Date('2026-01-01') }),
    ];
    const nav = buildSeriesNav(tied, 'b');
    expect(nav!.items.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('无 series 的文章返回 null', () => {
    expect(buildSeriesNav(entries, 'solo')).toBeNull();
  });

  it('系列只包含同名分组成员，不混入其他系列', () => {
    const nav = buildSeriesNav(entries, 'other-series');
    expect(nav!.total).toBe(1);
    expect(nav!.items).toEqual([{ id: 'other-series', title: '别处', current: true }]);
    expect(nav!.prev).toBeUndefined();
    expect(nav!.next).toBeUndefined();
  });

  it('当前文章不在任何组内时返回 null', () => {
    expect(buildSeriesNav(entries, 'ghost')).toBeNull();
  });
});
