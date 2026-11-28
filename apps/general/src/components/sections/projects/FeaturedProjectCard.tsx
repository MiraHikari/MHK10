import { useEffect, type Ref } from 'react';
import { motion, useIsPresent, useMotionTemplate, useMotionValue, useSpring } from 'motion/react';
import ArrowUpRightIcon from '~icons/lucide/arrow-up-right';
import Code2Icon from '~icons/lucide/code-xml';
import ExpandIcon from '~icons/lucide/expand';
import { Badge } from '@/components/ui/badge';
import SiteImage from '@/components/ui/SiteImage';
import { formatProjectDate, type Project } from '@/lib/projects/types';
import { durationFor, motionDuration, motionEase, springHover, springParallax } from '@/lib/motion';
import { shouldRenderEager } from '@/lib/images/prefetch';
import { useClientFlag } from '@/hooks/useClientFlag';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';

/** 主图 accent 描边 + 辉光：让深色品牌图从卡片底色里浮出来。 */
const ACCENT_FRAME =
  '0 0 0 1px color-mix(in srgb, var(--section-accent) 30%, transparent), ' +
  '0 12px 48px -16px color-mix(in srgb, var(--section-accent) 45%, transparent)';

/** 显式变体：移动端 stack 卡 vs 桌面精选卡（原 `compact: boolean` 的 20+ 分支）。 */
export type FeaturedCardVariant = 'compact' | 'featured';

interface FeaturedCardStyles {
  readonly title: string;
  readonly body: string;
  readonly padding: string;
  readonly number: string;
  readonly fallbackNumber: string;
  readonly article: string;
  readonly imageClass: string;
  /** 入场动画时长：紧凑卡跟随列表节奏，精选卡跟随章节节奏。 */
  readonly transitionDuration: number;
  readonly tagClass: string;
  readonly expandClass: string;
  readonly expandIconClass: string;
  readonly linkClass: string;
  readonly linkIconClass: string;
}

const CARD_STYLES: Record<FeaturedCardVariant, FeaturedCardStyles> = {
  compact: {
    title: 'text-xl font-bold text-ink-on-dark mb-3 font-sans',
    body: 'text-gray-400 text-sm leading-relaxed mb-4 flex-1',
    padding: 'p-6',
    number: 'absolute left-4 top-3 text-[4rem] font-normal text-white/10 font-mono leading-none',
    fallbackNumber: 'text-[4rem] font-normal text-white/5 font-mono leading-none p-6 pb-0',
    article: 'group bg-neutral-900 border border-white/8 flex flex-col overflow-hidden',
    imageClass: 'h-full w-full object-cover',
    transitionDuration: motionDuration.control,
    tagClass: 'text-[10px]',
    expandClass:
      'absolute right-3 top-3 inline-flex items-center gap-1 px-2 py-1 bg-black/50 backdrop-blur-sm border border-white/15 text-[9px] font-mono uppercase tracking-[0.2em] text-white/70',
    expandIconClass: 'w-2.5 h-2.5',
    linkClass: 'text-[10px]',
    linkIconClass: 'w-3 h-3',
  },
  featured: {
    title: 'text-2xl md:text-3xl font-bold text-ink-on-dark mb-4 font-sans',
    body: 'text-gray-400 text-sm leading-relaxed mb-6 flex-1',
    padding: 'p-6 md:p-8',
    number:
      'absolute left-4 top-3 text-[5rem] md:text-[6rem] font-normal text-white/10 font-mono leading-none',
    fallbackNumber:
      'text-[5rem] md:text-[7rem] font-normal text-white/5 font-mono leading-none p-8 md:p-10 pb-0',
    article: 'group bg-neutral-900 border border-white/8 h-full flex flex-col overflow-hidden',
    imageClass:
      'h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-500',
    transitionDuration: motionDuration.sectionEnter,
    tagClass: 'text-xs',
    expandClass:
      'absolute right-4 top-4 inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-black/50 backdrop-blur-sm border border-white/15 text-[10px] font-mono uppercase tracking-[0.25em] text-white/70',
    expandIconClass: 'w-3 h-3',
    linkClass: 'text-xs',
    linkIconClass: 'w-3.5 h-3.5',
  },
};

interface FeaturedProjectCardProps {
  readonly ref?: Ref<HTMLElement>;
  readonly project: Project;
  readonly index: number;
  readonly direction: number;
  readonly variant: FeaturedCardVariant;
  readonly reducedMotion: boolean;
  readonly onOpenLightbox: (index: number) => void;
}

