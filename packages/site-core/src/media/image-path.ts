export const CANONICAL_IMAGE_PREFIX = '/images/';
/** The desktop serves canonical objects from its own bundled `/images/` tree. */
export const DESKTOP_IMAGE_PREFIX = CANONICAL_IMAGE_PREFIX;
/** VGA previews stay on the desktop origin beside the display copies. */
export const DESKTOP_PREVIEW_PREFIX = '/images/previews/';
/** Previous desktop tree; accepted as input only, never produced. */
export const LEGACY_DESKTOP_IMAGE_PREFIX = '/portfolio/';
export const LEGACY_DESKTOP_PREVIEW_PREFIX = '/portfolio/previews/';
const hasControl = (value: string): boolean =>
  Array.from(value).some(
    (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  );

export function normalizeImageBase(value: string = ''): string {
  return value.trim().replace(/\/+$/, '');
}

export function isCanonicalImagePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith(CANONICAL_IMAGE_PREFIX) &&
    !/[\\?#]/.test(value) &&
    !hasControl(value) &&
    value
      .slice(CANONICAL_IMAGE_PREFIX.length)
      .split('/')
      .every((part) => {
        try {
          const decoded = decodeURIComponent(part);
          return (
            !!decoded &&
            decoded !== '.' &&
            decoded !== '..' &&
            !/[\\/]/.test(decoded) &&
            !hasControl(decoded)
          );
        } catch {
          return false;
        }
      })
  );
}

/**
 * Recover an authored identity from a deployment URL; unrelated URLs pass through.
 *
 * The legacy `/portfolio/` → `/images/` recovery is the desktop deployment's
 * normalization: older records and URLs still name the previous bundled tree,
 * so they map back to the authored identity before any other resolver step.
 * Previews are matched first because `/portfolio/previews/` also starts with
 * the legacy image prefix; new paths always use `/images/`.
 */
export function canonicalizeImageInput(value: string, base = ''): string {
  const prefix = normalizeImageBase(base);
  const path =
    prefix && value.startsWith(`${prefix}${CANONICAL_IMAGE_PREFIX}`)
      ? value.slice(prefix.length)
      : value;
  if (path.startsWith(LEGACY_DESKTOP_PREVIEW_PREFIX)) {
    return `${DESKTOP_PREVIEW_PREFIX}${path.slice(LEGACY_DESKTOP_PREVIEW_PREFIX.length)}`;
  }
  if (path.startsWith(LEGACY_DESKTOP_IMAGE_PREFIX)) {
    return `${CANONICAL_IMAGE_PREFIX}${path.slice(LEGACY_DESKTOP_IMAGE_PREFIX.length)}`;
  }
  return path;
}

