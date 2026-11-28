import SparklesIcon from '~icons/lucide/sparkles';
import PenLineIcon from '~icons/lucide/pen-line';
import { AI_LEVEL_META, aiDisclosure, aiLevelLabel, type AILevel } from '@/lib/blog/ai';
import { providerIconForModel } from './ai-provider-icons';

interface Props {
  readonly level: AILevel;
  readonly model?: string;
  /**
   * full：文章页完整披露徽章（eyebrow + 标签 + 模型名 + 披露语句）；
   * chip：列表卡片上的紧凑 mono 标记。
   */
  readonly variant?: 'full' | 'chip';
}

/**
 * 级别图标：已识别提供商的模型（Claude、Kimi 等）使用品牌图标，其余 AI
 * 级别用 sparkles，纯人工创作用钢笔——保证不依赖颜色也能区分三档（a11y）。
 */
function LevelIcon({ level, model }: { level: AILevel; model?: string }) {
  if (level === 'human') return <PenLineIcon width={13} height={13} aria-hidden="true" />;
  const ProviderIcon = providerIconForModel(model);
  if (ProviderIcon) return <ProviderIcon width={13} height={13} aria-hidden="true" />;
  return <SparklesIcon width={13} height={13} aria-hidden="true" />;
}

export default function AIGenBadge({ level, model, variant = 'full' }: Props) {
  const label = aiLevelLabel(level, model);

  if (variant === 'chip') {
    return (
      <span className={`ai-chip ai-chip--${level}`} title={label} aria-label={`创作来源：${label}`}>
        <LevelIcon level={level} model={model} />
        <span className="ai-chip__tag">{AI_LEVEL_META[level].tag}</span>
      </span>
    );
  }

  return (
    <aside className={`ai-badge ai-badge--${level}`} aria-label={`内容创作来源：${label}`}>
      <span className="ai-badge__eyebrow" aria-hidden="true">
        PROVENANCE · 创作来源
      </span>
      <div className="ai-badge__row">
        <span className="ai-badge__icon" aria-hidden="true">
          <LevelIcon level={level} model={model} />
        </span>
        <span className="ai-badge__label">{AI_LEVEL_META[level].label}</span>
        {level !== 'human' && model ? <span className="ai-badge__model">{model}</span> : null}
      </div>
      <p className="ai-badge__disclosure">{aiDisclosure(level, model)}</p>
    </aside>
  );
}
