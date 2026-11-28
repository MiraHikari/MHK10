/**
 * AI 分享提示词构建：把文章标题 / 摘要 / 链接与（可选）选中段落拼成发给
 * AI 助手的提问。逻辑从 AIShareMenu.tsx 提取为纯函数，供分享菜单与
 * 选中即引用（SelectionQuotePill）等入口共用。
 */

export function buildSharePrompt(
  title: string,
  description: string,
  url: string,
  selection = '',
): string {
  const excerpt = selection ? `\n\n我选中的段落：\n“${selection}”` : '';
  return `请阅读并分析这篇文章：《${title}》\n${description}\n${url}${excerpt}\n\n${selection ? '请重点解释这段文字的含义、上下文和可讨论之处。' : '请先概括核心观点，再指出值得讨论或改进的地方；'}如果信息不足，请明确说明，不要臆测。`;
}
