import { memo, useCallback, useEffect, useState, type MouseEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BEIAN_LINKS } from '@/data/beian-link';
import { motionEase } from '@/lib/motion';
import { prefetchArticleBody } from '@/lib/article-body-cache';
import { openArticleFromClick, PRIVACY_ARTICLE_SLUG } from '@/lib/blog/client';
import { formatCount, getSiteStats, type SiteStats } from '@/lib/kounter';
import './beian-footer.css';

interface BeianFooterProps {
  readonly isDark?: boolean;
  readonly onOpenArticle?: (slug: string) => void;
}

/**
 * 桌面端固定底栏；<640px 视口下备案入口由 Navigation 移动端抽屉承接，
 * 保证小屏也能访问 ICP / 公安备案链接。
 */
export default memo(function BeianFooter({ isDark = true, onOpenArticle }: BeianFooterProps) {
  const [show, setShow] = useState(false);
  const [siteStats, setSiteStats] = useState<SiteStats | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), 600);
    return () => clearTimeout(timer);
  }, []);

  // 全站 PV/UV：getSiteStats 缓存请求与自增结果，不重复计数。
  useEffect(() => {
    let cancelled = false;
    void getSiteStats(window.location.hostname).then((stats) => {
      if (!cancelled) setSiteStats(stats);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const openPrivacy = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      openArticleFromClick(event, onOpenArticle, PRIVACY_ARTICLE_SLUG);
    },
    [onOpenArticle],
  );

  const linkClass = isDark
    ? 'text-micro font-mono text-white/28 hover:text-accent-ink focus-visible:text-accent-ink focus-visible:outline-none transition-colors tracking-wide whitespace-nowrap'
    : 'text-micro font-mono text-black/35 hover:text-accent-ink focus-visible:text-accent-ink focus-visible:outline-none transition-colors tracking-wide whitespace-nowrap';
  const dividerClass = isDark ? 'w-px h-2 bg-white/8' : 'w-px h-2 bg-black/12';
  const statClass = isDark
    ? 'text-micro font-mono text-white/28 tracking-wide whitespace-nowrap'
    : 'text-micro font-mono text-black/35 tracking-wide whitespace-nowrap';

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="beian-footer fixed left-1/2 z-40 hidden -translate-x-1/2 items-center gap-2 pointer-events-auto sm:flex"
          data-tone={isDark ? 'dark' : 'light'}
          style={{
            bottom: 'max(0.375rem, env(safe-area-inset-bottom))',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, ease: motionEase }}
        >
          <a
            href={BEIAN_LINKS.icp.href}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            {BEIAN_LINKS.icp.label}
          </a>
          <span className={dividerClass} />
          <a
            href={BEIAN_LINKS.police.href}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            {BEIAN_LINKS.police.label}
          </a>
          <span className={dividerClass} />
          <a
            href={`/blog/${PRIVACY_ARTICLE_SLUG}`}
            className={linkClass}
            onPointerEnter={() => prefetchArticleBody(PRIVACY_ARTICLE_SLUG)}
            onFocus={() => prefetchArticleBody(PRIVACY_ARTICLE_SLUG)}
            onClick={openPrivacy}
          >
            隐私说明
          </a>
          {siteStats && (
            <>
              <span className={dividerClass} />
              <span className={statClass} aria-label="全站访问统计">
                PV {formatCount(siteStats.pv)} · UV {formatCount(siteStats.uv)}
              </span>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
});
