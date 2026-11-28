import { memo, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import GlassSurface from '../ui/GlassSurface';
import { springSoft } from '@/lib/motion';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import { ROOT_SECTION_ID } from '@/lib/sections';
interface BackToStartProps {
  readonly onNavigate: (sectionId: string) => void;
}

export default memo(function BackToStart({ onNavigate }: BackToStartProps) {
  const { reducedMotion } = useMediaCapabilities();
  const [nearEnd, setNearEnd] = useState(false);

  // The last section owns its own scroll container. Surface the return chip
  // only once the visitor is close to the end, so it never floats over cards
  // that have not been read yet.
  useEffect(() => {
    let frame = 0;
    let host: HTMLElement | null = null;
    // Observe the scrolling section itself: `document.body` never resizes when
    // the last section's content grows (lazy images, expanded TOC).
    const observer = new ResizeObserver(() => schedule());

    const update = () => {
      host ??= document.querySelector<HTMLElement>('.section-scroll:not([aria-hidden="true"])');
      if (!host) {
        setNearEnd(false);
        return;
      }
      const remaining = host.scrollHeight - host.scrollTop - host.clientHeight;
      setNearEnd(remaining <= 280);
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener('resize', schedule);
    // Scroll events do not bubble; capture them from whichever section owns
    // the viewport so the chip follows the active scroller. Rebinding only
    // happens when a different section starts scrolling, instead of
    // re-querying the document on every scroll frame.
    const onScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.matches('.section-scroll') && target !== host) {
        if (host) observer.unobserve(host);
        host = target;
        observer.observe(host);
      }
      schedule();
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, []);

  return (
    <AnimatePresence>
      {nearEnd ? (
        <motion.div
          data-back-to-start
          className="fixed bottom-16 left-1/2 z-40 hidden -translate-x-1/2 pointer-events-auto sm:block"
          initial={reducedMotion ? false : { opacity: 0, y: 28, filter: 'blur(14px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, filter: 'blur(8px)' }}
          transition={reducedMotion ? { duration: 0 } : { ...springSoft, delay: 0.15 }}
        >
          <GlassSurface
            width={188}
            height={48}
            borderRadius={24}
            borderWidth={0.1}
            brightness={56}
            opacity={0.84}
            blur={13}
            displace={0.15}
            backgroundOpacity={0.18}
            saturation={1.7}
            distortionScale={-150}
            className="border border-white/10 shadow-lift shadow-black/40"
          >
            <motion.button
              type="button"
              data-cursor="HOME"
              onClick={() => onNavigate(ROOT_SECTION_ID)}
              aria-label="回到开始 BACK TO START"
              className="group flex items-center justify-center gap-2.5 w-full h-full rounded-[inherit] transition-colors duration-300 hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
              whileHover={reducedMotion ? undefined : { scale: 1.03 }}
              whileTap={reducedMotion ? undefined : { scale: 0.97 }}
              animate={
                reducedMotion
                  ? undefined
                  : {
                      boxShadow: [
                        '0 0 0 0 color-mix(in srgb, var(--section-accent) 0%, transparent)',
                        '0 0 22px 0 color-mix(in srgb, var(--section-accent) 40%, transparent)',
                        '0 0 0 0 color-mix(in srgb, var(--section-accent) 0%, transparent)',
                      ],
                    }
              }
              transition={
                reducedMotion ? undefined : { duration: 2.8, repeat: Infinity, ease: 'easeInOut' }
              }
            >
              <motion.span
                className="flex h-5 w-5 items-center justify-center text-accent-ink transition-colors duration-300 group-hover:text-white"
                style={{
                  filter:
                    'drop-shadow(0 0 5px color-mix(in srgb, var(--section-accent) 70%, transparent))',
                }}
                animate={reducedMotion ? undefined : { y: [0, -3, 0] }}
                transition={
                  reducedMotion ? undefined : { duration: 2, repeat: Infinity, ease: 'easeInOut' }
                }
                aria-hidden="true"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 19V5" />
                  <path d="m5 12 7-7 7 7" />
                </svg>
              </motion.span>

              <span className="flex flex-col leading-none text-left">
                <span className="text-micro font-mono uppercase tracking-eyebrow text-white/90 font-bold transition-colors duration-300 group-hover:text-white">
                  BACK TO START
                </span>
                <span className="mt-0.5 text-micro font-medium tracking-eyebrow text-white/45 transition-colors duration-300 group-hover:text-white/70">
                  回到开始
                </span>
              </span>
            </motion.button>
          </GlassSurface>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
});