/** Split a URL-ish path at its query/hash so pathname checks never consume the suffix. */
function splitPathSuffix(value: string): { pathname: string; suffix: string } {
  const cut = value.search(/[?#]/);
  return cut === -1
    ? { pathname: value, suffix: '' }
    : { pathname: value.slice(0, cut), suffix: value.slice(cut) };
}

/**
 * Canonical pathnames safe to map into a deployment tree.
 *
 * Unlike `isCanonicalImagePath`, this permits a query/hash suffix (split off
 * first) and empty segments so `/images//a.png` keeps the previous local
 * mapping; empty segments are documented as passing through. Relative
 * segments, encoded separators and control characters still pass through
 * unchanged.
 */
function isSafeCanonicalPathname(pathname: string): boolean {
  if (!pathname.startsWith(CANONICAL_IMAGE_PREFIX)) return false;
  return pathname
    .slice(CANONICAL_IMAGE_PREFIX.length)
    .split('/')
    .every((part) => {
      try {
        const decoded = decodeURIComponent(part);
        return (
          decoded !== '.' && decoded !== '..' && !/[\\/]/.test(decoded) && !hasControl(decoded)
        );
      } catch {
        return false;
      }
    });
}

export interface ImageResolverOptions {
  /** Deployment path that serves canonical `/images/…` objects locally. */
  readonly localPrefix: string;
  /** Bundled preview tree, when the deployment keeps one beside the local files. */
  readonly previewPrefix?: string;
  /** Read-only image CDN base, already optional; trailing slashes are normalized. */
  readonly base?: string;
}

/**
 * One resolver for authored identities, bundled files, CDN URLs and previews.
 *
 * Canonical `/images/…` paths are the publication identity. Each deployment
 * maps them to its own served tree and, when configured, back to the CDN
 * object path. Query/hash suffixes survive every mapping, and preview files
 * are deliberately excluded from canonical recovery and CDN prefixing so they
 * stay on the presentation origin.
 */
export interface ImageResolver {
  /** Map a canonical or deployment URL to this deployment's bundled path. */
  local(src: string): string;
  /** Recover the authored `/images/…` identity from a local non-preview path. */
  canonical(src: string): string;
  /** Resolve to the fetchable public original/display URL. */
  public(src: string | null | undefined): string;
  /** Resolve the 16-colour preview beside a publication picture. */
  preview(src: string | null | undefined): string;
}

export function createImageResolver({
  localPrefix,
  previewPrefix,
  base = '',
}: ImageResolverOptions): ImageResolver {
  const remoteBase = normalizeImageBase(base);
  const isLocal = (path: string): boolean => {
    const { pathname } = splitPathSuffix(path);
    return (
      isSafeCanonicalPathname(pathname) &&
      pathname.startsWith(localPrefix) &&
      !(previewPrefix !== undefined && pathname.startsWith(previewPrefix))
    );
  };

  const local = (src: string): string => {
    const path = canonicalizeImageInput(src, remoteBase);
    const { pathname, suffix } = splitPathSuffix(path);
    return isSafeCanonicalPathname(pathname)
      ? `${localPrefix}${pathname.slice(CANONICAL_IMAGE_PREFIX.length)}${suffix}`
      : path;
  };
  const canonical = (src: string): string => {
    const path = local(src);
    const { pathname, suffix } = splitPathSuffix(path);
    return isLocal(path)
      ? `${CANONICAL_IMAGE_PREFIX}${pathname.slice(localPrefix.length)}${suffix}`
      : path;
  };
  const publicSrc = (src: string | null | undefined): string => {
    if (!src) return '';
    const path = local(src);
    return remoteBase && isLocal(path) ? `${remoteBase}${canonical(path)}` : path;
  };
  const preview = (src: string | null | undefined): string => {
    const path = src ? local(src) : '';
    if (!previewPrefix || !isLocal(path)) return path;
    const { pathname, suffix } = splitPathSuffix(path);
    const previewPath = `${previewPrefix}${pathname.slice(localPrefix.length)}`.replace(
      /\.[^./]+$/,
      '.png',
    );
    return `${previewPath}${suffix}`;
  };

  return { local, canonical, public: publicSrc, preview };
}

export function imagePathParts(
  value: string,
): { folder: string; stem: string; extension: string } | null {
  if (!isCanonicalImagePath(value)) return null;
  const parts = value.slice(CANONICAL_IMAGE_PREFIX.length).split('/');
  const name = parts.pop()!;
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return null;
  return {
    folder: parts.join('/'),
    stem: name.slice(0, dot),
    extension: name.slice(dot + 1).toLowerCase(),
  };
}

export function canonicalUploadPath(folder: string, stem: string, extension: string): string {
  if (
    !['gallery', 'honors', 'projects'].includes(folder) ||
    !/^[\p{L}\p{N}_-]+$/u.test(stem) ||
    !/^(?:webp|jpe?g|png)$/i.test(extension)
  ) {
    throw new Error('图片上传路径无效');
  }
  return `${CANONICAL_IMAGE_PREFIX}${folder}/${stem}.${extension.toLowerCase()}`;
}
