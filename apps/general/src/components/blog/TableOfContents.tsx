import { useRef } from 'react';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import ArrowUpIcon from '~icons/lucide/arrow-up';
import { scrollArticleToTop } from './scrollArticleToTop';
import {
  useArticleActiveHeading,
  useArticleHeadings,
  useArticleProgressPercent,
} from './ArticleScrollProvider';

interface Props {
  /** Estimated reading time in minutes, for the progress readout. */
  readonly readingTime: number;
}

/**
 * Sticky table-of-contents with scroll-spy. Its active heading is supplied by
 * the article-level scroll provider; anchor clicks rely on native scrolling
 * and the global reduced-motion rules. The header shows a compact read-progress
 * readout and the footer offers a back-to-top control.
 */
export default function TableOfContents({ readingTime }: Props) {
  const items = useArticleHeadings();
  const activeId = useArticleActiveHeading();
  const pct = useArticleProgressPercent();
  const navRef = useRef<HTMLElement>(null);
  const { reducedMotion } = useMediaCapabilities();

  if (items.length === 0) return null;

  const minsLeft = Math.max(0, Math.ceil(readingTime * (1 - pct / 100)));
  const stats = pct > 0 ? `已读 ${pct}% · 约剩 ${minsLeft} 分钟` : `约 ${readingTime} 分钟`;

  return (
    <nav ref={navRef} aria-label="目录">
      <p className="font-mono text-[11px] tracking-[0.16em] text-white/40 mb-1">目录 / TOC</p>
      <p className="font-mono text-[10px] tracking-[0.12em] text-white/30 mb-3">{stats}</p>
      <ul className="border-l border-white/10">
        {items.map((h) => (
          <li key={h.slug}>
            <a
              href={`#${h.slug}`}
              aria-current={activeId === h.slug ? 'location' : undefined}
              onClick={(event) => {
                event.preventDefault();
                document.getElementById(h.slug)?.scrollIntoView({
                  behavior: reducedMotion ? 'auto' : 'smooth',
                });
              }}
              className={[
                'block border-l-2 -ml-px transition-colors text-[12px] leading-snug py-0.5',
                h.depth === 3 ? 'pl-5' : 'pl-3',
                activeId === h.slug
                  ? 'border-accent-base text-accent-ink'
                  : 'border-transparent text-white/45 hover:text-white/75',
              ].join(' ')}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => scrollArticleToTop(navRef.current, !reducedMotion)}
        data-cursor="TOP"
        className="mt-4 inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.08em] uppercase text-white/40 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-base"
      >
        <ArrowUpIcon width={13} height={13} />
        回到顶部
      </button>
    </nav>
  );
}
