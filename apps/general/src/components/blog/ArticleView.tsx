import { useEffect, useRef, useState } from 'react';
import SectionShell from '../SectionShell';
import TableOfContents from './TableOfContents';
import MobileTOC from './MobileTOC';
import MobileTocFab from './MobileTocFab';
import ReadingProgress from './ReadingProgress';
import { ArticleScrollProvider, resolveScrollContext } from './ArticleScrollProvider';
import Lightbox from '@/components/effects/Lightbox';
import { ensureBlogStyles } from '@/lib/blog/css';
import { enhanceCodeBlocks } from './enhanceCodeBlocks';
import { enhanceArticleImages, type ArticleImage } from './enhanceArticleImages';
import { enhanceHeadings } from './enhanceHeadings';
import { enhanceFootnotes } from './enhanceFootnotes';
import { enhanceArticleLinks } from './enhanceArticleLinks';
import { loadArticleBody, prefetchArticleBody } from '@/lib/article-body-cache';
import { getSavedScroll, saveScroll, shouldRestore } from '@/lib/blog/scroll';
import { getDisplayMode, getVisibleDisplayMode } from '@/hooks/useDisplayMode';
import { readingDocument, saveReadingProgress } from '@mhk/site-core/fusion/browser-reading';
import { FUSION_EVENTS, parseFusionDestination } from '@mhk/site-core/fusion/protocol-model';
import { formatPostDate } from '@/lib/blog/client';
import { toEnglishCategory } from '@/lib/category-map';
import type { ArticleListItem } from '@/lib/blog/types';
import type { LightboxItem } from '@/components/effects/Lightbox';
import { useBlogSection } from '@/components/blog/BlogSectionContext';
import ArticleShareActions from './ArticleShareActions';
import ReadingPrefsControls from './ReadingPrefsControls';
import ZenBlock from './ZenBlock';
import ArticleRelations from './ArticleRelations';
import AIGenBadge from './AIGenBadge';
import ArticleCopyright from './ArticleCopyright';
import GiscusComments from './GiscusComments';
import ArrowLeftIcon from '~icons/lucide/arrow-left';
import ThinkingState from '@/components/ui/ThinkingState';
import PrivacyArticle from './PrivacyArticle';
import { PRIVACY_ARTICLE_SLUG } from '@/lib/blog/client';
import { useArticleViews } from '@/hooks/useArticleViews';
import { formatCount } from '@/lib/kounter';

interface Props {
  /** The active article (resolved from the `articles` list by slug). */
  readonly article?: ArticleListItem;
}

/**
 * Article reading mode — rendered inside the blog section's full-screen slot
 * when an article is open. Reuses `SectionShell` for the editorial header,
 * the existing `.prose-mh` / `.blog-post__body` / `.post-nav` styles, and the
 * existing `TableOfContents` + `ReadingProgress` (adapted to the Lenis scroll
 * container). Enter/return use the shared「散焦 · 聚焦」container-level transition
 * in `useFullpageNavigation`.
 */
