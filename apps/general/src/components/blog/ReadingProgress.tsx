import { zIndex } from '@/lib/z-index';
import { useArticleProgressPercent } from './ArticleScrollProvider';

/**
 * Thin command-blue reading-progress bar pinned to the top of the viewport.
 * Scroll state comes from the article-level provider, so the progress bar and
 * both TOCs share one listener and one animation frame.
 */
export default function ReadingProgress() {
  const percent = useArticleProgressPercent();

  return (
    <div
      className="reading-progress-bar fixed top-0 left-0 right-0 h-[2px] pointer-events-none"
      style={{ zIndex: zIndex.readingProgress }}
      aria-hidden="true"
    >
      <div
        className="h-full origin-left bg-accent-base transition-transform duration-100 ease-linear will-change-transform motion-reduce:transition-none"
        style={{ transform: `scaleX(${percent / 100})` }}
      />
    </div>
  );
}
