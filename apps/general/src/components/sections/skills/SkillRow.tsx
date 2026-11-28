import { memo, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { SkillItem } from '@/data/profile';
import { useCountUp } from '@/hooks/useCountUp';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import { useSectionReady } from '@/components/motion/SectionReadyContext';
import { motionDuration, motionEase } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { SkillIcon } from './SkillIcon';

interface SkillRowProps {
  readonly skill: SkillItem;
}

function SkillRowComponent({ skill }: SkillRowProps) {
  const isReady = useSectionReady();
  const { ref, value } = useCountUp(skill.level, 1.1, isReady);
  const { finePointer, reducedMotion } = useMediaCapabilities();
  const noteRef = useRef<HTMLSpanElement | null>(null);
  const hideTimer = useRef(0);
  const [notePreview, setNotePreview] = useState(false);
  const years = skill.years ?? 0;

  useEffect(
    () => () => {
      window.clearTimeout(hideTimer.current);
    },
    [],
  );

  // 桌面悬停浮现完整备注；触屏点按也能展开，并在 2.6s 后自行收起。
  const onPointerEnter = () => {
    if (!skill.note) return;
    window.clearTimeout(hideTimer.current);
    const note = noteRef.current;
    if (note && note.scrollWidth > note.clientWidth + 1) setNotePreview(true);
  };
  const onPointerLeave = () => {
    window.clearTimeout(hideTimer.current);
    if (finePointer) {
      setNotePreview(false);
      return;
    }
    hideTimer.current = window.setTimeout(() => setNotePreview(false), 2600);
  };

  return (
    <div
      data-command-target={skill.name}
      className="relative grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-1 py-2 transition-colors duration-200 hover:bg-black/[0.03] sm:grid-cols-[1.25rem_minmax(0,1fr)_auto_minmax(5rem,9rem)]"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <SkillIcon icon={skill.icon} className="h-5 w-5 shrink-0 text-gray-500" />

      <div className="flex min-w-0 items-baseline gap-2">
        <span className="text-sm font-semibold leading-snug text-neutral-950">{skill.name}</span>
        {skill.note && (
          <span ref={noteRef} className="truncate text-xs text-gray-500" title={skill.note}>
            {skill.note}
          </span>
        )}
      </div>

      <span
        className={cn(
          'shrink-0 rounded-sm border px-1.5 py-px font-mono text-caption tabular-nums',
          years === 0 ? 'border-accent-base/40 text-accent-ink' : 'border-black/10 text-gray-500',
        )}
      >
        {years === 0 ? '新' : `${years}y`}
      </span>

      <div className="col-span-2 col-start-2 flex items-center gap-2.5 sm:col-span-1 sm:col-start-auto">
        <div className="h-1 w-full max-w-[7.5rem] overflow-hidden rounded-full bg-black/8">
          <motion.div
            className="h-full w-full origin-left rounded-full bg-accent-base"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: isReady ? skill.level / 100 : 0 }}
            transition={
              reducedMotion ? { duration: 0 } : { duration: motionDuration.meter, ease: motionEase }
            }
          />
        </div>
        <span
          ref={ref}
          className="w-7 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500"
        >
          {value}
        </span>
      </div>

      {/* 截断备注的悬浮全注：思绪浮现式入场，pointer-events 关闭，纯展示 */}
      <AnimatePresence>
        {notePreview && (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-full left-8 z-20 mb-1.5 block max-w-72 rounded-sm border border-black/10 border-l-2 border-l-accent-base bg-white/95 px-2.5 py-1.5 text-left text-xs leading-relaxed text-gray-600 shadow-pop backdrop-blur-sm"
            initial={{ opacity: 0, y: 6, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 4, filter: 'blur(6px)' }}
            transition={{ duration: reducedMotion ? 0 : motionDuration.micro, ease: motionEase }}
          >
            {skill.note}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

/** 技能行：只读 module 数据 + context 就绪标志，memo 让击键过滤时稳定行直接跳过。 */
export default memo(SkillRowComponent);
