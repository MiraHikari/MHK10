/**
 * Publication picture paths.
 *
 * Authored records keep the canonical `/images/…` shape, and this site serves
 * the same bundled tree at `/images/` so the general site and the desktop share
 * one path convention. `resolveImageSrc` is the single place that turns a
 * stored path into a fetchable URL, including the optional
 * `PUBLIC_IMAGE_BASE_URL` prefix in production. The CDN retains canonical
 * `/images/` object keys. VGA previews stay on this origin at
 * `/images/previews/`.
 */

import {
  DESKTOP_IMAGE_PREFIX,
  DESKTOP_PREVIEW_PREFIX,
  createImageResolver,
  normalizeImageBase,
} from '@mhk/site-core/media/image-path';

export function imageBaseUrl(raw?: string): string {
  const value =
    raw ?? (import.meta.env as { PUBLIC_IMAGE_BASE_URL?: string }).PUBLIC_IMAGE_BASE_URL ?? '';
  return normalizeImageBase(value);
}

const resolver = (base: string) =>
  createImageResolver({
    localPrefix: DESKTOP_IMAGE_PREFIX,
    previewPrefix: DESKTOP_PREVIEW_PREFIX,
    base,
  });

/** Recover a bundled path from a canonical record or this deployment's CDN URL. */
export function localImageSrc(src: string, base = imageBaseUrl()): string {
  return resolver(base).local(src);
}

/** Canonical publication identity is independent of deployment and preview style. */
export function canonicalImageSrc(src: string, base = imageBaseUrl()): string {
  return resolver(base).canonical(src);
}

/** Map a stored picture path to the public original or display file. */
export function resolveImageSrc(src: string | null | undefined, base = imageBaseUrl()): string {
  return resolver(base).public(src);
}

/** 16-colour preview beside a publication picture. Already-preview paths pass through. */
export function previewImageSrc(src: string | null | undefined): string {
  return resolver(imageBaseUrl()).preview(src);
}

export const portfolioAsset = (path: string): string => resolveImageSrc(path);
export const portfolioPreview = (path: string): string => previewImageSrc(path);
