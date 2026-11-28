import SplitHeading from './effects/SplitHeading';
import { useSectionReady } from '@/components/motion/SectionReadyContext';
import './section-scene.css';

interface SectionShellProps {
  isDark: boolean;
  tagLine: string;
  badgeText: string;
  heading: string;
  metaLine: string;
  accent?: string;
  subtitle?: string;
  headingLevel?: 1 | 2;
  contentClassName?: string;
  children: React.ReactNode;
}

export default function SectionShell({
  isDark,
  tagLine,
  badgeText,
  heading,
  metaLine,
  accent,
  subtitle,
  headingLevel = 2,
  contentClassName,
  children,
}: SectionShellProps) {
  const isReady = useSectionReady();
  const textColor = isDark ? 'text-ink-on-dark' : 'text-neutral-950';
  const mutedColor = isDark ? 'text-white/40' : 'text-black/40';
  const metaColor = isDark ? 'text-white/30' : 'text-black/30';
  const accentColor = isDark ? 'text-accent-ink/75' : 'text-accent-ink/70';

  return (
    <section
      data-scene-ready={isReady}
      className="relative min-h-screen min-h-dvh flex flex-col overflow-x-clip md:pl-20 lg:pl-24"
    >
      <div className="flex flex-1 min-h-0">
        <div
          className={`flex-1 min-w-0 px-6 md:px-10 lg:px-16 pt-20 pb-24 md:py-20 flex flex-col${contentClassName ? ` ${contentClassName}` : ''}`}
        >
          {/* 标题与内容共享章节就绪信号，正文延后一拍到达。 */}
          <header className="section-scene__heading mb-10 md:mb-14">
            {/* Tier 1: Brand tag line */}
            <div
              className={`text-[11px] uppercase tracking-[0.28em] ${mutedColor} font-medium font-mono mb-1.5`}
            >
              {tagLine}
            </div>

            {/* Tier 2: Parallelogram marker + section badge */}
            <div className="flex items-center gap-2.5 mb-1.5">
              <span
                className={`inline-block w-5 h-3.5 ${isDark ? 'bg-white' : 'bg-neutral-950'} -skew-x-12`}
              />
              <span
                className={`text-sm md:text-base font-bold font-mono uppercase tracking-[0.15em] ${textColor}`}
              >
                {badgeText}
              </span>
            </div>

            {/* Tier 3: Chinese heading — one unit, no char-by-char stagger */}
            <SplitHeading
              text={heading}
              level={headingLevel}
              by="chars"
              className={`text-4xl md:text-5xl lg:text-6xl ${textColor} text-display text-balance mb-2`}
              static
            />

            {/* Tier 3.5: Serif italic echo — multi-font rhythm */}
            {accent && (
              <div
                className={`mb-1.5 text-sm md:text-base italic font-serif tracking-wide ${accentColor}`}
              >
                {accent}
              </div>
            )}

            {/* Meta line */}
            <div className={`text-[11px] font-mono ${metaColor} tracking-wider`}>{metaLine}</div>

            {subtitle && (
              <p className={`mt-4 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'} max-w-xl`}>
                {subtitle}
              </p>
            )}
          </header>

          {/* Section-specific content */}
          <div className="section-scene__content flex-1">{children}</div>
        </div>
      </div>
    </section>
  );
}
