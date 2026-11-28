import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { hide, shown } from '@/hooks/useSectionAnimations';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import { motionDuration, motionEase } from '@/lib/motion';
import { useZenMode } from '@/lib/blog/reading-prefs';

interface ZenBlockProps {
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * 专注模式折叠区块的动效包装：zen 开启时以「散焦 · 聚焦」姿态（blur + 淡出）
 * 退场，关闭时聚焦回来。区块保持挂载（评论 iframe / 相关文章状态不丢），
 * 淡出相位结束后的 display:none 布局折叠由 html.reading-zen 规则承接，
 * 该时序与 ReadingPrefsControls 的折叠时钟共用 motionDuration.control。
 * reduced 档退化为普通 div（折叠类仍即时生效）。
 */
export default function ZenBlock({ children, className }: ZenBlockProps) {
  const zen = useZenMode();
  const { reducedMotion } = useMediaCapabilities();

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={false}
      animate={zen ? hide : shown}
      transition={{ duration: motionDuration.control, ease: motionEase }}
      aria-hidden={zen || undefined}
      style={zen ? { pointerEvents: 'none' } : undefined}
    >
      {children}
    </motion.div>
  );
}
