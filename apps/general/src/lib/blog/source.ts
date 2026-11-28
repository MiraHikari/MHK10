/**
 * Exact blog source files, loaded at build time for machine-readable routes.
 *
 * Keeping the original source means MDX imports/components and YAML frontmatter
 * remain available to tools that understand MDX instead of being flattened
 * into a lossy plain-text approximation.
 */
const BLOG_SOURCES = import.meta.glob<string>(
  '../../../../../packages/site-core/content/blog/**/*.{md,mdx}',
  {
    eager: true,
    import: 'default',
    query: '?raw',
  },
);

const SOURCE_BY_ID = new Map(
  Object.entries(BLOG_SOURCES).map(([path, source]) => [
    path.replace(/^.*\/content\/blog\//, '').replace(/\.(?:md|mdx)$/i, ''),
    source,
  ]),
);

export function getBlogSource(id: string): string | undefined {
  return SOURCE_BY_ID.get(id);
}
