import { memo, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useSpring, useTransform } from 'motion/react';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import { usePointer } from '@/hooks/usePointer';
import type { FullpageTransitionPhase } from '@/hooks/fullpage/timing';
import { motionDuration, motionEase, springParallax } from '@/lib/motion';
import { playTypewriterErase, playTypewriterType } from '@/lib/typewriter';

export interface WatermarkLayerProps {
  text: string;
  isDark: boolean;
  cursorVisible: boolean;
  /** Drives erase (exit) → type (enter); idle snaps to `text`. */
  phase: FullpageTransitionPhase;
}

/**
 * Phase → displayed string. Cadence lives in `playTypewriter*`; this effect
 * only chooses which playback (or snap) to run when phase/cursor changes.
 */
function useWatermarkTypewriter(
  text: string,
  phase: FullpageTransitionPhase,
  cursorVisible: boolean,
  reducedMotion: boolean,
): string {
  const [displayed, setDisplayed] = useState(text);
  const displayedRef = useRef(text);

  useEffect(() => {
    const paint = (value: string) => {
      displayedRef.current = value;
      setDisplayed(value);
    };

    if (!cursorVisible) {
      if (phase === 'idle') paint(text);
      return;
    }

    if (phase === 'exit') {
      if (reducedMotion) {
        paint('');
        return;
      }
      const playback = playTypewriterErase(displayedRef.current, paint);
      return () => playback.cancel();
    }

    // Always clear on bridge. Exit cleanup cancels in-flight erase; if the
    // effect mounted late (GPU-heavy cross-boundary), a truncated string
    // would otherwise linger through the gap until enter typing resets it.
    if (phase === 'bridge') {
      paint('');
      return;
    }

    if (phase === 'enter') {
      if (reducedMotion) {
        paint(text);
        return;
      }
      const playback = playTypewriterType(text, paint);
      return () => playback.cancel();
    }
  }, [phase, cursorVisible, text, reducedMotion]);

  return displayed;
}

export default memo(function WatermarkLayer({
  text,
  isDark,
  cursorVisible,
  phase,
}: WatermarkLayerProps) {
  // Neutral resting texture — never lifts or glows; colour morph owns the stage.
  const color = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';

  const { normalizedX, normalizedY } = usePointer();
  const mx = useTransform(normalizedX, (value) => value * 12);
  const my = useTransform(normalizedY, (value) => value * 8);
  const sx = useSpring(mx, springParallax);
  const sy = useSpring(my, springParallax);
  const { finePointer, reducedMotion } = useMediaCapabilities();
  // Bind springs only after media queries resolve (post-hydration). Pointer
  // motion values are module singletons Cursor may already drive; binding
  // during hydration would mismatch the server's static markup.
  const parallax = finePointer && !reducedMotion;

  const displayed = useWatermarkTypewriter(text, phase, cursorVisible, reducedMotion);
  const head = displayed.slice(0, -1);
  const tail = displayed.slice(-1);
  const settleGlyph = phase === 'enter' && !reducedMotion;

  return (
    <div
      aria-hidden="true"
      className="fixed top-16 left-0 md:left-30 lg:left-40 right-0 z-1 pointer-events-none select-none overflow-hidden px-4 md:px-8"
    >
      <motion.div
        className="flex w-full items-center text-[8rem] md:text-[12rem] font-normal leading-none font-serif whitespace-nowrap text-left md:justify-end md:text-right"
        style={{ color, ...(parallax ? { x: sx, y: sy } : null) }}
      >
        <span>
          {head}
          {tail ? (
            <motion.span
              key={`${displayed.length}-${tail}`}
              className="inline-block"
              initial={settleGlyph ? { opacity: 0.4, filter: 'blur(5px)', y: 6 } : false}
              animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
              transition={{ duration: motionDuration.typeChar, ease: motionEase }}
            >
              {tail}
            </motion.span>
          ) : null}
        </span>
        <AnimatePresence>
          {cursorVisible && (
            <motion.span
              className="inline-block w-0.75 md:w-1 h-[0.75em] ml-1 align-middle origin-center"
              initial={{ opacity: 0, scaleY: 0.2 }}
              animate={{ opacity: 1, scaleY: 1 }}
              exit={{ opacity: 0, scaleY: 0.2 }}
              transition={{ duration: motionDuration.filter, ease: motionEase }}
            >
              <span
                className="block h-full w-full animate-blink"
                style={{ backgroundColor: 'var(--section-accent)' }}
              />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
});
