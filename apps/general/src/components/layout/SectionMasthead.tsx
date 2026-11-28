import SplitHeading from '@/components/effects/SplitHeading';
import { useResolvedSectionIsDark } from '@/components/layout/SectionThemeContext';
import { cn } from '@/lib/utils';
import { useSectionReady } from '@/components/motion/SectionReadyContext';
import '../section-scene.css';

export type SectionMastheadVariant = 'chapter' | 'quiet' | 'none';

interface SectionMastheadProps {
  readonly variant: SectionMastheadVariant;
  readonly title: string;
  readonly accent?: string;
  readonly headingLevel?: 1 | 2;
  readonly subtitle?: string;
  readonly isDark?: boolean;
  readonly className?: string;
}

/**
 * Section header. 与章节就绪信号同步入场，标题整词呈现并保留 CJK 断行。
 * Must not render ▼ MIRAHIKARI, `::GET()` chrome, or skew uppercase badge.
 */
export default function SectionMasthead({
  variant,
  title,
  accent,
  headingLevel = 2,
  subtitle,
  isDark: isDarkProp,
  className,
}: SectionMastheadProps) {
  const isReady = useSectionReady();
  const isDark = useResolvedSectionIsDark(isDarkProp);
  const textColor = isDark ? 'text-ink-on-dark' : 'text-neutral-950';
  const mutedColor = isDark ? 'text-white/50' : 'text-black/45';
  const accentColor = isDark ? 'text-accent-ink/75' : 'text-accent-ink/70';

  if (variant === 'none') {
    return null;
  }

  if (variant === 'quiet') {
    const QuietHeading = headingLevel === 1 ? 'h1' : 'h2';
    return (
      <header
        data-scene-ready={isReady}
        className={cn('section-scene__masthead mb-8 md:mb-10', className)}
      >
        {accent && (
          <div className={cn('mb-2 text-sm md:text-base italic font-serif', accentColor)}>
            {accent}
          </div>
        )}
        <QuietHeading className={cn('text-display-m font-semibold', textColor)}>
          {title}
        </QuietHeading>
        {subtitle && <p className={cn('mt-3 text-sm max-w-xl', mutedColor)}>{subtitle}</p>}
      </header>
    );
  }

  return (
    <header
      data-scene-ready={isReady}
      className={cn('section-scene__masthead mb-10 md:mb-14', className)}
    >
      {accent && (
        <div className={cn('mb-1.5 text-sm md:text-base italic font-serif', accentColor)}>
          {accent}
        </div>
      )}
      <SplitHeading
        text={title}
        level={headingLevel}
        by="chars"
        className={cn('text-4xl md:text-5xl lg:text-6xl text-display mb-2', textColor)}
        static
      />
      {subtitle && <p className={cn('mt-4 text-sm max-w-xl', mutedColor)}>{subtitle}</p>}
    </header>
  );
}
