import type { CSSProperties, ReactNode } from 'react';

/**
 * Lightweight frosted / tonal panel for mobile chrome and secondary chrome.
 * Avoids SVG displacement maps + ResizeObserver work used by GlassSurface.
 */
interface SurfacePanelProps {
  readonly children?: ReactNode;
  readonly isDark?: boolean;
  /** Use a cheap CSS blur. Prefer false on large mobile drawers for paint cost. */
  readonly blur?: boolean;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly borderRadius?: number | string;
}

export default function SurfacePanel({
  children,
  isDark = true,
  blur = false,
  className = '',
  style,
  borderRadius = 22,
}: SurfacePanelProps) {
  const radius = typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius;

  return (
    <div
      className={[
        'relative h-full w-full overflow-hidden',
        isDark
          ? 'border border-white/12 bg-neutral-975 text-white shadow-panel'
          : 'border border-black/8 bg-[#f7f7f8] text-neutral-950 shadow-panel-light',
        blur ? (isDark ? 'backdrop-blur-md' : 'backdrop-blur-sm') : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ borderRadius: radius, ...style }}
    >
      {/* Subtle top sheen — pure CSS, no filters */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 top-0 h-px ${
          isDark
            ? 'bg-linear-to-r from-transparent via-white/25 to-transparent'
            : 'bg-linear-to-r from-transparent via-black/10 to-transparent'
        }`}
      />
      <div className="relative z-1 flex h-full w-full min-h-0 flex-col">{children}</div>
    </div>
  );
}
