import { desktopApps } from '../../../data/desktop-apps';

/** Only a registered app's own URL, or an article inside the blog, can be opened. */
export function resolveAppHref(
  id: string,
  href: string | undefined,
  origin: string,
): string | null {
  const app = desktopApps.find((item) => item.id === id);
  if (!app) return null;
  try {
    const target = new URL(href ?? app.href, origin);
    if (target.origin !== origin || target.username || target.password) return null;
    const path = target.pathname.endsWith('/') ? target.pathname : `${target.pathname}/`;
    if (path !== app.href && !(id === 'blog' && path.startsWith('/blog/'))) return null;
    return target.href;
  } catch {
    return null;
  }
}
