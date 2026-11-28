import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useResolvedSectionIsDark } from '@/components/layout/SectionThemeContext';

interface LedgerProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly isDark?: boolean;
}

interface LedgerRowProps extends HTMLAttributes<HTMLDivElement> {
  readonly date?: string;
  readonly title: string;
  readonly detail?: string;
  readonly children?: ReactNode;
  readonly isDark?: boolean;
}

function LedgerRoot({ children, className, isDark: isDarkProp }: LedgerProps) {
  const isDark = useResolvedSectionIsDark(isDarkProp);
  return (
    <div
      role="list"
      className={cn(
        'flex flex-col divide-y',
        isDark ? 'divide-white/10' : 'divide-black/8',
        className,
      )}
    >
      {children}
    </div>
  );
}

function LedgerRow({
  date,
  title,
  detail,
  className,
  children,
  isDark: isDarkProp,
  ...rest
}: LedgerRowProps) {
  const isDark = useResolvedSectionIsDark(isDarkProp);
  const hasDate = date != null && date !== '';
  return (
    <div
      role="listitem"
      className={cn(
        'py-3.5 items-baseline',
        hasDate
          ? 'grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-4 gap-y-1 sm:grid-cols-[6.5rem_minmax(0,1fr)]'
          : 'flex flex-col gap-0.5',
        className,
      )}
      {...rest}
    >
      {hasDate && (
        <span className="font-mono text-caption tabular-nums tracking-mono text-gray-400">
          {date}
        </span>
      )}
      <div className="min-w-0 flex flex-col gap-0.5">
        <span
          className={cn(
            'text-sm md:text-base font-semibold leading-snug',
            isDark ? 'text-ink-on-dark' : 'text-neutral-950',
          )}
        >
          {title}
        </span>
        {detail != null && detail !== '' && (
          <span className="text-sm text-gray-500 leading-relaxed">{detail}</span>
        )}
        {children}
      </div>
    </div>
  );
}

const Ledger = Object.assign(LedgerRoot, { Row: LedgerRow });

export default Ledger;
export type { LedgerProps, LedgerRowProps };
