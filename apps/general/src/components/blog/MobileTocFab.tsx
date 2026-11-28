import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import TocIcon from '~icons/lucide/table-of-contents';
import SurfacePanel from '@/components/ui/SurfacePanel';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import { springSoft } from '@/lib/motion';
import { zIndex } from '@/lib/z-index';
import { useArticleHeadings, useArticleProgressPercent } from './ArticleScrollProvider';

/** 进度环几何参数：48px 按钮外叠一圈 2px 描边圆环，起笔在正上方。 */
const RING_RADIUS = 26;
const RING_SIZE = (RING_RADIUS + 2) * 2;
const RING_CENTER = RING_SIZE / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * 阅读进度环：currentColor 取章节主题色，随 progress 填充。单独订阅
 * 整百分比快照（useArticleProgressPercent），滚动只在整数百分比变化时
 * 重渲染这一小段 SVG，不触动外层 AnimatePresence / motion 子树。
 */
function ProgressRing() {
  const percent = useArticleProgressPercent();
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 text-accent-ink"
      width={RING_SIZE}
      height={RING_SIZE}
      viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
      fill="none"
    >
      <circle
        cx={RING_CENTER}
        cy={RING_CENTER}
        r={RING_RADIUS}
        stroke="currentColor"
        strokeOpacity={0.16}
        strokeWidth={2}
      />
      <circle
        cx={RING_CENTER}
        cy={RING_CENTER}
        r={RING_RADIUS}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={RING_CIRCUMFERENCE * (1 - percent / 100)}
        className="transition-[stroke-dashoffset] duration-100 ease-linear motion-reduce:transition-none"
      />
    </svg>
  );
}

interface MobileTocFabProps {
  readonly open: boolean;
  readonly onOpen: () => void;
}

/**
 * 移动端目录悬浮按钮：有标题即常驻（正文一屏放不下、progress 恒为 0 的
 * 短文章也必须能打开目录），外圈圆环同步阅读进度；目录 sheet 打开时隐去。
 * 替代原先顶部胶囊里的 TOC 图标入口（与汉堡图标形近难辨）。渲染在
 * ArticleScrollProvider 内，与 ReadingProgress / MobileTOC 共享同一份
 * 滚动状态；fixed 元素经 portal 挂到 body，脱离章节 wrapper 的
 * clip-path / transform 包含块，不随章节过渡被裁剪。
 */
export default function MobileTocFab({ open, onOpen }: MobileTocFabProps) {
  const headings = useArticleHeadings();
  const { isDesktop, reducedMotion } = useMediaCapabilities();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const visible = !isDesktop && headings.length > 0 && !open;

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          className="mobile-toc-fab lg:hidden fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))]"
          style={{ zIndex: zIndex.mobileTocFab }}
          initial={reducedMotion ? false : { opacity: 0, y: 28, filter: 'blur(14px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 28, filter: 'blur(14px)' }}
          transition={reducedMotion ? { duration: 0 } : springSoft}
        >
          <div className="relative h-12 w-12">
            <SurfacePanel isDark borderRadius="50%">
              <button
                type="button"
                aria-label="目录"
                data-cursor="TOC"
                onClick={onOpen}
                className="grid h-full w-full place-items-center rounded-full text-white transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-base"
              >
                <TocIcon width={20} height={20} />
              </button>
            </SurfacePanel>
            <ProgressRing />
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
