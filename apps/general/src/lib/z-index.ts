/**
 * Site-wide stacking order for layers that must interleave with content
 * (blog reading chrome + lightbox portal). Other layers use raw Tailwind
 * z-* classes directly at their mount sites.
 */
export const zIndex = {
  readingProgress: 61,
  mobileTocBackdrop: 70,
  mobileTocPanel: 75,
  mobileTocFab: 80,
  lightbox: 120,
} as const;
