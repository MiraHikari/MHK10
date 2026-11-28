/**
 * Local real-content override resolution (single implementation of the mechanism).
 *
 * The repository ships template content: `packages/site-core/content/profile.json`,
 * `projects/*.md`, `blog/*.{md,mdx}` and the desktop presentation JSON files.
 * The site owner keeps the real authored data in gitignored `local/` siblings:
 *
 *   packages/site-core/content/local/profile.json        full profile.json replacement
 *   packages/site-core/content/local/projects/*.md       per-slug full-file replacement
 *   packages/site-core/content/local/blog/*.{md,mdx}     per-slug full-file replacement
 *   apps/desktop/src/data/local/portfolio-presentation.json
 *   apps/desktop/src/data/local/article-presentation.json
 *
 * Overrides replace whole records; there is no deep merge, because a partially
 * merged biography is worse than a missing one. Every consumer resolves content
 * through this module:
 *
 *   - Vite/Astro builds and Vitest pick the override up through the alias
 *     returned by `contentAlias()` (profile JSON) — types still come from the
 *     tracked template, so a drifted local file fails the type check.
 *   - Node scripts (align, freshness, admin) call the `readLocal*` helpers.
 *   - Astro content collections point their glob at `contentSourceDir()`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const SHARED_CONTENT_ROOT = resolve(repoRoot, 'packages/site-core/content');
export const SHARED_LOCAL_ROOT = resolve(SHARED_CONTENT_ROOT, 'local');
export const DESKTOP_DATA_ROOT = resolve(repoRoot, 'apps/desktop/src/data');
export const DESKTOP_LOCAL_ROOT = resolve(DESKTOP_DATA_ROOT, 'local');

const PROFILE_ALIAS_ID = '@mhk/site-core/content/profile.json';

export const hasLocalContent = () => existsSync(resolve(SHARED_LOCAL_ROOT, 'profile.json'));

/**
 * The Vite alias entry for the shared profile JSON. Both apps merge this into
 * `resolve.alias`; Vitest and the Astro build share the same Vite resolver.
 * Returns `null` when no local override exists so callers can spread it in.
 */
export function profileContentAlias() {
  if (!hasLocalContent()) return null;
  const localPath = resolve(SHARED_LOCAL_ROOT, 'profile.json');
  return {
    find: PROFILE_ALIAS_ID,
    replacement: localPath,
    // Exact match only: `@mhk/site-core/content-model/profile` must keep
    // resolving to the tracked module through package exports.
    customResolver(source) {
      return source === PROFILE_ALIAS_ID ? { id: localPath } : null;
    },
  };
}

export function readLocalProfile() {
  const path = resolve(SHARED_LOCAL_ROOT, 'profile.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

/** Full-file override for an authored project/article, or null when only the template exists. */
export function readLocalPublication(kind, slug) {
  const extensions = kind === 'projects' ? ['md'] : ['mdx', 'md'];
  for (const extension of extensions) {
    const path = resolve(SHARED_LOCAL_ROOT, kind, `${slug}.${extension}`);
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  return null;
}

export function localPublicationSlugs(kind) {
  const directory = resolve(SHARED_LOCAL_ROOT, kind);
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((file) => /\.(?:md|mdx)$/.test(file))
    .map((file) => file.replace(/\.(?:md|mdx)$/, ''));
}

/** A local override replaces the whole file for `name` (desktop presentation JSONs). */
export function readDesktopLocalPresentation(name) {
  const path = resolve(DESKTOP_LOCAL_ROOT, `${name}.json`);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

export function readDesktopPresentation(name) {
  return (
    readDesktopLocalPresentation(name) ??
    JSON.parse(readFileSync(resolve(DESKTOP_DATA_ROOT, `${name}.json`), 'utf8'))
  );
}
