/**
 * Grok 因 iconify simple-icons 缺失该品牌而保留本地内联。
 */
import type { ComponentType, SVGProps } from 'react';
import OpenAIIcon from '~icons/simple-icons/openai';
import ClaudeIcon from '~icons/simple-icons/claude';
import GeminiIcon from '~icons/simple-icons/googlegemini';
import QwenIcon from '~icons/simple-icons/qwen';
import DeepSeekIcon from '~icons/simple-icons/deepseek';
import MinimaxIcon from '~icons/simple-icons/minimax';
import MoonshotIcon from '~icons/simple-icons/moonshotai';
import MetaIcon from '~icons/simple-icons/meta';

export function GrokIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      viewBox="0 0 256 246"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path
        fill="currentColor"
        d="M63.83 56.843c27.469-27.48 67.635-34.865 101.712-21.87l2.314.917c7.645 2.844 14.309 6.89 19.507 10.651l-28.857 13.342c-26.869-11.286-57.649-3.609-76.435 15.2c-25.405 25.414-30.539 69.484-.764 97.96L0 245.764c4.296-5.923 9.457-11.573 14.75-17.178l5.815-6.13l2.608-2.774c15.53-16.655 28.81-33.77 20.496-56.709l-.766-1.98c-14.592-35.497-6.094-77.096 20.928-104.15m156.956-21.587L256 0l-10.128 14.069c-21.094 29.716-30.456 48.424-21.11 88.659l-.065-.065c7.23 30.728-.503 64.803-25.472 89.802c-31.478 31.538-81.852 38.558-123.336 10.17l28.923-13.407c26.476 10.41 55.442 5.839 76.26-15.003c20.818-20.844 25.493-51.2 15.03-76.462c-1.989-4.79-7.952-5.992-12.125-2.909L98.87 157.755L220.786 35.147z"
      />
    </svg>
  );
}

/**
 * 从 aiModel 文本推断提供商品牌图标（创作来源徽章 / 列表 chip 用）。
 * 未识别的模型返回 null，由调用方回退到通用 sparkles 图标。
 */
const MODEL_ICON_MATCHERS: readonly {
  readonly pattern: RegExp;
  readonly Icon: ComponentType<SVGProps<SVGSVGElement>>;
}[] = [
  { pattern: /openai|chatgpt|gpt/i, Icon: OpenAIIcon },
  { pattern: /claude|anthropic/i, Icon: ClaudeIcon },
  { pattern: /gemini|google/i, Icon: GeminiIcon },
  { pattern: /grok|xai/i, Icon: GrokIcon },
  { pattern: /qwen|tongyi|通义千问/i, Icon: QwenIcon },
  { pattern: /deepseek/i, Icon: DeepSeekIcon },
  { pattern: /minimax/i, Icon: MinimaxIcon },
  { pattern: /kimi|moonshot/i, Icon: MoonshotIcon },
  { pattern: /llama|meta/i, Icon: MetaIcon },
];

export function providerIconForModel(
  model?: string,
): ComponentType<SVGProps<SVGSVGElement>> | null {
  if (!model) return null;
  return MODEL_ICON_MATCHERS.find(({ pattern }) => pattern.test(model))?.Icon ?? null;
}
