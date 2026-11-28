import { useMemo } from 'react';
import { motion } from 'motion/react';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import { useSectionReady } from '@/components/motion/SectionReadyContext';

interface SplitHeadingProps {
  readonly text: string;
  /** Boot 仪式等本地驱动时显式传入；缺省读所在章节的 `useSectionReady()`。 */
  readonly isReady?: boolean;
  readonly delay?: number;
  readonly className?: string;
  readonly by?: 'chars' | 'words';
  readonly stagger?: number;
  readonly duration?: number;
  readonly reduced?: boolean;
  readonly level?: 1 | 2;
  /** 章节切换为容器级「散焦 · 聚焦」：true 时整词一次性呈现（保留 CJK
      逐字拆分保证任意断行），逐字 stagger 仅服务 boot 仪式。 */
  readonly static?: boolean;
}

interface SplitUnit {
  readonly value: string;
  readonly key: string;
}

import { motionEase as revealEase } from '@/lib/motion';

function splitText(text: string, by: 'chars' | 'words'): SplitUnit[] {
  if (by === 'words') {
    return text.split(/(\s+)/).map((value, index) => ({ value, key: `${value}-${index}` }));
  }
  // chars 模式：拉丁字母 / 数字的连续段合并为一个渲染单元（inline-block 是
  // 原子盒，内部不会产生断行机会），避免标题在英文单词中间折断；
  // CJK 仍逐字拆分，保留中文任意位置断行的排版规则。
  const units = text.match(/[A-Za-z0-9]+(?:['’._-][A-Za-z0-9]+)*|\s|./gu) ?? [];
  return units.map((value, index) => ({ value, key: `${value}-${index}` }));
}

export default function SplitHeading({
  text,
  isReady: readyOverride,
  delay = 0,
  className = '',
  by = 'chars',
  stagger = 0.025,
  duration = 0.5,
  reduced = false,
  level = 2,
  static: staticMode = false,
}: SplitHeadingProps) {
  const sectionReady = useSectionReady();
  const isReady = readyOverride ?? sectionReady;
  const { reducedMotion: browserReducedMotion } = useMediaCapabilities();
  const units = useMemo(() => splitText(text, by), [by, text]);
  const shouldReduce = reduced || browserReducedMotion;

  const Heading = level === 1 ? 'h1' : 'h2';

  if (staticMode) {
    return (
      <Heading className={className} aria-label={text}>
        {units.map((unit) => (
          <span
            key={unit.key}
            aria-hidden="true"
            className="inline-block"
            style={{ whiteSpace: unit.value.trim() ? 'normal' : 'pre' }}
          >
            {unit.value === ' ' ? '\u00A0' : unit.value}
          </span>
        ))}
      </Heading>
    );
  }

  return (
    <Heading className={className} aria-label={text}>
      {units.map((unit, index) => (
        <motion.span
          key={unit.key}
          aria-hidden="true"
          className="inline-block"
          initial={false}
          animate={isReady ? { y: 0, opacity: 1 } : { y: shouldReduce ? 0 : 20, opacity: 0 }}
          transition={
            shouldReduce
              ? { duration: 0 }
              : { duration, delay: isReady ? delay + index * stagger : 0, ease: revealEase }
          }
          style={{ whiteSpace: unit.value.trim() ? 'normal' : 'pre' }}
        >
          {unit.value === ' ' ? '\u00A0' : unit.value}
        </motion.span>
      ))}
    </Heading>
  );
}
