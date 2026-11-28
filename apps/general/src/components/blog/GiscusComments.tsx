import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Giscus from '@giscus/react';
import {
  GISCUS_CONFIG,
  GISCUS_ORIGIN,
  GISCUS_SLOW_MS,
  GISCUS_WIDGET_DEFAULTS,
  isGiscusConfigured,
} from '@mhk/site-core/config/giscus';
import { motionEase } from '@/lib/motion';
import ThinkingState from '@/components/ui/ThinkingState';
import '@/styles/features/comments.css';

interface GiscusCommentsProps {
  readonly slug: string;
  /** 正文就绪（`.prose-mh.article-body-state` 占位已移除）——由宿主
   *  ArticleView 直接传入，免去在 GiscusComments 里全文档监听 DOM。 */
  readonly bodyReady: boolean;
  /** 头部 eyebrow 文案（mono 大写标签），博客默认 // COMMENTS。 */
  readonly eyebrow?: string;
  /** 头部标题文案，博客默认「评论」。 */
  readonly heading?: string;
}

/** The shared widget defaults, mapped onto the React embed's props. */
export function giscusWidgetProps(term: string) {
  return {
    repo: GISCUS_CONFIG.repo,
    repoId: GISCUS_CONFIG.repoId,
    category: GISCUS_CONFIG.category,
    categoryId: GISCUS_CONFIG.categoryId,
    mapping: GISCUS_WIDGET_DEFAULTS.mapping,
    term,
    strict: GISCUS_WIDGET_DEFAULTS.strict,
    reactionsEnabled: GISCUS_WIDGET_DEFAULTS.reactionsEnabled,
    emitMetadata: GISCUS_WIDGET_DEFAULTS.emitMetadata,
    inputPosition: GISCUS_WIDGET_DEFAULTS.inputPosition,
    theme: GISCUS_WIDGET_DEFAULTS.theme,
    lang: GISCUS_WIDGET_DEFAULTS.lang,
  } as const;
}

/**
 * 评论区宿主：Giscus iframe 懒加载，进入视口前只渲染占位；加载过程中
 * 覆盖站点风格的「THINKING」过渡面板。6s 兜底不再误报完成——超时只切换
 * 文案提示服务较慢，收到 giscus 首条消息才收起面板。
 */
export default function GiscusComments({
  slug,
  bodyReady,
  eyebrow = '// COMMENTS',
  heading = '评论',
}: GiscusCommentsProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSlow, setIsSlow] = useState(false);

  // 进入视口（提前 200px）再真正挂载 Giscus，保留懒加载语义。
  useEffect(() => {
    const section = sectionRef.current;
    if (!section || isVisible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px', threshold: 0 },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, [isVisible]);

  // 检测 Giscus iframe 完成加载：giscus 渲染后会通过 postMessage 发送 resize 等消息。
  useEffect(() => {
    if (!isVisible) return;

    let cancelled = false;
    setIsLoaded(false);
    setIsSlow(false);

    const markLoaded = () => {
      if (cancelled) return;
      setIsLoaded(true);
    };

    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== GISCUS_ORIGIN) return;
      const data = event.data;
      if (data && typeof data === 'object' && 'giscus' in (data as object)) {
        markLoaded();
      }
    };

    window.addEventListener('message', onMessage);
    // 兜底不再无条件 markLoaded：超时只是提示服务响应慢，面板保持，
    // iframe ready 后照常收起。
    const fallbackId = window.setTimeout(() => {
      if (cancelled) return;
      setIsSlow(true);
    }, GISCUS_SLOW_MS);

    return () => {
      cancelled = true;
      window.removeEventListener('message', onMessage);
      window.clearTimeout(fallbackId);
    };
  }, [slug, isVisible]);

  return (
    <section ref={sectionRef} className="article-comments" aria-labelledby="article-comments-title">
      <header className="article-comments__header">
        <span className="article-comments__eyebrow" aria-hidden="true">
          {eyebrow}
        </span>
        <h2 id="article-comments-title">{heading}</h2>
      </header>
      {!isGiscusConfigured() ? (
        <div className="giscus-pending border border-white/10 bg-white/5 p-6 font-mono text-xs text-white/40">
          评论功能尚未启用 · 站点维护者完成 Giscus 配置后开放
        </div>
      ) : (
        <div className="giscus-host" aria-busy={!isLoaded}>
          {isVisible && <Giscus key={slug} {...giscusWidgetProps(slug)} loading="eager" />}
          <AnimatePresence>
            {isVisible && !isLoaded && bodyReady && (
              <motion.div
                key="comments-loader"
                className="comments-loader"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: motionEase }}
              >
                <div className="comments-loader__accent" aria-hidden="true">
                  <div />
                </div>
                <div className="comments-loader__body">
                  {isSlow ? (
                    <p className="comments-loader__log">评论服务响应较慢，稍候…</p>
                  ) : (
                    <>
                      <ThinkingState dark label="LOADING COMMENTS" />
                      <p className="comments-loader__log">
                        Initializing discussion for{' '}
                        <span className="comments-loader__slug">{slug}</span>…
                      </p>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}
