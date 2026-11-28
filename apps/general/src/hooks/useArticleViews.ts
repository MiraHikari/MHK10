import { useEffect, useState } from 'react';
import {
  articleTarget,
  getCount,
  incrementCounts,
  isLocalhost,
  markCounted,
  shouldCount,
} from '@/lib/kounter';

/**
 * 文章阅读数：读取 OpenKounter 计数并（24h 去重后）自增。
 *
 * 只在浏览器端执行（SSR 渲染期返回 null，UI 隐藏）；请求失败静默
 * 降级为 null / 不计数。显示值 = 当前值 + 本次是否计入（乐观 +1，
 * 与 open-kounter 客户端 adapter 一致）。
 */
export function useArticleViews(slug: string | undefined): number | null {
  const [views, setViews] = useState<number | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    void (async () => {
      const target = articleTarget(slug);
      const current = await getCount(target);
      if (cancelled) return;

      const countThisVisit = !isLocalhost(window.location.hostname) && shouldCount(target);
      if (countThisVisit) {
        markCounted(target);
        void incrementCounts([target]);
      }
      if (!cancelled) {
        setViews(current + (countThisVisit ? 1 : 0));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  return views;
}
