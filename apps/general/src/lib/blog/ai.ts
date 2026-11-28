/**
 * AI 创作标识体系：frontmatter `aiLevel` / `aiModel` 的单一文案来源。
 * 文章徽章（AIGenBadge）、版权块（ArticleCopyright）、列表卡片与
 * Markdown 导出共用这里的定义，保证全站措辞一致。
 */

import type { AILevel } from '@mhk/site-core/content-model/article';
export type { AILevel };

export interface AILevelMeta {
  /** 中文短标签，如「AI 完全创作」。 */
  label: string;
  /** JetBrains Mono 大写标签，用于徽章 eyebrow 与列表 chip。 */
  tag: string;
  /** 完整披露语句：文章页徽章与版权块使用的正式说明。 */
  disclosure: (model?: string) => string;
}

export const AI_LEVEL_META: Record<AILevel, AILevelMeta> = {
  generated: {
    label: 'AI 创作',
    tag: 'AI GENERATED',
    disclosure: (model) =>
      `本文由 ${model ?? 'AI'} 完成，未经作者逐字审校；` + `内容如有错漏请自行甄别。`,
  },
  assisted: {
    label: 'AI 辅助润色',
    tag: 'AI ASSISTED',
    disclosure: (model) =>
      `本文由作者独立撰写，${model ?? 'AI'} 参与了润色与校订。` +
      `个别措辞可能与作者的原始表达存在差异。`,
  },
  human: {
    label: '纯人工创作',
    tag: 'HUMAN WRITTEN',
    disclosure: () => '本文由作者独立撰写，不含 AI 生成内容。',
  },
};

/** 「AI 完全创作 · Claude Fable 5」式的组合标签；human 级别忽略 model。 */
export function aiLevelLabel(level: AILevel, model?: string): string {
  return model && level !== 'human'
    ? `${AI_LEVEL_META[level].label} · ${model}`
    : AI_LEVEL_META[level].label;
}

/** 对应级别的完整披露语句。 */
export function aiDisclosure(level: AILevel, model?: string): string {
  return AI_LEVEL_META[level].disclosure(model);
}
