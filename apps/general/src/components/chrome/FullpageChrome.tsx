import { memo, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { springStiff, springTrail } from '@/lib/motion';
import WatermarkLayer, { type WatermarkLayerProps } from '@/components/chrome/WatermarkLayer';

interface SectionIndicatorProps {
  current: number;
  total: number;
}

const dotSize = 4;
const dotGap = 12;
const dotStep = dotSize + dotGap;
const indicatorHeight = 20;
const indicatorPadding = (indicatorHeight - dotSize) / 2;

function SectionDots({ current, total, isDark }: SectionIndicatorProps & { isDark: boolean }) {
  const containerHeight = total * dotSize + (total - 1) * dotGap + 2 * indicatorPadding;
  const previousRef = useRef(current);
  const direction = current - previousRef.current;

  useEffect(() => {
    previousRef.current = current;
  }, [current]);

  const topTarget = current * dotStep;
  const bottomTarget = containerHeight - topTarget - indicatorHeight;

  return (
    <div className="fixed right-6 xl:right-10 top-1/2 -translate-y-1/2 z-40 hidden lg:block">
      <div className="relative" style={{ width: 6, height: containerHeight }}>
        {Array.from({ length: total }).map((_, index) => (
          <div
            key={index}
            className="absolute left-1/2 -translate-x-1/2"
            style={{
              width: dotSize,
              height: dotSize,
              top: indicatorPadding + index * dotStep,
              backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(10,10,10,0.14)',
            }}
          />
        ))}
        <motion.div
          className="absolute inset-x-0"
          initial={false}
          animate={{ top: topTarget, bottom: bottomTarget }}
          transition={{
            top: direction > 0 ? springTrail : springStiff,
            bottom: direction < 0 ? springTrail : springStiff,
          }}
          style={{
            backgroundColor: 'var(--section-accent)',
            boxShadow: '0 0 10px color-mix(in srgb, var(--section-accent) 55%, transparent)',
          }}
        />
      </div>
    </div>
  );
}

interface FullpageChromeProps extends SectionIndicatorProps, WatermarkLayerProps {}

export default memo(function FullpageChrome({ current, total, ...watermark }: FullpageChromeProps) {
  return (
    <>
      <WatermarkLayer {...watermark} />
      <SectionDots current={current} total={total} isDark={watermark.isDark} />
    </>
  );
});
