import { SITE_ORIGIN } from '@/data/site-origin';

/** Public directory routes end in a slash; file endpoints retain their names. */
export function canonicalUrl(pathname: string, origin: string | URL = SITE_ORIGIN): string {
  const url = new URL(pathname, origin);
  url.search = '';
  url.hash = '';
  if (!url.pathname.endsWith('/') && !/\.[^/]+$/.test(url.pathname)) url.pathname += '/';
  return url.href;
}
