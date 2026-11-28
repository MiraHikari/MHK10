/**
 * One capacity table for the reader notebook. Persisted records, backup imports
 * and live commands all admit the same bounds so the two presentations cannot
 * drift. Preference and zoom ladders have their own fixed domains.
 */
export const READING_LIMITS = {
  books: 100,
  bookmarks: 64,
  notes: 128,
  id: 100,
  label: 200,
  documentId: 200,
  title: 200,
  quote: 3000,
  noteText: 4000,
  anchor: 300,
  blockIndex: 100000,
  offset: 2_000_000,
  blockEnd: 2_000_000,
} as const;

export type ReadingLimits = typeof READING_LIMITS;
