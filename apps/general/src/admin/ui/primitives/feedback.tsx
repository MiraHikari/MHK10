/** 后台反馈原语：加载指示与空状态。 */

// ------------------------------------------------------------------
// Spinner
// ------------------------------------------------------------------
export interface SpinnerProps {
  className?: string;
}

export function Spinner({ className = '' }: SpinnerProps) {
  return (
    <div
      className={`inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-sky-400 ${className}`}
      role="status"
      aria-label="加载中"
    />
  );
}

// ------------------------------------------------------------------
// EmptyState
// ------------------------------------------------------------------
export interface EmptyStateProps {
  title?: string;
  description?: string;
}

export function EmptyState({ title = '暂无内容', description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <p className="text-sm font-medium text-zinc-300">{title}</p>
      {description && <p className="mt-1 text-xs text-zinc-500">{description}</p>}
    </div>
  );
}
