/**
 * 图片预取工具：跨页面去重的 <img> 预取与空闲批量预取。
 * 数据层仍写 /images/ 站内路径，统一经 resolveImageSrc 解析。
 *
 * 分层策略：
 * - BaseHead 输出 preconnect / dns-prefetch 预热 CDN 源；
 * - 列表卡片 hover / focus 时 prefetchImage 预取灯箱大图（省流 / 2G 自动跳过）；
 * - Lightbox 打开后预取相邻两张（省流 / 2G 自动跳过）；
 * - 列表空闲时 prefetchImagesOnIdle 批量预取展示图（省流 / 2G 自动跳过，
 *   并发上限默认 3 张，防止空闲期一次性发起过多请求）。
 */

import { resolveImageSrc } from './url';
import { whenIdle } from '@/lib/idle';

const prefetched = new Set<string>();

interface ConnectionLike {
  saveData?: boolean;
  effectiveType?: string;
}

/** 省流模式或 2G 弱网时不做预取 */
export function shouldConserveData(): boolean {
  if (typeof window === 'undefined') return true;
  const connection = (navigator as Navigator & { connection?: ConnectionLike }).connection;
  return (
    Boolean(connection?.saveData) ||
    connection?.effectiveType === '2g' ||
    connection?.effectiveType === 'slow-2g'
  );
}

/**
 * 省流模式或 2G 弱网时首屏图也应降为 lazy 渲染（eager 会让整页大图并发
 * 抢占有限带宽）。与 shouldConserveData 同一判定。
 */
export function shouldRenderEager(): boolean {
  return !shouldConserveData();
}

/** 预取单张图片（同一 URL 只触发一次；SSR 或省流/弱网环境为空操作） */
export function prefetchImage(src: string | null | undefined): void {
  if (typeof window === 'undefined' || !src) return;
  if (shouldConserveData()) return;
  const url = resolveImageSrc(src);
  if (!url || prefetched.has(url)) return;
  prefetched.add(url);
  const img = new Image();
  img.decoding = 'async';
  img.onerror = () => prefetched.delete(url);
  img.src = url;
}

/**
 * 空闲时批量预取（requestIdleCallback，降级 setTimeout）。
 * 返回取消函数；SSR 或省流/弱网环境不调度并返回 undefined。
 *
 * 并发控制：idle 回调触发后，按顺序预取，但同时进行中的 Image 加载不超过
 * concurrency 张。cancel() 取消 idle 调度并置标志位，后续不再启动新加载
 *（在途的不强制中止）。
 */
export function prefetchImagesOnIdle(
  srcs: readonly (string | null | undefined)[],
  timeout = 2000,
  concurrency = 3,
): (() => void) | undefined {
  if (typeof window === 'undefined' || shouldConserveData()) return undefined;

  let cancelled = false;

  const run = () => {
    if (cancelled) return;
    const urls = srcs
      .map(resolveImageSrc)
      .filter((url): url is string => Boolean(url) && !prefetched.has(url));

    if (urls.length === 0) return;

    let index = 0;
    let inFlight = 0;

    const launchNext = () => {
      if (cancelled) return;
      while (inFlight < concurrency && index < urls.length) {
        const url = urls[index++];
        prefetched.add(url);
        inFlight++;
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          inFlight--;
          launchNext();
        };
        img.onerror = () => {
          // Keep successful requests deduplicated, but allow a transient CDN
          // failure to be retried by a later hover or idle pass.
          prefetched.delete(url);
          inFlight--;
          launchNext();
        };
        img.src = url;
      }
    };

    launchNext();
  };

  const cancelIdle = whenIdle(run, { timeout, fallbackDelay: 300 });
  return () => {
    cancelled = true;
    cancelIdle();
  };
}
