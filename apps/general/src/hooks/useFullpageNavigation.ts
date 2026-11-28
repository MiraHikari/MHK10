import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ROOT_SECTION_ID,
  SECTIONS,
  getSectionIndex,
  getSectionPath,
  normalizeSectionPath,
  type SectionId,
} from '@/lib/sections';
import { useBootLoader } from './fullpage/useBootLoader';
import { useFullpageHistory } from './fullpage/useFullpageHistory';
import { useFullpageInputHandlers } from './fullpage/useFullpageInputHandlers';
import { useLenisScroller } from './fullpage/useLenisScroller';
import { delay, type FullpageTransitionPhase } from './fullpage/timing';
import { useMediaCapabilities } from './useMediaCapabilities';
import { motionDuration, pauseFor, transitionScore, typewriterPhaseDelays } from '@/lib/motion';
import { prefetchArticleBody } from '@/lib/article-body-cache';
import type { SectionScroller } from './fullpage/sectionScroller';
import type { FusionDestination } from '@mhk/site-core/fusion/protocol-model';

export { acquireInputPause, releaseInputPause } from './fullpage/inputPause';

interface NavigationOptions {
  /** Slug of an article to open directly on boot (direct-load of `/blog/[slug]`). */
  readonly initialArticle?: string | null;
  /** Resolves the watermark text for a given article slug (its category, etc.). */
  readonly getArticleWatermark?: (slug: string) => string;
  readonly onDeepLink?: (destination: FusionDestination | null) => void;
  readonly isArticleAvailable?: (slug: string) => boolean;
}

interface RunTransitionOptions {
  readonly toWatermark: string;
  readonly toBg: string;
  readonly toIsDark: boolean;
  readonly targetIndex: number;
  readonly direction: number;
  /** Swaps the visible content while the accent bridge crosses the viewport. */
  readonly onCommit: () => void;
}

type PendingNavigation =
  | { kind: 'section'; index: number; syncHistory: boolean }
  | { kind: 'article'; slug: string; syncHistory: boolean }
  | { kind: 'back'; syncHistory: boolean };

/**
 * Set when a transition crosses the night/paper boundary. Carries the
 * outgoing background so the cover layer can route the swap through the
 * incoming accent instead of a grey sRGB midpoint.
 *
 * Cleared after `motionDuration.veilMorph` so watermark typing / enter
 * re-renders do not keep rebuilding crossing keyframes (which restarts the
 * cover animation and extends paint work past the visual settle).
 */
interface BgCrossing {
  readonly fromBg: string;
  readonly fromIsDark: boolean;
}

