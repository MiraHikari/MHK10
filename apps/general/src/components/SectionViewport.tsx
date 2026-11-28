import { memo, Suspense, useMemo, type ComponentType, type ReactNode } from 'react';
import { durationFor, motionDuration, motionEase, type MotionLevel } from '@/lib/motion';
import { resolveMotionBudget } from '@/lib/device-performance';
import type { DevicePerfTier } from '@/lib/device-performance';
import { resolveSectionPoseKind } from '@/lib/section-transition-pose';
import { SectionScrollHost } from '@/components/motion/SectionScrollContext';
import { SectionReadyProvider } from '@/components/motion/SectionReadyContext';
import { SectionAppProvider } from '@/components/layout/SectionAppContext';
import { BlogSectionProvider } from '@/components/blog/BlogSectionContext';
import { sectionComponents, SectionFallback } from '@/components/sectionsRegistry';
import SectionErrorBoundary from '@/components/ui/SectionErrorBoundary';
import type { ArticleListItem } from '@/lib/blog/types';
import type { Project } from '@/lib/projects/types';
import { SECTION_MAP, SECTIONS, type SectionId } from '@/lib/sections';
import type { CommandTarget } from '@/hooks/useCommandTargetHighlight';
import type { useFullpageNavigation } from '@/hooks/useFullpageNavigation';

type NavigationState = ReturnType<typeof useFullpageNavigation>;

interface SectionViewportProps {
  readonly navigation: NavigationState;
  readonly projects: readonly Project[];
  readonly articles?: readonly ArticleListItem[];
  readonly renderableSectionIds: ReadonlySet<SectionId>;
  readonly getSectionRef: (index: number) => (element: HTMLDivElement | null) => void;
  readonly motionLevel: MotionLevel;
  /** 设备性能轴档位：与意图档共同决定过渡 blur 等预算项。 */
  readonly perfTier: DevicePerfTier;
  readonly bgmPlaying: boolean;
  readonly blogActiveTag: string | null;
  readonly onBlogActiveTagChange: (tag: string | null) => void;
  readonly onOpenArticle: (slug: string) => void;
  readonly onBackFromArticle: () => void;
  readonly articleBody?: ReactNode;
  readonly articleBodySlug?: string | null;
  readonly commandTarget: CommandTarget | null;
  readonly tocOpen: boolean;
  readonly onTocOpenChange: (open: boolean) => void;
}

/** 章节统一外壳：ErrorBoundary 兜住 lazy chunk 加载失败，Suspense 呈现 fallback。 */
function SectionFrame({
  sectionId,
  children,
}: {
  readonly sectionId: SectionId;
  readonly children: ReactNode;
}) {
  return (
    <SectionErrorBoundary dark={SECTION_MAP[sectionId].isDark}>
      <Suspense fallback={<SectionFallback sectionId={sectionId} />}>{children}</Suspense>
    </SectionErrorBoundary>
  );
}

// 章节组件分发点：props 只有原语 sectionId，memo 让 SectionViewport 重渲染
// （过渡阶段翻转 / 无关 slice 变化）时已挂载章节直接 bail out。
const SectionContent = memo(function SectionContent({
  sectionId,
}: {
  readonly sectionId: SectionId;
}) {
  const SectionComponent: ComponentType = sectionComponents[sectionId];
  return <SectionComponent />;
});

