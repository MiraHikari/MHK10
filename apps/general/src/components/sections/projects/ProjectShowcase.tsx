import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import ChevronLeftIcon from '~icons/lucide/chevron-left';
import ChevronRightIcon from '~icons/lucide/chevron-right';
import Code2Icon from '~icons/lucide/code-xml';
import type { Project } from '@/lib/projects/types';
import { profile } from '@/data/profile';
import { FeaturedProjectCard } from './FeaturedProjectCard';
import { ProjectQueue } from './ProjectQueue';
import { ProjectGrid } from './ProjectGrid';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import { durationFor, motionDuration, motionEase } from '@/lib/motion';

interface ProjectShowcaseProps {
  readonly projects: readonly Project[];
  readonly featuredIndex: number;
  readonly direction: number;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onSelect: (index: number) => void;
  readonly onOpenLightbox: (index: number) => void;
}

export function ProjectShowcase({
  projects,
  featuredIndex,
  direction,
  onPrevious,
  onNext,
  onSelect,
  onOpenLightbox,
}: ProjectShowcaseProps) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const { reducedMotion, motionLevel, isDesktop } = useMediaCapabilities();
  const [viewMode, setViewMode] = useState<'featured' | 'grid'>('featured');
  const featured = projects[featuredIndex];

  return (
    <div className="w-full" data-project-showcase>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-y border-white/10 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrevious}
            aria-label="上一个项目"
            className="flex h-11 w-11 items-center justify-center border border-white/15 text-white/70 transition-colors hover:border-accent-base hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-accent-base"
          >
            <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="下一个项目"
            className="flex h-11 w-11 items-center justify-center border border-white/15 text-white/70 transition-colors hover:border-accent-base hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-accent-base"
          >
            <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="ml-2 font-mono text-xs tabular-nums text-white/60" aria-live="polite">
            {String(featuredIndex + 1).padStart(2, '0')} /{' '}
            {String(projects.length).padStart(2, '0')}
          </span>
        </div>
        <div
          className="flex items-center border border-white/15"
          role="group"
          aria-label="项目视图"
        >
          {(['featured', 'grid'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              aria-pressed={viewMode === mode}
              className={`min-h-11 px-3 font-mono text-xs transition-colors focus-visible:outline-2 focus-visible:outline-accent-base ${viewMode === mode ? 'bg-accent-base/15 text-accent-soft' : 'text-white/60 hover:text-white'}`}
            >
              {mode === 'featured' ? '精选视图' : '全部项目'}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={viewMode}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: durationFor(motionLevel, motionDuration.fast), ease: motionEase }}
        >
          {viewMode === 'grid' ? (
            <ProjectGrid projects={projects} onOpenLightbox={onOpenLightbox} />
          ) : (
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
              <div
                className="relative min-w-0 touch-pan-y"
                onTouchStart={(event) => {
                  const touch = event.touches.item(0);
                  if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY };
                }}
                onTouchCancel={() => {
                  touchStart.current = null;
                }}
                onTouchEnd={(event) => {
                  const start = touchStart.current;
                  touchStart.current = null;
                  const touch = event.changedTouches.item(0);
                  if (!start || !touch) return;
                  const dx = touch.clientX - start.x;
                  const dy = touch.clientY - start.y;
                  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                    if (dx < 0) onNext();
                    else onPrevious();
                  }
                }}
              >
                <AnimatePresence mode="popLayout" initial={false} custom={direction}>
                  {featured && (
                    <FeaturedProjectCard
                      key={featured.id}
                      project={featured}
                      index={featuredIndex}
                      direction={direction}
                      variant={isDesktop ? 'featured' : 'compact'}
                      reducedMotion={reducedMotion}
                      onOpenLightbox={onOpenLightbox}
                    />
                  )}
                </AnimatePresence>
              </div>
              <ProjectQueue
                projects={projects}
                featuredIndex={featuredIndex}
                onSelect={onSelect}
                onOpenLightbox={onOpenLightbox}
                variant={isDesktop ? 'sidebar' : 'stack'}
              />
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <a
        href={profile.github}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex min-h-11 items-center gap-2 text-xs font-medium text-accent-ink focus-visible:outline-2 focus-visible:outline-accent-base"
      >
        <Code2Icon className="h-4 w-4" aria-hidden="true" />
        更多开源作品 · GitHub
      </a>
    </div>
  );
}
