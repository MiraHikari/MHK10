import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MotionConfig, motion } from 'motion/react';
import Navigation from '@/components/chrome/Navigation';
import FullpageChrome from '@/components/chrome/FullpageChrome';
import DisplayModeToggle from '@/components/chrome/DisplayModeToggle';
import DesktopEntryNotice from '@/components/chrome/DesktopEntryNotice';
import Win95Embed from '@/components/embed/Win95Embed';
import SectionRail from '@/components/rail/SectionRail';
import BeianFooter from '@/components/chrome/BeianFooter';
import Lightbox from '@/components/effects/Lightbox';
import type { LightboxItem } from '@/components/effects/Lightbox';
import SectionViewport from '@/components/SectionViewport';
import InkRipple from '@/components/effects/InkRipple';
import ShortcutHint from '@/components/chrome/ShortcutHint';
import BackToStart from '@/components/chrome/BackToStart';
import { useAudioSystem } from '@/hooks/useAudioSystem';
import { reportFrameWindow } from '@/hooks/useDevicePerformance';
import {
  acquireInputPause,
  releaseInputPause,
  useFullpageNavigation,
} from '@/hooks/useFullpageNavigation';
import { useKonami } from '@/hooks/useKonami';
import { useLucidMode, setLucidMode, toggleLucidMode } from '@/hooks/useLucidMode';
import {
  getDisplayMode,
  markBootReady,
  useDisplayMode,
  useVisibleDisplayMode,
} from '@/hooks/useDisplayMode';
import { disposePresentation, getPresentation } from '@/hooks/presentation-controller';
import {
  destinationFromUrl,
  destinationPath,
  type FusionDestination,
} from '@mhk/site-core/fusion/protocol-model';
import { readingDocument } from '@mhk/site-core/fusion/browser-reading';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import { useMotionOverride } from '@/hooks/useMotionPreference';
import { useScrollBreath } from '@/hooks/useScrollBreath';
import { useSectionAccent } from '@/hooks/useSectionAccent';
import { applyBlogHead, syncSectionHead } from '@/hooks/useDocumentHead';
import { articleHead, blogIndexHead, blogTagHead } from '@/lib/blog/head-model';
import { sectionTargetFromDestination } from '@/lib/fusion-destination';
import type { CommandTarget } from '@/hooks/useCommandTargetHighlight';
import { articleWatermarkFor } from '@/lib/blog/client';
import { loadArticleBody } from '@/lib/article-body-cache';
import type { ArticleListItem } from '@/lib/blog/types';
import type { Project } from '@/lib/projects/types';
import { ROOT_SECTION_ID, SECTIONS, SECTION_MAP, type SectionId } from '@/lib/sections';
import { pageTitle } from '@/lib/page-title';
import { resolveMotionBudget } from '@/lib/device-performance';
import { durationFor, motionDuration, motionEase, type MotionLevel } from '@/lib/motion';
import { mixHex } from '@/lib/palette';
import { prefetchImagesOnIdle, shouldConserveData } from '@/lib/images/prefetch';
import { whenIdle } from '@/lib/idle';
import { preloadSectionChunk } from '@/components/sectionsRegistry';
import { currentDayPhase, tintForPhase } from '@/lib/time-tint';
import { profile, galleryItems } from '@/data/profile';

interface AppProps {
  readonly projects: readonly Project[];
  readonly initialSection?: SectionId;
  /** Blog article list (meta + TOC + prev/next). Passed through to BlogSection/ArticleView. */
  readonly articles?: readonly ArticleListItem[];
  readonly initialBlogTag?: string | null;
  /** Slug of an article to open on boot (direct-load of /blog/[slug]). */
  readonly initialArticle?: string | null;
  /** Server-rendered article body for direct-load of /blog/[slug]. */
  readonly children?: React.ReactNode;
}

const DarkVeil = lazy(() => import('@/components/effects/DarkVeil'));
const loadCommandPalette = () => import('@/components/effects/CommandPalette');
const CommandPalette = lazy(loadCommandPalette);
const BLOG_SECTION_INDEX = SECTIONS.findIndex((section) => section.id === 'blog');

function getRenderableSectionIds(activeIndex: number, articleReadingMode: boolean) {
  const ids = new Set<SectionId>();
  if (articleReadingMode) {
    const activeSection = SECTIONS[activeIndex];
    if (activeSection) ids.add(activeSection.id);
    return ids;
  }
  for (const index of [activeIndex - 1, activeIndex, activeIndex + 1]) {
    const section = SECTIONS[index];
    if (section) ids.add(section.id);
  }
  return ids;
}

