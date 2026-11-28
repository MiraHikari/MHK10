import { useEffect, type RefObject } from 'react';
import Lenis from 'lenis';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import { resolveMotionBudget } from '@/lib/device-performance';
import type { SectionScroller } from './sectionScroller';

interface UseLenisScrollerArgs {
  readonly activeIndex: number;
  readonly sectionVisible: boolean;
  readonly sectionRefs: RefObject<(HTMLDivElement | null)[]>;
  readonly lenisRef: RefObject<SectionScroller | null>;
}

function isInteractiveTarget(node: Element) {
  return node.closest('input, textarea, [data-command-palette], [data-lightbox]') !== null;
}

function createNativeScroller(wrapper: HTMLElement): SectionScroller {
  return {
    get scroll() {
      return wrapper.scrollTop;
    },
    get limit() {
      return Math.max(0, wrapper.scrollHeight - wrapper.clientHeight);
    },
    scrollTo(target: number) {
      wrapper.scrollTop = Math.max(0, target);
    },
  };
}

export function useLenisScroller({
  activeIndex,
  sectionVisible,
  sectionRefs,
  lenisRef,
}: UseLenisScrollerArgs) {
  // 与 runTransition 同一条链路：命令面板手动「减少动效」也关掉 Lenis 平滑滚动；
  // 性能轴 low 档（大屏弱机）同样回原生滚动，省去常驻 lenis.raf 循环。
  const { reducedMotion, coarsePointer, motionLevel, perfTier } = useMediaCapabilities();
  const smoothScroll = resolveMotionBudget(motionLevel, perfTier).smoothScroll;

  useEffect(() => {
    if (!sectionVisible) return;
    const wrapper = sectionRefs.current[activeIndex];
    if (!wrapper) return;
    const content = wrapper.firstElementChild as HTMLElement | null;
    if (!content) return;

    if (reducedMotion || coarsePointer || !smoothScroll) {
      const nativeScroller = createNativeScroller(wrapper);
      lenisRef.current = nativeScroller;

      return () => {
        if (lenisRef.current === nativeScroller) {
          lenisRef.current = null;
        }
      };
    }

    const lenis = new Lenis({
      wrapper,
      content,
      lerp: 0.12,
      duration: 1.05,
      smoothWheel: true,
      syncTouch: false,
      eventsTarget: wrapper,
      prevent: isInteractiveTarget,
      // limit 每次从 wrapper 的 scrollHeight/clientHeight 实时计算，不依赖
      // 缓存尺寸：文章模式下 content（firstElementChild）是固定的阅读进度条，
      // ResizeObserver 盯不到正文尺寸变化，缓存 limit 会在正文高度变化后失准
      // （异步正文加载、懒加载图片、专注模式折叠 / 行宽切换），
      // 导致大视口下滚不到底。
      naiveDimensions: true,
    });
    lenisRef.current = lenis;

    let frame = 0;
    const tick = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };
    const handleVisibility = () => (document.hidden ? stop() : start());
    start();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
      lenis.destroy();
      if (lenisRef.current === lenis) {
        lenisRef.current = null;
      }
    };
  }, [
    activeIndex,
    sectionVisible,
    sectionRefs,
    lenisRef,
    reducedMotion,
    coarsePointer,
    smoothScroll,
  ]);
}
