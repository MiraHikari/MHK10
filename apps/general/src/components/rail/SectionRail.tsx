import { memo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import './section-rail.css';
import type { FullpageTransitionPhase } from '@/hooks/fullpage/timing';
import { motionDuration, motionEase } from '@/lib/motion';
import { shade, withAlpha } from '@/lib/palette';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';

interface SectionRailProps {
  readonly visible: boolean;
  readonly label: string;
  readonly verticalText: string;
  readonly current: number;
  readonly total: number;
  readonly direction: number;
  readonly phase: FullpageTransitionPhase;
  readonly accent: string;
  readonly accentSoft: string;
}

/** Vertical column gradient: lifted at the top, sinking into shadow at the base. */
function railGradient(accent: string) {
  return `linear-gradient(180deg, ${shade(accent, 0.14)} 0%, ${accent} 38%, ${shade(accent, -0.3)} 100%)`;
}

/**
 * Decorative left chapter rail — identity + progress only.
 * Navigation stays in the existing sidebar / command palette.
 */
export default memo(function SectionRail({
  visible,
  label,
  verticalText,
  current,
  total,
  direction,
  phase,
  accent,
  accentSoft,
}: SectionRailProps) {
  const { reducedMotion } = useMediaCapabilities();
  const moving = phase !== 'idle';
  const motionDirection = direction === 0 ? 1 : direction;
  const transition = reducedMotion ? { duration: 0 } : { duration: 0.5, ease: motionEase };
  const indexDigits = String(current + 1).padStart(2, '0');

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.aside
          aria-hidden="true"
          className="section-rail fixed inset-y-0 left-0 z-20 hidden origin-left overflow-hidden md:flex"
          initial={reducedMotion ? { opacity: 0 } : { x: '-102%' }}
          animate={{ x: 0, opacity: 1, backgroundImage: railGradient(accent) }}
          exit={reducedMotion ? { opacity: 0 } : { x: '-102%', opacity: 0.9 }}
          transition={{
            ...transition,
            backgroundImage: reducedMotion
              ? { duration: 0 }
              : { duration: motionDuration.accentShift, ease: motionEase },
          }}
          style={{
            width: 'var(--rail-base)',
            backgroundColor: accent,
            boxShadow: `inset -1px 0 rgba(255,255,255,0.16), inset 0 0 72px ${withAlpha(accentSoft, 0.24)}, 10px 0 36px ${withAlpha(shade(accent, -0.35), 0.42)}`,
          }}
        >
          <span className="rail-grain pointer-events-none absolute inset-0" />
          <span
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(0,0,0,0.34) 0%, transparent 22%, transparent 74%, rgba(0,0,0,0.42) 100%)',
            }}
          />

          <div className="relative flex h-full w-full flex-col items-center overflow-hidden px-2 py-5 lg:py-6">
            <div className="relative z-10 flex overflow-hidden font-mono text-micro tabular-nums tracking-mono text-white/60">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={indexDigits}
                  initial={
                    reducedMotion
                      ? { opacity: 0 }
                      : { y: motionDirection > 0 ? 11 : -11, opacity: 0 }
                  }
                  animate={{ y: 0, opacity: 1 }}
                  exit={
                    reducedMotion
                      ? { opacity: 0 }
                      : { y: motionDirection > 0 ? -11 : 11, opacity: 0 }
                  }
                  transition={{
                    duration: reducedMotion ? 0 : motionDuration.control,
                    ease: motionEase,
                  }}
                >
                  {indexDigits}
                </motion.span>
              </AnimatePresence>
              <span className="text-white/25">/{String(total).padStart(2, '0')}</span>
            </div>

            <div
              className="relative z-10 flex min-h-0 flex-1 items-center justify-center overflow-hidden"
              style={{
                maskImage:
                  'linear-gradient(to bottom, transparent 0%, black 13%, black 82%, transparent 100%)',
                WebkitMaskImage:
                  'linear-gradient(to bottom, transparent 0%, black 13%, black 82%, transparent 100%)',
              }}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={`${verticalText}-${label}`}
                  initial={
                    reducedMotion
                      ? { opacity: 0 }
                      : { y: motionDirection > 0 ? 54 : -54, opacity: 0 }
                  }
                  animate={{ y: 0, opacity: 1 }}
                  exit={
                    reducedMotion
                      ? { opacity: 0 }
                      : { y: motionDirection > 0 ? -54 : 54, opacity: 0 }
                  }
                  transition={
                    reducedMotion ? { duration: 0 } : { duration: 0.38, ease: motionEase }
                  }
                  className="relative flex items-center justify-center"
                >
                  <span
                    className="rail-vertical-title vertical-text text-white"
                    style={{
                      textShadow: `0 0 10px rgba(255,255,255,0.5), 0 0 30px ${withAlpha(accentSoft, 0.62)}`,
                    }}
                  >
                    {verticalText}
                  </span>
                </motion.div>
              </AnimatePresence>
            </div>

            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={label}
                initial={{ opacity: 0, y: motionDirection > 0 ? 8 : -8 }}
                animate={{ opacity: 0.75, y: 0 }}
                exit={{ opacity: 0, y: motionDirection > 0 ? -8 : 8 }}
                transition={transition}
                className="relative z-10 text-micro font-bold tracking-mono text-white"
              >
                {label}
              </motion.span>
            </AnimatePresence>

            <motion.span
              className="absolute inset-y-0 right-0 w-px"
              animate={{ opacity: moving ? 0.85 : 0.3 }}
              transition={{ duration: motionDuration.fast }}
              style={{ background: withAlpha(accentSoft, 0.8) }}
            />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
});
