import { useEffect, useMemo, useRef, useState } from 'react';
import CalendarIcon from '~icons/lucide/calendar';
import SlidersHorizontalIcon from '~icons/lucide/sliders-horizontal';
import Columns3Icon from '~icons/lucide/columns-3';
import Grid2x2Icon from '~icons/lucide/grid-2x2';
import SiteImage from '@/components/ui/SiteImage';
import { galleryItems, type GalleryItem } from '@/data/profile';
import {
  balanceMasonry,
  sortGalleryItems,
  galleryCategories,
  type GallerySort,
} from '@/lib/gallery';
import { prefetchImage, prefetchImagesOnIdle, shouldRenderEager } from '@/lib/images/prefetch';
import SectionCanvas from '@/components/layout/SectionCanvas';
import SectionMasthead from '@/components/layout/SectionMasthead';
import ThinkingState from '@/components/ui/ThinkingState';
import Lightbox from '../effects/Lightbox';
import { cn } from '@/lib/utils';
import { useSectionCommandTarget } from '@/components/layout/SectionAppContext';
import { useSectionReady } from '@/components/motion/SectionReadyContext';
import { useCommandTargetHighlight } from '@/hooks/useCommandTargetHighlight';
import { useClientFlag } from '@/hooks/useClientFlag';
import { useMediaCapabilities, useMediaQuery } from '@/hooks/useMediaCapabilities';

type GalleryLayout = 'masonry' | 'mosaic';

/** The curated rhythm used by the alternate grid view. */
const MOSAIC_PATTERN = [
  {
    span: 'col-span-2 md:col-span-7 md:row-span-2',
    ratio: 'aspect-[16/10] md:aspect-auto',
  },
  { span: 'col-span-1 md:col-span-5', ratio: 'aspect-[4/3] md:aspect-auto' },
  { span: 'col-span-1 md:col-span-5', ratio: 'aspect-[4/3] md:aspect-auto' },
  {
    span: 'col-span-2 md:col-span-12',
    ratio: 'aspect-[16/9] md:aspect-auto',
  },
] as const;