/**
 * Opacity of the flat colour layer covering the veil. Lower on dark sections so
 * the ink field shows through; on light sections it is the contrast guard that
 * keeps body text readable over the paper wash.
 */
const BG_COVER = { dark: 0.72, light: 0.8 } as const;

/**
 * MotionConfig 的全局 transition 引用：模块级常量保持引用稳定，避免 App
 * 每次重渲染都新建对象 → MotionConfig context 变化 → 全树 motion 组件重渲染。
 */
const APP_TRANSITION = { ease: motionEase } as const;

/**
 * Crossing the night/paper boundary pulses a solid accent mid-layer near-opaque:
 * the veil's 0.9s OKLab morph lags behind the colour commit, and a translucent
 * cover over a mid-morph veil is exactly the grey wash this guards against.
 *
 * Cross-boundary covers animate **opacity only** (compositor); never interpolate
 * `backgroundColor` across night↔paper (that forces main-thread paint every frame
 * and still passes through a muddy sRGB midpoint).
 */
const BG_COVER_PEAK = 0.97;

const COVER_LAYER_CLASS = 'pointer-events-none fixed inset-0 z-0';

/** Steady cover CSS transition: opacity-only while crossing; colour+opacity otherwise. */
function coverLayerTransition(crossing: boolean, motionLevel: MotionLevel): string {
  const ease = `${durationFor(motionLevel, motionDuration.background)}s var(--ease-brand)`;
  if (crossing) return `opacity ${ease}`;
  return `background-color ${ease}, opacity ${ease}`;
}

/**
 * 帷幕帧率：阅读模式 1fps；跨明暗过渡与低预算档压到 30fps
 * （预算内的 30fps 档保持 30——过场节流与档位降频不叠加）。
 */
function veilFrameRate(
  articleReadingMode: boolean,
  crossing: boolean,
  budgetFrameRate: number,
): number {
  if (articleReadingMode) return 1;
  if (crossing) return Math.min(30, budgetFrameRate);
  return budgetFrameRate;
}

const contactQRItems: LightboxItem[] = [
  {
    imageSrc: '/images/contact/wechat.webp',
    imageAlt: '微信好友二维码',
    title: '微信好友',
    location: 'WeChat',
    year: '',
    category: 'CONTACT',
    description: '扫码添加微信好友',
    tags: ['微信', 'WeChat', '好友'],
    width: 539,
    height: 800,
  },
  {
    imageSrc: '/images/contact/feishu.jpg',
    imageAlt: '飞书好友二维码',
    title: '飞书好友',
    location: 'Lark',
    year: '',
    category: 'CONTACT',
    description: '扫码添加飞书好友',
    tags: ['飞书', 'Lark', '好友'],
    width: 653,
    height: 800,
  },
  {
    imageSrc: '/images/contact/zanshang.webp',
    imageAlt: '赞赏码',
    title: '赞赏码',
    location: 'Tip',
    year: '',
    category: 'CONTACT',
    description: '扫码赞赏支持',
    tags: ['赞赏', '打赏', '赞助'],
    width: 800,
    height: 800,
  },
];

