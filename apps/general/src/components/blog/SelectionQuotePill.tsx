import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { zIndex } from '@/lib/z-index';

interface Props {
  /** 当前选区文本（空则不渲染）。 */
  readonly selection: string;
  /** 「引用这段」→ 打开 AI 分享菜单。 */
  readonly onQuote: () => void;
  /** 「高亮」→ 调用 useArticleHighlights 的 add 方法。 */
  readonly onHighlight: () => void;
}

interface PillRect {
  top: number;
  left: number;
  width: number;
}

/**
 * 选区悬浮胶囊：portal 到 body，fixed 定位在选区上方（毛玻璃小胶囊，
 * 参照 `.article-back` 玻璃拟态）。滚动 / resize / 选区变化时重算位置，
 * 选区移出视口则隐藏。容器级 mousedown preventDefault 防止点击胶囊时
 * 选区塌缩（否则 click 永远不会触发）。
 */
export default function SelectionQuotePill({ selection, onQuote, onHighlight }: Props) {
  const [rect, setRect] = useState<PillRect | null>(null);
  // 只关心「有没有选区」：选区内容变化不需要重建监听，update 每次读实时
  // Selection，因此以布尔为依赖，避免拖选过程中每帧拆除/重建 3 个监听。
  const hasSelection = selection.length > 0;

  useEffect(() => {
    if (!hasSelection) {
      setRect(null);
      return;
    }
    let raf = 0;
    let lastRect: PillRect | null = null;
    const update = () => {
      raf = 0;
      const current = window.getSelection();
      if (!current || current.isCollapsed || current.rangeCount === 0) {
        lastRect = null;
        setRect(null);
        return;
      }
      const bounds = current.getRangeAt(0).getBoundingClientRect();
      const inViewport =
        bounds.bottom > 0 &&
        bounds.top < window.innerHeight &&
        bounds.right > 0 &&
        bounds.left < window.innerWidth;
      if (!inViewport) {
        lastRect = null;
        setRect(null);
        return;
      }
      const next = { top: bounds.top, left: bounds.left, width: bounds.width };
      // 位置没变就不 setState，避免滚动/resize 触发无意义的 re-render。
      if (
        lastRect &&
        lastRect.top === next.top &&
        lastRect.left === next.left &&
        lastRect.width === next.width
      ) {
        return;
      }
      lastRect = next;
      setRect(next);
    };
    // rAF 合并同一帧内的多次 scroll/resize/selectionchange。
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    // capture 阶段监听 scroll，覆盖任意滚动容器。
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    document.addEventListener('selectionchange', schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      document.removeEventListener('selectionchange', schedule);
    };
  }, [hasSelection]);

  if (!rect) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="selection-quote-pill"
      role="toolbar"
      aria-label="选中内容操作"
      style={{
        top: rect.top - 10,
        left: rect.left + rect.width / 2,
        zIndex: zIndex.mobileTocFab,
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <button type="button" onClick={onQuote} data-cursor="QUOTE">
        引用这段
      </button>
      <button type="button" onClick={onHighlight} data-cursor="HIGHLIGHT">
        高亮
      </button>
    </div>,
    document.body,
  );
}
