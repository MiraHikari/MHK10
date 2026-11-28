import { Component, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SectionErrorBoundaryProps {
  readonly children: ReactNode;
  readonly dark?: boolean;
}

interface SectionErrorBoundaryState {
  readonly hasError: boolean;
}

/**
 * lazy 章节 chunk 加载失败（重新部署后 hash 失配 / 弱网）时，React.lazy 会把
 * 错误抛向渲染层；没有边界会导致整棵树卸载白屏。此处兜底为「章节级」错误
 * 面板：rejected 的 dynamic import 会被缓存、无法就地重试，故提供整页刷新
 * 入口。视觉沿用 ThinkingState 的细字等宽语言。
 */
export default class SectionErrorBoundary extends Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  override state: SectionErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): SectionErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown): void {
    console.error('[SectionErrorBoundary] section render failed:', error);
  }

  override render(): ReactNode {
    const { children, dark = false } = this.props;
    if (!this.state.hasError) return children;

    return (
      <div className="flex min-h-screen min-h-dvh items-center justify-center">
        <div
          role="alert"
          className={cn(
            'flex flex-col items-center gap-4 font-mono text-xs uppercase tracking-[0.22em]',
            dark ? 'text-white/55' : 'text-gray-500',
          )}
        >
          <span>章节加载失败</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className={cn(
              'cursor-pointer border px-4 py-2 tracking-[0.22em] transition-colors',
              dark ? 'border-white/25 hover:bg-white/10' : 'border-gray-300 hover:bg-gray-100',
            )}
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }
}
