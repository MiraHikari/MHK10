import { useEffect, useState } from 'react';
import { getCount } from '@/lib/kounter';

/** 并发上限：避免列表文章多时打爆服务 */
const CONCURRENCY_LIMIT = 6;

/**
 * 批量读取计数器（只读，不自增）。
 *
 * targets 变化时重新获取；读取失败的目标显示为 0（静默降级）。
 * 调用方应传入稳定引用（useMemo），避免每次渲染触发重新获取。
 * SSR 渲染期返回空 Map。
 */
export function useKounterCounts(targets: string[]): Map<string, number> {
  const [counts, setCounts] = useState<Map<string, number>>(() => new Map());

  useEffect(() => {
    if (targets.length === 0) {
      setCounts(new Map());
      return;
    }
    let cancelled = false;

    void (async () => {
      const results = new Map<string, number>();
      let cursor = 0;

      const workers = Array.from(
        { length: Math.min(CONCURRENCY_LIMIT, targets.length) },
        async () => {
          while (!cancelled) {
            const index = cursor++;
            if (index >= targets.length) break;
            const target = targets[index];
            results.set(target, await getCount(target));
          }
        },
      );

      await Promise.all(workers);
      if (!cancelled) setCounts(results);
    })();

    return () => {
      cancelled = true;
    };
  }, [targets]);

  return counts;
}
