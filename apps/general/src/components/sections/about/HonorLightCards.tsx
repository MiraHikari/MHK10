import { motion } from 'motion/react';
import type { HonorItem, HonorTier } from '@/data/profile';
import { honorTierMeta } from '@/data/profile';
import ArrowUpRightIcon from '~icons/lucide/arrow-up-right';
import ZoomInIcon from '~icons/lucide/zoom-in';
import LandmarkIcon from '~icons/lucide/landmark';
import SiteImage from '@/components/ui/SiteImage';
import { motionEase, springHover } from '@/lib/motion';
import { prefetchImage } from '@/lib/images/prefetch';

/* ------------------------------------------------------------------ */
/*  Light (paper) variants of the retired honors/ components — used by */
/*  AboutSection's AWARDS area. Honors were merged into About, so these */
/*  keep the command-target ids of the originals.                       */
/* ------------------------------------------------------------------ */

export function TierBadge({ tier }: { readonly tier: HonorTier }) {
  const meta = honorTierMeta[tier];
  const styles =
    tier === 'national'
      ? 'bg-accent-base text-accent-on border-accent-base'
      : tier === 'provincial'
        ? 'bg-neutral-950 text-white border-neutral-950'
        : 'bg-transparent text-gray-500 border-gray-300';

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold font-mono uppercase tracking-[0.2em] border ${styles}`}
    >
      <span className="inline-block w-1.5 h-1.5 bg-current" />
      {meta.label}
    </span>
  );
}

export function IssuerBlock({ honor }: { readonly honor: HonorItem }) {
  return (
    <div className="flex items-start gap-3">
      {/* 盖章式图标框：accent 边框 + wash 底，与 TierBadge 的方块语言呼应 */}
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center border border-accent-base bg-accent-wash text-accent-ink transition-colors duration-300 group-hover:border-accent-line">
        <LandmarkIcon width={14} height={14} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="mb-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.3em] text-gray-400">
          ISSUED BY
          <span className="h-px flex-1 bg-gray-200" aria-hidden="true" />
        </p>
        <p className="text-xs font-harmonyos font-medium text-gray-700 leading-relaxed break-words">
          {honor.issuerShort ?? honor.issuer}
        </p>
      </div>
    </div>
  );
}

import { useSectionReady } from '@/components/motion/SectionReadyContext';

interface HonorCardProps {
  readonly honor: HonorItem;
  readonly index: number;
}

interface HighlightCardProps extends HonorCardProps {
  readonly total: number;
  /** 打开该卡片图片的灯箱（AboutSection 注入；无图卡片不传）。 */
  readonly onOpenImage?: () => void;
}

export function HighlightCard({ honor, index, total, onOpenImage }: HighlightCardProps) {
  const isReady = useSectionReady();

  return (
    <motion.article
      data-command-target={`honor-${index}`}
      className="relative border bg-white overflow-hidden group transition-colors duration-300 border-gray-200 border-l-2 border-l-accent-base hover:border-gray-300 hover:bg-black/[0.02] hover:ring-1 hover:ring-accent-line"
      initial={{ y: 15, opacity: 0 }}
      animate={isReady ? { y: 0, opacity: 1 } : { y: 15, opacity: 0 }}
      transition={{
        duration: 0.5,
        delay: 0.35 + index * 0.06,
        ease: motionEase,
      }}
      whileHover={{
        y: -4,
        transition: springHover,
      }}
    >
      <div className="absolute top-0 left-0 right-0 h-1 bg-accent-base" />
      {honor.imageSrc ? (
        <button
          type="button"
          onClick={onOpenImage}
          onPointerEnter={() => prefetchImage(honor.imageSrc)}
          onFocus={() => prefetchImage(honor.imageSrc)}
          aria-label={`查看高分辨率图片：${honor.title}`}
          data-cursor="VIEW"
          className="relative block w-full text-left aspect-[16/9] overflow-hidden border-b border-gray-200 bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-base focus-visible:ring-inset"
        >
          <SiteImage
            src={honor.imageSrc}
            alt={honor.imageAlt ?? ''}
            width={1280}
            height={720}
            loading="lazy"
            wrapperClassName="h-full w-full"
            className="h-full w-full object-cover group-hover:scale-[1.02] transition-[opacity,transform] duration-500 group-hover:will-change-transform"
          />
          <div className="absolute inset-0 bg-linear-to-t from-white via-transparent to-transparent pointer-events-none" />
          <span className="absolute right-4 top-4 inline-flex items-center gap-1.5 border border-white/35 bg-black/45 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-label text-white/75 backdrop-blur-sm">
            View <ZoomInIcon className="h-3 w-3" />
          </span>
        </button>
      ) : (
        <div className="relative flex aspect-[16/5] items-end justify-between overflow-hidden border-b border-gray-200 bg-accent-wash px-6 pb-5 pt-8 md:px-8">
          <span
            aria-hidden="true"
            className="absolute -right-4 -top-8 font-mono text-[7rem] leading-none text-accent-ink/10 md:text-[9rem]"
          >
            {honor.date}
          </span>
          <div className="relative flex flex-col gap-2">
            <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent-ink">
              // {honor.kind === 'industry' ? 'INDUSTRY AWARD' : 'HIGHLIGHT AWARD'}
            </span>
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-500">
              {honor.issuerShort ?? honor.issuer}
            </span>
          </div>
          <span className="relative font-mono text-4xl leading-none text-accent-ink md:text-5xl">
            {honor.date}
          </span>
        </div>
      )}
      <div className="p-6 md:p-8">
        <div className="flex items-center justify-between gap-4 mb-5">
          <span className="text-[10px] font-mono text-gray-400 tabular-nums">
            {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
          </span>
          <div className="flex items-center gap-2">
            {honor.kind === 'industry' && (
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-500 font-bold border border-gray-200 px-2 py-1">
                INDUSTRY
              </span>
            )}
            <TierBadge tier={honor.tier} />
          </div>
        </div>
        <h3 className="text-xl md:text-2xl lg:text-3xl font-normal text-neutral-950 font-serif leading-tight mb-4 group-hover:text-accent-ink transition-colors duration-300">
          {honor.title}
        </h3>
        <p className="text-sm text-gray-500 leading-relaxed mb-6">{honor.description}</p>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs uppercase tracking-[0.2em] text-accent-ink font-bold font-mono">
            {honor.level}
          </span>
          <span className="text-[10px] font-mono text-gray-400 tabular-nums ml-auto">
            {honor.date}
          </span>
        </div>
        <div className="h-px bg-gray-100 mb-4" />
        <IssuerBlock honor={honor} />
        {honor.sourceUrl && (
          <a
            href={honor.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-label text-accent-ink transition-colors hover:text-neutral-950"
          >
            {honor.sourceLabel ?? '查看来源'}
            <ArrowUpRightIcon className="h-3 w-3" />
          </a>
        )}
      </div>
    </motion.article>
  );
}

export function StandardCard({ honor, index }: HonorCardProps) {
  const isReady = useSectionReady();
  const tierAccent =
    honor.tier === 'national'
      ? 'border-l-accent-base'
      : honor.tier === 'provincial'
        ? 'border-l-neutral-950'
        : 'border-l-gray-300';

  return (
    <motion.article
      data-command-target={`honor-${index}`}
      className={`relative border border-l-2 ${tierAccent} bg-white p-6 md:p-7 group transition-colors duration-300 border-gray-200 hover:border-gray-300 hover:bg-black/[0.02] hover:ring-1 hover:ring-accent-line`}
      initial={{ y: 15, opacity: 0 }}
      animate={isReady ? { y: 0, opacity: 1 } : { y: 15, opacity: 0 }}
      transition={{
        duration: 0.5,
        delay: 0.35 + index * 0.06,
        ease: motionEase,
      }}
      whileHover={{
        y: -4,
        transition: springHover,
      }}
    >
      <div className="flex items-center justify-between gap-4 mb-5">
        <span className="text-[10px] font-mono text-gray-400 tabular-nums">
          {String(index + 1).padStart(2, '0')}
        </span>
        <TierBadge tier={honor.tier} />
      </div>
      <h3 className="text-base md:text-lg font-normal text-neutral-950 font-serif leading-snug mb-3 group-hover:text-accent-ink transition-colors duration-300">
        {honor.title}
      </h3>
      <p className="text-sm text-gray-500 leading-relaxed mb-5">{honor.description}</p>
      <div className="flex items-center justify-between gap-4 mb-4">
        <span className="text-xs uppercase tracking-[0.2em] text-accent-ink font-bold font-mono">
          {honor.level}
        </span>
        <span className="text-[10px] font-mono text-gray-400 tabular-nums">{honor.date}</span>
      </div>
      <div className="h-px bg-gray-100 mb-3" />
      <IssuerBlock honor={honor} />
    </motion.article>
  );
}
