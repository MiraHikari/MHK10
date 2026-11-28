import { useEffect, useRef, useState } from 'react';
import CopyIcon from '~icons/lucide/copy';
import RssIcon from '~icons/lucide/rss';
import ExternalLinkIcon from '~icons/lucide/external-link';
import { SITE_ORIGIN } from '@/lib/blog/legal';

interface FeedSource {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly href: string;
  readonly mime: string;
}

const FEEDS: readonly FeedSource[] = [
  {
    id: 'rss',
    label: 'RSS 2.0',
    kind: 'application/rss+xml',
    href: '/rss.xml',
    mime: 'RSS',
  },
  {
    id: 'atom',
    label: 'Atom 1.0',
    kind: 'application/atom+xml',
    href: '/atom.xml',
    mime: 'ATOM',
  },
] as const;

interface Props {
  readonly articleCount?: number;
}

async function copyFeedUrl(url: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Subscribe panel for the blog index — surfaces the RSS/Atom feed URLs so
 * readers can subscribe at a glance. Each feed row exposes the absolute URL,
 * a copy-to-clipboard button (with copied feedback), and an open-feed link.
 * Styled to match the editorial/mono language of `BlogSection`.
 */
export default function BlogSubscribe({ articleCount }: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimer = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(copyTimer.current);
    };
  }, []);

  const handleCopy = async (feed: FeedSource) => {
    const url = `${SITE_ORIGIN}${feed.href}`;
    const ok = await copyFeedUrl(url);
    if (ok && mounted.current) {
      setCopiedId(feed.id);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(
        () => setCopiedId((current) => (current === feed.id ? null : current)),
        1800,
      );
    }
  };

  return (
    <section className="blog-subscribe" aria-label="订阅源">
      <header className="blog-subscribe__head">
        <span className="blog-subscribe__icon" aria-hidden="true">
          <RssIcon width={14} height={14} />
        </span>
        <span className="blog-subscribe__title">SUBSCRIBE / 订阅</span>
        <span className="blog-subscribe__divider" aria-hidden="true" />
        <span className="blog-subscribe__hint">RSS · Atom · 长期更新</span>
      </header>

      <p className="blog-subscribe__desc">
        把源地址填进阅读器，新文章自动送达。
        {typeof articleCount === 'number' && articleCount > 0 && (
          <>
            {' '}
            当前已收录 <span className="blog-subscribe__count">{articleCount}</span> 篇。
          </>
        )}
      </p>

      <ul className="blog-subscribe__feeds">
        {FEEDS.map((feed) => {
          const absolute = `${SITE_ORIGIN}${feed.href}`;
          const copied = copiedId === feed.id;
          return (
            <li key={feed.id} className="blog-subscribe__feed">
              <span className="blog-subscribe__feed-label" data-mime={feed.mime}>
                {feed.label}
              </span>
              <a
                href={feed.href}
                target="_blank"
                rel="noopener noreferrer"
                className="blog-subscribe__url"
                data-cursor="RSS"
                title={`打开 ${feed.label} 源 (${feed.kind})`}
              >
                {absolute}
              </a>
              <div className="blog-subscribe__actions">
                <a
                  href={feed.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="blog-subscribe__open"
                  data-cursor="RSS"
                  aria-label={`在新标签打开 ${feed.label}`}
                  title="在新标签打开"
                >
                  <ExternalLinkIcon width={13} height={13} />
                </a>
                <button
                  type="button"
                  onClick={() => void handleCopy(feed)}
                  className="blog-subscribe__copy"
                  data-cursor="COPY"
                  data-copied={copied ? 'true' : 'false'}
                  aria-label={copied ? `已复制 ${feed.label} 地址` : `复制 ${feed.label} 地址`}
                  title={copied ? '已复制' : '复制地址'}
                >
                  {copied ? 'COPIED' : 'COPY'}
                  <CopyIcon width={13} height={13} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
