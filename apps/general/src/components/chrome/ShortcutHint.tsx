import { memo, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { motionEase } from '@/lib/motion';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import { STORAGE_KEYS, readStorage, writeStorage } from '@/lib/storage/keys';

const STORAGE_KEY = STORAGE_KEYS.shortcutHintSeen;

function hasSeenShortcutHint() {
  // readStorage 在 storage 不可用（隐私模式）时返回 null：提示会显示
  // 一次且 markSeen 写入失败，但不会影响站点功能。
  return readStorage(STORAGE_KEY) === '1';
}

function markShortcutHintSeen() {
  writeStorage(STORAGE_KEY, '1');
}

/**
 * First-visit keyboard legend for fine pointers.
 *
 * It sits in the empty top-centre lane, between the author mark and the
 * navigation pill: never over the hero name, the work card or the footer.
 * Touch visitors skip it — swiping and the visible search icon already teach
 * the same two gestures, and a floating toast would only cover content.
 */
export default memo(function ShortcutHint() {
  const { reducedMotion, finePointer } = useMediaCapabilities();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!finePointer || hasSeenShortcutHint()) return;

    const showTimer = window.setTimeout(() => {
      setVisible(true);
      markShortcutHintSeen();
    }, 1500);
    const hideTimer = window.setTimeout(() => setVisible(false), 5500);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [finePointer]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="shortcut-hint pointer-events-none fixed left-1/2 top-[max(1.35rem,env(safe-area-inset-top))] z-40 hidden -translate-x-1/2 items-center gap-3 border border-black/8 bg-neutral-50/92 px-3 py-1.5 font-mono text-micro uppercase tracking-mono text-neutral-500 shadow-pop backdrop-blur-sm xl:flex"
          initial={reducedMotion ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.35, ease: motionEase }}
        >
          <kbd className="border border-black/12 px-1.5 py-0.5 text-neutral-950">↑</kbd>
          <kbd className="border border-black/12 px-1.5 py-0.5 text-neutral-950">↓</kbd>
          <span>翻页</span>
          <span aria-hidden="true" className="text-neutral-300">
            /
          </span>
          <kbd className="border border-black/12 px-1.5 py-0.5 text-neutral-950">⌘K</kbd>
          <span>命令</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
