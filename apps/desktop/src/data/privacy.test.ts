import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';
import shared from '@mhk/site-core/content-model/profile-data';
import { GISCUS_CONFIG } from '@mhk/site-core/config/giscus';
import { READER_STORAGE_KEY, SHARED_SERVICE_KEYS } from '@mhk/site-core/storage/keys';
import { LOCAL_RECORDS } from './privacy';

const root = fileURLToPath(new URL('../../', import.meta.url));

function filesIn(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return filesIn(path);
    return /\.(?:ts|astro|mjs|css)$/.test(name) && !name.endsWith('.test.ts') ? [path] : [];
  });
}

function storageKeys(paths: string[]): Set<string> {
  const keys = new Set<string>();
  const pattern = /['"`]((?:doom95\.[A-Za-z0-9._-]+)|giscus-session|kounter-flags)['"`]/g;
  for (const path of paths) {
    for (const match of readFileSync(path, 'utf8').matchAll(pattern)) keys.add(match[1] ?? '');
  }
  keys.delete('');
  return keys;
}

describe('privacy inventory', () => {
  it('names every storage key the site writes, and no unused key', () => {
    const implementation = filesIn(join(root, 'src')).filter(
      (path) => relative(root, path).replaceAll('\\', '/') !== 'src/data/privacy.ts',
    );
    // Shared notebook storage is a runtime dependency of Reader and the embedded host.
    implementation.push(
      ...filesIn(fileURLToPath(new URL('../../../../packages/site-core/src/', import.meta.url))),
    );
    const found = storageKeys(implementation);
    const listed = LOCAL_RECORDS.map((record) => record.key);
    expect(listed).toEqual([...new Set(listed)]);
    expect([...found].sort()).toEqual([...listed].sort());
  });

  it('uses the shared service identities for the raw desktop keys', () => {
    const keys = LOCAL_RECORDS.map((record) => record.key);
    expect(keys).toContain(SHARED_SERVICE_KEYS.kounterFlags);
    expect(keys).toContain(SHARED_SERVICE_KEYS.giscusSession);
    expect(keys).toContain(READER_STORAGE_KEY);
    expect(SHARED_SERVICE_KEYS).toEqual({
      kounterFlags: 'kounter-flags',
      giscusSession: 'giscus-session',
    });
  });

  it('publishes those keys in the English privacy article', () => {
    const article = readFileSync(join(root, 'src/content/posts/privacy.md'), 'utf8');
    for (const record of LOCAL_RECORDS) expect(article).toContain(record.key);
    expect(article).toContain('title: Privacy');
    expect(article).toContain('Giscus');
    expect(article).toContain(GISCUS_CONFIG.repo);
    expect(article).toContain('GitHub');
    expect(article).toContain('Open Kounter');
    expect(article).toContain('kounter-flags');
    expect(article).not.toContain('GDPR');
  });

  it('keeps the published contact address aligned with the shared profile', () => {
    // The privacy Adapter is authored as a template artifact, so its contact
    // sentence must match the tracked template profile — not the owner's
    // local override, which replaces the runtime data source only.
    const template = JSON.parse(
      readFileSync(join(root, '../../packages/site-core/content/profile.json'), 'utf8'),
    ) as { profile: { email: string } };
    const article = readFileSync(join(root, 'src/content/posts/privacy.md'), 'utf8');
    expect(article).toContain(template.profile.email);
  });
});
