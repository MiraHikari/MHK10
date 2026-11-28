import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { motion } from 'motion/react';
import ExpandIcon from '~icons/lucide/expand';
import SiteImage from '@/components/ui/SiteImage';
import { formatProjectDate, type Project } from '@/lib/projects/types';
import { springSnappy } from '@/lib/motion';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';

interface ProjectQueueProps {
  readonly projects: readonly Project[];
  readonly featuredIndex: number;
  readonly onSelect: (index: number) => void;
  readonly onOpenLightbox: (index: number) => void;
  /** "stack" (default) = full-width list below the featured card. "sidebar" = compact scrollable rail for the two-column desktop layout. */
  readonly variant?: 'stack' | 'sidebar';
}

export function ProjectQueue({
  projects,
  featuredIndex,
  onSelect,
  onOpenLightbox,
  variant = 'stack',
}: ProjectQueueProps) {
  const [listOpen, setListOpen] = useState(true);
  const { reducedMotion } = useMediaCapabilities();
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleSidebarKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;

    event.preventDefault();
    const lastIndex = projects.length - 1;
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? lastIndex
          : event.key === 'ArrowDown'
            ? Math.min(featuredIndex + 1, lastIndex)
            : Math.max(featuredIndex - 1, 0);

    onSelect(nextIndex);
    itemRefs.current[nextIndex]?.focus();
  };

  /* Auto-scroll active item into view (sidebar variant only). */
  useEffect(() => {
    if (variant !== 'sidebar' || !listRef.current) return;
    const active = listRef.current.querySelector<HTMLElement>(
      `[data-queue-index="${featuredIndex}"]`,
    );
    if (active) {
      const host = listRef.current;
      const itemTop =
        active.getBoundingClientRect().top - host.getBoundingClientRect().top + host.scrollTop;
      if (
        itemTop < host.scrollTop ||
        itemTop + active.offsetHeight > host.scrollTop + host.clientHeight
      ) {
        host.scrollTo({ top: itemTop, behavior: reducedMotion ? 'instant' : 'smooth' });
      }
    }
  }, [featuredIndex, variant, reducedMotion]);

  /* ---- Sidebar variant ------------------------------------------------ */
  if (variant === 'sidebar') {
    return (
      <div className="flex flex-col h-full min-h-0">
        {/* Sidebar header */}
        <div className="shrink-0 flex items-end justify-between gap-3 px-2 pb-3 mb-1 border-b border-white/8">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.3em] text-accent-ink">
              <span className="inline-block w-3 h-2 bg-accent-base -skew-x-12" />
              <span>ALL PROJECTS</span>
            </div>
            <p className="mt-1.5 text-[9px] font-mono uppercase tracking-[0.16em] text-white/25">
              ↑↓ 切换 · 展开查看详情
            </p>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/30 tabular-nums">
            {String(projects.length).padStart(2, '0')}
          </span>
        </div>

        {/* Scrollable list */}
        <div
          ref={listRef}
          onKeyDown={handleSidebarKeyDown}
          className="flex-1 min-h-0 max-h-[42rem] overflow-y-auto space-y-1 pr-1 overscroll-contain"
          aria-label="全部项目，使用上下方向键切换"
        >
          {projects.map((project, originalIndex) => {
            const isActive = originalIndex === featuredIndex;
            return (
              <div
                key={project.id}
                data-queue-index={originalIndex}
                data-command-target={project.id}
                className={`group relative w-full flex items-stretch text-left transition-[background-color,border-color,color] duration-300 ${
                  isActive
                    ? 'bg-accent-base/12 border border-accent-base/40'
                    : 'border border-transparent hover:bg-white/[0.04]'
                }`}
              >
                {/* Active left bar */}
                {isActive && (
                  <motion.span
                    layoutId="project-sidebar-active"
                    className="pointer-events-none absolute left-0 top-0 bottom-0 w-[2px] bg-accent-base"
                    transition={reducedMotion ? { duration: 0 } : springSnappy}
                  />
                )}

                <button
                  ref={(element) => {
                    itemRefs.current[originalIndex] = element;
                  }}
                  type="button"
                  onClick={() => onSelect(originalIndex)}
                  aria-current={isActive ? 'true' : undefined}
                  className="flex flex-1 min-w-0 items-center gap-3 px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-base focus-visible:ring-inset"
                >
                  {project.image ? (
                    <div
                      className={`shrink-0 w-12 h-12 overflow-hidden border transition-[border-color,opacity] duration-300 ${
                        isActive
                          ? 'border-accent-base/60 ring-1 ring-accent-base/50 opacity-100'
                          : 'border-white/10 opacity-55 group-hover:opacity-85 group-hover:border-white/20'
                      }`}
                    >
                      <SiteImage
                        src={project.image ?? ''}
                        alt=""
                        width={72}
                        height={72}
                        loading="lazy"
                        wrapperClassName="h-full w-full"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : (
                    <span
                      className={`shrink-0 w-12 h-12 flex items-center justify-center font-mono text-lg tabular-nums border transition-[border-color,opacity] duration-300 ${
                        isActive
                          ? 'border-accent-base/30 text-accent-ink bg-accent-base/10'
                          : 'border-white/8 text-white/20 bg-white/[0.02]'
                      }`}
                    >
                      {String(originalIndex + 1).padStart(2, '0')}
                    </span>
                  )}

                  <div className="flex-1 min-w-0 text-left">
                    <span
                      title={project.title}
                      className={`block text-left text-[13px] font-bold font-sans leading-snug transition-colors duration-300 ${
                        isActive
                          ? 'text-accent-soft'
                          : 'text-ink-on-dark group-hover:text-accent-soft'
                      }`}
                    >
                      {project.title}
                    </span>
                    <div className="flex flex-wrap justify-start gap-x-2 gap-y-0.5 mt-1">
                      {project.tags.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className={`text-[10px] font-mono uppercase tracking-wider transition-colors duration-300 ${
                            isActive
                              ? 'text-accent-ink/70'
                              : 'text-white/25 group-hover:text-white/45'
                          }`}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <time
                    dateTime={project.date}
                    className={`shrink-0 font-mono text-[9px] tabular-nums transition-colors duration-300 ${
                      isActive
                        ? 'text-accent-ink font-bold'
                        : 'text-white/20 group-hover:text-white/40'
                    }`}
                  >
                    {formatProjectDate(project.date)}
                  </time>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenLightbox(originalIndex)}
                  data-cursor="OPEN"
                  aria-label={`查看 ${project.title} 详情`}
                  title="查看项目详情"
                  className={`shrink-0 w-11 min-h-11 flex items-center justify-center border-l transition-[background-color,border-color,color] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-base focus-visible:ring-inset ${
                    isActive
                      ? 'border-accent-base/30 text-accent-soft hover:bg-accent-base/15 hover:text-white'
                      : 'border-white/8 text-white/60 hover:bg-white/[0.05] hover:text-accent-soft'
                  }`}
                >
                  <ExpandIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ---- Stack variant (original) --------------------------------------- */
  return (
    <div className="w-full flex flex-col">
      <button
        type="button"
        className="lg:hidden flex items-center justify-between w-full py-3 px-4 bg-white/[0.03] border border-white/8 text-left text-xs font-mono uppercase tracking-[0.2em] text-white/60"
        onClick={() => setListOpen((value) => !value)}
        aria-expanded={listOpen}
      >
        <span>ALL PROJECTS / 全部项目 ({projects.length})</span>
        <span className={`transition-transform duration-300 ${listOpen ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>

      <div className="hidden lg:flex items-center justify-between px-5 pb-3 mb-1 border-b border-white/8">
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.3em] text-accent-ink">
          <span className="inline-block w-3 h-2 bg-accent-base -skew-x-12" />
          <span>ALL PROJECTS / 全部项目</span>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/30 tabular-nums">
          {String(projects.length).padStart(2, '0')} ITEMS
        </span>
      </div>

      <div
        ref={listRef}
        onKeyDown={handleSidebarKeyDown}
        className={`flex flex-col gap-3 ${listOpen ? 'flex' : 'hidden'} lg:flex`}
      >
        {projects.map((project, originalIndex) => {
          const isActive = originalIndex === featuredIndex;
          return (
            <div
              key={project.id}
              data-command-target={project.id}
              className={`group relative flex w-full items-stretch overflow-hidden border text-left transition-[transform,background-color,border-color] duration-300 ${
                isActive
                  ? 'border-accent-base bg-accent-base/10 -translate-y-0.5'
                  : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/15 hover:translate-x-1'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="project-active-bar"
                  className="pointer-events-none absolute left-0 top-0 bottom-0 w-1 bg-accent-base"
                  transition={reducedMotion ? { duration: 0 } : springSnappy}
                />
              )}

              {/* 选中按钮：承接整行的选中 / 双击语义。与详情按钮平级，
                  避免 <button> 嵌套（非法 HTML，React 水合报错）。 */}
              <button
                ref={(element) => {
                  itemRefs.current[originalIndex] = element;
                }}
                type="button"
                data-cursor="GO"
                onClick={() => {
                  onSelect(originalIndex);
                }}
                onDoubleClick={() => onOpenLightbox(originalIndex)}
                aria-current={isActive ? 'true' : undefined}
                className="flex min-w-0 flex-1 items-center gap-4 px-4 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-base md:gap-5 md:px-6 md:py-5"
              >
                <span
                  className={`shrink-0 w-8 md:w-10 font-mono text-sm md:text-base tabular-nums transition-colors duration-300 ${
                    isActive ? 'text-accent-ink' : 'text-white/30 group-hover:text-accent-ink'
                  }`}
                >
                  {String(originalIndex + 1).padStart(2, '0')}
                </span>

                {project.image && (
                  <div
                    className={`hidden md:block shrink-0 w-14 h-14 overflow-hidden border transition-[border-color,opacity] duration-300 ${
                      isActive
                        ? 'border-accent-base/60 opacity-100'
                        : 'border-white/10 opacity-50 group-hover:opacity-100 group-hover:border-white/25'
                    }`}
                  >
                    <SiteImage
                      src={project.image ?? ''}
                      alt={project.title}
                      width={96}
                      height={96}
                      loading="lazy"
                      wrapperClassName="h-full w-full"
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <span
                    className={`block text-sm md:text-base font-bold font-sans leading-relaxed transition-colors duration-300 ${
                      isActive ? 'text-accent-ink' : 'text-ink-on-dark group-hover:text-accent-ink'
                    }`}
                  >
                    {project.title}
                  </span>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                    {project.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className={`text-[10px] font-mono uppercase tracking-wider transition-colors duration-300 ${
                          isActive
                            ? 'text-accent-ink/70'
                            : 'text-white/30 group-hover:text-white/50'
                        }`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <span
                  className={`shrink-0 text-base md:text-lg transition-[color,transform] duration-300 ${
                    isActive
                      ? 'text-accent-ink'
                      : 'text-white/20 group-hover:text-accent-ink group-hover:translate-x-1'
                  }`}
                >
                  →
                </span>
              </button>

              {/* 详情按钮：stack 变体此前只有双击可打开灯箱，键盘/读屏
                  无法触达。显式按钮让 Enter/Space 与点击都有可靠路径。 */}
              <button
                type="button"
                onClick={() => onOpenLightbox(originalIndex)}
                data-cursor="OPEN"
                aria-label={`查看 ${project.title} 详情`}
                title="查看项目详情"
                className="flex min-h-11 w-11 shrink-0 items-center justify-center self-stretch border-l border-white/10 text-white/35 transition-colors duration-300 hover:border-accent-base/50 hover:text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-base"
              >
                <ExpandIcon className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
