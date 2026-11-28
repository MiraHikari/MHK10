import { parseDesktopDeployment } from '@/hooks/desktop-deployment-model';

/**
 * The configured MHK10 desktop deployment, or an empty string when Win95 mode
 * is bypassed. This mirrors the `PUBLIC_DESK_URL` kill switch used by the
 * presentation controller so the address shown in the About section can never
 * advertise a desktop that is disabled.
 */
export const DESKTOP_SITE_URL = parseDesktopDeployment(import.meta.env.PUBLIC_DESK_URL) ?? '';

/** Compact address for display: host plus path, without protocol or trailing slash. */
export function displayAddress(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname.replace(/\/$/, '')}`;
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
}
