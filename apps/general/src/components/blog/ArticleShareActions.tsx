import { useEffect, useRef, useState } from 'react';
import AIShareMenu from './AIShareMenu';
import SelectionQuotePill from './SelectionQuotePill';
import { useArticleHighlights } from '@/hooks/blog/useArticleHighlights';
import { writeClipboard } from '@/lib/clipboard';
import ShareIcon from '~icons/lucide/share-2';
import FileCodeIcon from '~icons/lucide/file-code';
import CheckIcon from '~icons/lucide/check';

interface Props {
  readonly title: string;
  readonly description?: string;
  readonly slug: string;
  /** 正文是否就绪：控制高亮恢复（useArticleHighlights）。 */
  readonly bodyReady: boolean;
}

export default function ArticleShareActions({ title, description, slug, bodyReady }: Props) {
  const [selection, setSelection] = useState('');
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [done, setDone] = useState<'share' | 'md' | null>(null);
  const doneTimer = useRef<number | null>(null);
  const highlights = useArticleHighlights(slug, bodyReady);

  useEffect(() => {
    // `.prose-mh` 随正文异步挂载：首次命中后缓存，避免每次 selectionchange
    // 都全文档查询一次。
    let prose: Element | null | undefined;
    const update = () => {
      const current = window.getSelection();
      const text = current?.toString().trim() ?? '';
      const anchor = current?.anchorNode;
      prose ??= document.querySelector('.prose-mh');
      const insideArticle = anchor instanceof Node && prose?.contains(anchor);
      setSelection(insideArticle && text.length >= 4 ? text.slice(0, 1200) : '');
    };
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, [slug]);

  useEffect(
    () => () => {
      if (doneTimer.current) window.clearTimeout(doneTimer.current);
    },
    [],
  );

  const flashDone = (which: 'share' | 'md') => {
    setDone(which);
    if (doneTimer.current) window.clearTimeout(doneTimer.current);
    doneTimer.current = window.setTimeout(
      () => setDone((cur) => (cur === which ? null : cur)),
      1800,
    );
  };

  const share = async () => {
    const url = `${window.location.origin}/blog/${slug}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text: description, url });
        setStatus('分享面板已打开');
      } catch {
        /* user cancelled */
      }
      return;
    }
    const ok = await writeClipboard(url);
    if (!ok) {
      setStatus('复制失败，请手动复制地址');
      return;
    }
    setStatus('文章链接已复制');
    flashDone('share');
  };

  const copyMarkdown = async () => {
    try {
      const response = await fetch(`/blog/${slug}.md`);
      if (!response.ok) throw new Error('Markdown request failed');
      const ok = await writeClipboard(await response.text());
      if (!ok) {
        setStatus('复制失败，请重试');
        return;
      }
      setStatus('Markdown 已复制');
      flashDone('md');
    } catch {
      setStatus('Markdown 获取失败，请重试');
    }
  };

  return (
    <div className="article-share-actions">
      {/* 分享胶囊：AI 阅读 / 分享 / 复制 Markdown 收进同一容器，发丝竖线分隔 */}
      <div className="article-tool-cluster">
        <AIShareMenu
          title={title}
          description={description}
          slug={slug}
          selection={selection}
          open={aiMenuOpen}
          onOpenChange={setAiMenuOpen}
        />
        <button
          type="button"
          className="article-tool-button"
          aria-label="分享"
          onClick={() => void share()}
          data-cursor="SHARE"
          data-done={done === 'share' ? 'true' : 'false'}
        >
          {done === 'share' ? (
            <CheckIcon width={13} height={13} />
          ) : (
            <ShareIcon width={13} height={13} />
          )}
          <span className="article-tool-button__label">
            {done === 'share' ? '已复制链接' : '分享'}
          </span>
        </button>
        <button
          type="button"
          className="article-tool-button"
          aria-label="复制 Markdown"
          onClick={() => void copyMarkdown()}
          data-cursor="COPY MD"
          data-done={done === 'md' ? 'true' : 'false'}
        >
          {done === 'md' ? (
            <CheckIcon width={13} height={13} />
          ) : (
            <FileCodeIcon width={13} height={13} />
          )}
          <span className="article-tool-button__label">{done === 'md' ? '已复制' : '复制 MD'}</span>
        </button>
      </div>
      {selection ? (
        <span className="article-selection-hint">已选 {selection.length} 字</span>
      ) : null}
      <SelectionQuotePill
        selection={selection}
        onQuote={() => setAiMenuOpen(true)}
        onHighlight={highlights.addFromSelection}
      />
      <span className="sr-only" role="status" aria-live="polite">
        {status}
      </span>
    </div>
  );
}
