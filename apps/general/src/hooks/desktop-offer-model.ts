import { DISPLAY_MODE_BOOTSTRAP } from './display-mode-model';

export interface DesktopOfferContext {
  /** `PUBLIC_DESK_URL` is configured; there is a desktop to offer. */
  readonly enabled: boolean;
  /** The visitor already saved a presentation, so nothing is being offered. */
  readonly hasChoice: boolean;
  /** This session already answered the offer. */
  readonly answered: boolean;
  readonly pathname: string;
  readonly viewportWidth: number;
  /** Save-Data / 2G: the desktop loads a second document, so stay quiet. */
  readonly conserveData: boolean;
}

/**
 * Whether to *recommend* the MHK10 desktop on the general site.
 *
 * The desktop is a complementary presentation, never a silent replacement, so
 * the general site always paints first and this decision only controls an
 * explicit, dismissible offer:
 *
 * 1. only at the site entry, where a first-time visitor is choosing where to
 *    start (deep links keep their general reading context);
 * 2. on any desktop-class viewport — a fine pointer is no longer required, so
 *    touch laptops and large tablets see the card too. Entering still passes
 *    the desktop entry check, which explains the pointer-first world on a
 *    coarse-pointer device;
 * 3. never after a saved choice or on a metered connection, and only once per
 *    session so it cannot nag.
 */
export function shouldOfferDesktop(context: DesktopOfferContext): boolean {
  if (!context.enabled || context.hasChoice || context.answered) return false;
  if (context.pathname !== DISPLAY_MODE_BOOTSTRAP.rootPath) return false;
  if (context.conserveData) return false;
  return context.viewportWidth >= DISPLAY_MODE_BOOTSTRAP.minWidth;
}
