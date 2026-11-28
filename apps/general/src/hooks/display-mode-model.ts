import { FUSION_QUERY } from '@mhk/site-core/fusion/protocol-model';

/** Presentation choices are shared by the pre-hydration script and the React store. */
export type DisplayMode = 'classic' | 'win95';

/**
 * Bootstrap constants mirrored by the inline script in `layouts/Layout.astro`.
 * The script runs before hydration and cannot import modules, so it consumes
 * these values through `define:vars`; keep the predicate itself in sync.
 */
export const DISPLAY_MODE_BOOTSTRAP = {
  rootPath: '/',
  minWidth: 1024,
  finePointerQuery: '(pointer: fine)',
} as const;

export interface DisplayModeBootstrapInput {
  /** `PUBLIC_DESK_URL` is configured; without it the desktop is bypassed. */
  enabled: boolean;
  /** `?view=` value; an explicit visitor choice wins everywhere. */
  explicit?: unknown;
  /** Persisted preference. Once chosen, it follows the visitor across routes. */
  stored?: unknown;
  /**
   * Session-scoped failure cooldown. After a failed desktop handoff the saved
   * `win95` preference stays, but automatic entry is suspended for the rest of
   * the session; an explicit `?view` choice still wins and clears the cooldown.
   */
  failedThisSession?: unknown;
}

export function parseDisplayMode(value: unknown): DisplayMode | null {
  return value === 'classic' || value === 'win95' ? value : null;
}

/**
 * Remove one `view` parameter from an href while preserving the path, every
 * other parameter and the hash. Relative hrefs resolve against a placeholder
 * origin and come back as a same-origin path, which is what
 * `history.replaceState` expects. The input is returned unchanged when there
 * is no `view` to consume.
 */
export function stripViewParam(href: string): string {
  const url = new URL(href, 'http://mhk.invalid');
  if (!url.searchParams.has(FUSION_QUERY.view)) return href;
  url.searchParams.delete(FUSION_QUERY.view);
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Presentation bootstrap policy:
 *
 * 1. `?view=` wins everywhere, including deep links and constrained devices.
 * 2. A stored choice follows the visitor to every route. This is the
 *    "preserve mode state" guarantee: leaving the desktop and opening an
 *    article directly must not silently reset the presentation.
 * 3. Without a stored choice the general site is always the presentation that
 *    paints first. The desktop is an offer, never a silent takeover: a
 *    desktop-class visitor is *recommended* the desktop and enters it from the
 *    recommendation card or the right-edge toggle, which persists the choice.
 * 4. A failed handoff earlier this session suppresses the desktop target even
 *    when the saved preference is `win95`. Explicit `?view` entry wins and
 *    (in the inline script) clears that cooldown.
 *
 * SSR always renders the complete classic document; these rules only decide
 * the pre-hydration target that the BootLoader and fusion layer act on.
 */
export function resolveDisplayMode(input: DisplayModeBootstrapInput): DisplayMode {
  if (!input.enabled) return 'classic';
  const explicit = parseDisplayMode(input.explicit);
  if (explicit) return explicit;
  const stored = parseDisplayMode(input.stored);
  if (stored === 'win95' && input.failedThisSession === 'win95') return 'classic';
  return stored ?? 'classic';
}
