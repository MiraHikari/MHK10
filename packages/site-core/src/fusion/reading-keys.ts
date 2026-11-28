/**
 * Neutral contract shared by the reading repository and its storage adapters.
 * Keys keep their legacy values so existing visitors and desktops stay compatible;
 * this module has no imports so neither side creates a runtime cycle.
 */
export const READER_STORAGE_KEY = 'doom95.reader.v2';
export const SHARED_READING_STORAGE_KEY = 'mirahikari-portfolio:visitor:reader-v1';
export interface ReaderStoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
