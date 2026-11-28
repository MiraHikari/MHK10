import { cn } from '@/lib/utils';

interface ThinkingStateProps {
  readonly className?: string;
  readonly dark?: boolean;
  readonly compact?: boolean;
  readonly label?: string;
}

/** Shared loading language: the site is always thinking, never merely waiting. */
export default function ThinkingState({
  className,
  dark = false,
  compact = false,
  label = 'THINKING',
}: ThinkingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center gap-2 font-mono uppercase tracking-[0.22em]',
        compact ? 'text-[10px]' : 'text-xs',
        dark ? 'text-white/55' : 'text-gray-500',
        className,
      )}
    >
      <span aria-hidden="true" className="inline-flex gap-1">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-base [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-base [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-base" />
      </span>
      {label}
      <span aria-hidden="true">…</span>
    </div>
  );
}
