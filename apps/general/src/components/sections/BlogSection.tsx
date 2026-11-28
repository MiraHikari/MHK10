import { useEffect, useMemo } from 'react';
import SectionShell from '../SectionShell';
import AIGenBadge from '../blog/AIGenBadge';
import BlogSubscribe from '../blog/BlogSubscribe';
import { formatPostDate } from '@/lib/blog/client';
import { prefetchArticleBody } from '@/lib/article-body-cache';
import { ensureBlogStyles } from '@/lib/blog/css';
import { useBlogSection } from '@/components/blog/BlogSectionContext';
import { countTags } from '@/lib/blog/tags';
import { useKounterCounts } from '@/hooks/useKounterCounts';
import { articleTarget, formatCount } from '@/lib/kounter';

/**
 * Blog index as a main-site section. Reuses `SectionShell` for the editorial
 * header; entrance is container-level — cards mount statically under the
 * SectionViewport「散焦 · 聚焦」gesture.
 */
export default function BlogSection() {
  const { articles, blogActiveTag, onBlogActiveTagChange, onOpenArticle } = useBlogSection();
  // context 字段名与内部语义名解耦（内部逻辑沿用 activeTag）。
  const activeTag = blogActiveTag;

  // SPA 内从其他章节进入博客列表时，服务端路由的 blog.css 不在场，按需注入一次。
  useEffect(() => {
    ensureBlogStyles();
  }, []);

  const listedArticles = useMemo(() => articles.filter((a) => a.listed), [articles]);

  const filteredArticles = useMemo(
    () => (activeTag ? listedArticles.filter((a) => a.tags.includes(activeTag)) : listedArticles),
    [listedArticles, activeTag],
  );

  const tags = useMemo(() => countTags(listedArticles), [listedArticles]);

  const latestDate = useMemo(() => {
    if (listedArticles.length === 0) return null;
    return listedArticles.reduce(
      (max, a) => (a.publishDate > max ? a.publishDate : max),
      listedArticles[0].publishDate,
    );
  }, [listedArticles]);

  const latestSlug = useMemo(() => {
    if (listedArticles.length === 0) return null;
    return listedArticles.reduce(
      (latest, a) => (a.publishDate > latest.publishDate ? a : latest),
      listedArticles[0],
    ).id;
  }, [listedArticles]);

  const isFiltered = !!activeTag;

  // 列表每篇阅读数（只读，不自增）：targets 经 useMemo 稳定引用，
  // 避免每次渲染触发 hook 重新获取。
  const listedTargets = useMemo(
    () => filteredArticles.map((post) => articleTarget(post.id)),
    [filteredArticles],
  );
  const viewsByTarget = useKounterCounts(listedTargets);

  return (
    <SectionShell
      isDark
      tagLine="// BLOG"
      badgeText="BLOG"
      heading="思想存档与随笔"
      accent="thoughts, archived"
      headingLevel={1}
      metaLine="// MIRAHIKARI::BLOG::INDEX::GET()"
    >
      <div className="blog-index-grid">
        <div className="blog-index-main">
          <div className="blog-index-meta">
            <span className="blog-index-meta__item">
              <span className="blog-index-meta__key">TOTAL</span>
              <span className="blog-index-meta__val">{listedArticles.length}</span>
            </span>
            <span className="blog-index-meta__sep" aria-hidden="true">
              /
            </span>
            <span className="blog-index-meta__item">
              <span className="blog-index-meta__key">SHOWING</span>
              <span className="blog-index-meta__val">
                {filteredArticles.length}
                {isFiltered && <span className="blog-index-meta__sub"> · #{activeTag}</span>}
              </span>
            </span>
            {latestDate && (
              <>
                <span className="blog-index-meta__sep" aria-hidden="true">
                  /
                </span>
                <span className="blog-index-meta__item">
                  <span className="blog-index-meta__key">LATEST</span>
                  <span className="blog-index-meta__val">{formatPostDate(latestDate)}</span>
                </span>
              </>
            )}
          </div>

          {isFiltered && (
            <p className="blog-filter-line">
              筛选: <span className="blog-filter-line__tag">#{activeTag}</span>
              <button
                type="button"
                onClick={() => onBlogActiveTagChange(null)}
                className="blog-filter-line__clear"
                data-cursor="BACK"
              >
                × 清除筛选
              </button>
            </p>
          )}

          <section className="blog-list">
            {filteredArticles.length === 0 ? (
              <div className="blog-empty">
                <span className="blog-empty__glyph" aria-hidden="true">
                  ∅
                </span>
                <p className="blog-empty__title">没有匹配的文章</p>
                <p className="blog-empty__desc">
                  标签 <span className="blog-empty__tag">#{activeTag}</span> 下暂无内容。
                </p>
                {isFiltered && (
                  <button
                    type="button"
                    onClick={() => onBlogActiveTagChange(null)}
                    className="blog-empty__reset"
                    data-cursor="BACK"
                  >
                    ← 查看全部
                  </button>
                )}
              </div>
            ) : (
              filteredArticles.map((post) => {
                const views = viewsByTarget.get(articleTarget(post.id));
                return (
                  <article
                    key={post.id}
                    className={`post-card${post.id === latestSlug ? ' post-card--latest' : ''}`}
                    data-cursor="READ"
                  >
                    <a
                      href={`/blog/${post.id}/`}
                      className="post-card__link"
                      data-article-slug={post.id}
                      data-cursor="READ"
                      onPointerEnter={() => void prefetchArticleBody(post.id)}
                      onFocus={() => void prefetchArticleBody(post.id)}
                      onClick={(event) => {
                        event.preventDefault();
                        onOpenArticle?.(post.id);
                      }}
                    >
                      <div className="post-card__meta">
                        <span className="post-card__meta-side">
                          {post.id === latestSlug && (
                            <span className="post-card__latest" aria-label="最新文章">
                              LATEST
                            </span>
                          )}
                          <span className="post-card__cat">{post.category ?? 'ARTICLE'}</span>
                          <AIGenBadge variant="chip" level={post.aiLevel} model={post.aiModel} />
                        </span>
                        <span className="post-card__date">{formatPostDate(post.publishDate)}</span>
                      </div>
                      <h2 className="post-card__title">{post.title}</h2>
                      <p className="post-card__excerpt">{post.description}</p>
                      <div className="post-card__foot">
                        {post.tags.length > 0 && (
                          <ul className="post-card__tags">
                            {post.tags.map((tag) => (
                              <li key={tag}>{tag}</li>
                            ))}
                          </ul>
                        )}
                        <span className="post-card__read">
                          {views !== undefined && (
                            <>
                              <span className="post-card__views">{formatCount(views)} READS</span>
                              <span aria-hidden="true"> · </span>
                            </>
                          )}
                          {post.readingTime} min · 阅读全文 →
                        </span>
                      </div>
                    </a>
                  </article>
                );
              })
            )}
          </section>
        </div>

        <aside className="blog-index-rail" aria-label="文章索引">
          {tags.length > 0 && (
            <>
              <p className="blog-index-rail__label">TAGS</p>
              <ul className="blog-tags">
                <li>
                  <button
                    type="button"
                    onClick={() => onBlogActiveTagChange(null)}
                    aria-pressed={!activeTag}
                    className={activeTag ? undefined : 'is-active'}
                  >
                    ALL · {listedArticles.length}
                  </button>
                </li>
                {tags.map((tag) => (
                  <li key={tag.tag}>
                    <button
                      type="button"
                      onClick={() => onBlogActiveTagChange(activeTag === tag.tag ? null : tag.tag)}
                      aria-pressed={activeTag === tag.tag}
                      className={activeTag === tag.tag ? 'is-active' : undefined}
                    >
                      {tag.tag} · {tag.count}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {latestSlug && (
            <>
              <p className="blog-index-rail__label">LATEST</p>
              <a
                className="blog-index-rail__latest"
                href={`/blog/${latestSlug}/`}
                onPointerEnter={() => void prefetchArticleBody(latestSlug)}
                onFocus={() => void prefetchArticleBody(latestSlug)}
                onClick={(event) => {
                  event.preventDefault();
                  onOpenArticle?.(latestSlug);
                }}
              >
                {listedArticles.find((article) => article.id === latestSlug)?.title}
                <span aria-hidden="true">→</span>
              </a>
            </>
          )}
        </aside>
      </div>

      <BlogSubscribe articleCount={articles.length} />
    </SectionShell>
  );
}
