import { useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useDismissable } from '@/hooks/useDismissable';
import { motionEase, motionDuration } from '@/lib/motion';
import { buildSharePrompt } from '@/lib/blog/share';
import SparklesIcon from '~icons/lucide/sparkles';
import MessageQuoteIcon from '~icons/lucide/message-square-quote';
import ExternalLinkIcon from '~icons/lucide/external-link';
import OpenAIIcon from '~icons/simple-icons/openai';
import PerplexityIcon from '~icons/simple-icons/perplexity';
import GoogleIcon from '~icons/simple-icons/google';

interface Provider {
  readonly id: string;
  readonly label: string;
  /** Maker, shown as a muted second line for context. */
  readonly maker: string;
  readonly url: string;
  readonly Icon: React.ComponentType<SVGProps<SVGSVGElement>>;
}

const PROVIDERS: readonly Provider[] = [
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    maker: 'OpenAI',
    url: 'https://chatgpt.com/?q=',
    Icon: OpenAIIcon,
  },
  {
    id: 'chatgpt-search',
    label: 'ChatGPT 搜索',
    maker: 'OpenAI',
    url: 'https://chatgpt.com/?hints=search&q=',
    Icon: OpenAIIcon,
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    maker: 'Perplexity',
    url: 'https://www.perplexity.ai/search?q=',
    Icon: PerplexityIcon,
  },
  {
    id: 'google-ai-mode',
    label: 'Google AI Mode',
    maker: 'Google',
    url: 'https://www.google.com/search?udm=50&q=',
    Icon: GoogleIcon,
  },
] as const;

interface Props {
  readonly title: string;
  readonly description?: string;
  readonly slug: string;
  readonly selection?: string;
  /** 受控展开状态（由父级 ArticleShareActions 持有）。 */
  readonly open: boolean;
  readonly onOpenChange: (next: boolean) => void;
}

export default function AIShareMenu({
  title,
  description = '',
  slug,
  selection = '',
  open,
  onOpenChange,
}: Props) {
  const [status, setStatus] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  useDismissable(rootRef, open, () => onOpenChange(false));

  const sendTo = async (provider: Provider) => {
    const prompt = buildSharePrompt(
      title,
      description,
      `${window.location.origin}/blog/${slug}`,
      selection,
    );
    const target = `${provider.url}${encodeURIComponent(prompt)}`;
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    try {
      await navigator.clipboard.writeText(prompt);
      setStatus(`已复制提示词，正在打开 ${provider.label}`);
    } catch {
      setStatus(`正在打开 ${provider.label}`);
    }
    if (popup) popup.location.replace(target);
    else window.location.assign(target);
    onOpenChange(false);
  };

  const menuTransition = {
    duration: shouldReduceMotion ? motionDuration.instant : motionDuration.filter,
    ease: motionEase,
  };

  return (
    <div className="ai-share" ref={rootRef}>
      <button
        type="button"
        className="ai-share__trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={selection ? '解读选中段落' : '发给 AI 阅读'}
        onClick={() => onOpenChange(!open)}
        data-cursor="ASK AI"
      >
        {selection ? (
          <MessageQuoteIcon className="ai-share__trigger-icon" width={14} height={14} />
        ) : (
          <SparklesIcon className="ai-share__trigger-icon" width={14} height={14} />
        )}
        <span className="article-tool-button__label">
          {selection ? '解读选中段落' : '发给 AI 阅读'}
        </span>
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            key="ai-share-menu"
            className="ai-share__menu origin-top-right"
            role="menu"
            aria-label="选择 AI 助手"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={menuTransition}
          >
            <div className="ai-share__intro">
              {selection
                ? `围绕选中的 ${selection.length} 字展开，自动附上原文链接与上下文。`
                : '自动附上标题、摘要、原文链接与分析提示词，选一个模型即开始对话。'}
            </div>
            {PROVIDERS.map((provider) => (
              <button
                key={provider.id}
                type="button"
                role="menuitem"
                className="ai-share__item"
                onClick={() => void sendTo(provider)}
              >
                <span className="ai-share__item-icon" aria-hidden="true">
                  <provider.Icon width={16} height={16} />
                </span>
                <span className="ai-share__item-copy">
                  <strong>{provider.label}</strong>
                  <small>{provider.maker}</small>
                </span>
                <ExternalLinkIcon className="ai-share__item-arrow" width={13} height={13} />
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <span className="sr-only" role="status" aria-live="polite">
        {status}
      </span>
    </div>
  );
}