export default function ArticleView({ article }: Props) {
  const {
    onBackFromArticle: onBack,
    onOpenArticle,
    articleBody: children,
    articleBodySlug: serverBodySlug,
    tocOpen,
    onTocOpenChange,
  } = useBlogSection();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyState, setBodyState] = useState<{
    slug?: string;
    status: 'idle' | 'loading' | 'ready' | 'error';
    html?: string;
  }>(() => ({
    slug: article?.id,
    status: children != null && article?.id === serverBodySlug ? 'ready' : 'idle',
  }));
  const [retryNonce, setRetryNonce] = useState(0);
  const [lightboxImages, setLightboxImages] = useState<ArticleImage[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [headingCopyStatus, setHeadingCopyStatus] = useState('');
  const headingCopyTimer = useRef<number>(0);
  const articleId = article?.id;
  const usesServerBody = children != null && articleId === serverBodySlug;
  const views = useArticleViews(articleId);
  // 隐私说明是结构化双语内容，不走 fragment 加载 / prose 增强管线。
  const isPrivacy = articleId === PRIVACY_ARTICLE_SLUG;

  // 博客样式只随服务端博客路由加载；SPA 内进入时注入一次（与 BlogSection 共用）。
  useEffect(() => {
    ensureBlogStyles();
  }, []);

  useEffect(() => {
    if (!articleId || isPrivacy) return;
    if (usesServerBody) {
      setBodyState({ slug: articleId, status: 'ready' });
      return;
    }

    let cancelled = false;
    setBodyState({ slug: articleId, status: 'loading' });
    void loadArticleBody(articleId).then(
      (html) => {
        if (!cancelled) setBodyState({ slug: articleId, status: 'ready', html });
      },
      () => {
        if (!cancelled) setBodyState({ slug: articleId, status: 'error' });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [articleId, retryNonce, usesServerBody, isPrivacy]);

  const bodyReady =
    isPrivacy || usesServerBody || (bodyState.slug === articleId && bodyState.status === 'ready');
  const currentBodyStatus = bodyReady
    ? 'ready'
    : bodyState.slug === articleId
      ? bodyState.status
      : 'loading';
  const bodyAnnouncement =
    currentBodyStatus === 'ready'
      ? '文章正文加载完成'
      : currentBodyStatus === 'error'
        ? '文章正文加载失败'
        : '正在思考文章正文';

  // Enhance code blocks (language label + copy button) once the body is
  // populated — covers both direct-load children and fetched fragment HTML.
  useEffect(() => {
    if (!bodyReady || !bodyRef.current) return;
    return enhanceCodeBlocks(bodyRef.current);
  }, [articleId, bodyReady, bodyState.html]);

  // Enhance article images with click-to-lightbox. Runs after the body is
  // populated, with the same lifecycle as code-block enhancement. Clicks are
  // delegated on the container; the returned disposer unbinds on cleanup.
  useEffect(() => {
    if (!bodyReady || !bodyRef.current) return;
    return enhanceArticleImages(bodyRef.current, (index, images) => {
      setLightboxImages(images);
      setLightboxIndex(index);
    });
  }, [articleId, bodyReady, bodyState.html]);

  // Enhance headings with copyable deep-link anchors. Same lifecycle as the
  // code-block and image enhancers; the callback surfaces a brief sr-only status.
  useEffect(() => {
    if (!bodyReady || !bodyRef.current) return;
    const dispose = enhanceHeadings(bodyRef.current, () => {
      setHeadingCopyStatus('已复制本节链接');
      window.clearTimeout(headingCopyTimer.current);
      headingCopyTimer.current = window.setTimeout(() => setHeadingCopyStatus(''), 1500);
    });
    return () => {
      window.clearTimeout(headingCopyTimer.current);
      dispose();
    };
  }, [articleId, bodyReady, bodyState.html]);

  // Enhance GFM footnote references with an inline expand panel. Same lifecycle
  // as the other enhancers; the returned disposer unbinds listeners on cleanup.
  useEffect(() => {
    if (!bodyReady || !bodyRef.current) return;
    return enhanceFootnotes(bodyRef.current);
  }, [articleId, bodyReady, bodyState.html]);

  // Same-origin /blog/<slug> links in prose use SPA article transition.
  useEffect(() => {
    if (!bodyReady || !bodyRef.current || !onOpenArticle) return;
    return enhanceArticleLinks(bodyRef.current, onOpenArticle);
  }, [articleId, bodyReady, bodyState.html, onOpenArticle]);

  // 阅读进度持久化（保存）：bodyReady 后给滚动目标（.section-scroll 或
  // window）挂 scroll 监听，节流 1s 写存储；scrollend 立即写；cleanup
  // 移除监听并最后一次保存。
  useEffect(() => {
    if (!bodyReady || !bodyRef.current || !articleId) return;
    const content = bodyRef.current;
    const { target, element } = resolveScrollContext(content);
    let timer = 0;
    const persist = () => {
      if (getDisplayMode() !== 'classic' || getVisibleDisplayMode() !== 'classic') return;
      saveScroll(articleId, element.scrollTop);
      const max = Math.max(0, element.scrollHeight - element.clientHeight);
      const headings = Array.from(content.querySelectorAll<HTMLElement>('h2[id], h3[id]'));
      const anchor =
        headings.findLast(
          (heading) =>
            heading.getBoundingClientRect().top <= element.getBoundingClientRect().top + 80,
        )?.id ?? '';
      saveReadingProgress(articleId, max > 0 ? element.scrollTop / max : 0, anchor, article?.title);
    };
    const flush = () => {
      window.clearTimeout(timer);
      persist();
    };
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(persist, 1000);
    };
    const onScrollEnd = () => {
      window.clearTimeout(timer);
      persist();
    };
    target.addEventListener('scroll', onScroll, { passive: true });
    target.addEventListener('scrollend', onScrollEnd);
    window.addEventListener(FUSION_EVENTS.flushReading, flush);
    return () => {
      window.clearTimeout(timer);
      target.removeEventListener('scroll', onScroll);
      target.removeEventListener('scrollend', onScrollEnd);
      window.removeEventListener(FUSION_EVENTS.flushReading, flush);
      persist();
    };
  }, [articleId, bodyReady, bodyState.html]);

  // 阅读进度持久化（恢复）：字体就绪 + 650ms（避开 sectionEnter 0.5s
  // 进场转场）后回跳存储位置。用户若已手动滚动则不再恢复；滚回顶部后
  // 存储归零，下次自然不再恢复（自校正）。
  useEffect(() => {
    if (!bodyReady || !bodyRef.current || !articleId) return;
    let cancelled = false;
    let timer = 0;
    const fontsReady = document.fonts?.ready ?? Promise.resolve();
    void fontsReady.then(() => {
      if (cancelled) return;
      timer = window.setTimeout(() => {
        if (cancelled || !bodyRef.current) return;
        const saved = getSavedScroll(articleId);
        const { element, target } = resolveScrollContext(bodyRef.current);
        let shared;
        try {
          shared = readingDocument(articleId);
        } catch {
          shared = undefined;
        }
        const top = shared
          ? shared.progress * Math.max(0, element.scrollHeight - element.clientHeight)
          : saved;
        if (!shared && !shouldRestore(saved)) return;
        if (target === window) {
          if (window.scrollY > 0) return;
          window.scrollTo({ top, behavior: 'instant' });
        } else {
          if (element.scrollTop > 0) return;
          element.scrollTop = top;
        }
      }, 650);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [articleId, bodyReady, bodyState.html]);

  useEffect(() => {
    if (!articleId || !bodyReady) return;
    const restore = (anchor?: string) => {
      if (getDisplayMode() !== 'classic' || !bodyRef.current) return;
      let shared;
      try {
        shared = readingDocument(articleId);
      } catch {
        return;
      }
      if (!shared) return;
      const { element } = resolveScrollContext(bodyRef.current);
      // Local scroll writes already match; synchronize a remote handoff without an animated jump.
      const top = shared.progress * Math.max(0, element.scrollHeight - element.clientHeight);
      if (Math.abs(element.scrollTop - top) > 2) element.scrollTop = top;
      if (anchor) {
        const heading = Array.from(bodyRef.current.querySelectorAll<HTMLElement>('[id]')).find(
          (node) => node.id === anchor,
        );
        if (heading)
          element.scrollTop +=
            heading.getBoundingClientRect().top - element.getBoundingClientRect().top - 32;
      }
    };
    const onReturn = (event: Event) => {
      const destination = parseFusionDestination((event as CustomEvent<unknown>).detail);
      if (destination?.kind === 'article' && destination.id === articleId)
        restore(destination.anchor);
    };
    window.addEventListener(FUSION_EVENTS.restoreReading, onReturn);
    return () => {
      window.removeEventListener(FUSION_EVENTS.restoreReading, onReturn);
    };
  }, [articleId, bodyReady, bodyState.html]);

  useEffect(() => {
    setLightboxIndex(null);
    setLightboxImages(null);
  }, [articleId]);

  // 切换文章时关掉目录 sheet：否则它在正文未加载期间保持打开，点标题时
  // getElementById 解析到旧/空 DOM，sheet 静默关闭却不滚动。
  useEffect(() => {
    onTocOpenChange(false);
  }, [articleId, onTocOpenChange]);

  if (!article) return null;

  const lightboxItems: LightboxItem[] = (lightboxImages ?? []).map((img) => ({
    imageSrc: img.src,
    imageAlt: img.alt,
    title: img.title || img.alt || 'Article image',
    location: '',
    year: '',
    dateLabel: img.dateLabel,
    category: 'IMAGE',
    downloadSrc: img.downloadSrc,
    description: '',
    tags: [],
  }));

  // 回调（onPointerEnter/onFocus/onClick）内 TS 会丢失可空性收窄，
  // 先解构为局部常量，避免在回调里重复非空断言。
  const seriesNav = article.seriesNav;
  const seriesPrev = seriesNav?.prev ?? null;
  const seriesNext = seriesNav?.next ?? null;
  const plainPrev = article.prev ?? null;
  const plainNext = article.next ?? null;

  // 正文槽：隐私说明由专用组件接管；普通文章按加载状态渲染
  // prose / 错误重试 / 加载中。
  const renderBody = () => {
    if (isPrivacy) return <PrivacyArticle />;
    if (usesServerBody) {
      return (
        <div key={article.id} ref={bodyRef} className="prose-mh">
          {children}
        </div>
      );
    }
    if (bodyState.slug === article.id && bodyState.status === 'ready') {
      return (
        <div
          key={article.id}
          ref={bodyRef}
          className="prose-mh"
          dangerouslySetInnerHTML={{ __html: bodyState.html ?? '' }}
        />
      );
    }
    if (currentBodyStatus === 'error') {
      return (
        <div key={article.id} ref={bodyRef} className="prose-mh article-body-state" tabIndex={-1}>
          <span className="article-body-state__code" aria-hidden="true">
            ERR
          </span>
          <p className="article-body-state__title">文章正文加载失败</p>
          <p className="article-body-state__detail">网络恢复后可重试，或使用独立文章页继续阅读。</p>
          <div className="article-body-state__actions">
            <button
              type="button"
              onClick={() => {
                bodyRef.current?.focus();
                setRetryNonce((value) => value + 1);
              }}
            >
              重试
            </button>
            <a href={`/blog/${article.id}`}>打开独立文章页</a>
          </div>
        </div>
      );
    }
    return (
      <div
        key={article.id}
        ref={bodyRef}
        className="prose-mh article-body-state article-body-state--loading"
        tabIndex={-1}
      >
        <ThinkingState dark label="THINKING" />
        <p className="article-body-state__detail">正在整理当前文章，只请求这一份正文。</p>
      </div>
    );
  };

  return (
    <ArticleScrollProvider articleKey={article.id} contentRef={bodyRef} headings={article.headings}>
      <ReadingProgress />
      {/* 移动端目录 FAB 与 bottom sheet 正文就绪前不渲染：sheet 打开时正文
          DOM 尚未填充，点标题会解析不到锚点。两者内部经 portal 挂到 body。 */}
      {bodyReady && (
        <>
          <MobileTocFab open={tocOpen} onOpen={() => onTocOpenChange(true)} />
          <MobileTOC open={tocOpen} onOpenChange={onTocOpenChange} />
        </>
      )}
      <SectionShell
        isDark
        tagLine="// BLOG · 长期主义"
        badgeText={toEnglishCategory(article.category)}
        heading={article.title}
        accent="long form"
        headingLevel={1}
        metaLine={`// ${formatPostDate(article.publishDate)} · ${article.readingTime}min · ${article.author}`}
        contentClassName="article-flow"
      >
        <div>
          <AIGenBadge level={article.aiLevel} model={article.aiModel} />
        </div>

        <ZenBlock className="article-actions">
          <div className="article-back-cluster">
            <button type="button" onClick={onBack} data-cursor="BACK" className="article-back">
              <ArrowLeftIcon className="article-back__icon" width={14} height={14} />
              <span>返回博客</span>
            </button>
            {views !== null && (
              <span className="article-views">
                <span className="sr-only">阅读次数 {formatCount(views)}，</span>
                {formatCount(views)} READS
              </span>
            )}
          </div>
          <ArticleShareActions
            title={article.title}
            description={article.description}
            slug={article.id}
            bodyReady={bodyReady}
          />
          <ReadingPrefsControls />
        </ZenBlock>

        <div className="blog-post__body" aria-busy={!bodyReady}>
          <span className="sr-only" role="status" aria-live="polite">
            {bodyAnnouncement}
          </span>
          <span className="sr-only" role="status" aria-live="polite">
            {headingCopyStatus}
          </span>
          {renderBody()}
          {/* TOC 列始终渲染：bodyReady 前是同尺寸骨架（防正文到达瞬间的
              CLS），就绪后原位替换为 TableOfContents（后者依赖滚动上下文，
              骨架阶段不能渲染）。 */}
          <aside className="blog-post__aside" aria-hidden={!bodyReady}>
            <ZenBlock>
              {bodyReady ? (
                <TableOfContents readingTime={article.readingTime} />
              ) : (
                <div className="blog-post__aside--skeleton">
                  <span className="blog-post__aside--skeleton__bar" />
                  <span className="blog-post__aside--skeleton__stats" />
                  <span className="blog-post__aside--skeleton__line" />
                  <span className="blog-post__aside--skeleton__line" />
                  <span className="blog-post__aside--skeleton__line" />
                </div>
              )}
            </ZenBlock>
          </aside>
        </div>

        {bodyReady && (
          <ZenBlock>
            <ArticleCopyright
              slug={article.id}
              title={article.title}
              aiLevel={article.aiLevel}
              aiModel={article.aiModel}
            />
          </ZenBlock>
        )}

        <ZenBlock>
          <ArticleRelations article={article} onOpenArticle={onOpenArticle} />
        </ZenBlock>

        {article.comments && (
          <ZenBlock>
            <GiscusComments slug={article.id} bodyReady={bodyReady} />
          </ZenBlock>
        )}

        {seriesNav ? (
          <ZenBlock>
            <nav className="article-series" aria-label={`系列「${seriesNav.name}」文章导航`}>
              <header className="article-series__head">
                <span className="article-series__eyebrow">// SERIES</span>
                <h2>{seriesNav.name}</h2>
                <strong>{String(seriesNav.total).padStart(2, '0')}</strong>
              </header>
              <ol className="article-series__list">
                {seriesNav.items.map((item, index) => (
                  <li key={item.id}>
                    <a
                      href={`/blog/${item.id}`}
                      aria-current={item.current ? 'page' : undefined}
                      data-cursor={item.current ? undefined : 'OPEN'}
                      onPointerEnter={() => {
                        if (!item.current) void prefetchArticleBody(item.id);
                      }}
                      onFocus={() => {
                        if (!item.current) void prefetchArticleBody(item.id);
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        if (item.current || !onOpenArticle) return;
                        onOpenArticle(item.id);
                      }}
                    >
                      <span className="article-series__index">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="article-series__title">{item.title}</span>
                    </a>
                  </li>
                ))}
              </ol>
              <div className="article-series__nav">
                {seriesPrev ? (
                  <a
                    className="post-nav__item"
                    href={`/blog/${seriesPrev.id}`}
                    data-cursor="BACK"
                    onPointerEnter={() => void prefetchArticleBody(seriesPrev.id)}
                    onFocus={() => void prefetchArticleBody(seriesPrev.id)}
                    onClick={(event) => {
                      event.preventDefault();
                      onOpenArticle?.(seriesPrev.id);
                    }}
                  >
                    <div className="post-nav__label">← 上一篇</div>
                    <div className="post-nav__title">{seriesPrev.title}</div>
                  </a>
                ) : (
                  <span className="post-nav__item post-nav__item--empty" />
                )}
                {seriesNext ? (
                  <a
                    className="post-nav__item post-nav__item--next"
                    href={`/blog/${seriesNext.id}`}
                    data-cursor="NEXT"
                    onPointerEnter={() => void prefetchArticleBody(seriesNext.id)}
                    onFocus={() => void prefetchArticleBody(seriesNext.id)}
                    onClick={(event) => {
                      event.preventDefault();
                      onOpenArticle?.(seriesNext.id);
                    }}
                  >
                    <div className="post-nav__label">下一篇 →</div>
                    <div className="post-nav__title">{seriesNext.title}</div>
                  </a>
                ) : (
                  <span className="post-nav__item post-nav__item--empty" />
                )}
              </div>
            </nav>
          </ZenBlock>
        ) : plainPrev || plainNext ? (
          <ZenBlock>
            <nav className="post-nav" aria-label="文章导航">
              {plainPrev ? (
                <a
                  className="post-nav__item"
                  href={`/blog/${plainPrev.id}`}
                  data-cursor="BACK"
                  onPointerEnter={() => void prefetchArticleBody(plainPrev.id)}
                  onFocus={() => void prefetchArticleBody(plainPrev.id)}
                  onClick={(event) => {
                    event.preventDefault();
                    onOpenArticle?.(plainPrev.id);
                  }}
                >
                  <div className="post-nav__label">← 上一篇</div>
                  <div className="post-nav__title">{plainPrev.title}</div>
                </a>
              ) : (
                <span className="post-nav__item post-nav__item--empty" />
              )}
              {plainNext ? (
                <a
                  className="post-nav__item post-nav__item--next"
                  href={`/blog/${plainNext.id}`}
                  data-cursor="NEXT"
                  onPointerEnter={() => void prefetchArticleBody(plainNext.id)}
                  onFocus={() => void prefetchArticleBody(plainNext.id)}
                  onClick={(event) => {
                    event.preventDefault();
                    onOpenArticle?.(plainNext.id);
                  }}
                >
                  <div className="post-nav__label">下一篇 →</div>
                  <div className="post-nav__title">{plainNext.title}</div>
                </a>
              ) : (
                <span className="post-nav__item post-nav__item--empty" />
              )}
            </nav>
          </ZenBlock>
        ) : null}
      </SectionShell>

      <Lightbox
        items={lightboxItems}
        index={lightboxIndex}
        onClose={() => {
          setLightboxIndex(null);
          setLightboxImages(null);
        }}
        onNavigate={setLightboxIndex}
        variant="gallery"
      />
    </ArticleScrollProvider>
  );
}
