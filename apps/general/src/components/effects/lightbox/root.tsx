import { useMemo } from 'react';
import type * as React from 'react';
import YarlLightbox, {
  type ControllerRef,
  type Plugin,
  type Slide,
  type SlideImage,
  type ToolbarSettings,
} from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen';
import Slideshow from 'yet-another-react-lightbox/plugins/slideshow';
import Share from 'yet-another-react-lightbox/plugins/share';
import 'yet-another-react-lightbox/styles.css';
import ChevronLeftIcon from '~icons/lucide/chevron-left';
import ChevronRightIcon from '~icons/lucide/chevron-right';
import PlayIcon from '~icons/lucide/play';
import PauseIcon from '~icons/lucide/pause';
import MaximizeIcon from '~icons/lucide/maximize';
import MinimizeIcon from '~icons/lucide/minimize';
import Share2Icon from '~icons/lucide/share-2';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import { motionDuration, motionEase as EASE } from '@/lib/motion';
import { resolveImageSrc } from '@/lib/images/url';
import { shouldConserveData } from '@/lib/images/prefetch';
import { zIndex } from '@/lib/z-index';
import ThinkingState from '@/components/ui/ThinkingState';
import type { LightboxItem } from './types';
import { CloseButton, LightboxChrome, SlideErrorHint, ZoomControls } from './chrome';
import { ThumbnailStrip } from './thumbnails';
import { ProjectCardSlideView, type ProjectCardSlideType } from './project-card';

/**
 * YARL 灯箱的完整实现（按需加载的子树）。
 *
 * 壳组件 `Lightbox`（../Lightbox.tsx）保持 props 契约与关闭动画语义，首次
 * 打开时才动态 import 本模块——YARL 核心、官方插件与 styles.css 一并移出
 * 首屏主包。此处只做装配：插件、slides 构造与 render 插槽；内部控件见
 * ./chrome.tsx、缩略图条见 ./thumbnails.tsx、项目详情卡见 ./project-card.tsx。
 */

function isProjectCardSlide(slide: Slide): slide is ProjectCardSlideType {
  return slide.type === 'project-card';
}

const EASE_CSS = `cubic-bezier(${EASE.join(',')})`;

export interface LightboxYarlRootProps {
  /** 常驻最后帧非空条目（退场动画期间沿用旧 items）。 */
  readonly items: readonly LightboxItem[];
  readonly open: boolean;
  readonly index: number;
  readonly onClose: () => void;
  readonly onNavigate: (idx: number) => void;
  /** Visual variant: gallery (media-first) or project (detail-first). */
  readonly variant: 'gallery' | 'project';
  readonly controllerRef: React.RefObject<ControllerRef | null>;
}

/** 灯箱完整实现：由壳组件按需加载后渲染，props 语义与壳对外契约一致。 */
export function LightboxYarlRoot({
  items: liveItems,
  open: isOpen,
  index: displayIndex,
  onClose,
  onNavigate,
  variant,
  controllerRef,
}: LightboxYarlRootProps) {
  const { reducedMotion } = useMediaCapabilities();
  // 两态均从 variant / items 派生，不再由壳重复传入（原先同时存在外部
  // props 与 LightboxChrome 内部派生两份来源）。
  const isGallery = variant === 'gallery';
  const hasSiblings = liveItems.length > 1;

  const slides = useMemo<Slide[]>(() => {
    if (isGallery) {
      return liveItems.map((item): SlideImage => {
        const src = resolveImageSrc(item.imageSrc);
        return {
          src,
          alt: item.imageAlt,
          width: item.width,
          height: item.height,
          share: { url: src, title: item.title },
          item,
        };
      });
    }
    return liveItems.map((item, position): ProjectCardSlideType => ({
      type: 'project-card',
      item,
      position,
      total: liveItems.length,
    }));
  }, [liveItems, isGallery]);

  const plugins = useMemo<Plugin[]>(() => {
    if (!isGallery) return [];
    const list: Plugin[] = [Zoom, Fullscreen, Share];
    if (hasSiblings) list.push(Slideshow);
    return list;
  }, [isGallery, hasSiblings]);

  const toolbarButtons = useMemo<ToolbarSettings['buttons']>(() => {
    if (!isGallery) return ['close'];
    return [
      'zoom',
      ...(hasSiblings ? (['slideshow'] as const) : []),
      'fullscreen',
      'share',
      'close',
    ];
  }, [isGallery, hasSiblings]);

  const base = Math.round(motionDuration.lightbox * 1000);
  const animation = reducedMotion
    ? { fade: 0, swipe: 0, zoom: 0 }
    : {
        fade: base,
        swipe: base,
        zoom: Math.round(motionDuration.control * 1000),
        easing: { fade: EASE_CSS, swipe: EASE_CSS, navigation: EASE_CSS },
      };

  return (
    <YarlLightbox
      open={isOpen}
      close={onClose}
      index={displayIndex}
      slides={slides}
      on={{ view: ({ index: viewIndex }) => onNavigate(viewIndex) }}
      plugins={plugins}
      className={`pf-lightbox ${isGallery ? '' : 'pf-lightbox--project'}`}
      styles={{ root: { '--yarl__portal_zindex': zIndex.lightbox } }}
      portal={{ container: { 'data-lightbox': '' } as React.HTMLAttributes<HTMLDivElement> }}
      animation={animation}
      carousel={{
        finite: !hasSiblings,
        // 省流 / 弱网时不预挂相邻 slide（旧 prefetch 策略的等价物）。
        preload: shouldConserveData() ? 0 : 1,
        padding: '16px',
      }}
      controller={{
        ref: controllerRef,
        closeOnBackdropClick: true,
        closeOnPullDown: isGallery,
        // project 卡片内含滚动区，放行原生纵向滚动，横滑仍归 YARL 翻页。
        touchAction: isGallery ? 'none' : 'pan-y',
      }}
      labels={{
        Lightbox: '图片查看器',
        Previous: '上一张 (←)',
        Next: '下一张 (→)',
        Close: '关闭 (Esc)',
      }}
      zoom={{
        maxZoomPixelRatio: 2,
        scrollToZoom: true,
        doubleClickMaxStops: 1,
      }}
      slideshow={{ delay: 4500 }}
      render={{
        controls: () => (
          <>
            <LightboxChrome variant={variant} />
            {isGallery && hasSiblings && <ThumbnailStrip onSelect={onNavigate} />}
          </>
        ),
        buttonClose: () => <CloseButton key="pf-close" />,
        buttonZoom: (zoom) => <ZoomControls zoom={zoom} />,
        buttonPrev: hasSiblings ? undefined : () => null,
        buttonNext: hasSiblings ? undefined : () => null,
        iconPrev: () => <ChevronLeftIcon className="h-7 w-7" />,
        iconNext: () => <ChevronRightIcon className="h-7 w-7" />,
        iconLoading: () => <ThinkingState dark compact />,
        iconError: () => <SlideErrorHint />,
        iconSlideshowPlay: () => <PlayIcon className="h-5 w-5" />,
        iconSlideshowPause: () => <PauseIcon className="h-5 w-5" />,
        iconEnterFullscreen: () => <MaximizeIcon className="h-5 w-5" />,
        iconExitFullscreen: () => <MinimizeIcon className="h-5 w-5" />,
        iconShare: () => <Share2Icon className="h-5 w-5" />,
        slide: isGallery
          ? undefined
          : ({ slide }) =>
              isProjectCardSlide(slide) ? <ProjectCardSlideView slide={slide} /> : undefined,
      }}
      toolbar={{ buttons: toolbarButtons }}
    />
  );
}
