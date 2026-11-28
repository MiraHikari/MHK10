import { describe, expect, it } from 'vite-plus/test';

import { STORAGE_CATALOG, STORAGE_KEY_PREFIX } from '@/lib/storage/keys';
import { PRIVACY_SECTIONS, STORAGE_KEY_PURPOSES } from '@/data/privacy';

describe('privacy data inventory', () => {
  it('documents every catalog key with bilingual copy', () => {
    for (const entry of STORAGE_CATALOG) {
      const copy = STORAGE_KEY_PURPOSES[entry.key];
      expect(copy, `missing copy for ${entry.key}`).toBeDefined();
      expect(copy.kind.zh).toBeTruthy();
      expect(copy.kind.en).toBeTruthy();
      expect(copy.purpose.zh).toBeTruthy();
      expect(copy.purpose.en).toBeTruthy();
    }
  });

  it('renders storage tables for both visitor and admin audiences', () => {
    const audiences = PRIVACY_SECTIONS.filter((section) => section.tableAudience !== undefined).map(
      (section) => section.tableAudience,
    );
    expect(audiences).toContain('visitor');
    expect(audiences).toContain('admin');
  });

  it('documents the canonical key prefix in the storage section', () => {
    const storageSection = PRIVACY_SECTIONS.find((section) => section.id === 'on-device-storage');
    const zh = storageSection?.paragraphs?.[0]?.zh ?? '';
    const en = storageSection?.paragraphs?.[0]?.en ?? '';
    expect(zh).toContain(STORAGE_KEY_PREFIX);
    expect(en).toContain(STORAGE_KEY_PREFIX);
  });
});
