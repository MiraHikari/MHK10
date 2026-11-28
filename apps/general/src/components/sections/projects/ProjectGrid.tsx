import { motion } from 'motion/react';
import ArrowUpRightIcon from '~icons/lucide/arrow-up-right';
import Code2Icon from '~icons/lucide/code-xml';
import ExpandIcon from '~icons/lucide/expand';
import { Badge } from '@/components/ui/badge';
import SiteImage from '@/components/ui/SiteImage';
import { formatProjectDate, type Project } from '@/lib/projects/types';
import { durationFor, motionDuration, motionEase, springHover } from '@/lib/motion';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import { prefetchImage } from '@/lib/images/prefetch';

interface ProjectGridProps {
  readonly projects: readonly Project[];
  readonly onOpenLightbox: (index: number) => void;
}

/** Complete project grid shared by desktop and phone view switches. */
export function ProjectGrid({ projects, onOpenLightbox }: ProjectGridProps) {
  const { motionLevel, finePointer } = useMediaCapabilities();
  return (
    <motion.div
      key="grid-container"
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 xl:gap-5"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: durationFor(motionLevel, motionDuration.control), ease: motionEase }}
    >
      {projects.map((project, index) => (
        <motion.article
          key={project.id}
          className="group bg-neutral-900 border border-white/8 flex flex-col overflow-hidden"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: durationFor(motionLevel, motionDuration.control),
            ease: motionEase,
            delay: motionLevel === 'reduced' ? 0 : index * 0.055,
          }}
          whileHover={
            finePointer && motionLevel !== 'reduced'
              ? {
                  y: -4,
                  transition: springHover,
                }
              : undefined
          }
        >
          {/* Project image / fallback */}
          {project.image ? (
            <button
              type="button"
              onClick={() => onOpenLightbox(index)}
              onPointerEnter={() => prefetchImage(project.image)}
              onFocus={() => prefetchImage(project.image)}
              className="relative aspect-[16/9] bg-black overflow-hidden border-b border-white/8 block w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-base focus-visible:ring-inset"
              aria-label={`放大查看 ${project.title}`}
            >
              <SiteImage
                src={project.image ?? ''}
                alt={project.title}
                width={640}
                height={360}
                loading="lazy"
                wrapperClassName="h-full w-full"
                className="h-full w-full object-cover opacity-75 group-hover:opacity-100 group-hover:scale-[1.04] transition-[opacity,transform] duration-500"
              />
              <div className="absolute inset-0 bg-linear-to-t from-neutral-900 via-transparent to-transparent pointer-events-none" />
              <span className="absolute left-3 top-3 px-2 py-1 bg-black/45 backdrop-blur-sm border border-white/10 text-4xl font-normal text-white/75 font-mono leading-none group-hover:text-white/95 transition-colors duration-300">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="absolute right-3 top-3 inline-flex items-center gap-1 px-2 py-1 bg-black/50 backdrop-blur-sm border border-white/15 text-[9px] font-mono uppercase tracking-[0.2em] text-white/70 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <ExpandIcon className="w-2.5 h-2.5" />
                Expand
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onOpenLightbox(index)}
              className="relative aspect-[16/9] bg-neutral-925 border-b border-white/8 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-base focus-visible:ring-inset"
              aria-label={`查看 ${project.title} 详情`}
            >
              <span className="text-[4rem] font-normal text-white/25 font-mono leading-none group-hover:text-white/40 transition-colors duration-300">
                {String(index + 1).padStart(2, '0')}
              </span>
            </button>
          )}

          {/* Card body */}
          <div className="p-4 xl:p-5 flex flex-col flex-1">
            <time
              dateTime={project.date}
              className="mb-2 font-mono text-[9px] tabular-nums tracking-[0.18em] text-white/30"
            >
              {formatProjectDate(project.date)}
            </time>
            <h3 className="text-base font-bold text-ink-on-dark mb-2 font-sans leading-relaxed">
              {project.title}
            </h3>
            <p className="text-gray-400 text-sm leading-relaxed mb-3 flex-1">
              {project.description}
            </p>
            <div className="flex flex-wrap gap-1 mb-3">
              {project.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="border-white/10 text-gray-400 rounded-none text-[9px]"
                >
                  {tag}
                </Badge>
              ))}
            </div>
            <div className="flex items-center gap-3 pt-2.5 border-t border-white/8">
              {project.link && (
                <a
                  href={project.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-11 text-xs inline-flex items-center gap-1 uppercase tracking-widest text-accent-ink font-bold hover:text-white transition-colors duration-300"
                >
                  <ArrowUpRightIcon className="w-2.5 h-2.5" />
                  Visit
                </a>
              )}
              {project.github && (
                <a
                  href={project.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-11 text-xs inline-flex items-center gap-1 uppercase tracking-widest text-white/60 hover:text-accent-ink transition-colors duration-300"
                >
                  <Code2Icon className="w-2.5 h-2.5" />
                  Code
                </a>
              )}
            </div>
          </div>
        </motion.article>
      ))}
    </motion.div>
  );
}