export default function GallerySection() {
  const commandTarget = useSectionCommandTarget();
  const isReady = useSectionReady();
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [sort, setSort] = useState<GallerySort>('custom');
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [layout, setLayout] = useState<GalleryLayout>('masonry');
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const { reducedMotion } = useMediaCapabilities();
  useEffect(() => {
    if (commandTarget?.sectionId !== 'gallery') return;
    const item = galleryItems.find((entry) => entry.imageSrc === commandTarget.itemId);
    if (item) setActiveCategory(item.category);
  }, [commandTarget]);
  useCommandTargetHighlight('gallery', isReady, commandTarget);
  // 省流 / 2G 弱网时前两行也降为 lazy，避免整页大图并发抢带宽。
  const eager = useClientFlag(shouldRenderEager);

  const categories = useMemo(() => galleryCategories(galleryItems), []);
  const visibleItems = useMemo(() => {
    const filtered =
      activeCategory === 'ALL'
        ? galleryItems
        : galleryItems.filter((item) => item.category === activeCategory);
    return sortGalleryItems(filtered, sort);
  }, [activeCategory, sort]);

  // 空闲时预取当前筛选下的全部展示图，滚动更顺滑（省流 / 2G 自动跳过）
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancel: (() => void) | undefined;
    timer = setTimeout(() => {
      const sources = visibleItems.map((item) => item.imageSrc);
      cancel = prefetchImagesOnIdle(sources);
    }, 150);
    return () => {
      if (timer) clearTimeout(timer);
      cancel?.();
    };
  }, [visibleItems]);

  // 瀑布流列数与 Tailwind 断点对齐：<sm 1 列、sm–xl 2 列、≥xl 3 列。
  // 走共享的 useSyncExternalStore 媒体查询：首次渲染即取真实值，
  // 不再先建 1 列再重排成 3 列（每张图都会位移一次）。
  const smUp = useMediaQuery('(min-width: 640px)');
  const xlUp = useMediaQuery('(min-width: 1280px)');
  const columnCount = xlUp ? 3 : smUp ? 2 : 1;

  // 最短列优先分列：替代 CSS multicol 的顺序填充，让各列底部基本对齐。
  const masonryColumns = useMemo(
    () => balanceMasonry(visibleItems, columnCount),
    [visibleItems, columnCount],
  );

  const renderCard = (item: GalleryItem, index: number) => {
    const cell = MOSAIC_PATTERN[index % MOSAIC_PATTERN.length];
    return (
      <div
        key={item.imageSrc}
        role="listitem"
        data-command-target={item.imageSrc}
        className={cn(
          'relative min-w-0 overflow-hidden bg-black',
          layout === 'mosaic' && cn(cell.span, cell.ratio),
        )}
      >
        <button
          ref={(element) => {
            if (element) buttons.current.set(item.imageSrc, element);
            else buttons.current.delete(item.imageSrc);
          }}
          type="button"
          onClick={() => setLightboxIdx(index)}
          onPointerEnter={() => prefetchImage(item.imageSrc)}
          onFocus={() => prefetchImage(item.imageSrc)}
          aria-label={`查看大图: ${item.title}`}
          data-cursor="VIEW"
          className="group relative block h-full w-full overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-base focus-visible:ring-inset"
        >
          <span className="relative block h-full w-full origin-center overflow-hidden bg-neutral-910 transition-transform duration-700 ease-[var(--ease-brand)] transform-gpu group-hover:scale-[1.055]">
            <SiteImage
              src={item.imageSrc}
              alt={item.imageAlt}
              width={item.width}
              height={item.height}
              loading={index < columnCount * 2 && eager ? 'eager' : 'lazy'}
              wrapperClassName="h-full w-full"
              className={cn(
                // 只过渡 opacity：hover 时父层同时在 700ms 缩放，若把
                // brightness()/saturate() 也逐帧插值，等于让 GPU 对整张
                // 大图重复重采样 42 帧来换取 ~5% 的亮度差。滤镜终值保留。
                'h-full w-full object-cover opacity-85 transition-opacity duration-700 ease-[var(--ease-brand)] group-hover:opacity-100 group-hover:brightness-105 group-hover:saturate-110',
                layout === 'masonry' ? 'h-auto' : 'h-full',
              )}
            />
          </span>
          <span
            className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/85 via-black/20 to-transparent opacity-75 transition-[background,opacity] duration-500 ease-[var(--ease-brand)] group-hover:opacity-100"
            aria-hidden="true"
          />
          <span
            className="pointer-events-none absolute inset-3 border border-white/0 transition-[inset,border-color] duration-500 ease-[var(--ease-brand)] group-hover:inset-4 group-hover:border-accent-base/65 md:inset-5 md:group-hover:inset-6"
            aria-hidden="true"
          />
          <span
            className="pointer-events-none absolute left-3 top-3 h-5 w-5 border-l border-t border-white/0 transition-[height,width,border-color] duration-500 ease-[var(--ease-brand)] group-hover:h-7 group-hover:w-7 group-hover:border-accent-base md:left-5 md:top-4"
            aria-hidden="true"
          />
          {/* 顶部压暗条：亮图（花丛/天空）上保证分类标签与序号可读 */}
          <span
            className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-linear-to-b from-black/50 to-transparent"
            aria-hidden="true"
          />
          <span
            className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between md:inset-x-5 md:top-4"
            aria-hidden="true"
          >
            <span className="inline-flex items-center gap-1.5 border border-white/10 bg-black/45 px-2 py-1 font-mono text-micro uppercase tracking-label text-white/80 backdrop-blur-sm transition-colors duration-500 group-hover:border-accent-base/50 group-hover:text-white">
              <span className="inline-block h-1.5 w-1.5 -skew-x-12 bg-accent-base" />
              {item.category}
            </span>
            <span className="font-mono text-xl leading-none text-white/25 transition-colors duration-500 group-hover:text-accent-ink md:text-2xl">
              {String(index + 1).padStart(2, '0')}
            </span>
          </span>
          <span className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[88%] translate-y-1 opacity-80 transition-[opacity,transform] duration-500 ease-[var(--ease-brand)] group-hover:translate-y-0 group-hover:opacity-100 md:bottom-5 md:left-5">
            <span className="block font-mono text-micro uppercase tracking-label text-white/65 transition-colors duration-500 group-hover:text-white/85">
              {item.location} · {item.dateLabel}
            </span>
            <span className="mt-1 block text-sm font-semibold leading-snug text-ink-on-dark transition-colors duration-500 group-hover:text-white md:text-base">
              {item.title}
            </span>
            <span
              className="mt-2 block h-0.5 w-6 bg-accent-base transition-[box-shadow,width] duration-500 ease-[var(--ease-brand)] group-hover:w-12 group-hover:shadow-[0_0_14px_color-mix(in_srgb,var(--section-accent)_65%,transparent)]"
              aria-hidden="true"
            />
          </span>
        </button>
      </div>
    );
  };

  return (
    <SectionCanvas isDark sectionId="gallery">
      <SectionMasthead
        variant="chapter"
        title="影集"
        accent="frames & light"
        subtitle="现场与路上拍下的几帧"
        className="shrink-0 mb-4 md:mb-6"
      />

      <div className="mb-5 flex flex-col gap-4 border-y border-white/10 py-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label="照片分类">
          {['ALL', ...categories].map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              aria-pressed={activeCategory === category}
              className={cn(
                'min-h-11 border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-label transition-colors',
                activeCategory === category
                  ? 'border-accent-base bg-accent-base text-accent-on'
                  : 'border-white/12 text-white/45 hover:border-white/30 hover:text-white/80',
              )}
            >
              {category}
            </button>
          ))}
        </div>

        <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3 md:w-auto md:shrink-0 md:flex-nowrap">
          <div className="flex items-center gap-2" aria-live="polite">
            <span className="font-mono text-[10px] uppercase tracking-label text-white/45 tabular-nums">
              {String(visibleItems.length).padStart(2, '0')} /{' '}
              {String(galleryItems.length).padStart(2, '0')}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-label text-white/25">
              FRAMES
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-2 border border-white/10 bg-white/3 px-2 py-1.5">
            <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-accent-ink" aria-hidden="true" />
            <label className="sr-only" htmlFor="gallery-sort">
              照片排序
            </label>
            <select
              id="gallery-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as GallerySort)}
              className="min-h-11 min-w-0 bg-transparent font-mono text-[10px] uppercase tracking-label text-white/65 outline-none transition-colors hover:text-white focus:text-white md:w-36"
            >
              <option value="custom">CURATED ORDER</option>
              <option value="newest">NEWEST FIRST</option>
              <option value="oldest">OLDEST FIRST</option>
            </select>
          </div>
          <div className="flex shrink-0 items-center gap-1 border-l border-white/10 pl-2">
            <SlidersHorizontalIcon className="mr-1 h-3.5 w-3.5 text-white/30" aria-hidden="true" />
            <button
              type="button"
              onClick={() => setLayout('masonry')}
              aria-pressed={layout === 'masonry'}
              aria-label="瀑布流布局"
              title="瀑布流布局"
              className={cn(
                'flex h-11 w-11 items-center justify-center border transition-colors',
                layout === 'masonry'
                  ? 'border-accent-base text-accent-ink'
                  : 'border-transparent text-white/40 hover:border-white/20 hover:text-white',
              )}
            >
              <Columns3Icon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setLayout('mosaic')}
              aria-pressed={layout === 'mosaic'}
              aria-label="编辑式拼贴布局"
              title="编辑式拼贴布局"
              className={cn(
                'flex h-11 w-11 items-center justify-center border transition-colors',
                layout === 'mosaic'
                  ? 'border-accent-base text-accent-ink'
                  : 'border-transparent text-white/40 hover:border-white/20 hover:text-white',
              )}
            >
              <Grid2x2Icon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="-mx-6 flex-1 min-h-0 md:-mx-10 lg:-mx-16">
        {visibleItems.length === 0 ? (
          <div className="flex min-h-64 items-center justify-center border border-dashed border-white/15">
            <ThinkingState dark label="NO FRAMES" />
          </div>
        ) : (
          <div
            role="list"
            className={cn(
              'm-0 p-0',
              layout === 'masonry'
                ? 'flex items-start gap-3'
                : 'grid grid-cols-2 gap-px md:grid-cols-12 md:auto-rows-[minmax(12rem,24vh)]',
            )}
          >
            {layout === 'masonry'
              ? masonryColumns.map((column, columnIndex) => (
                  <div key={columnIndex} className="flex min-w-0 flex-1 flex-col gap-3">
                    {column.map((index) => renderCard(visibleItems[index], index))}
                  </div>
                ))
              : visibleItems.map((item, index) => renderCard(item, index))}
          </div>
        )}
      </div>

      <Lightbox
        items={visibleItems}
        index={lightboxIdx}
        onClose={() => {
          const current = lightboxIdx === null ? null : visibleItems[lightboxIdx];
          setLightboxIdx(null);
          const button = current ? buttons.current.get(current.imageSrc) : null;
          if (!button) return;
          button.scrollIntoView({
            block: 'nearest',
            behavior: reducedMotion ? 'instant' : 'smooth',
          });
          button.focus({ preventScroll: true });
        }}
        onNavigate={setLightboxIdx}
        variant="gallery"
      />
    </SectionCanvas>
  );
}
