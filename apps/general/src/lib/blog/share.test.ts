import { describe, expect, it } from 'vite-plus/test';

import { buildSharePrompt } from '@/lib/blog/share';

describe('buildSharePrompt', () => {
  it('assembles title, description and url for a plain share', () => {
    const prompt = buildSharePrompt('杭州行记', '三月的西湖', 'https://example.com/blog/hangzhou');

    expect(prompt).toContain('《杭州行记》');
    expect(prompt).toContain('三月的西湖');
    expect(prompt).toContain('https://example.com/blog/hangzhou');
  });

  it('uses the summary instruction when no selection is given', () => {
    const prompt = buildSharePrompt('t', 'd', 'u');

    expect(prompt).toContain('请先概括核心观点');
    expect(prompt).toContain('如果信息不足，请明确说明，不要臆测。');
    expect(prompt).not.toContain('我选中的段落');
    expect(prompt).not.toContain('请重点解释');
  });

  it('embeds the selected passage in guillemets with an excerpt lead-in', () => {
    const prompt = buildSharePrompt('t', 'd', 'u', '这段是选中的文字');

    expect(prompt).toContain('我选中的段落：');
    expect(prompt).toContain('“这段是选中的文字”');
  });

  it('switches to the explain-selection instruction when a selection exists', () => {
    const prompt = buildSharePrompt('t', 'd', 'u', '选中');

    expect(prompt).toContain('请重点解释这段文字的含义、上下文和可讨论之处。');
    expect(prompt).not.toContain('请先概括核心观点');
  });

  it('defaults the selection to empty', () => {
    expect(buildSharePrompt('t', 'd', 'u')).toBe(buildSharePrompt('t', 'd', 'u', ''));
  });
});
