import { useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import MonitorIcon from '~icons/lucide/monitor';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import {
  confirmDesktopEntry,
  dismissDesktopEntry,
  useDesktopEntryNotice,
} from '@/hooks/useDisplayModeEntry';
import { motionEase } from '@/lib/motion';

/**
 * Phones and narrow windows ask before downloading the desktop presentation.
 *
 * The desktop is a 640×360 pointer world: windows, a taskbar and small text.
 * It stays reachable from a phone, but the general site is the complete
 * touch-first reading experience, so staying is the recommended action and
 * the answer is remembered for this session only.
 */
export default function DesktopEntryNotice() {
  const { open } = useDesktopEntryNotice();
  const { reducedMotion } = useMediaCapabilities();
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, { active: open, onEscape: dismissDesktopEntry });

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="desktop-entry-notice"
          className="fixed inset-0 z-[95] flex items-end justify-center bg-black/75 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-10 sm:items-center sm:p-6"
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.22 }}
          onClick={dismissDesktopEntry}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="desktop-entry-title"
            aria-describedby="desktop-entry-description"
            className="relative w-full max-w-md border border-white/15 bg-neutral-975 shadow-lift"
            initial={reducedMotion ? false : { opacity: 0, y: 18, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.995 }}
            transition={{ duration: reducedMotion ? 0 : 0.28, ease: motionEase }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
              <span>// PRESENTATION · MHK10</span>
              <span className="flex items-center gap-1" aria-hidden="true">
                <span className="h-2 w-2 bg-accent-soft" />
                <span className="h-2 w-2 bg-white/25" />
                <span className="h-2 w-2 bg-white/10" />
              </span>
            </div>

            <div className="px-5 pb-5 pt-4">
              <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-eyebrow text-white/35">
                <MonitorIcon aria-hidden="true" className="h-3.5 w-3.5" />
                Desktop entry check
              </p>
              <h2 id="desktop-entry-title" className="mt-2 text-lg font-semibold text-white">
                这个桌面原本是为鼠标设计的
              </h2>
              <p
                id="desktop-entry-description"
                className="mt-2 text-sm leading-relaxed text-white/70"
              >
                MHK10 桌面以 640×360
                的窗口、指针和键盘操作为核心。手机也能进入，但文字会更小、窗口与任务栏更拥挤，部分应用需要横屏或外接输入设备。
              </p>

              <div className="mt-4 grid gap-2 border border-white/10 bg-black/30 p-3 text-xs leading-relaxed">
                <p className="text-white/70">
                  <span className="mr-2 font-mono text-[10px] uppercase tracking-mono text-accent-soft">
                    Stay
                  </span>
                  留在通用版：阅读、博客、图库与触控体验都按手机设计。
                </p>
                <p className="text-white/45">
                  <span className="mr-2 font-mono text-[10px] uppercase tracking-mono text-white/35">
                    Enter
                  </span>
                  仍要进入：建议横屏，使用底部触控键与双击打开窗口。
                </p>
              </div>

              <p className="mt-3 font-mono text-[10px] leading-relaxed text-white/30">
                确认后会记住呈现选择。随时可以用屏幕边缘的图标回到通用版。
              </p>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={dismissDesktopEntry}
                  className="min-h-11 border border-accent-soft/50 bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
                >
                  留在通用版
                </button>
                <button
                  type="button"
                  onClick={confirmDesktopEntry}
                  className="min-h-11 border border-white/15 px-4 py-2.5 text-sm text-white/70 transition-colors hover:border-white/30 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
                >
                  仍要进入桌面
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
