import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { acquireInputPause, releaseInputPause } from '@/hooks/useFullpageNavigation';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import { springStiff } from '@/lib/motion';
import { zIndex } from '@/lib/z-index';
import ArrowUpIcon from '~icons/lucide/arrow-up';
import { scrollArticleToTop } from './scrollArticleToTop';
import { useArticleActiveHeading, useArticleHeadings } from './ArticleScrollProvider';

/**
 * Mobile-only TOC bottom sheet — opened from the MobileTocFab floating button.
 * Hidden on desktop (lg:hidden) where the sidebar TOC takes over.
 * Active-heading state is shared with the desktop TOC.
 * fixed 元素经 portal 挂到 body，脱离章节 wrapper 的 clip-path / transform
 * 包含块，不随章节过渡被裁剪。
 */
interface MobileTOCProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function MobileTOC({ open, onOpenChange }: MobileTOCProps) {
  const items = useArticleHeadings();
  const activeId = useArticleActiveHeading();
  const listRef = useRef<HTMLUListElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const { isDesktop, reducedMotion } = useMediaCapabilities();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isDesktop && open) onOpenChange(false);
  }, [isDesktop, open, onOpenChange]);

  /* ---- Auto-scroll active item into view in the sheet ---- */
  useEffect(() => {
    if (!open || !activeId || !listRef.current) return;
    const active = listRef.current.querySelector<HTMLElement>(`[data-toc="${activeId}"]`);
    if (active) {
      active.scrollIntoView({
        block: 'nearest',
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    }
  }, [open, activeId, reducedMotion]);

  /* ---- Lock body scroll while sheet is open ---- */
  useFocusTrap(sheetRef, {
    active: open && !isDesktop,
    onEscape: () => onOpenChange(false),
  });

  useEffect(() => {
    if (!open || isDesktop) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const pauseToken = acquireInputPause('mobile-toc');
    return () => {
      document.body.style.overflow = previousOverflow;
      releaseInputPause(pauseToken);
    };
  }, [open, isDesktop]);

  const handleClick = (slug: string) => {
    onOpenChange(false);
    // Small delay so the sheet close animation starts before scroll jump
    requestAnimationFrame(() => {
      const el = document.getElementById(slug);
      if (el) {
        el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
      }
    });
  };

  const handleBackToTop = () => {
    onOpenChange(false);
    scrollArticleToTop(sheetRef.current, !reducedMotion);
  };

  if (!mounted || items.length === 0 || isDesktop) return null;

  return createPortal(
    <div className="mobile-toc-sheet lg:hidden">
      {/* Bottom sheet */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              style={{ zIndex: zIndex.mobileTocBackdrop }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.2 }}
              onClick={() => onOpenChange(false)}
            />

            {/* Sheet panel */}
            <motion.div
              ref={sheetRef}
              role="dialog"
              aria-modal="true"
              aria-label="文章目录"
              className="fixed inset-x-0 bottom-0 max-h-[65vh] overflow-hidden rounded-t-xl border border-white/10 border-b-0 bg-neutral-900 shadow-lift"
              style={{ zIndex: zIndex.mobileTocPanel }}
              initial={{ y: '100%', opacity: 1 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 1 }}
              transition={reducedMotion ? { duration: 0 } : springStiff}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-1 w-10 rounded-full bg-white/15" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 pb-3">
                <div>
                  <p className="font-mono text-[12px] tracking-[0.16em] text-white font-bold">
                    目录 / TOC
                  </p>
                  <p className="font-mono text-[10px] text-white/30 mt-0.5">
                    {items.length} 个章节
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleBackToTop}
                    className="flex min-h-11 items-center gap-1.5 rounded-full border border-white/10 px-3 text-white/55 hover:text-white hover:border-white/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-base"
                    aria-label="回到顶部"
                  >
                    <ArrowUpIcon width={14} height={14} />
                    <span className="font-mono text-[11px] tracking-[0.08em] uppercase">
                      回到顶部
                    </span>
                  </button>
                  <button
                    type="button"
                    data-toc-close
                    onClick={() => onOpenChange(false)}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/10 text-white/50 hover:text-white hover:border-white/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-base"
                    aria-label="关闭目录"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    >
                      <line x1="3" y1="3" x2="11" y2="11" />
                      <line x1="11" y1="3" x2="3" y2="11" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Heading list */}
              <ul
                ref={listRef}
                className="overflow-y-auto px-5 pb-[max(2rem,env(safe-area-inset-bottom))] max-h-[50vh] space-y-0.5"
              >
                {items.map((h) => (
                  <li key={h.slug}>
                    <button
                      type="button"
                      data-toc={h.slug}
                      aria-current={activeId === h.slug ? 'location' : undefined}
                      onClick={() => handleClick(h.slug)}
                      className={[
                        'w-full text-left py-2.5 px-3 rounded-md transition-colors text-[13px] leading-snug',
                        h.depth === 3 ? 'pl-8' : 'pl-3',
                        activeId === h.slug
                          ? 'bg-accent-base/20 text-accent-ink font-medium'
                          : 'text-white/55 hover:text-white/80 hover:bg-white/[0.04]',
                      ].join(' ')}
                    >
                      {h.depth === 3 && (
                        <span className="text-white/20 mr-1.5" aria-hidden="true">
                          ⌙
                        </span>
                      )}
                      {h.text}
                    </button>
                  </li>
                ))}
              </ul>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
