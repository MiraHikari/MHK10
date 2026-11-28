import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { SHARED_READING_STORAGE_KEY, SHARED_SERVICE_KEYS } from '@mhk/site-core/storage/keys';

import {
  STORAGE_CATALOG,
  STORAGE_KEY_PREFIX,
  STORAGE_KEYS,
  readJsonStorage,
  readStorage,
  readStorageItem,
  removeStorage,
  removeStorageItem,
  writeJsonStorage,
  writeStorage,
  writeStorageItem,
} from '@/lib/storage/keys';

class MemoryStorage {
  private readonly map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }
}

describe('STORAGE_CATALOG', () => {
  it('covers every STORAGE_KEYS entry exactly once', () => {
    const catalogKeys = new Set(STORAGE_CATALOG.map((entry) => entry.key));
    const namedKeys = Object.values(STORAGE_KEYS);
    expect(catalogKeys.size).toBe(STORAGE_CATALOG.length);
    expect(namedKeys).toHaveLength(STORAGE_CATALOG.length);
    for (const key of namedKeys) {
      expect(catalogKeys.has(key)).toBe(true);
    }
  });

  it('uses unique ids so the derived STORAGE_KEYS alias cannot collide', () => {
    const ids = new Set(STORAGE_CATALOG.map((entry) => entry.id));
    expect(ids.size).toBe(STORAGE_CATALOG.length);
    expect(STORAGE_CATALOG.every((entry) => entry.id.length > 0)).toBe(true);
  });

  it('uses the canonical mirahikari-portfolio: prefix and unique keys', () => {
    const keys = new Set<string>();
    for (const entry of STORAGE_CATALOG) {
      expect(entry.key.startsWith(STORAGE_KEY_PREFIX)).toBe(true);
      expect(keys.has(entry.key)).toBe(false);
      keys.add(entry.key);
    }
  });

  it('tags every entry with a visitor or admin audience', () => {
    for (const entry of STORAGE_CATALOG) {
      expect(entry.audience === 'visitor' || entry.audience === 'admin').toBe(true);
    }
    expect(STORAGE_CATALOG.some((entry) => entry.audience === 'visitor')).toBe(true);
    expect(STORAGE_CATALOG.some((entry) => entry.audience === 'admin')).toBe(true);
  });

  it('references the shared service identity without changing the physical key', () => {
    const kounter = STORAGE_CATALOG.find((entry) => entry.id === 'kounterFlags');
    expect(kounter?.key).toBe('mirahikari-portfolio:cache:kounter-flags');
    expect(kounter && 'sharedId' in kounter ? kounter.sharedId : undefined).toBe(
      SHARED_SERVICE_KEYS.kounterFlags,
    );
    expect(STORAGE_KEYS.visitorReader).toBe(SHARED_READING_STORAGE_KEY);
    // Giscus owns its session inside the giscus.app iframe on the general site.
    const keys: readonly string[] = STORAGE_CATALOG.map((entry) => entry.key);
    expect(keys).not.toContain(SHARED_SERVICE_KEYS.giscusSession);
  });
});

describe('readStorageItem / writeStorageItem / removeStorageItem', () => {
  const storage = new MemoryStorage();

  afterEach(() => {
    storage.clear();
  });

  it('returns canonical value when present', () => {
    storage.setItem(STORAGE_KEYS.motionLevel, 'reduced');
    expect(readStorageItem(storage, STORAGE_KEYS.motionLevel)).toBe('reduced');
  });

  it('ignores retired keys and reads only the canonical key', () => {
    storage.setItem('cmd-palette-recents', '["nav-home"]');
    expect(readStorageItem(storage, STORAGE_KEYS.cmdRecents)).toBeNull();
    expect(storage.getItem('cmd-palette-recents')).toBe('["nav-home"]');

    storage.setItem(STORAGE_KEYS.cmdRecents, '["nav-home"]');
    expect(readStorageItem(storage, STORAGE_KEYS.cmdRecents)).toBe('["nav-home"]');
  });

  it('writes only the canonical key and leaves unrelated keys untouched', () => {
    storage.setItem('mirahikari-shortcut-hint-seen', '1');
    writeStorageItem(storage, STORAGE_KEYS.shortcutHintSeen, '1');
    expect(storage.getItem(STORAGE_KEYS.shortcutHintSeen)).toBe('1');
    expect(storage.getItem('mirahikari-shortcut-hint-seen')).toBe('1');
  });

  it('removes only the canonical key', () => {
    storage.setItem(STORAGE_KEYS.adminGhPat, 'ghp_new');
    storage.setItem('portfolio-admin-gh-pat', 'ghp_old');
    removeStorageItem(storage, STORAGE_KEYS.adminGhPat);
    expect(storage.getItem(STORAGE_KEYS.adminGhPat)).toBeNull();
    expect(storage.getItem('portfolio-admin-gh-pat')).toBe('ghp_old');
  });

  it('returns null when nothing is stored', () => {
    expect(readStorageItem(storage, STORAGE_KEYS.privacyLang)).toBeNull();
  });
});

