import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { ProjectCardSlide } from 'yet-another-react-lightbox';
import ArrowUpRightIcon from '~icons/lucide/arrow-up-right';
import Code2Icon from '~icons/lucide/code-xml';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import { motionDuration, motionEase as EASE } from '@/lib/motion';
import { resolveImageSrc } from '@/lib/images/url';
import ThinkingState from '@/components/ui/ThinkingState';
import { padCount } from './chrome';

export type ProjectCardSlideType = ProjectCardSlide;

/** 项目详情卡片 slide：媒体 + 详情双栏，入场 reveal 保留原编排。 */
export function ProjectCardSlideView({ slide }: { readonly slide: ProjectCardSlideType }) {
  const { reducedMotion } = useMediaCapabilities();
  const [imageReady, setImageReady] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const item = slide.item;
  const duration = reducedMotion ? 0 : motionDuration.lightbox;

  // 若图片已被缓存，挂载时 load 事件可能已错过，直接检查 complete。
  const resolvedSrc = resolveImageSrc(item.imageSrc);
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      setImageReady(true);
    }
  }, [resolvedSrc]);

  return (
    <motion.div
      className="relative grid max-h-[86vh] w-full max-w-5xl overflow-y-auto border border-white/10 bg-neutral-925 md:overflow-hidden md:grid-cols-[1.15fr_0.85fr]"
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration, ease: EASE }}
    >
      {/* Media side */}
      <div className="relative min-h-55 max-h-[36vh] overflow-hidden bg-black md:max-h-none md:min-h-120">
        {!imageReady && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/25">
            <ThinkingState dark compact />
          </div>
        )}
        <motion.img
          ref={imgRef}
          src={resolvedSrc}
          alt={item.imageAlt}
          decoding="async"
          draggable={false}
          className="h-full w-full object-cover"
          initial={reducedMotion ? false : { scale: 1.06, opacity: 0.6 }}
          animate={{ scale: 1, opacity: imageReady ? 1 : 0.22 }}
          transition={{ duration, ease: EASE }}
          onLoad={() => setImageReady(true)}
          onError={() => setImageReady(true)}
        />
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-neutral-925 via-transparent to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-linear-to-r from-transparent to-neutral-925/30" />
        <span className="absolute left-5 top-5 text-micro font-mono uppercase tracking-label text-white/40">
          // {item.category}
        </span>
      </div>

      {/* Detail side（select-text 抵消 YARL 容器的 user-select:none） */}
      <div className="flex select-text flex-col overflow-y-auto p-6 md:p-8">
        <div className="mb-4 flex items-center gap-3 text-micro font-mono uppercase tracking-eyebrow text-accent-ink">
          <span className="inline-block h-2 w-3 -skew-x-12 bg-accent-base" />
          <span>PROJECT</span>
          <span className="ml-auto text-white/30 tabular-nums">
            {padCount(slide.position + 1)} / {padCount(slide.total)}
          </span>
        </div>

        <motion.h3
          className="mb-4 text-2xl font-normal leading-tight text-ink-on-dark text-display md:text-3xl"
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration, delay: reducedMotion ? 0 : 0.08, ease: EASE }}
        >
          {item.title}
        </motion.h3>

        {item.location && (
          <p className="mb-5 text-xs font-mono text-accent-ink">
            {item.location}
            {item.year ? ` · ${item.year}` : ''}
          </p>
        )}

        {item.description && (
          <motion.p
            className="mb-6 text-sm leading-relaxed text-gray-400"
            initial={reducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration, delay: reducedMotion ? 0 : 0.14, ease: EASE }}
          >
            {item.description}
          </motion.p>
        )}

        {item.tags && item.tags.length > 0 && (
          <motion.div
            className="mb-6 flex flex-wrap gap-1.5"
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: {
                transition: {
                  staggerChildren: reducedMotion ? 0 : 0.04,
                  delayChildren: reducedMotion ? 0 : 0.2,
                },
              },
            }}
          >
            {item.tags.map((tag) => (
              <motion.span
                key={tag}
                variants={{
                  hidden: { opacity: 0, y: reducedMotion ? 0 : 4 },
                  visible: { opacity: 1, y: 0 },
                }}
                transition={{ duration: reducedMotion ? 0 : 0.3, ease: EASE }}
                className="border border-white/12 px-2.5 py-1 font-mono text-caption uppercase tracking-wider text-gray-400"
              >
                {tag}
              </motion.span>
            ))}
          </motion.div>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-white/8 pt-5">
          {item.link && (
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 bg-accent-base px-4 py-2 text-caption font-bold uppercase tracking-widest text-white transition-colors duration-300 hover:bg-white hover:text-black"
            >
              <ArrowUpRightIcon className="h-3.5 w-3.5" />
              Visit
            </a>
          )}
          {item.github && (
            <a
              href={item.github}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 border border-white/20 px-4 py-2 text-caption font-bold uppercase tracking-widest text-white/80 transition-colors duration-300 hover:border-accent-base hover:text-accent-ink"
            >
              <Code2Icon className="h-3.5 w-3.5" />
              Code
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}
