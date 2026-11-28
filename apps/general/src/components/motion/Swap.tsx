import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { hide, shown } from '@/hooks/useSectionAnimations';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import { motionDuration, motionEase } from '@/lib/motion';

interface SwapProps {
  readonly children: ReactNode;
  readonly itemKey: string | number;
  readonly className?: string;
  /**
   * 布局动画：小列表（技能筛选）保留；上百行的结果列表关闭——motion 会
   * 逐个子项测量并克隆退出子树，成本远大于一次交叉淡入。
   */
  readonly layout?: boolean;
}

/**
 * Cross-fade / layout swap for filters, palette results, and similar keyed content.
 * Uses blur→focus pose language and `AnimatePresence mode="popLayout"`.
 */
export function Swap({ children, itemKey, className, layout = true }: SwapProps) {
  const { reducedMotion } = useMediaCapabilities();

  return (
    <AnimatePresence mode="popLayout">
      <motion.div
        key={itemKey}
        className={className}
        initial={reducedMotion ? false : hide}
        animate={shown}
        exit={reducedMotion ? undefined : hide}
        transition={{
          duration: reducedMotion ? 0 : motionDuration.filter,
          ease: motionEase,
        }}
        layout={layout && !reducedMotion}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
