import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, it } from 'vite-plus/test';
import { buildCatalogSnapshotSource } from '../../scripts/generate-app-catalog.mjs';
import { APP_CATALOG } from './app-catalog';
import { CANVAS_APPS } from './app-catalog.generated';

const temporaryRoot = fileURLToPath(new URL('../../.tmp/', import.meta.url));

async function withSidecars(files: Record<string, string>, run: (directory: URL) => Promise<void>) {
  mkdirSync(temporaryRoot, { recursive: true });
  const directory = mkdtempSync(join(temporaryRoot, 'catalog-fixture-'));
  if (!directory.startsWith(temporaryRoot)) throw new Error('Invalid catalog fixture path');
  try {
    for (const [name, source] of Object.entries(files)) {
      const target = join(directory, name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, source);
    }
    await run(pathToFileURL(`${directory}${sep}`));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function registrationSource(overrides: Record<string, unknown> = {}): string {
  return `export const registration = ${JSON.stringify({
    id: 'sample',
    name: 'Sample',
    kind: 'canvas',
    title: 'Sample',
    w: 200,
    h: 100,
    ...overrides,
  })} as const;`;
}

it('keeps the generated catalog snapshot fresh', async () => {
  const committed = readFileSync(new URL('./app-catalog.generated.ts', import.meta.url), 'utf8');
  expect(committed, 'The catalog snapshot is stale; run npm run generate:app-catalog.').toBe(
    await buildCatalogSnapshotSource(),
  );
});
it('orders every registration exactly once', () => {
  const seen = APP_CATALOG.map((app) => app.id);
  expect(new Set(seen).size).toBe(seen.length);
  // 9 = the non-canvas seed block authored beside CATALOG_ORDER in app-catalog.ts.
  expect(seen).toHaveLength(CANVAS_APPS.length + 9);
});
it('keeps every canvas registration in the ordered catalog', () => {
  const ordered = new Set(APP_CATALOG.map((app) => app.id));
  for (const app of CANVAS_APPS) expect(ordered).toContain(app.id);
});

it('discovers nested sidecars and orders IDs independently of directory and filename', async () => {
  await withSidecars(
    {
      'a-first.registration.ts': registrationSource({ id: 'zulu' }),
      'feature/nested/z-last.registration.ts': registrationSource({ id: 'alpha' }),
      'feature/model.ts': "throw new Error('Models must not enter catalog generation');",
      'feature/example.app.ts':
        "throw new Error('Applications must not enter catalog generation');",
      'feature/example.registration.test.ts':
        "throw new Error('Tests must not enter catalog generation');",
    },
    async (directory) => {
      const source = await buildCatalogSnapshotSource(directory);
      expect(source.match(/id: '[^']+'/g)).toEqual(["id: 'alpha'", "id: 'zulu'"]);
    },
  );
});

it('rejects duplicate IDs across nested directories with both source paths', async () => {
  await withSidecars(
    {
      'first/example.registration.ts': registrationSource(),
      'second/deep/example.registration.ts': registrationSource(),
    },
    async (directory) => {
      await expect(buildCatalogSnapshotSource(directory)).rejects.toThrow(
        'Duplicate application registration: sample (first/example.registration.ts, second/deep/example.registration.ts)',
      );
    },
  );
});

it.each([
  { id: '' },
  { id: 'not a stable id' },
  { kind: 'html' },
  { name: '' },
  { title: ' ' },
  { w: 0 },
  { h: 0.5 },
  { x: 1.5 },
])('rejects malformed nested registration fields: %j', async (overrides) => {
  await withSidecars(
    { 'feature/bad.registration.ts': registrationSource(overrides) },
    async (directory) => {
      await expect(buildCatalogSnapshotSource(directory)).rejects.toThrow(
        'Invalid registration sidecar: feature/bad.registration.ts',
      );
    },
  );
});

it('rejects a sidecar without a registration export', async () => {
  await withSidecars(
    { 'feature/bad.registration.ts': 'export const metadata = {};' },
    async (directory) => {
      await expect(buildCatalogSnapshotSource(directory)).rejects.toThrow(
        'Invalid registration sidecar: feature/bad.registration.ts',
      );
    },
  );
});