describe('convenience wrappers (readStorage / writeStorage / readJsonStorage / …)', () => {
  const local = new MemoryStorage();
  const session = new MemoryStorage();

  beforeEach(() => {
    local.clear();
    session.clear();
    vi.stubGlobal('window', { localStorage: local, sessionStorage: session });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes local-persistence keys to localStorage and session keys to sessionStorage', () => {
    writeStorage(STORAGE_KEYS.motionLevel, 'reduced');
    writeStorage(STORAGE_KEYS.perfNoticeDismissed, '1');

    expect(local.getItem(STORAGE_KEYS.motionLevel)).toBe('reduced');
    expect(session.getItem(STORAGE_KEYS.motionLevel)).toBeNull();
    expect(session.getItem(STORAGE_KEYS.perfNoticeDismissed)).toBe('1');
    expect(local.getItem(STORAGE_KEYS.perfNoticeDismissed)).toBeNull();

    expect(readStorage(STORAGE_KEYS.motionLevel)).toBe('reduced');
    expect(readStorage(STORAGE_KEYS.perfNoticeDismissed)).toBe('1');
  });

  it('round-trips the display-mode preference through the catalog key', () => {
    writeStorage(STORAGE_KEYS.displayMode, 'win95');
    expect(readStorage(STORAGE_KEYS.displayMode)).toBe('win95');
    writeStorage(STORAGE_KEYS.displayMode, 'classic');
    expect(readStorage(STORAGE_KEYS.displayMode)).toBe('classic');
  });

  it('readJsonStorage / writeJsonStorage round-trip and tolerate corrupt JSON', () => {
    writeJsonStorage(STORAGE_KEYS.cmdRecents, ['nav-home', 'perf-auto']);
    expect(readJsonStorage<string[]>(STORAGE_KEYS.cmdRecents)).toEqual(['nav-home', 'perf-auto']);

    local.setItem(STORAGE_KEYS.cmdRecents, '{oops');
    expect(readJsonStorage<string[]>(STORAGE_KEYS.cmdRecents)).toBeNull();
    expect(readStorage(STORAGE_KEYS.cmdRecents)).toBe('{oops');
  });

  it('removeStorage clears only the canonical key from the right storage', () => {
    writeStorage(STORAGE_KEYS.shortcutHintSeen, '1');
    local.setItem('mirahikari-shortcut-hint-seen', '1');
    removeStorage(STORAGE_KEYS.shortcutHintSeen);
    expect(local.getItem(STORAGE_KEYS.shortcutHintSeen)).toBeNull();
    expect(local.getItem('mirahikari-shortcut-hint-seen')).toBe('1');
  });

  it('is SSR-safe: no window means reads return null and writes are ignored', () => {
    vi.unstubAllGlobals();
    expect(readStorage(STORAGE_KEYS.motionLevel)).toBeNull();
    expect(readJsonStorage(STORAGE_KEYS.motionLevel)).toBeNull();
    expect(() => writeStorage(STORAGE_KEYS.motionLevel, 'full')).not.toThrow();
    expect(() => removeStorage(STORAGE_KEYS.motionLevel)).not.toThrow();
  });

  it('treats restricted storage as unavailable instead of throwing', () => {
    vi.unstubAllGlobals();
    vi.stubGlobal(
      'window',
      Object.defineProperty({}, 'localStorage', {
        get() {
          throw new Error('storage blocked');
        },
      }),
    );
    expect(readStorage(STORAGE_KEYS.motionLevel)).toBeNull();
    expect(() => writeStorage(STORAGE_KEYS.motionLevel, 'full')).not.toThrow();
    expect(() => removeStorage(STORAGE_KEYS.motionLevel)).not.toThrow();
  });
});
