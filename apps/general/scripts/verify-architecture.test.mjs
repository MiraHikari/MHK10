import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { analyzeArchitecture } from './verify-architecture.mjs';

async function fixture(t, files) {
  const root = await mkdtemp(join(tmpdir(), 'mhk-general-architecture-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, ...path.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return root;
}

function contains(violations, fragment) {
  return violations.some((violation) => violation.includes(fragment));
}

test('accepts a clean Astro page and TypeScript model', async (t) => {
  const root = await fixture(t, {
    'src/pages/index.astro': `---
import Layout from '../layouts/Layout.astro';
import { FUSION_EVENTS } from '@mhk/site-core/fusion/protocol-model';
---
<Layout><script src="/scripts/app.js"></script><p>The 'mhk-fusion' protocol is shared.</p></Layout>
`,
    'src/layouts/Layout.astro': `---
import { value } from '@/lib/value';
---
<p>{value}</p>
`,
    'src/lib/value.ts': `export const value = 1;\n`,
  });
  const { violations, astroCount } = await analyzeArchitecture(root);
  assert.deepEqual(violations, []);
  assert.equal(astroCount, 2);
});

test('rejects an Astro page that imports the desktop presentation', async (t) => {
  const root = await fixture(t, {
    'src/pages/index.astro': `---
import Desktop from '@mhk/desktop/src/App';
---
<Desktop />
`,
  });
  const { violations } = await analyzeArchitecture(root);
  assert(
    contains(violations, 'app must not depend on the desktop presentation'),
    violations.join(),
  );
});

test('rejects an inline Astro script that imports the desktop presentation', async (t) => {
  const root = await fixture(t, {
    'src/pages/index.astro': `---
const title = 'page';
---
<h1>{title}</h1>
<script>
  import Desktop from '@mhk/desktop/src/App';
  console.log(Desktop);
</script>
`,
  });
  const { violations } = await analyzeArchitecture(root);
  assert(
    contains(violations, 'app must not depend on the desktop presentation'),
    violations.join(),
  );
});

test('rejects a raw mhk-fusion literal in an Astro page', async (t) => {
  const root = await fixture(t, {
    'src/pages/index.astro': `---
const namespace = 'mhk-fusion';
---
<p>{namespace}</p>
`,
  });
  const { violations } = await analyzeArchitecture(root);
  assert(
    contains(violations, 'use shared fusion namespace and event constants'),
    violations.join(),
  );
});

test('reports malformed Astro instead of crashing the gate', async (t) => {
  const root = await fixture(t, {
    'src/pages/index.astro': '<div>\n',
  });
  const { violations } = await analyzeArchitecture(root);
  assert(contains(violations, 'Unexpected token'), violations.join());
});

test('rejects an Astro relative import that escapes src', async (t) => {
  const root = await fixture(t, {
    'src/pages/index.astro': `---
import Outside from '../../../outside/Outside.astro';
---
<Outside />
`,
  });
  const { violations } = await analyzeArchitecture(root);
  assert(contains(violations, 'relative import escapes src'), violations.join());
});
