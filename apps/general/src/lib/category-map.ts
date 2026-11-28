/**
 * Category → watermark / badge English label.
 * Frontmatter categories are English; keep a few Chinese aliases for older content.
 */
const CATEGORY_MAP: Record<string, string> = {
  Essay: 'ESSAY',
  Engineering: 'ENGINEERING',
  Legal: 'LEGAL',
  随笔: 'ESSAY',
  工程: 'ENGINEERING',
  法律: 'LEGAL',
};

/**
 * Map a category string to its English ribbon/watermark label.
 * Falls back to the input uppercased, or 'READ' when absent.
 */
export function toEnglishCategory(category?: string): string {
  if (!category) return 'READ';
  return CATEGORY_MAP[category] ?? category.toUpperCase();
}
