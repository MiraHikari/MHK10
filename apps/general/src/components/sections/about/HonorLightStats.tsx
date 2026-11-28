import { motion } from 'motion/react';
import { honorTierMeta, type HonorItem } from '@/data/profile';
import { useCountUp } from '@/hooks/useCountUp';
import { useSectionReady } from '@/components/motion/SectionReadyContext';
import { motionEase } from '@/lib/motion';

/* Light (paper) variants of the retired honors/ stats + timeline rows. */

export function HonorStat({ value, label }: { readonly value: number; readonly label: string }) {
  const isReady = useSectionReady();
  const { ref, value: count } = useCountUp(value, 1.4, isReady);

  return (
    <div className="flex flex-col gap-1">
      <span
        ref={ref}
        className="text-3xl md:text-4xl lg:text-5xl font-black text-accent-ink tabular-nums leading-none"
      >
        {count}
      </span>
      <span className="text-[10px] uppercase tracking-[0.3em] text-gray-500 font-bold mt-2">
        {label}
      </span>
    </div>
  );
}

export function TimelineRow({
  honor,
  index,
  delayIndex = index,
}: {
  readonly honor: HonorItem;
  /** 用于 data-command-target 与命令面板高亮对齐（honors 原始数组位置）。 */
  readonly index: number;
  /** 入场阶梯序号（视觉顺序），默认与 index 相同。 */
  readonly delayIndex?: number;
}) {
  const isReady = useSectionReady();
  const dotBase =
    honor.tier === 'national'
      ? 'bg-accent-base border-accent-base'
      : honor.tier === 'provincial'
        ? 'bg-white border-2 border-neutral-950'
        : 'bg-white border-2 border-gray-300';

  return (
    <motion.li
      data-command-target={`honor-${index}`}
      className="group relative pl-8 pb-6 last:pb-0 cursor-pointer"
      initial={{ x: -10, opacity: 0 }}
      animate={isReady ? { x: 0, opacity: 1 } : { x: -10, opacity: 0 }}
      transition={{
        duration: 0.5,
        delay: 0.4 + delayIndex * 0.05,
        ease: motionEase,
      }}
    >
      {/* hover 底色用独立覆盖层外扩，不改 li 的 padding/margin——否则绝对定位的
          节点圆点会随 pl-8 被 hover:px-2 覆盖而压到标题上（错位）。 */}
      <span
        className="pointer-events-none absolute -inset-x-2 inset-y-0 rounded-sm bg-black/[0.03] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        aria-hidden="true"
      />
      <span
        className={`absolute left-0 top-1.5 w-3 h-3 ${dotBase} group-hover:bg-accent-base group-hover:border-accent-base group-hover:ring-2 group-hover:ring-accent-line`}
      />
      <span className="absolute left-[5.5px] top-4.5 bottom-0 w-px bg-gray-200" />
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
        <span className="text-xs font-mono tabular-nums text-accent-ink group-hover:text-accent-base">
          {honor.date}
        </span>
        <span className="text-[10px] font-mono text-gray-400 uppercase tracking-[0.2em]">
          {honorTierMeta[honor.tier].zh}
        </span>
      </div>
      <h4 className="text-sm font-bold leading-snug mb-1 text-neutral-950 group-hover:text-accent-ink">
        {honor.title}
      </h4>
      <p className="text-xs text-gray-500 font-mono uppercase tracking-wider">{honor.level}</p>
    </motion.li>
  );
}
