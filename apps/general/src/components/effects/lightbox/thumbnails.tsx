import { useEffect, useRef } from 'react';
import { useLightboxState } from 'yet-another-react-lightbox';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import { cn } from '@/lib/utils';

/**
 * 自绘缩略图条 — YARL 官方 Thumbnails 插件的轨道只渲染
 * `globalIndex ± carousel.preload` 窗口（本站 preload=1，永远只有 3 枚），
 * 无法整排挑图。这里渲染全部 slides：URL 与画廊网格 / 正文同源，浏览器
 * 大多已缓存；横向原生滚动 + 滚轮横移，激活位自动居中，点击经 onSelect
 * 走受控 index（YARL 沿用滑动动画）。
 *
 * 与 YARL 手势的隔离：YARL 的滑动 / 下拉关闭 / 滚轮缩放都是以 React prop
 * 形式挂在 controller 元素上的，这里 stopPropagation 即可阻断；条带自身
 * `touch-action: pan-x` 恢复移动端原生横滑（controller 是 touch-action: none）。
 */
export function ThumbnailStrip({ onSelect }: { readonly onSelect: (index: number) => void }) {
  const { slides, currentIndex } = useLightboxState();
  const { reducedMotion } = useMediaCapabilities();
  const stripRef = useRef<HTMLDivElement>(null);

  // 激活缩略图保持在视口中央（scrollIntoView 会牵连外层页面，手算 scrollLeft）。
  useEffect(() => {
    const strip = stripRef.current;
    const active = strip?.querySelector<HTMLElement>('[data-active="true"]');
    if (!strip || !active) return;
    const left = active.offsetLeft - (strip.clientWidth - active.clientWidth) / 2;
    strip.scrollTo({ left, behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [currentIndex, reducedMotion]);

  return (
    <div
      ref={stripRef}
      role="group"
      aria-label="缩略图"
      className="pointer-events-auto fixed inset-x-0 bottom-[4.25rem] z-10 overflow-x-auto [scrollbar-width:none] [touch-action:pan-x] [mask-image:linear-gradient(to_right,transparent,black_40px,black_calc(100%-40px),transparent)] [&::-webkit-scrollbar]:hidden md:bottom-[5rem]"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => {
        e.stopPropagation();
        e.currentTarget.scrollLeft += e.deltaY + e.deltaX;
      }}
    >
      <div className="mx-auto flex w-max items-center gap-1.5 px-10 py-2">
        {slides.map((slide, i) => {
          const src = 'src' in slide ? slide.src : undefined;
          const alt = 'alt' in slide ? slide.alt : undefined;
          if (!src) return null;
          const active = i === currentIndex;
          return (
            <button
              key={src}
              type="button"
              data-active={active || undefined}
              onClick={() => onSelect(i)}
              aria-label={`第 ${i + 1} 张${alt ? `：${alt}` : ''}`}
              data-cursor="THUMB"
              aria-current={active || undefined}
              className={cn(
                'group relative h-12 w-16 shrink-0 overflow-hidden border transition-[opacity,border-color,transform] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-base md:h-14 md:w-20',
                active
                  ? 'border-accent-base opacity-100'
                  : 'border-white/15 opacity-55 hover:opacity-100',
              )}
            >
              <img
                src={src}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                className="h-full w-full object-cover transition-[filter,transform] duration-300 ease-[var(--ease-brand)] group-hover:scale-105 group-hover:saturate-110"
              />
              <span
                className="pointer-events-none absolute inset-0 border border-accent-base/0 transition-colors duration-300 group-hover:border-accent-base/60"
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
