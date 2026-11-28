import { SITE_ORIGIN } from './site-origin';

function firstConfiguredUrl(...values: readonly (string | undefined)[]): string {
  for (const value of values) {
    const first = value
      ?.trim()
      .split(/[\s,]+/)[0]
      ?.trim();
    if (first) return first;
  }
  return '';
}

/**
 * The classic general presentation this desktop complements. `PUBLIC_GENERAL_URL`
 * is the documented destination; deployments that only configure a trusted
 * parent origin still get a useful address for the Classic Site hand-off.
 */
export const GENERAL_SITE_URL = firstConfiguredUrl(
  import.meta.env.PUBLIC_GENERAL_URL,
  import.meta.env.PUBLIC_PARENT_ORIGINS,
  import.meta.env.PUBLIC_PARENT_ORIGIN,
);

/** This desktop's canonical public address. */
export const DESKTOP_SITE_URL = SITE_ORIGIN;

/** Compact address for display: host plus path, without protocol or trailing slash. */
export function displayAddress(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname.replace(/\/$/, '')}`;
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
}
