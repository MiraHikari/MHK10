import { prefetchArticleBody } from '@/lib/article-body-cache';
import { formatPostDate } from '@/lib/blog/client';
import ArrowUpRightIcon from '~icons/lucide/arrow-up-right';
import type { ArticleListItem, ArticleRelationItem } from '@/lib/blog/types';

interface Props {
  readonly article: ArticleListItem;
  readonly onOpenArticle?: (slug: string) => void;
}

interface RelationGroupProps {
  readonly code: string;
  readonly title: string;
  readonly emptyText: string;
  readonly items: readonly ArticleRelationItem[];
  readonly onOpenArticle?: (slug: string) => void;
}

function RelationGroup({ code, title, emptyText, items, onOpenArticle }: RelationGroupProps) {
  return (
    <section className="article-relations__group" aria-labelledby={`article-relations-${code}`}>
      <header className="article-relations__heading">
        <span aria-hidden="true">{code}</span>
        <h3 id={`article-relations-${code}`}>{title}</h3>
        <strong>{String(items.length).padStart(2, '0')}</strong>
      </header>
      {items.length > 0 ? (
        <ul className="article-relations__list">
          {items.map((item) => (
            <li key={item.id}>
              <a
                href={`/blog/${item.id}`}
                onPointerEnter={() => void prefetchArticleBody(item.id)}
                onFocus={() => void prefetchArticleBody(item.id)}
                onClick={(event) => {
                  if (!onOpenArticle) return;
                  event.preventDefault();
                  onOpenArticle(item.id);
                }}
              >
                <span className="article-relations__category">{item.category ?? 'ARTICLE'}</span>
                <span className="article-relations__copy">
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </span>
                <span className="article-relations__arrow" aria-hidden="true">
                  <ArrowUpRightIcon width={14} height={14} />
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="article-relations__empty">{emptyText}</p>
      )}
    </section>
  );
}

export default function ArticleRelations({ article, onOpenArticle }: Props) {
  const hasVersionInfo = article.version != null || article.updates.length > 0;
  const hasRelations =
    article.relations.references.length > 0 ||
    article.relations.backlinks.length > 0 ||
    article.relations.related.length > 0;

  if (!hasVersionInfo && !hasRelations) return null;

  return (
    <aside className="article-relations" aria-label="文章关系与更新记录">
      {hasVersionInfo ? (
        <section className="article-history" aria-labelledby="article-history-title">
          <header className="article-history__header">
            <div>
              <span className="article-history__eyebrow">// CHANGELOG</span>
              <h2 id="article-history-title">文章更新记录</h2>
            </div>
            {article.version ? (
              <span className="article-version" aria-label={`当前版本 ${article.version}`}>
                v{article.version}
              </span>
            ) : null}
          </header>
          {article.updates.length > 0 ? (
            <ol className="article-history__timeline">
              {article.updates.map((update, index) => (
                <li key={`${update.version}-${update.dateISO}`}>
                  <span className="article-history__dot" aria-hidden="true" />
                  <div className="article-history__meta">
                    <strong>v{update.version}</strong>
                    <time dateTime={update.dateISO}>
                      {formatPostDate(new Date(update.dateISO))}
                    </time>
                    {index === 0 ? <span>当前</span> : null}
                  </div>
                  <p>{update.summary}</p>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}

      <div className="article-relations__grid">
        <RelationGroup
          code="OUT"
          title="本文引用"
          emptyText="本文暂未引用站内文章。"
          items={article.relations.references}
          onOpenArticle={onOpenArticle}
        />
        <RelationGroup
          code="IN"
          title="引用本文"
          emptyText="暂时还没有其他文章引用本文。"
          items={article.relations.backlinks}
          onOpenArticle={onOpenArticle}
        />
        <RelationGroup
          code="NEXT"
          title="继续阅读"
          emptyText="相关文章会在内容网络扩展后出现。"
          items={article.relations.related}
          onOpenArticle={onOpenArticle}
        />
      </div>
    </aside>
  );
}
