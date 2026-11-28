import type { DisplayMode } from '@/hooks/display-mode-model';

/**
 * One owner for the two presentation favicons.
 *
 * The general site and the desktop publish different icons, so `<head>` must
 * follow the chosen target: SSR ships the classic pair, the pre-hydration
 * script swaps it for a desktop target, and the presentation controller calls
 * `syncFavicon` when it paints a target. React's SSR snapshot never writes it.
 * All three read this map.
 */

export interface FaviconVariant {
  readonly icon: string;
  readonly apple: string;
}

export const FAVICON_VARIANTS: Record<DisplayMode, FaviconVariant> = {
  classic: { icon: '/favicon.webp', apple: '/favicon-180.png' },
  win95: { icon: '/favicon-pixel-32.png', apple: '/favicon-pixel-180.png' },
};

/**
 * The `?v=` suffix carries the mode, so a genuine switch breaks the browser's
 * same-href cache instead of keeping the previously fetched icon.
 */
export function faviconHref(mode: DisplayMode, kind: keyof FaviconVariant = 'icon'): string {
  return `${FAVICON_VARIANTS[mode][kind]}?v=${mode}`;
}
