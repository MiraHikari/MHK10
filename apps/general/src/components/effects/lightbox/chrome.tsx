import { useEffect, useRef } from 'react';
import { useController, useLightboxState, type ZoomRef } from 'yet-another-react-lightbox';
import XIcon from '~icons/lucide/x';
import ZoomInIcon from '~icons/lucide/zoom-in';
import ZoomOutIcon from '~icons/lucide/zoom-out';
import { resolveImageSrc } from '@/lib/images/url';
import { downloadImage } from '@/lib/images/download';

/**
 * 灯箱内部控件（YARL render 插槽件）：工具栏关闭 / 缩放组、加载失败提示与
 * 站点 chrome（顶部分类 + 底部信息栏）。由 `./root.tsx` 装配进 YARL。
 */

export const padCount = (n: number) => String(n).padStart(2, '0');

const TOP_CONTROL_CLASS =
  'flex min-w-11 min-h-11 items-center justify-center text-white/50 hover:text-white transition-colors duration-300 disabled:opacity-30 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-base';

const CHIP_CLASS =
  'pointer-events-auto inline-flex items-center gap-1 border border-white/15 bg-black/45 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-label text-white/75 backdrop-blur-sm transition-colors hover:border-accent-base hover:text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-base';

/** 工具栏关闭按钮：hover 旋转沿用旧视觉。 */
export function CloseButton() {
  const { close } = useController();
  return (
    <button
      type="button"
      onClick={close}
      className="flex min-w-11 min-h-11 items-center justify-center text-white/50 hover:text-white hover:rotate-90 transition-[color,transform] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-base"
      aria-label="Close lightbox"
      title="关闭 (Esc)"
    >
      <XIcon className="w-6 h-6" />
    </button>
  );
}

/**
 * 缩放按钮到达边界被禁用时，焦点会随 disabled 掉回 body，键盘翻页就此失效。
 * 复刻 YARL 默认缩放按钮的行为：焦点还在身上就被禁用 → 交还 controller。
 */
function useFocusGuard(disabled: boolean) {
  const { focus } = useController();
  const wasFocused = useRef(false);
  useEffect(() => {
    if (disabled && wasFocused.current) focus();
  }, [disabled, focus]);
  return {
    onFocus: () => {
      wasFocused.current = true;
    },
    onBlur: () => {
      wasFocused.current = false;
    },
  };
}

/** 工具栏缩放组（− / 百分比 / ＋），替换 Zoom 插件默认按钮；百分比即复位。 */
export function ZoomControls({ zoom }: { readonly zoom: ZoomRef }) {
  const zoomed = zoom.zoom > zoom.minZoom;
  const outDisabled = zoom.disabled || !zoomed;
  const resetDisabled = zoom.disabled || !zoomed;
  const inDisabled = zoom.disabled || zoom.zoom >= zoom.maxZoom;
  const outGuard = useFocusGuard(outDisabled);
  const resetGuard = useFocusGuard(resetDisabled);
  const inGuard = useFocusGuard(inDisabled);
  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={zoom.zoomOut}
        disabled={outDisabled}
        {...outGuard}
        className={TOP_CONTROL_CLASS}
        aria-label="缩小"
        title="缩小 (−)"
      >
        <ZoomOutIcon className="w-5 h-5" />
      </button>
      <button
        type="button"
        onClick={() => zoom.changeZoom(zoom.minZoom)}
        disabled={resetDisabled}
        {...resetGuard}
        className={`${TOP_CONTROL_CLASS} font-mono text-[11px] tabular-nums`}
        aria-label="重置缩放"
        title="重置缩放"
      >
        {Math.round(zoom.zoom * 100)}%
      </button>
      <button
        type="button"
        onClick={zoom.zoomIn}
        disabled={inDisabled}
        {...inGuard}
        className={TOP_CONTROL_CLASS}
        aria-label="放大"
        title="放大 (+)"
      >
        <ZoomInIcon className="w-5 h-5" />
      </button>
    </div>
  );
}

/** 加载失败提示（gallery 图片 slide）：保留旧的 chip 视觉与「打开原图」出口。 */
export function SlideErrorHint() {
  const { currentSlide } = useLightboxState();
  const src = currentSlide && 'src' in currentSlide ? currentSlide.src : undefined;
  return (
    <div className="flex flex-col items-center gap-3 leading-normal">
      <span className="font-mono text-xs text-white/45">图片加载失败</span>
      {src && (
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={CHIP_CLASS}
        >
          打开原图 ↗
        </a>
      )}
    </div>
  );
}

/**
 * 站点 chrome：顶部分类标签 + 底部信息栏（两种变体共用）。
 * 经 render.controls 渲染在 YARL controller 内，随 portal 一起淡入淡出。
 */
export function LightboxChrome({ variant }: { readonly variant: 'gallery' | 'project' }) {
  const { currentSlide, currentIndex, slides } = useLightboxState();
  const item = currentSlide?.item;
  if (!item) return null;
  const isGallery = variant === 'gallery';
  return (
    <>
      {/* 顶部分类 — 与工具栏同一行，高度对齐 lightbox.css 的 toolbar padding */}
      <span className="pointer-events-none absolute left-4 top-0 z-10 flex h-[4.25rem] max-w-[45vw] items-center truncate font-mono text-micro uppercase tracking-label text-white/40 md:left-8 md:h-[5.25rem]">
        {item.category}
      </span>
      <div className="sr-only" aria-live="polite">
        第 {currentIndex + 1} 张，共 {slides.length} 张{item.title ? `：${item.title}` : ''}
      </div>
      {/* 底部信息栏 — fixed 落在视口底部，缩略图条悬于其上方（bottom 偏移与栏高对齐） */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex items-end justify-between gap-3 px-4 py-3 md:px-8 md:py-5">
        <div className="min-w-0">
          <h3 className="truncate text-sm text-ink-on-dark text-display sm:text-base md:text-lg">
            {item.title}
          </h3>
          <p className="mt-1 text-xs font-mono text-white/50">
            {item.location}
            {item.dateLabel || item.year ? ` · ${item.dateLabel ?? item.year}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 md:gap-4">
          {isGallery && (
            <button
              type="button"
              onClick={() => {
                void downloadImage(resolveImageSrc(item.downloadSrc ?? item.imageSrc));
              }}
              className={CHIP_CLASS}
            >
              FULL RES ↗
            </button>
          )}
          {item.sourceUrl && (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={CHIP_CLASS}
            >
              {item.sourceLabel ?? 'SOURCE'} ↗
            </a>
          )}
          <span className="text-xs font-mono text-white/40 tabular-nums">
            {padCount(currentIndex + 1)} / {padCount(slides.length)}
          </span>
        </div>
      </div>
    </>
  );
}