export default memo(function SectionViewport({
  navigation,
  projects,
  articles,
  renderableSectionIds,
  getSectionRef,
  motionLevel,
  perfTier,
  bgmPlaying,
  blogActiveTag,
  onBlogActiveTagChange,
  onOpenArticle,
  onBackFromArticle,
  articleBody,
  articleBodySlug,
  commandTarget,
  tocOpen,
  onTocOpenChange,
}: SectionViewportProps) {
  const blogValue = useMemo(
    () => ({
      articles: articles ?? [],
      activeArticle: navigation.activeArticle,
      blogActiveTag,
      onBlogActiveTagChange,
      onOpenArticle,
      onBackFromArticle,
      articleBody,
      articleBodySlug: articleBodySlug ?? null,
      tocOpen,
      onTocOpenChange,
    }),
    [
      articles,
      navigation.activeArticle,
      blogActiveTag,
      onBlogActiveTagChange,
      onOpenArticle,
      onBackFromArticle,
      articleBody,
      articleBodySlug,
      tocOpen,
      onTocOpenChange,
    ],
  );

  // 「散焦 · 聚焦」— 容器级手势一次算好，各章节只挑姿态引用。
  // blur 仅 full 档；mobile 只做 y/opacity/scale，省全屏 filter 合成。
  // 性能轴 low 档同样关闭——大屏弱机过渡期 blur 与 WebGL morph / 盖层
  // 脉冲三方争 GPU，掉帧即卡顿（预算表 transitionBlur）。
  // 跨明暗边界时盖层已近不透明遮帷幕，内容 blur 可收一档，减轻与
  // WebGL morph / 盖层脉冲的 GPU 争用（home↔about 等相邻切换几乎必跨界）。
  const motionDirection = navigation.direction === 0 ? 1 : navigation.direction;
  const crossing = navigation.bgCrossing != null;
  const transitionBlur = resolveMotionBudget(motionLevel, perfTier).transitionBlur;
  const focusBlur = transitionBlur ? (crossing ? 'blur(8px)' : 'blur(12px)') : 'blur(0px)';
  // 邻居章节常驻 opacity:0，禁止挂 filter——否则预挂的 ±1 节也会各占一层
  // 全屏 blur 合成层，跨界时与帷幕抢 GPU。
  const poses = {
    visible: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' },
    parked: { opacity: 0, y: 0, scale: 1, filter: 'blur(0px)' },
    exit: {
      opacity: 0,
      y: motionDirection > 0 ? -28 : 28,
      scale: 0.985,
      filter: focusBlur,
    },
    enter: {
      opacity: 0,
      y: motionDirection > 0 ? 28 : -28,
      scale: 1.012,
      filter: focusBlur,
    },
  } as const;
  const transitioning = navigation.transitionPhase !== 'idle';

  return (
    // 真实 main 地标（替代 display:contents —— contents 元素无 box、不可聚焦，
    // 且地标会从无障碍树消失）：absolute inset-0 与现状视觉等价，章节的
    // absolute 定位上下文不变。skip link 目标。
    <main id="main-content" tabIndex={-1} className="absolute inset-0 outline-none">
      <SectionAppProvider
        projects={projects}
        bgmPlaying={bgmPlaying}
        onNavigate={navigation.handleNavigate}
        commandTarget={commandTarget}
      >
        <BlogSectionProvider value={blogValue}>
          {SECTIONS.map((section, index) => {
            if (!renderableSectionIds.has(section.id)) return null;
            const isActive = index === navigation.activeIndex;
            const poseKind = resolveSectionPoseKind({
              isActive,
              sectionVisible: navigation.sectionVisible,
              phase: navigation.transitionPhase,
            });
            const isLeaving = poseKind === 'exit';
            const animating =
              poseKind === 'exit' || poseKind === 'enter' || (isActive && transitioning);

            return (
              <SectionScrollHost
                key={section.id}
                data-section-scroll={section.id}
                assignRef={getSectionRef(index)}
                className={`absolute inset-0 z-2 section-scroll overflow-x-hidden overflow-y-auto ${isActive ? '' : 'pointer-events-none'}`}
                initial={false}
                animate={poses[poseKind]}
                transition={
                  animating
                    ? {
                        duration: durationFor(
                          motionLevel,
                          isLeaving ? motionDuration.sectionExit : motionDuration.sectionEnter,
                        ),
                        ease: motionEase,
                        opacity: {
                          duration: durationFor(
                            motionLevel,
                            isLeaving ? motionDuration.fast : motionDuration.control,
                          ),
                        },
                      }
                    : { duration: 0 }
                }
                style={{
                  // 只给正在进出场的活跃层挂 will-change；邻居不提升合成层。
                  willChange: animating
                    ? motionLevel === 'full'
                      ? 'transform, opacity, filter'
                      : 'transform, opacity'
                    : 'auto',
                  contain: 'layout paint',
                }}
                aria-hidden={!isActive}
                inert={!isActive}
                tabIndex={isActive ? -1 : undefined}
              >
                <SectionReadyProvider isReady={isActive && navigation.contentReady}>
                  <SectionFrame sectionId={section.id}>
                    <SectionContent sectionId={section.id} />
                  </SectionFrame>
                </SectionReadyProvider>
              </SectionScrollHost>
            );
          })}
        </BlogSectionProvider>
      </SectionAppProvider>
    </main>
  );
});