export function useFullpageNavigation(
  onNavigateStart?: () => void,
  initialSectionId: SectionId = ROOT_SECTION_ID,
  options: NavigationOptions = {},
) {
  const { initialArticle = null, getArticleWatermark, onDeepLink } = options;
  const initialIndex = Math.max(getSectionIndex(initialSectionId), 0);
  const initialSection = SECTIONS[initialIndex] ?? SECTIONS[0];
  const initialArticleWatermark =
    initialArticle && getArticleWatermark ? getArticleWatermark(initialArticle) : '';
  const initialWatermark = initialArticle ? initialArticleWatermark : initialSection.watermark;

  const [activeIndex, setActiveIndex] = useState(initialIndex);
  /** Accent identity commits on the bridge crest, later than the content swap. */
  const [accentIndex, setAccentIndex] = useState(initialIndex);
  const [direction, setDirection] = useState(0);
  const [transitionPhase, setTransitionPhase] = useState<FullpageTransitionPhase>('idle');
  const [transitionTargetIndex, setTransitionTargetIndex] = useState<number | null>(null);
  const [contentReady, setContentReady] = useState(false);
  const [sectionVisible, setSectionVisible] = useState(true);
  const [watermarkText, setWatermarkText] = useState<string>(initialWatermark);
  const [cursorVisible, setCursorVisible] = useState(false);
  const [bgColor, setBgColor] = useState<string>(initialSection.bg);
  const [bgIsDark, setBgIsDark] = useState<boolean>(initialSection.isDark);
  const [bgCrossing, setBgCrossing] = useState<BgCrossing | null>(null);
  const [activeArticle, setActiveArticle] = useState<string | null>(initialArticle);
  const [articleWatermark, setArticleWatermark] = useState<string>(initialArticleWatermark);

  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lenisRef = useRef<SectionScroller | null>(null);
  const activeIndexRef = useRef(initialIndex);
  const activeArticleRef = useRef<string | null>(initialArticle);
  const articleWatermarkRef = useRef<string>(initialArticleWatermark);
  const watermarkTextRef = useRef(initialWatermark);
  const lockedRef = useRef(false);
  const contentReadyRef = useRef(false);
  const pendingNavigationRef = useRef<PendingNavigation | null>(null);
  const flushPendingNavigationRef = useRef<() => void>(() => {});
  const transitionIdRef = useRef(0);
  const transitionAbortRef = useRef<AbortController | null>(null);
  const unlockTimerRef = useRef<number | null>(null);
  const crossingClearTimerRef = useRef<number | null>(null);
  const getArticleWatermarkRef = useRef(getArticleWatermark);
  const isArticleAvailableRef = useRef(options.isArticleAvailable);
  const articleReturnPathRef = useRef('/blog');

  // Manual 「减少动效」from the command palette must reach runTransition too.
  const { reducedMotion } = useMediaCapabilities();
  const reducedMotionRef = useRef(reducedMotion);

  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  // Direct loads and history jumps skip runTransition — settle the accent once
  // the transition machinery is back at rest.
  useEffect(() => {
    if (transitionPhase === 'idle') setAccentIndex(activeIndex);
  }, [transitionPhase, activeIndex]);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);
  useEffect(() => {
    activeArticleRef.current = activeArticle;
  }, [activeArticle]);
  useEffect(() => {
    articleWatermarkRef.current = articleWatermark;
  }, [articleWatermark]);
  useEffect(() => {
    getArticleWatermarkRef.current = getArticleWatermark;
  }, [getArticleWatermark]);
  useEffect(() => {
    isArticleAvailableRef.current = options.isArticleAvailable;
  }, [options.isArticleAvailable]);
  useEffect(() => {
    contentReadyRef.current = contentReady;
  }, [contentReady]);

  useEffect(
    () => () => {
      transitionIdRef.current += 1;
      transitionAbortRef.current?.abort();
      if (unlockTimerRef.current !== null) {
        window.clearTimeout(unlockTimerRef.current);
        unlockTimerRef.current = null;
      }
      if (crossingClearTimerRef.current !== null) {
        window.clearTimeout(crossingClearTimerRef.current);
        crossingClearTimerRef.current = null;
      }
      lockedRef.current = false;
    },
    [],
  );

  const markContentReady = useCallback(() => {
    contentReadyRef.current = true;
    setContentReady(true);
  }, []);

  const restoreSectionScroll = useCallback((index: number, scrollTop: number) => {
    const nextScrollTop = Math.max(0, scrollTop);
    lenisRef.current?.scrollTo(nextScrollTop, { immediate: true });
    const section = sectionRefs.current[index];
    if (section) section.scrollTop = nextScrollTop;
  }, []);

  const resetSectionScroll = useCallback(
    (index: number) => restoreSectionScroll(index, 0),
    [restoreSectionScroll],
  );

  useBootLoader(markContentReady);
  useLenisScroller({ activeIndex, sectionVisible, sectionRefs, lenisRef });

  const setWatermarkValue = useCallback((value: string) => {
    watermarkTextRef.current = value;
    setWatermarkText(value);
  }, []);

  /** Shared section/article transition with independent rail and content phases. */
  const runTransition = useCallback(
    async (opts: RunTransitionOptions): Promise<boolean> => {
      if (lockedRef.current) return false;
      transitionAbortRef.current?.abort();
      lockedRef.current = true;
      const transitionId = ++transitionIdRef.current;
      const controller = new AbortController();
      transitionAbortRef.current = controller;
      const reduced = reducedMotionRef.current;
      const pause = (ms: number) => delay(pauseFor(reduced, ms), controller.signal);

      try {
        onNavigateStart?.();
        // Closed-form waits from typewriterScore — same cadence playTypewriter* uses.
        const tw = typewriterPhaseDelays(watermarkTextRef.current, opts.toWatermark);

        setDirection(opts.direction);
        setTransitionTargetIndex(opts.targetIndex);
        setTransitionPhase('exit');
        setContentReady(false);
        setCursorVisible(true);

        // 水印擦除 ∥ 内容散焦退场 — 以两者较长者为准。
        if (!(await pause(transitionScore.exitHold))) return false;
        setSectionVisible(false);
        if (!(await pause(Math.max(transitionScore.exitPose, tw.erase)))) return false;

        setTransitionPhase('bridge');
        const fromSection = SECTIONS[activeIndexRef.current] ?? SECTIONS[0];
        setBgColor(opts.toBg);
        setBgIsDark(opts.toIsDark);
        if (crossingClearTimerRef.current !== null) {
          window.clearTimeout(crossingClearTimerRef.current);
          crossingClearTimerRef.current = null;
        }
        // reduced：瞬切，不挂跨界盖层（避免 0ms timer 的空 setState）。
        // Clear after veilMorph so enter/typewriter re-renders cannot restart cover keyframes.
        const crossesAtmosphere = fromSection.isDark !== opts.toIsDark && !reduced;
        if (crossesAtmosphere) {
          setBgCrossing({ fromBg: fromSection.bg, fromIsDark: fromSection.isDark });
          crossingClearTimerRef.current = window.setTimeout(
            () => {
              crossingClearTimerRef.current = null;
              if (transitionId !== transitionIdRef.current) return;
              setBgCrossing(null);
            },
            Math.round(motionDuration.veilMorph * 1000),
          );
        } else {
          setBgCrossing(null);
        }
        opts.onCommit();
        // Target watermark commits on the bridge; the layer types it in on enter.
        setWatermarkValue(opts.toWatermark);
        // 换色峰值稍晚于内容切换，落在桥接中段（accentCrest ≈ 50% bridgeHold）。
        if (!(await pause(transitionScore.accentCrest))) return false;
        setAccentIndex(opts.targetIndex);
        if (!(await pause(transitionScore.bridgeHold + tw.gap))) return false;

        setTransitionPhase('enter');
        setSectionVisible(true);
        if (!(await pause(transitionScore.enterHold))) return false;
        setContentReady(true);
        // 内容聚焦入场 → 水印打字；打字时长覆盖 enterSettle。
        if (!(await pause(Math.max(transitionScore.enterSettle, tw.type) + tw.settle)))
          return false;

        setCursorVisible(false);
        setTransitionPhase('idle');
        setTransitionTargetIndex(null);

        unlockTimerRef.current = window.setTimeout(
          () => {
            if (transitionId !== transitionIdRef.current) return;
            unlockTimerRef.current = null;
            lockedRef.current = false;
            flushPendingNavigationRef.current();
          },
          reduced ? 0 : transitionScore.unlockDelay,
        );
        return true;
      } catch {
        if (transitionId === transitionIdRef.current) {
          setSectionVisible(true);
          setContentReady(true);
          setCursorVisible(false);
          setTransitionPhase('idle');
          setTransitionTargetIndex(null);
          lockedRef.current = false;
        }
        // 调用点全部为 void、无人消费 rejection（transition 内部仅
        // history.pushState 在沙箱 iframe 等环境下可能抛错）；状态已复位，
        // 不再向上抛，避免 unhandled rejection。
        return false;
      }
    },
    [onNavigateStart, setWatermarkValue],
  );

  const navigateToSection = useCallback(
    async (targetIndex: number, syncHistory = true): Promise<void> => {
      if (lockedRef.current) {
        pendingNavigationRef.current = { kind: 'section', index: targetIndex, syncHistory };
        return;
      }
      if (
        targetIndex === activeIndexRef.current ||
        targetIndex < 0 ||
        targetIndex >= SECTIONS.length
      )
        return;
      const current = SECTIONS[activeIndexRef.current];
      const target = SECTIONS[targetIndex];
      if (!current || !target) return;
      const nextDirection = targetIndex > activeIndexRef.current ? 1 : -1;
      await runTransition({
        toWatermark: target.watermark,
        toBg: target.bg,
        toIsDark: target.isDark,
        targetIndex,
        direction: nextDirection,
        onCommit: () => {
          activeIndexRef.current = targetIndex;
          setActiveIndex(targetIndex);
          // Leaving article mode if we were reading.
          if (activeArticleRef.current) {
            activeArticleRef.current = null;
            articleWatermarkRef.current = '';
            setActiveArticle(null);
            setArticleWatermark('');
          }
          if (syncHistory) {
            // The root section is served at `/`; `/about` remains a direct
            // route alias, but SPA navigation returns to the canonical entry.
            const path = target.id === ROOT_SECTION_ID ? '/' : getSectionPath(target.id);
            if (normalizeSectionPath(window.location.pathname) !== normalizeSectionPath(path)) {
              window.history.pushState({ sectionId: target.id }, '', path);
            }
          }
        },
      });
    },
    [runTransition],
  );

  /** A presentation handoff waits for any accepted transition before issuing its target. */
  const waitForNavigation = useCallback(async (): Promise<void> => {
    while (lockedRef.current) await delay(16);
  }, []);

  const navigateBackFromArticle = useCallback(
    async (syncHistory = true): Promise<void> => {
      if (lockedRef.current) {
        pendingNavigationRef.current = { kind: 'back', syncHistory };
        return;
      }
      if (!activeArticleRef.current) return;
      const section = SECTIONS[activeIndexRef.current] ?? SECTIONS[0];
      await runTransition({
        toWatermark: section.watermark,
        toBg: section.bg,
        toIsDark: section.isDark,
        targetIndex: activeIndexRef.current,
        direction: -1,
        onCommit: () => {
          resetSectionScroll(activeIndexRef.current);
          activeArticleRef.current = null;
          articleWatermarkRef.current = '';
          setActiveArticle(null);
          setArticleWatermark('');
          if (syncHistory) {
            const path = articleReturnPathRef.current;
            if (window.location.pathname !== path) {
              window.history.replaceState({ sectionId: 'blog' }, '', path);
            }
          }
        },
      });
    },
    [resetSectionScroll, runTransition],
  );

  const navigateToArticle = useCallback(
    async (slug: string, syncHistory = true): Promise<void> => {
      if (isArticleAvailableRef.current && !isArticleAvailableRef.current(slug)) {
        if (activeArticleRef.current) await navigateBackFromArticle(false);
        else await navigateToSection(getSectionIndex('blog'), false);
        await waitForNavigation();
        window.history.replaceState({ sectionId: 'blog' }, '', '/blog/');
        onDeepLink?.({ kind: 'blog' });
        return;
      }
      prefetchArticleBody(slug);
      if (lockedRef.current) {
        pendingNavigationRef.current = { kind: 'article', slug, syncHistory };
        return;
      }
      if (activeArticleRef.current === slug) return;
      const targetIndex = getSectionIndex('blog');
      const section = SECTIONS[targetIndex] ?? SECTIONS[0];
      const watermark = getArticleWatermarkRef.current?.(slug) ?? 'READ';
      if (!activeArticleRef.current) {
        const currentPath = normalizeSectionPath(window.location.pathname);
        articleReturnPathRef.current =
          currentPath === '/blog' || currentPath.startsWith('/blog/tag/')
            ? currentPath
            : getSectionPath('blog');
      }
      const nextDirection = targetIndex >= activeIndexRef.current ? 1 : -1;
      await runTransition({
        toWatermark: watermark,
        toBg: section.bg,
        toIsDark: section.isDark,
        targetIndex,
        direction: nextDirection,
        onCommit: () => {
          resetSectionScroll(targetIndex);
          activeArticleRef.current = slug;
          articleWatermarkRef.current = watermark;
          activeIndexRef.current = targetIndex;
          setActiveIndex(targetIndex);
          setActiveArticle(slug);
          setArticleWatermark(watermark);
          if (syncHistory) {
            const path = `/blog/${slug}/`;
            if (window.location.pathname !== path) {
              window.history.pushState({ sectionId: 'blog', articleSlug: slug }, '', path);
            }
          }
        },
      });
    },
    [
      resetSectionScroll,
      runTransition,
      navigateToSection,
      navigateBackFromArticle,
      waitForNavigation,
      onDeepLink,
    ],
  );

  flushPendingNavigationRef.current = () => {
    const pending = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    if (pending?.kind === 'section') void navigateToSection(pending.index, pending.syncHistory);
    else if (pending?.kind === 'article') void navigateToArticle(pending.slug, pending.syncHistory);
    else if (pending?.kind === 'back') void navigateBackFromArticle(pending.syncHistory);
  };

  useFullpageInputHandlers({
    lenisRef,
    activeIndexRef,
    activeArticleRef,
    lockedRef,
    contentReadyRef,
    navigateToSection,
    navigateBackFromArticle,
  });

  const handleNavigate = useCallback(
    (sectionId: string) => {
      const targetIndex = SECTIONS.findIndex((section) => section.id === sectionId);
      if (targetIndex < 0) return;
      // If already on this section but in article reading mode, back to list.
      if (targetIndex === activeIndexRef.current && activeArticleRef.current) {
        navigateBackFromArticle();
        return;
      }
      navigateToSection(targetIndex);
    },
    [navigateToSection, navigateBackFromArticle],
  );

  useFullpageHistory({
    initialSectionId,
    activeIndexRef,
    activeArticleRef,
    navigateToSection,
    navigateToArticle,
    navigateBackFromArticle,
    handleNavigate,
    onDeepLink,
  });

  // 返回对象 useMemo 化：App 自身的无关 state（命令面板、navCompact 等）变化时
  // 对象引用保持稳定，memo 化的常驻组件（SectionViewport/Navigation/…）才能
  // bail out，避免整树 reconcile。
  return useMemo(
    () => ({
      accentIndex,
      activeIndex,
      activeArticle,
      articleWatermark,
      bgColor,
      bgCrossing,
      bgIsDark,
      contentReady,
      cursorVisible,
      direction,
      handleNavigate,
      navigateToSection,
      waitForNavigation,
      navigateToArticle,
      navigateBackFromArticle,
      restoreSectionScroll,
      sectionRefs,
      sectionVisible,
      transitionPhase,
      transitionTargetIndex,
      watermarkText,
    }),
    [
      accentIndex,
      activeIndex,
      activeArticle,
      articleWatermark,
      bgColor,
      bgCrossing,
      bgIsDark,
      contentReady,
      cursorVisible,
      direction,
      handleNavigate,
      navigateToSection,
      waitForNavigation,
      navigateToArticle,
      navigateBackFromArticle,
      restoreSectionScroll,
      sectionVisible,
      transitionPhase,
      transitionTargetIndex,
      watermarkText,
    ],
  );
}
