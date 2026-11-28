import { describe, expect, it } from 'vite-plus/test';

import { AI_LEVEL_META, aiDisclosure, aiLevelLabel } from '@/lib/blog/ai';

describe('aiLevelLabel', () => {
  it('returns the bare label without a model', () => {
    expect(aiLevelLabel('generated')).toBe('AI 创作');
    expect(aiLevelLabel('assisted')).toBe('AI 辅助润色');
    expect(aiLevelLabel('human')).toBe('纯人工创作');
  });

  it('appends the model for AI-involved levels', () => {
    expect(aiLevelLabel('generated', 'Claude Fable 5')).toBe('AI 创作 · Claude Fable 5');
    expect(aiLevelLabel('assisted', 'Claude Fable 5')).toBe('AI 辅助润色 · Claude Fable 5');
  });

  it('ignores the model for human-written posts', () => {
    expect(aiLevelLabel('human', 'Claude Fable 5')).toBe('纯人工创作');
  });
});

describe('aiDisclosure', () => {
  it('names the model in generated disclosures', () => {
    expect(aiDisclosure('generated', 'Claude Fable 5')).toContain('Claude Fable 5');
  });

  it('states that generated content is not author-reviewed', () => {
    expect(aiDisclosure('generated', 'Claude Fable 5')).toContain('未经作者逐字审校');
  });

  it('keeps author ownership explicit for assisted posts', () => {
    expect(aiDisclosure('assisted', 'Claude Fable 5')).toContain('由作者独立撰写');
  });

  it('falls back to a generic AI mention when the model is missing', () => {
    expect(aiDisclosure('generated')).toContain('AI');
  });

  it('declares human posts as AI-free', () => {
    expect(aiDisclosure('human')).toBe(AI_LEVEL_META.human.disclosure(undefined));
    expect(aiDisclosure('human')).toContain('不含 AI 生成内容');
  });
});
