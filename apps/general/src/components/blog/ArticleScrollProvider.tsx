import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';
import type { ArticleHeading } from '@/lib/blog/types';

const DESKTOP_HEADING_OFFSET = 120;
const MOBILE_HEADING_OFFSET = 100;
const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';

type Listener = () => void;

interface ArticleScrollStore {
  getActiveId: () => string;
  getProgress: () => number;
  reset: () => void;
  setActiveId: (activeId: string) => void;
  setProgress: (progress: number) => void;
  subscribeActiveId: (listener: Listener) => () => void;
  subscribeProgress: (listener: Listener) => () => void;
}

interface ArticleScrollContextValue {
  headings: ArticleHeading[];
  store: ArticleScrollStore;
}

interface ArticleScrollProviderProps {
  articleKey: string;
  children: ReactNode;
  contentRef: RefObject<HTMLElement | null>;
  headings: ArticleHeading[];
}

interface ScrollContext {
  container: HTMLElement | null;
  element: HTMLElement;
  target: HTMLElement | Window;
}

const ArticleScrollContext = createContext<ArticleScrollContextValue | null>(null);

function createArticleScrollStore(): ArticleScrollStore {
  let activeId = '';
  let progress = 0;
  const activeIdListeners = new Set<Listener>();
  const progressListeners = new Set<Listener>();

  return {
    getActiveId: () => activeId,
    getProgress: () => progress,
    reset: () => {
      if (activeId) {
        activeId = '';
        activeIdListeners.forEach((listener) => listener());
      }
      if (progress !== 0) {
        progress = 0;
        progressListeners.forEach((listener) => listener());
      }
    },
    setActiveId: (nextActiveId) => {
      if (!nextActiveId || nextActiveId === activeId) return;
      activeId = nextActiveId;
      activeIdListeners.forEach((listener) => listener());
    },
    setProgress: (nextProgress) => {
      // The progress bar does not need sub-pixel React updates. Keeping a
      // small threshold preserves smooth visual movement while preventing the
      // TOC/progress subscribers from re-rendering on every scroll frame.
      if (Math.abs(nextProgress - progress) < 0.001) return;
      progress = nextProgress;
      progressListeners.forEach((listener) => listener());
    },
    subscribeActiveId: (listener) => {
      activeIdListeners.add(listener);
      return () => activeIdListeners.delete(listener);
    },
    subscribeProgress: (listener) => {
      progressListeners.add(listener);
      return () => progressListeners.delete(listener);
    },
  };
}

/**
 * 解析文章内容所在的滚动上下文：`.section-scroll` 容器优先，回退
 * scrollingElement / documentElement；target 为容器或 window。
 * 导出供 ArticleView 的阅读进度持久化（保存 / 恢复）复用同一解析。
 */
export function resolveScrollContext(content: HTMLElement): ScrollContext {
  const container = content.closest<HTMLElement>('.section-scroll');
  const element =
    container ?? (document.scrollingElement as HTMLElement | null) ?? document.documentElement;

  return {
    container,
    element,
    target: container ?? window,
  };
}

