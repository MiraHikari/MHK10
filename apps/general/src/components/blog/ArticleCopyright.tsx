import CCIcon from '~icons/simple-icons/creativecommons';
import {
  AI_LEGAL_NOTE,
  BLOG_LICENSE,
  BLOG_LICENSE_TERMS,
  REPRINT_NOTE,
  SITE_ORIGIN,
  copyrightLine,
} from '@/lib/blog/legal';
import { aiLevelLabel, type AILevel } from '@/lib/blog/ai';

interface Props {
  readonly slug: string;
  readonly title: string;
  readonly aiLevel: AILevel;
  readonly aiModel?: string;
}

/**
 * 文章页脚版权块：按著作权 / 许可协议 / 原文链接 / 转载须知分类成网格，
 * 头部以 BY / NC / SA 标签拆解许可条款，AI 参与内容（如有）追加通栏附注。
 */
export default function ArticleCopyright({ slug, title, aiLevel, aiModel }: Props) {
  const canonical = `${SITE_ORIGIN}/blog/${slug}/`;

  return (
    <aside className="article-legal" aria-label="版权与许可信息">
      <div className="article-legal__head">
        <span className="article-legal__eyebrow" aria-hidden="true">
          <CCIcon className="article-legal__cc" width={13} height={13} aria-hidden="true" />
          LICENSE · 版权与许可
        </span>
        <span className="article-legal__terms">
          {BLOG_LICENSE_TERMS.map((term) => (
            <span key={term.code} className="article-legal__term">
              <span className="article-legal__term-code" aria-hidden="true">
                {term.code}
              </span>
              {term.label}
            </span>
          ))}
        </span>
      </div>
      <dl className="article-legal__grid">
        <div className="article-legal__item">
          <dt className="article-legal__key">Copyright · 著作权</dt>
          <dd className="article-legal__value">
            {copyrightLine()} · 《{title}》
          </dd>
        </div>
        <div className="article-legal__item">
          <dt className="article-legal__key">License · 许可协议</dt>
          <dd className="article-legal__value">
            <a href={BLOG_LICENSE.url} target="_blank" rel="license noopener noreferrer">
              {BLOG_LICENSE.id}
            </a>
            （{BLOG_LICENSE.name}）
          </dd>
        </div>
        <div className="article-legal__item">
          <dt className="article-legal__key">Canonical · 原文链接</dt>
          <dd className="article-legal__value article-legal__url">
            <a href={canonical}>{canonical}</a>
          </dd>
        </div>
        <div className="article-legal__item">
          <dt className="article-legal__key">Reprint · 转载须知</dt>
          <dd className="article-legal__value">{REPRINT_NOTE}</dd>
        </div>
        {aiLevel !== 'human' ? (
          <div className="article-legal__item article-legal__item--ai">
            <dt className="article-legal__key">AI Notice · {aiLevelLabel(aiLevel, aiModel)}</dt>
            <dd className="article-legal__value">{AI_LEGAL_NOTE}</dd>
          </div>
        ) : null}
      </dl>
    </aside>
  );
}