export default function App({
  projects,
  initialSection = ROOT_SECTION_ID,
  articles,
  initialBlogTag = null,
  initialArticle = null,
  children,
}: AppProps) {
  const visibleDisplayMode = useVisibleDisplayMode();
  const displayTarget = useDisplayMode();
  // The desktop owns the screen as soon as it is targeted: freeze the veil
  // while the iframe boots or is visible so two GPU surfaces never compete.
  const veilPaused = displayTarget === 'win95';
  useEffect(() => {
    if (displayTarget === 'classic' && visibleDisplayMode === 'classic') return;
    const token = acquireInputPause('navigation');
    return () => releaseInputPause(token);
  }, [displayTarget, visibleDisplayMode]);

  // The island owns the presentation lifecycle: mount starts the single
  // controller (the subscriptions above also start it lazily), unmount
  // releases it so a remount boots from the datasets instead of reusing state.
  useEffect(() => {
    getPresentation().start();
    return () => disposePresentation();
  }, []);
  const {
    playing: bgmPlaying,
    toggle: toggleBGM,
    analyserRef: bgmAnalyserRef,
    playNav,
    playHover,
    playTransition,
  } = useAudioSystem();

  // Resolve the article category used by the shared watermark and rail layers.
  const getArticleWatermark = useCallback(
    (slug: string) => {
      const found = articles?.find((a) => a.id === slug);
      return articleWatermarkFor(found);
    },
    [articles],
  );

  const [blogActiveTag, setBlogActiveTag] = useState<string | null>(initialBlogTag);
  const [commandTarget, setCommandTarget] = useState<CommandTarget | null>(null);
  const onDeepLink = useCallback((destination: FusionDestination | null) => {
    const target = sectionTargetFromDestination(destination);
    setCommandTarget(target ? { ...target, nonce: Date.now() } : null);
    setBlogActiveTag(destination?.kind === 'tag' ? destination.id : null);
  }, []);
  const isArticleAvailable = useCallback(
    (slug: string) => articles?.some((article) => article.id === slug) ?? false,
    [articles],
  );
  const navigation = useFullpageNavigation(playTransition, initialSection, {
    initialArticle,
    getArticleWatermark,
    onDeepLink,
    isArticleAvailable,
  });
  useEffect(() => {
    const destination = destinationFromUrl(new URL(window.location.href), 'general');
    const target = sectionTargetFromDestination(destination);
    if (target) setCommandTarget({ ...target, nonce: Date.now() });
  }, []);
  const blogReturnSnapshotRef = useRef({ scrollTop: 0, focusSlug: null as string | null });
  const previousArticleRef = useRef(navigation.activeArticle);
  const pendingBlogRestoreRef = useRef(false);
  // 首次 boot 不抢焦点：只有经历过至少一次完整过渡后才接管焦点。
  const hasTransitionedRef = useRef(false);

  const handleBlogActiveTagChange = useCallback((tag: string | null) => {
    setBlogActiveTag(tag);
    const path = destinationPath(tag ? { kind: 'tag', id: tag } : { kind: 'blog' }, 'general');
    if (`${window.location.pathname}${window.location.search}` !== path)
      window.history.pushState({ sectionId: 'blog' }, '', path);
  }, []);

  const handleOpenArticle = useCallback(
    (slug: string) => {
      if (navigation.activeIndex === BLOG_SECTION_INDEX && !navigation.activeArticle) {
        const wrapper = navigation.sectionRefs.current[BLOG_SECTION_INDEX];
        blogReturnSnapshotRef.current = {
          scrollTop: wrapper?.scrollTop ?? 0,
          focusSlug: slug,
        };
      }
      void navigation.navigateToArticle(slug);
    },
    [
      navigation.activeArticle,
      navigation.activeIndex,
      navigation.navigateToArticle,
      navigation.sectionRefs,
    ],
  );

  const handleBackFromArticle = useCallback(() => {
    void navigation.navigateBackFromArticle();
  }, [navigation.navigateBackFromArticle]);

  const currentSection =
    SECTION_MAP[SECTIONS[navigation.activeIndex]?.id ?? ROOT_SECTION_ID] ?? SECTIONS[0];
  const fusionDestination = useMemo<FusionDestination>(() => {
    if (navigation.activeArticle) {
      const linked =
        typeof location !== 'undefined'
          ? destinationFromUrl(new URL(location.href), 'general')
          : null;
      return {
        kind: 'article',
        id: navigation.activeArticle,
        ...(linked?.kind === 'article' && linked.id === navigation.activeArticle && linked.anchor
          ? { anchor: linked.anchor }
          : {}),
      };
    }
    if (currentSection.id === 'blog' && blogActiveTag) return { kind: 'tag', id: blogActiveTag };
    if (commandTarget?.sectionId === currentSection.id) {
      if (currentSection.id === 'projects') return { kind: 'project', id: commandTarget.itemId };
      if (
        currentSection.id === 'skills' ||
        currentSection.id === 'gallery' ||
        currentSection.id === 'friends'
      )
        return { kind: currentSection.id, id: commandTarget.itemId };
    }
    return { kind: currentSection.id === 'about' ? 'profile' : currentSection.id };
  }, [navigation.activeArticle, currentSection.id, blogActiveTag, commandTarget]);
  const returnFromDesktop = useCallback(
    async (destination: FusionDestination, signal: AbortSignal) => {
      const cancelled = () => signal.aborted || getDisplayMode() !== 'classic';
      await navigation.waitForNavigation();
      if (cancelled()) return;
      if (destination.kind === 'article') {
        if (!articles?.some((article) => article.id === destination.id))
          throw new Error('Article is unavailable.');
        await loadArticleBody(destination.id);
        if (cancelled()) return;
        await navigation.navigateToArticle(destination.id);
        await navigation.waitForNavigation();
        if (cancelled()) return;
        window.history.replaceState(
          window.history.state,
          '',
          destinationPath(destination, 'general'),
        );
        let progress = 0;
        try {
          progress = readingDocument(destination.id)?.progress ?? 0;
        } catch {
          /* read-only fallback */
        }
        const wrapper = navigation.sectionRefs.current[BLOG_SECTION_INDEX];
        if (wrapper)
          wrapper.scrollTop = progress * Math.max(0, wrapper.scrollHeight - wrapper.clientHeight);
        return;
      }
      const sectionId =
        destination.kind === 'home' || destination.kind === 'profile'
          ? 'about'
          : destination.kind === 'project'
            ? 'projects'
            : destination.kind === 'tag'
              ? 'blog'
              : destination.kind;
      if (navigation.activeArticle) {
        await navigation.navigateBackFromArticle();
        await navigation.waitForNavigation();
      }
      if (cancelled()) return;
      await preloadSectionChunk(sectionId);
      if (cancelled()) return;
      setBlogActiveTag(destination.kind === 'tag' ? destination.id : null);
      await navigation.navigateToSection(SECTIONS.findIndex((section) => section.id === sectionId));
      await navigation.waitForNavigation();
      if (cancelled()) return;
      window.history.replaceState(
        window.history.state,
        '',
        destinationPath(destination, 'general'),
      );
      const target = sectionTargetFromDestination(destination);
      setCommandTarget(target ? { ...target, nonce: Date.now() } : null);
    },
    [
      articles,
      navigation.navigateToArticle,
      navigation.navigateBackFromArticle,
      navigation.navigateToSection,
      navigation.waitForNavigation,
      navigation.activeArticle,
      navigation.sectionRefs,
    ],
  );
  // Accent identity follows the bridge crest (accentIndex), not the content commit.
  const accentSection = SECTIONS[navigation.accentIndex] ?? currentSection;
  const [cmdOpen, setCmdOpen] = useState(false);
  // 首次打开后保持挂载：面板的退出动效由 CommandPalette 内部的
  // AnimatePresence 播放，随 `cmdOpen` 一起卸载会直接吞掉 exit。
  // chunk 仍在首次打开时才加载（lazy + Suspense）。
  const [cmdMounted, setCmdMounted] = useState(false);
  // 稳定回调：内联箭头会让 memo(Navigation) 永远失效。
  const openCommand = useCallback(() => {
    setCmdMounted(true);
    setCmdOpen(true);
  }, []);
  const [contactQRIndex, setContactQRIndex] = useState<number | null>(null);
  // 首屏即根章节（Home 已删除）：仅深链文章直开时顶部条才以紧凑态起步。
  const [navCompact, setNavCompact] = useState(!!initialArticle);
  const { motionLevel, perfTier } = useMediaCapabilities();
  // 设备性能轴：意图档（motionLevel）确定用户选择，性能档（perfTier）
  // 在预算表内下调数值——low 档含两个可见降级（过渡 blur、滚动呼吸），
  // 其余（分辨率/帧率/速度/粒子数）观感不可辨。
  const motionBudget = resolveMotionBudget(motionLevel, perfTier);
  const articleReadingMode = navigation.activeArticle != null;
  const [mobileTocOpen, setMobileTocOpen] = useState(false);
  const breathPulse = navigation.transitionPhase === 'bridge';
  // The veil is permanent now, so 「墨与光的呼吸」applies on paper sections too.
  useScrollBreath(motionBudget.scrollBreath && !articleReadingMode && !veilPaused, breathPulse);
  const lucidMode = useLucidMode();
  // Paper sections keep a quieter field so the wash never competes with body text.
  const veilSpeed = articleReadingMode
    ? 0
    : (motionLevel === 'mobile' ? 0.72 : 1) *
      motionBudget.veilSpeedFactor *
      (navigation.bgIsDark ? 1 : 0.42) *
      (lucidMode ? 1.7 : 1);
  const veilWarp =
    articleReadingMode || motionLevel === 'reduced'
      ? 0.12
      : lucidMode
        ? 0.74
        : navigation.bgIsDark
          ? 0.4
          : 0.22;
  const railVisible =
    navigation.activeIndex > 0 ||
    (navigation.transitionTargetIndex !== null && navigation.transitionTargetIndex > 0);
  const railPreviewIndex =
    navigation.activeIndex === 0 &&
    navigation.transitionTargetIndex !== null &&
    navigation.transitionTargetIndex > 0
      ? navigation.transitionTargetIndex
      : navigation.activeIndex;
  const railSection = SECTIONS[railPreviewIndex] ?? currentSection;
  const railLabel = navigation.activeArticle ? 'ARTICLE' : railSection.zh;
  const railVerticalText = navigation.activeArticle
    ? navigation.articleWatermark || currentSection.en
    : railSection.en;

  useKonami(toggleLucidMode);

  // ESC exits lucid mode without swallowing Escape while a modal owns focus.
  useEffect(() => {
    if (!lucidMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.closest('[role="dialog"]') ||
          target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      )
        return;
      setLucidMode(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lucidMode]);

  // A manual motion tier has to beat `prefers-reduced-motion` in the stylesheet
  // too, otherwise choosing 「完整」on a reduce-preferring OS only half applies.
  const motionOverride = useMotionOverride();
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('motion-forced', motionOverride !== null && motionOverride !== 'reduced');
    root.classList.toggle('motion-suppressed', motionOverride === 'reduced');
  }, [motionOverride]);

  // The day phase is captured once per visit: it is atmosphere, not a clock.
  const dayPhase = useMemo(() => currentDayPhase(), []);
  const veilTint = useMemo(
    () => tintForPhase(currentSection.veilTint, dayPhase),
    [currentSection.veilTint, dayPhase],
  );
  useSectionAccent(
    accentSection.accent,
    accentSection.accentSoft,
    currentSection.isDark,
    motionLevel,
    lucidMode,
  );

  const renderableSectionIds = useMemo(
    () => getRenderableSectionIds(navigation.activeIndex, articleReadingMode),
    [articleReadingMode, navigation.activeIndex],
  );

  const getSectionRef = useCallback(
    (index: number) => (element: HTMLDivElement | null) => {
      navigation.sectionRefs.current[index] = element;
    },
    [navigation.sectionRefs],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (getDisplayMode() !== 'classic') return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!navigation.contentReady) return;
    return whenIdle(() => void loadCommandPalette(), { timeout: 2400, fallbackDelay: 1600 });
  }, [navigation.contentReady]);

  // 预热首屏 chunk 并广播就绪：BootLoader 双轨进度依赖
  // portfolio:boot-ready 信号收场，保证遮罩消失时首屏章节已就绪、
  // 不再闪 THINKING fallback。chunk 加载失败（重新部署后 hash 失配 /
  // 弱网）时同样广播放行遮罩，首屏区域由 SectionErrorBoundary 呈现
  // 重试入口，避免遮罩干等兜底 + unhandled rejection。
  // Win95 桌面落地时跳过：遮罩由 iframe 的 `startup` 消息收场
  // （Win95Embed），经典 chunk 的就绪与否与可见首屏无关。
  useEffect(() => {
    if (getDisplayMode() !== 'classic') return;
    let cancelled = false;
    void preloadSectionChunk(initialSection)
      .catch(() => {
        // 失败路径在下一步统一广播；此处吞掉 rejection 即可。
      })
      .then(() => {
        if (cancelled) return;
        markBootReady();
      });
    return () => {
      cancelled = true;
    };
  }, [initialSection]);

  // contentReady 后空闲预载全部懒加载章节 chunk（sectionsRegistry 的
  // preloadSectionChunk）：fullpage 可任意翻页/命令面板跳转，预载让首次
  // 切换不再撞 Suspense 的 THINKING fallback。构建期只预载 Hero 与直链页
  // 目标章节（全量 modulepreload 会抢首访主线程），其余在此空闲拉取；
  // 省流 / 2G 跳过，与灯箱预载策略一致。
  useEffect(() => {
    if (!navigation.contentReady || shouldConserveData()) return;
    return whenIdle(
      () => {
        for (const id of SECTIONS.map((section) => section.id)) {
          void preloadSectionChunk(id).catch(() => undefined);
        }
      },
      { timeout: 4000, fallbackDelay: 2400 },
    );
  }, [navigation.contentReady]);

  // contentReady 后空闲预载 YARL 灯箱完整子树（首次打开时按需加载的
  // `./effects/lightbox` 内含核心 + 插件 + styles：只预载核心会在首开
  // 时仍要拉插件/样式，起不到「近乎零等待」）。省流 / 2G 跳过预载。
  useEffect(() => {
    if (!navigation.contentReady || shouldConserveData()) return;
    return whenIdle(() => void import('./effects/lightbox/index').catch(() => undefined), {
      timeout: 4000,
      fallbackDelay: 2400,
    });
  }, [navigation.contentReady]);

  // 挂载即开始空闲预取首屏外的展示图（不再等 contentReady ≈1.5s+）；
  // 省流 / 2G 由 prefetchImagesOnIdle 内置守卫跳过。
  useEffect(() => {
    const sources = [
      profile.avatar,
      projects[0]?.image,
      ...galleryItems.slice(0, 6).map((item) => item.imageSrc),
      '/images/contact/wechat.webp',
      '/images/contact/feishu.jpg',
    ].filter((src): src is string => Boolean(src));
    return prefetchImagesOnIdle(sources, 4000);
  }, [projects]);

  // 过渡瞄准目标章节时预热其 chunk：快速跨节跳转不再在 bridge 阶段撞上 fallback。
  useEffect(() => {
    if (navigation.transitionTargetIndex === null) return;
    const section = SECTIONS[navigation.transitionTargetIndex];
    if (section) void preloadSectionChunk(section.id).catch(() => undefined);
  }, [navigation.transitionTargetIndex]);

  // TTS 播报期间暂停 BGM，避免朗读与背景音乐叠加。
  useEffect(() => {
    const onTtsSpeaking = (event: Event) => {
      const detail = (event as CustomEvent<{ speaking?: boolean }>).detail;
      // toggle 无参数：守卫保证只在 bgm 播放中调用，此时切换即暂停。
      if (detail?.speaking && bgmPlaying) toggleBGM();
    };
    window.addEventListener('portfolio:tts-speaking', onTtsSpeaking);
    return () => window.removeEventListener('portfolio:tts-speaking', onTtsSpeaking);
  }, [bgmPlaying, toggleBGM]);

  useEffect(() => {
    const activeWrapper = navigation.sectionRefs.current[navigation.activeIndex];
    const updateCompact = () => {
      setNavCompact(navigation.activeIndex > 0 || (activeWrapper?.scrollTop ?? 0) > 24);
    };

    updateCompact();
    activeWrapper?.addEventListener('scroll', updateCompact, { passive: true });
    return () => activeWrapper?.removeEventListener('scroll', updateCompact);
  }, [navigation.activeIndex, navigation.sectionRefs]);

  // 过渡落定后把焦点移到当前章节容器，让键盘与读屏上下文跟随章节切换。
  useEffect(() => {
    if (navigation.transitionPhase !== 'idle') {
      hasTransitionedRef.current = true;
      return;
    }
    if (!hasTransitionedRef.current || !navigation.contentReady) return;
    navigation.sectionRefs.current[navigation.activeIndex]?.focus({ preventScroll: true });
  }, [
    navigation.activeIndex,
    navigation.contentReady,
    navigation.sectionRefs,
    navigation.transitionPhase,
  ]);

  useEffect(() => {
    const section = SECTIONS[navigation.activeIndex];
    if (section?.id === 'blog') {
      const article = articles?.find((item) => item.id === navigation.activeArticle);
      applyBlogHead(
        article
          ? articleHead(article)
          : blogActiveTag
            ? blogTagHead(blogActiveTag, articles ?? [])
            : blogIndexHead(articles ?? []),
      );
      return;
    }

    let nextTitle: string;
    if (section) {
      nextTitle = pageTitle([`${section.zh} / ${section.en}`]);
    } else {
      nextTitle = pageTitle([]);
    }
    syncSectionHead(nextTitle);
  }, [navigation.activeIndex, navigation.activeArticle, articles, blogActiveTag]);

  useEffect(() => {
    const previousArticle = previousArticleRef.current;
    if (
      previousArticle &&
      !navigation.activeArticle &&
      navigation.activeIndex === BLOG_SECTION_INDEX
    ) {
      pendingBlogRestoreRef.current = true;
    }
    if (previousArticle && !navigation.activeArticle) {
      setMobileTocOpen(false);
    }
    previousArticleRef.current = navigation.activeArticle;
  }, [navigation.activeArticle, navigation.activeIndex]);

  useEffect(() => {
    if (
      !pendingBlogRestoreRef.current ||
      navigation.activeArticle ||
      navigation.activeIndex !== BLOG_SECTION_INDEX ||
      !navigation.contentReady ||
      navigation.transitionPhase !== 'idle'
    )
      return;

    pendingBlogRestoreRef.current = false;
    const { scrollTop, focusSlug } = blogReturnSnapshotRef.current;
    let focusFrame = 0;
    const restoreFrame = window.requestAnimationFrame(() => {
      navigation.restoreSectionScroll(BLOG_SECTION_INDEX, scrollTop);
      focusFrame = window.requestAnimationFrame(() => {
        if (!focusSlug) return;
        const wrapper = navigation.sectionRefs.current[BLOG_SECTION_INDEX];
        const sourceCard = [
          ...(wrapper?.querySelectorAll<HTMLElement>('[data-article-slug]') ?? []),
        ].find((element) => element.dataset.articleSlug === focusSlug);
        sourceCard?.focus({ preventScroll: true });
      });
    });

    return () => {
      window.cancelAnimationFrame(restoreFrame);
      window.cancelAnimationFrame(focusFrame);
    };
  }, [
    navigation.activeArticle,
    navigation.activeIndex,
    navigation.contentReady,
    navigation.restoreSectionScroll,
    navigation.sectionRefs,
    navigation.transitionPhase,
  ]);

  const handleNavigateToItem = useCallback(
    async (sectionId: string, itemId: string) => {
      setCommandTarget({ sectionId, itemId, nonce: Date.now() });
      navigation.handleNavigate(sectionId);
      await navigation.waitForNavigation();
      const destination: FusionDestination | null =
        sectionId === 'projects'
          ? { kind: 'project', id: itemId }
          : sectionId === 'skills' || sectionId === 'gallery'
            ? { kind: sectionId, id: itemId }
            : null;
      if (destination)
        window.history.replaceState(
          window.history.state,
          '',
          destinationPath(destination, 'general'),
        );
    },
    [navigation],
  );

  return (
    <MotionConfig
      reducedMotion={
        motionOverride === null ? 'user' : motionOverride === 'reduced' ? 'always' : 'never'
      }
      transition={APP_TRANSITION}
    >
      <div
        className="fixed inset-0 overflow-hidden"
        data-classic-root
        inert={visibleDisplayMode === 'win95'}
        aria-hidden={visibleDisplayMode === 'win95'}
      >
        {/* The veil never unmounts: a dark → light section change is one continuous
          morph of its palette uniforms rather than a cross-fade to flat colour.
          The container carries an opaque section-bg base under the canvas: the
          0.8 cover above is translucent, so if the GL layer ever drops out
          (shader compile failure / context loss), a light section would
          otherwise blend straight into the permanently dark <body> — the flat
          grey wash this base prevents. */}
        <div
          className={COVER_LAYER_CLASS}
          style={{
            backgroundColor: navigation.bgColor,
            // 跨界时底色瞬切：CSS background-color 插值会与盖层抢 paint，
            // 并再次经过 sRGB 中灰；帷幕 OKLab morph 才是氛围过渡。
            transition: navigation.bgCrossing
              ? undefined
              : `background-color ${motionDuration.background}s var(--ease-brand)`,
          }}
        >
          <Suspense
            fallback={
              <div className="h-full w-full" style={{ backgroundColor: navigation.bgColor }} />
            }
          >
            <DarkVeil
              speed={veilSpeed}
              hueCycle={lucidMode ? 26 : 0}
              warpAmount={veilWarp}
              tint={veilTint}
              mesh={currentSection.mesh}
              tintAmount={navigation.bgIsDark ? 0.62 : 0.9}
              lightMix={navigation.bgIsDark ? 0 : 1}
              resolutionScale={articleReadingMode ? 0.28 : motionBudget.resolutionScale}
              // 跨明暗：帷幕 morph 与内容 blur / 盖层脉冲争 GPU——压到 30fps
              // （liveRef，不重建 GL context）。同氛围切换保持档位帧率。
              frameRate={veilFrameRate(
                articleReadingMode,
                !!navigation.bgCrossing,
                motionBudget.frameRate,
              )}
              dprCap={articleReadingMode ? 1 : motionBudget.dprCap}
              staticFrame={articleReadingMode || motionLevel === 'reduced' || veilPaused}
              reducedMotion={motionLevel === 'reduced'}
              onFrameWindow={reportFrameWindow}
            />
          </Suspense>
        </div>

        {/* 稳态盖层：只承载目标章节色。同氛围切换用 CSS 补间 background；
          跨界时颜色瞬切，由下方两层 opacity 叠层完成「accent 中转 + 遮帷幕」。 */}
        <div
          className={COVER_LAYER_CLASS}
          style={{
            backgroundColor: navigation.bgColor,
            opacity: navigation.bgIsDark ? BG_COVER.dark : BG_COVER.light,
            transition: coverLayerTransition(!!navigation.bgCrossing, motionLevel),
          }}
        />

        {/* 「散焦 · 聚焦」跨界换色：墨夜 ↔ 纸面若单层 sRGB 插值必经中灰，再加上
          帷幕 morph 滞后透过盖层，就是肉眼可见的灰洗。跨界改为两层实色 +
          仅 opacity 关键（合成器友好）：outgoing 淡出，accent 中转层脉冲至
          近不透明遮住仍在 morph 的帷幕，再回落露出稳态盖层。 */}
        {navigation.bgCrossing && (
          <>
            <motion.div
              key={`cover-mid-${navigation.bgCrossing.fromBg}-${navigation.bgColor}`}
              className={COVER_LAYER_CLASS}
              style={{
                backgroundColor: mixHex(navigation.bgColor, currentSection.accent, 0.55),
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, BG_COVER_PEAK, 0] }}
              transition={{
                duration: durationFor(motionLevel, motionDuration.veilMorph),
                ease: motionEase,
                times: [0, 0.22, 1],
              }}
            />
            <motion.div
              key={`cover-from-${navigation.bgCrossing.fromBg}-${navigation.bgColor}`}
              className={COVER_LAYER_CLASS}
              style={{ backgroundColor: navigation.bgCrossing.fromBg }}
              initial={{
                opacity: navigation.bgCrossing.fromIsDark ? BG_COVER.dark : BG_COVER.light,
              }}
              animate={{ opacity: 0 }}
              transition={{
                duration: durationFor(motionLevel, motionDuration.sweep),
                ease: motionEase,
              }}
            />
          </>
        )}

        <SectionRail
          visible={railVisible}
          label={railLabel}
          verticalText={railVerticalText}
          current={railPreviewIndex}
          total={SECTIONS.length}
          direction={navigation.direction}
          phase={navigation.transitionPhase}
          accent={railSection.accent}
          accentSoft={railSection.accentSoft}
        />

        <FullpageChrome
          current={navigation.activeIndex}
          total={SECTIONS.length}
          text={navigation.watermarkText}
          isDark={navigation.bgIsDark}
          cursorVisible={navigation.cursorVisible}
          phase={navigation.transitionPhase}
        />

        <Navigation
          currentSection={currentSection.id}
          onNavigate={navigation.handleNavigate}
          onOpenArticle={handleOpenArticle}
          bgmPlaying={bgmPlaying}
          onBGMToggle={toggleBGM}
          bgmAnalyser={bgmAnalyserRef}
          onNavSound={playNav}
          onNavHover={playHover}
          onOpenCommand={openCommand}
          onCommandIntent={loadCommandPalette}
          compact={navCompact}
        />

        <InkRipple />

        <SectionViewport
          navigation={navigation}
          projects={projects}
          articles={articles}
          renderableSectionIds={renderableSectionIds}
          getSectionRef={getSectionRef}
          motionLevel={motionLevel}
          perfTier={perfTier}
          bgmPlaying={bgmPlaying}
          blogActiveTag={blogActiveTag}
          onBlogActiveTagChange={handleBlogActiveTagChange}
          onOpenArticle={handleOpenArticle}
          onBackFromArticle={handleBackFromArticle}
          articleBody={children}
          articleBodySlug={initialArticle}
          commandTarget={commandTarget}
          tocOpen={mobileTocOpen}
          onTocOpenChange={setMobileTocOpen}
        />

        {cmdMounted && (
          <Suspense fallback={null}>
            <CommandPalette
              open={cmdOpen}
              onClose={() => setCmdOpen(false)}
              onNavigate={navigation.handleNavigate}
              onNavigateToItem={handleNavigateToItem}
              onOpenArticle={handleOpenArticle}
              bgmPlaying={bgmPlaying}
              bgmAnalyser={bgmAnalyserRef}
              onToggleBGM={toggleBGM}
              onOpenContactQR={setContactQRIndex}
              projects={projects}
              articles={articles ?? []}
              currentSection={currentSection.id}
            />
          </Suspense>
        )}
        {navigation.activeIndex === SECTIONS.length - 1 && !navigation.activeArticle && (
          <BackToStart onNavigate={navigation.handleNavigate} />
        )}
        <BeianFooter isDark={navigation.bgIsDark} onOpenArticle={handleOpenArticle} />
        <ShortcutHint />
        <Lightbox
          items={contactQRItems}
          index={contactQRIndex}
          onClose={() => setContactQRIndex(null)}
          onNavigate={setContactQRIndex}
          variant="gallery"
        />
      </div>
      {/* Win95 融合层（classic 根之外——不受其让位规则影响）：iframe 宿主
          常驻（z-80，classic 根经 CSS 隐藏）+ 右缘切换入口（z-90）。一切
          由 <html data-display-mode> 与 useDisplayMode 驱动。 */}
      <Win95Embed destination={fusionDestination} onReturn={returnFromDesktop} />
      <DisplayModeToggle />
      <DesktopEntryNotice />
    </MotionConfig>
  );
}