export function FeaturedProjectCard({
  ref,
  project,
  index,
  direction,
  variant,
  reducedMotion,
  onOpenLightbox,
}: FeaturedProjectCardProps) {
  const { finePointer, motionLevel } = useMediaCapabilities();
  const isPresent = useIsPresent();
  const styles = CARD_STYLES[variant];
  const isFeatured = variant === 'featured';
  // 省流 / 2G 弱网时 Featured 主图也降为 lazy。
  const eager = useClientFlag(shouldRenderEager);
  // 品牌舞台：仅桌面精选卡 + 精细指针 + full 档开启倾斜/光泽跟随。
  const stageInteractive = isFeatured && !reducedMotion && finePointer && motionLevel === 'full';

  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const rotateX = useSpring(tiltX, springParallax);
  const rotateY = useSpring(tiltY, springParallax);
  const glareX = useMotionValue(50);
  const glareY = useMotionValue(50);
  const glare = useMotionTemplate`radial-gradient(240px circle at ${glareX}% ${glareY}%, color-mix(in srgb, var(--section-accent-soft) 28%, transparent), transparent 70%)`;
  useEffect(() => {
    if (stageInteractive) return;
    tiltX.set(0);
    tiltY.set(0);
  }, [stageInteractive, tiltX, tiltY]);

  // 「思绪浮现」换场：blur → 聚焦，方向只决定浮现的垂直来向。
  const enterY = direction >= 0 ? 16 : -16;

  return (
    <motion.article
      ref={ref}
      key={project.id}
      data-featured-project={project.id}
      inert={!isPresent}
      aria-hidden={!isPresent}
      custom={direction}
      className={styles.article}
      initial={reducedMotion ? false : { opacity: 0, y: enterY }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reducedMotion ? 0 : -enterY, pointerEvents: 'none' }}
      transition={{
        duration: durationFor(motionLevel, styles.transitionDuration),
        ease: motionEase,
      }}
      whileHover={
        stageInteractive
          ? {
              y: -4,
              transition: springHover,
            }
          : undefined
      }
    >
      {project.image ? (
        <motion.button
          type="button"
          onClick={() => onOpenLightbox(index)}
          onPointerMove={(event) => {
            if (!stageInteractive) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const px = (event.clientX - rect.left) / rect.width;
            const py = (event.clientY - rect.top) / rect.height;
            tiltX.set((0.5 - py) * 7);
            tiltY.set((px - 0.5) * 9);
            glareX.set(px * 100);
            glareY.set(py * 100);
          }}
          onPointerLeave={() => {
            tiltX.set(0);
            tiltY.set(0);
          }}
          className="relative aspect-[16/9] lg:aspect-[16/10] bg-black overflow-hidden border-b border-white/8 block w-full cursor-pointer focus-visible:outline-2 focus-visible:[outline-offset:-2px] focus-visible:outline-accent-base"
          style={
            stageInteractive
              ? { rotateX, rotateY, transformPerspective: 900, boxShadow: ACCENT_FRAME }
              : { boxShadow: ACCENT_FRAME }
          }
          aria-label={`放大查看 ${project.title}`}
        >
          <SiteImage
            key={project.image}
            src={project.image ?? ''}
            alt={project.title}
            width={1920}
            height={768}
            loading={isFeatured ? (eager ? 'eager' : 'lazy') : 'lazy'}
            wrapperClassName="h-full w-full"
            className={styles.imageClass}
          />
          <div className="absolute inset-0 bg-linear-to-t from-neutral-900/70 via-transparent to-transparent pointer-events-none" />
          {stageInteractive && (
            <motion.div
              className="pointer-events-none absolute inset-0 mix-blend-screen opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{ background: glare }}
              aria-hidden="true"
            />
          )}
          <span className={styles.number}>{String(index + 1).padStart(2, '0')}</span>
          <span className={styles.expandClass}>
            <ExpandIcon className={styles.expandIconClass} />
            Expand
          </span>
        </motion.button>
      ) : (
        <span className={styles.fallbackNumber}>{String(index + 1).padStart(2, '0')}</span>
      )}

      <div className={`${styles.padding} flex flex-col flex-1`}>
        <div className="flex items-center gap-2 mb-4 text-[10px] font-mono uppercase tracking-[0.3em] text-accent-ink">
          <span className="inline-block w-3 h-2 bg-accent-base -skew-x-12" />
          <span>{project.featured ? 'FEATURED' : 'PROJECT'}</span>
          <time dateTime={project.date} className="ml-auto text-white/35 tabular-nums">
            {formatProjectDate(project.date)}
          </time>
        </div>
        <h3 className={styles.title}>{project.title}</h3>
        <p className={styles.body}>{project.description}</p>
        <div className={`flex flex-wrap ${isFeatured ? 'gap-2 mb-6' : 'gap-1.5 mb-4'}`}>
          {project.tags.map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className={`border-white/10 text-gray-400 rounded-none ${styles.tagClass}`}
            >
              {tag}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {project.link && (
            <a
              href={project.link}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.linkClass} min-h-11 inline-flex items-center gap-1.5 uppercase tracking-widest text-accent-ink font-bold hover:text-white transition-colors duration-300`}
            >
              <ArrowUpRightIcon className={styles.linkIconClass} />
              Visit
            </a>
          )}
          {project.github && (
            <a
              href={project.github}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.linkClass} min-h-11 inline-flex items-center gap-1.5 uppercase tracking-widest text-white/50 hover:text-accent-ink transition-colors duration-300`}
            >
              <Code2Icon className={styles.linkIconClass} />
              Code
            </a>
          )}
        </div>
      </div>
    </motion.article>
  );
}