function findActiveHeading(
  positions: ReadonlyArray<{ id: string; top: number }>,
  scrollTop: number,
  offset: number,
) {
  const boundary = scrollTop + offset;
  let low = 0;
  let high = positions.length - 1;
  let activeIndex = -1;

  while (low <= high) {
    const middle = (low + high) >> 1;
    if (positions[middle].top <= boundary) {
      activeIndex = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return activeIndex >= 0 ? positions[activeIndex].id : '';
}

export function ArticleScrollProvider({
  articleKey,
  children,
  contentRef,
  headings,
}: ArticleScrollProviderProps) {
  const [store] = useState(createArticleScrollStore);
  const visibleHeadings = useMemo(
    () => headings.filter((heading) => heading.depth >= 2 && heading.depth <= 3),
    [headings],
  );
  const contextValue = useMemo(
    () => ({ headings: visibleHeadings, store }),
    [store, visibleHeadings],
  );

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    let animationFrame = 0;
    let currentScrollElement: HTMLElement | null = null;
    let currentTarget: HTMLElement | Window | null = null;
    let headingPositions: Array<{ id: string; top: number }> = [];
    let layoutDirty = true;
    let stopped = false;

    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => schedule(true));
    const mutationObserver =
      typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => schedule(true));
    const desktopQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);

    const onScroll = () => schedule(false);

    const bindScrollTarget = () => {
      const scrollContext = resolveScrollContext(content);
      if (
        scrollContext.target === currentTarget &&
        scrollContext.element === currentScrollElement
      ) {
        return scrollContext;
      }

      currentTarget?.removeEventListener('scroll', onScroll);
      if (currentScrollElement && currentScrollElement !== content) {
        resizeObserver?.unobserve(currentScrollElement);
      }
      currentTarget = scrollContext.target;
      currentScrollElement = scrollContext.element;
      currentTarget.addEventListener('scroll', onScroll, { passive: true });
      if (currentScrollElement !== content) {
        resizeObserver?.observe(currentScrollElement);
      }
      return scrollContext;
    };

    const measureHeadings = (scrollContext: ScrollContext) => {
      const viewportTop = scrollContext.container?.getBoundingClientRect().top ?? 0;
      const scrollTop = scrollContext.element.scrollTop;
      const nextPositions: Array<{ id: string; top: number }> = [];

      for (const heading of visibleHeadings) {
        const element = document.getElementById(heading.slug);
        if (!element || !content.contains(element)) continue;
        nextPositions.push({
          id: heading.slug,
          top: element.getBoundingClientRect().top - viewportTop + scrollTop,
        });
      }

      headingPositions = nextPositions;
      layoutDirty = false;
    };

    const update = () => {
      animationFrame = 0;
      if (stopped) return;

      const scrollContext = bindScrollTarget();
      if (layoutDirty) measureHeadings(scrollContext);

      const { clientHeight, scrollHeight, scrollTop } = scrollContext.element;
      const maxScroll = scrollHeight - clientHeight;
      const progress = maxScroll > 0 ? Math.min(1, Math.max(0, scrollTop / maxScroll)) : 0;
      const headingOffset = desktopQuery.matches ? DESKTOP_HEADING_OFFSET : MOBILE_HEADING_OFFSET;

      store.setProgress(progress);
      store.setActiveId(findActiveHeading(headingPositions, scrollTop, headingOffset));
    };

    function schedule(needsMeasurement: boolean) {
      layoutDirty ||= needsMeasurement;
      if (!animationFrame) animationFrame = requestAnimationFrame(update);
    }

    const onLayoutChange = () => schedule(true);
    const onAfterSwap = () => {
      bindScrollTarget();
      schedule(true);
    };

    store.reset();
    bindScrollTarget();
    resizeObserver?.observe(content);
    mutationObserver?.observe(content, { childList: true, subtree: true });
    window.addEventListener('resize', onLayoutChange);
    desktopQuery.addEventListener('change', onLayoutChange);
    document.addEventListener('astro:after-swap', onAfterSwap);
    void document.fonts?.ready.then(() => {
      if (!stopped) onLayoutChange();
    });
    schedule(true);

    return () => {
      stopped = true;
      currentTarget?.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onLayoutChange);
      desktopQuery.removeEventListener('change', onLayoutChange);
      document.removeEventListener('astro:after-swap', onAfterSwap);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [articleKey, contentRef, store, visibleHeadings]);

  return (
    <ArticleScrollContext.Provider value={contextValue}>{children}</ArticleScrollContext.Provider>
  );
}

function useArticleScrollContext() {
  const context = useContext(ArticleScrollContext);
  if (!context) {
    throw new Error('Article scroll hooks must be used within ArticleScrollProvider.');
  }
  return context;
}

export function useArticleActiveHeading() {
  const { store } = useArticleScrollContext();
  return useSyncExternalStore(store.subscribeActiveId, store.getActiveId, store.getActiveId);
}

export function useArticleHeadings() {
  return useArticleScrollContext().headings;
}

/**
 * Whole-percent progress for visual readouts (bar, ring, TOC caption).
 *
 * The store notifies on every scroll frame; subscribing to the raw float would
 * re-render all three consumers 60×/s to move a compositor-only transform.
 * `useSyncExternalStore` bails out when this snapshot is unchanged, so the
 * readout updates at most 100 times per article. The bar and ring keep their
 * existing 100 ms CSS transitions, which hides the 1% steps.
 */
export function useArticleProgressPercent() {
  const { store } = useArticleScrollContext();
  return useSyncExternalStore(
    store.subscribeProgress,
    () => Math.round(store.getProgress() * 100),
    () => 0,
  );
}
