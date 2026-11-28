import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useResolvedSectionIsDark } from '@/components/layout/SectionThemeContext';

interface BandProps {
  readonly label: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly isDark?: boolean;
}

/**
 * Labeled content band — replaces hand-copied skew + tracking label rows.
 * Uses a hairline accent rule (no parallelogram skew chrome).
 * Renders as `div` to avoid nested `<section>` under `SectionCanvas`.
 */
export default function Band({ label, children, className, isDark: isDarkProp }: BandProps) {
  const isDark = useResolvedSectionIsDark(isDarkProp);
  return (
    <div className={cn('mb-[var(--spacing-band)] md:mb-[var(--spacing-band-lg)]', className)}>
      <h3
        className={cn(
          'flex items-center gap-3 text-micro font-bold uppercase tracking-label mb-4',
          isDark ? 'text-white/40' : 'text-gray-400',
        )}
      >
        <span aria-hidden="true" className="inline-block h-px w-6 shrink-0 bg-accent-base" />
        {label}
      </h3>
      {children}
    </div>
  );
}
