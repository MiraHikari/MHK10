import { describe, expect, it } from 'vite-plus/test';
import { READER_STORAGE_KEY, SHARED_READING_STORAGE_KEY, SHARED_SERVICE_KEYS } from './keys';

describe('shared storage identities', () => {
  it('keeps the physical service keys that both presentations already write', () => {
    expect(SHARED_SERVICE_KEYS).toEqual({
      kounterFlags: 'kounter-flags',
      giscusSession: 'giscus-session',
    });
  });

  it('is the single import path that re-exports the shared reader keys', () => {
    expect(READER_STORAGE_KEY).toBe('doom95.reader.v2');
    expect(SHARED_READING_STORAGE_KEY).toBe('mirahikari-portfolio:visitor:reader-v1');
  });
});
