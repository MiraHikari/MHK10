import { relative, sep } from 'node:path';
import {
  CANONICAL_IMAGE_PREFIX,
  DESKTOP_IMAGE_PREFIX,
  createImageResolver,
} from '@mhk/site-core/media/image-path';

const localResolver = createImageResolver({ localPrefix: DESKTOP_IMAGE_PREFIX });

/**
 * Shared media projection policy. The Python preview generator, the Node
 * freshness gate, the content aligner and the Vitest metadata tests all derive
 * their expectations from these values.
 */
export const IMAGE_SUFFIXES = new Set(['.svg', '.webp', '.png', '.jpg', '.jpeg']);
export const PREVIEW_SECTIONS = Object.freeze(['profile', 'projects', 'honors', 'gallery', 'blog']);
export const PREVIEW_CAPS = Object.freeze({
  profile: Object.freeze({ width: 96, height: 96 }),
  default: Object.freeze({ width: 640, height: 480 }),
});

export const previewCap = (section) => PREVIEW_CAPS[section] ?? PREVIEW_CAPS.default;

/** Display copies are derived WebPs; their source originals are not previewed. */
export const DISPLAY_SUFFIX = '-display.webp';
export const isDisplayCopy = (path) => path.endsWith(DISPLAY_SUFFIX);
export const displayCopyPath = (path) => path.replace(/\.webp$/i, DISPLAY_SUFFIX);

/** WebP originals ship with the desktop; every other authored original stays on R2. */
export const isBundledOriginal = (path) => path.endsWith('.webp');

export const compareStrings = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

/**
 * Structural metadata problems. A non-object entry is reported once and never
 * dereferenced by callers that gate their byte comparison on the result.
 */
export function mediaInfoProblems(label, key, info) {
  if (!info || typeof info !== 'object' || Array.isArray(info)) {
    return [`${label}: ${key} is not an object`];
  }
  const problems = [];
  if (!(info.width > 0) || !(info.height > 0)) {
    problems.push(`${label}: ${key} has no valid dimensions`);
  }
  if (!info.format) problems.push(`${label}: ${key} has no format`);
  return problems;
}

/** Byte drift message, or undefined when the entry is malformed or matches. */
export function mediaBytesProblem(label, key, info, actualBytes) {
  if (!info || typeof info !== 'object' || Array.isArray(info)) return undefined;
  if (info.bytes === actualBytes) return undefined;
  return `${label}: ${key} records ${info.bytes} bytes but the file has ${actualBytes}`;
}

/** Canonical `/images/...` paths authored by gallery, honors and article photos. */
export function collectAuthoredOriginals(profile, photos) {
  const authored = new Set();
  for (const item of profile?.galleryItems ?? []) {
    if (item.downloadSrc) authored.add(item.downloadSrc);
  }
  for (const item of profile?.honors ?? []) {
    if (item.downloadSrc) authored.add(item.downloadSrc);
  }
  for (const photo of photos ?? []) {
    if (photo.full) authored.add(photo.full);
  }
  return [...authored].sort(compareStrings);
}

/** Bundled (`/images/...`) and R2-only keys, split by the shared policy. */
export function splitAuthoredOriginals(originals) {
  return {
    bundledOriginals: originals.filter(isBundledOriginal).map(localKey),
    r2Only: originals.filter((path) => !isBundledOriginal(path)).map(localKey),
  };
}

export function localKey(canonical) {
  if (typeof canonical !== 'string' || !canonical.startsWith(CANONICAL_IMAGE_PREFIX)) {
    throw new Error(`Authored original must start with ${CANONICAL_IMAGE_PREFIX}: ${canonical}`);
  }
  return localResolver.local(canonical);
}

/** Published URL path for a file below `public/`, independent of the host platform. */
export function publishedPath(root, file) {
  return `/${relative(root, file).split(sep).join('/')}`;
}
