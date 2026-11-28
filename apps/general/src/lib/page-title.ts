import { SECTION_MAP, type SectionId } from './sections';

export const SITE_NAME = 'MiraHikari';
export const SITE_TAGLINE = 'Full Stack';

/**
 * Build a consistent page title: all parts joined with ` · `, then the site name.
 * When no parts are given, returns `MiraHikari · Full Stack` for the root page.
 */
export function pageTitle(parts: string[]): string {
  if (parts.length === 0) {
    return `${SITE_NAME} · ${SITE_TAGLINE}`;
  }
  return `${parts.join(' · ')} · ${SITE_NAME}`;
}

/** Title for a routed section page (e.g. `关于 / ABOUT · MiraHikari`). */
export function sectionPageTitle(sectionId: SectionId): string {
  const section = SECTION_MAP[sectionId];
  if (!section) return pageTitle([]);
  return pageTitle([`${section.zh} / ${section.en}`]);
}

/** Title for the blog index page. */
export function blogIndexPageTitle(): string {
  return pageTitle(['Blog']);
}

/** Title for a single blog article page. */
export function blogArticlePageTitle(articleTitle: string): string {
  return pageTitle([articleTitle, 'Blog']);
}

/** Title for a blog tag page. */
export function blogTagPageTitle(tag: string): string {
  return pageTitle([`#${tag}`, 'Blog']);
}
