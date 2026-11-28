import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { analyzeArchitecture } from './check.mjs';
import { astroImports } from '../../../../scripts/architecture/astro-imports.mjs';

async function fixture(files, run) {
  const directory = await mkdtemp(join(resolve('.tmp'), 'architecture-fixture-'));
  try {
    for (const [file, source] of Object.entries(files)) {
      const target = join(directory, file);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, source);
    }
    await run(await analyzeArchitecture(directory));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

await mkdir('.tmp', { recursive: true });

test('Astro parser sees frontmatter, script, script src, and literal dynamic imports only', () => {
  const source = `---
import type { Type } from './type';
import Component from './Component.astro';
const lazy = () => import('./frontmatter');
---
<p>import fake from './not-code';</p>
<script>import './script'; const lazy = () => import('./dynamic');</script>
<script src="./external.js"></script>`;
  assert.deepEqual(
    astroImports(source, 'sample.astro').map((entry) => entry.source),
    ['./type', './Component.astro', './frontmatter', './script', './dynamic', './external.js'],
  );
  assert.equal(astroImports(source, 'sample.astro')[0].typeOnly, true);
});

test('real dependency rules reject graphics, application and domain boundary violations', async () => {
  await fixture(
    {
      'src/lib/gfx/draw.ts': "import '../os/host';",
      'src/lib/os/host.ts': 'export const host = true;',
      'src/lib/os/desktop/shell.ts': 'export interface Host {}',
      'src/lib/apps/app.ts':
        "import type { Host } from '../os/desktop/shell'; export type App = Host;",
      'src/lib/apps/files.ts': "import '../os/files/browser-files';",
      'src/lib/os/files/browser-files.ts': 'export const download = true;',
      'src/lib/apps/computer/computer.app.ts':
        "import '../../os/host/browser-file-picker'; export const browser = navigator;",
      'src/lib/os/host/browser-file-picker.ts': 'export const picker = true;',
      'src/lib/os/story/doom.ts': "import '../../gfx/draw'; export const title = document.title;",
    },
    ({ violations }) => {
      const names = new Set(violations.map((violation) => violation.rule.name));
      for (const name of [
        'graphics-do-not-own-applications',
        'applications-use-contracts',
        'applications-use-file-capabilities',
        'applications-use-browser-capabilities',
        'application-uses-browser-capabilities',
        'domain-has-no-host-dependencies',
        'domain-has-no-browser-globals',
      ]) {
        assert(names.has(name), `${name} should reject the negative fixture`);
      }
    },
  );
});

test('cycles crossing an Astro dynamic import fail, while a type-only cycle is allowed', async () => {
  await fixture(
    {
      'src/pages/first.astro': "---\nimport './second.astro';\n---\n<div />",
      'src/pages/second.astro': '<script>import("./first.astro");</script>',
      'src/lib/a.ts': "import type { B } from './b'; export interface A { value: B }",
      'src/lib/b.ts': "import type { A } from './a'; export interface B { value: A }",
      'src/lib/c.ts': "import type { D } from './d'; export const c: D = { value: 1 };",
      'src/lib/d.ts':
        "import { c } from './c'; export const d = c; export interface D { value: number }",
    },
    ({ violations, modules }) => {
      assert(
        violations.some(
          (violation) =>
            violation.rule.name === 'no-runtime-cycles' && violation.from.includes('first.astro'),
        ),
      );
      assert(!violations.some((violation) => /\/[abcd]\.ts$/.test(violation.from)));
      assert(
        modules.some(
          (module) =>
            module.source.endsWith('second.astro.ts') &&
            module.dependencies.some((dependency) => dependency.dynamic),
        ),
      );
    },
  );
});

test('missing local imports in Astro are rejected', async () => {
  await fixture(
    { 'src/lib/apps/home/HomeView.astro': '<script>import("./missing");</script>' },
    ({ violations }) => {
      assert(violations.some((violation) => violation.rule.name === 'local-imports-resolve'));
    },
  );
});

test('malformed Astro is an actionable error, not a silently empty module', () => {
  assert.throws(
    () => astroImports('---\nconst = ;\n---\n<div />', 'broken.astro'),
    /broken\.astro: Unexpected token/,
  );
});

test('metadata cannot import the runtime or reference browser globals', async () => {
  await fixture(
    {
      'src/data/catalog.ts':
        "import '../lib/os/host'; export const viewport = globalThis.window.innerWidth;",
      'src/lib/os/host.ts': 'export const host = true;',
    },
    ({ violations }) => {
      assert(violations.some((violation) => violation.rule.name === 'metadata-stays-build-safe'));
      assert(
        violations.some((violation) => violation.rule.name === 'domain-has-no-browser-globals'),
      );
    },
  );
});

test('Vite eager glob registry edges expose cycles and honor exclusions', async () => {
  await fixture(
    {
      'src/lib/apps/index.ts':
        "export const modules = import.meta.glob(['./*.ts', '!./ignored.ts', '!./*.test.ts'], { eager: true });",
      'src/lib/apps/app.ts': "import { modules } from './index'; export const app = modules;",
      'src/lib/apps/ignored.ts': 'export const ignored = true;',
      'src/lib/apps/example.test.ts': 'export const test = true;',
    },
    ({ violations, modules }) => {
      assert(violations.some((violation) => violation.rule.name === 'no-runtime-cycles'));
      const registry = modules.find((module) => module.source === 'src/lib/apps/index.ts');
      assert(
        registry.dependencies.some(
          (dependency) => dependency.resolved.endsWith('/app.ts') && !dependency.dynamic,
        ),
      );
      assert(
        !registry.dependencies.some(
          (dependency) =>
            dependency.resolved.endsWith('/ignored.ts') ||
            dependency.resolved.endsWith('/example.test.ts'),
        ),
      );
    },
  );
});

test('recursive application entry points expose nested cycles without importing sidecars or helpers', async () => {
  await fixture(
    {
      'src/lib/apps/index.ts':
        "export const modules = import.meta.glob('./**/*.app.ts', { eager: true });",
      'src/lib/apps/root.app.ts': 'export const app = true;',
      'src/lib/apps/feature/nested/entry.app.ts':
        "import { modules } from '../../index'; export const app = modules;",
      'src/lib/apps/feature/entry.registration.ts': 'export const registration = {};',
      'src/lib/apps/feature/model.ts': 'export const model = true;',
      'src/lib/apps/feature/entry.app.test.ts': 'export const test = true;',
    },
    ({ violations, modules }) => {
      assert(violations.some((violation) => violation.rule.name === 'no-runtime-cycles'));
      const registry = modules.find((module) => module.source === 'src/lib/apps/index.ts');
      assert.deepEqual(registry.dependencies.map((dependency) => dependency.resolved).sort(), [
        'src/lib/apps/feature/nested/entry.app.ts',
        'src/lib/apps/root.app.ts',
      ]);
      assert(registry.dependencies.every((dependency) => !dependency.dynamic));
    },
  );
});

test('domain names may shadow DOM names, but domain code cannot import styles', async () => {
  await fixture(
    {
      'src/lib/os/files/documents.ts':
        'export function name(document: {name: string}) { return document.name; }',
      'src/lib/os/story/doom.ts': "import '../../../styles/theme.css'; export const risk = 5;",
      'src/styles/theme.css': 'body { color: black; }',
    },
    ({ violations }) => {
      assert(!violations.some((violation) => violation.from.includes('/documents.ts')));
      assert(
        violations.some((violation) => violation.rule.name === 'domain-has-no-host-dependencies'),
      );
    },
  );
});

test('raw Markdown glob imports resolve as data and retain a source dependency edge', async () => {
  await fixture(
    {
      'src/lib/apps/print.ts':
        "export const articles = import.meta.glob('../../content/*.md', { query: '?raw', import: 'default', eager: true });",
      'src/content/article.md':
        "---\ntitle: Printed article\n---\nimport '../lib/os/missing';\n# Body",
    },
    ({ violations, modules }) => {
      assert.deepEqual(violations, []);
      const printer = modules.find((module) => module.source === 'src/lib/apps/print.ts');
      assert(
        printer.dependencies.some(
          (dependency) =>
            dependency.resolved === 'src/content/article.md.raw.ts' && !dependency.dynamic,
        ),
      );
      const article = modules.find((module) => module.source === 'src/content/article.md.raw.ts');
      assert.deepEqual(article.dependencies, []);
    },
  );
});

test('raw Markdown remains a real dependency when imported from a pure model', async () => {
  await fixture(
    {
      'src/lib/apps/print-preview/print-model.ts':
        "export const articles = import.meta.glob('../../../content/*.md', { query: '?raw' });",
      'src/content/article.md': '# Body',
    },
    ({ violations }) => {
      assert(
        violations.some((violation) => violation.rule.name === 'domain-has-no-host-dependencies'),
      );
    },
  );
});

test('new pure models reject browser globals while importing pure palette and sequence types', async () => {
  await fixture(
    {
      'src/lib/apps/sound-recorder/recording-model.ts':
        "import type { Tone } from '../../os/audio/speaker-sequence'; export const tone: Tone = { value: 1 }; export const bad = window.name;",
      'src/lib/os/audio/speaker-sequence.ts': 'export interface Tone { value: number }',
      'src/lib/gfx/palette.ts': 'export const black = "#000000";',
      'src/lib/os/desktop/desktop-settings.ts':
        "import { black } from '../../gfx/palette'; export const colour = black;",
    },
    ({ violations }) => {
      assert.equal(violations.length, 1);
      assert.equal(violations[0].rule.name, 'domain-has-no-browser-globals');
    },
  );
});

test('file, keyboard and assistant models remain independent of host resources', async () => {
  await fixture(
    {
      'src/lib/os/files/file-associations.ts': 'export const bad = localStorage.getItem("files");',
      'src/lib/ui/browser/keyboard-shortcuts.ts': 'export const bad = document.title;',
      'src/lib/os/desktop/assistant-placement.ts': 'export const bad = window.innerWidth;',
      'src/lib/os/files/file-drop-geometry.ts': "import '../desktop/shell';",
      'src/lib/os/desktop/shell.ts': 'export const host = 1;',
    },
    ({ violations }) => {
      assert.equal(
        violations.filter((item) => item.rule.name === 'domain-has-no-browser-globals').length,
        3,
      );
      assert(violations.some((item) => item.rule.name === 'domain-has-no-host-dependencies'));
    },
  );
});

test('new model names and reusable geometry inherit domain protection automatically', async () => {
  await fixture(
    {
      'src/lib/apps/example-model.ts': 'export const bad = navigator.language;',
      'src/lib/os/nested/example-model.ts': "import '../host';",
      'src/lib/os/host.ts': 'export const host = true;',
      'src/lib/os/desktop/desktop-selection.ts': 'export const bad = document.title;',
      'src/lib/ui/canvas/layout.ts': "import '../../os/host';",
      'src/lib/apps/valid-model.ts':
        "import { size } from '../../data/settings'; export const doubled = size * 2;",
      'src/data/settings.ts': 'export const size = 16;',
    },
    ({ violations }) => {
      assert.equal(violations.length, 4);
      assert.equal(
        violations.filter((item) => item.rule.name === 'domain-has-no-browser-globals').length,
        2,
      );
      assert.equal(
        violations.filter((item) => item.rule.name === 'domain-has-no-host-dependencies').length,
        2,
      );
      assert(!violations.some((item) => item.from.endsWith('valid-model.ts')));
    },
  );
});

test('registration sidecars stay zero-import data even for types and lazy dependencies', async () => {
  await fixture(
    {
      'src/lib/apps/typed.registration.ts':
        "import type { Metadata } from '../../data/types'; export const registration: Metadata = { id: 'typed' };",
      'src/lib/apps/lazy.registration.ts':
        "export const registration = { id: 'lazy', load: () => import('./host') };",
      'src/lib/apps/browser.registration.ts':
        "export const registration = { id: 'browser', title: window.name };",
      'src/lib/apps/valid.registration.ts':
        "export const registration = { id: 'valid', kind: 'canvas', w: 200, h: 100 } as const;",
      'src/lib/apps/host.ts': 'export const host = true;',
      'src/data/types.ts': 'export interface Metadata { id: string }',
    },
    ({ violations }) => {
      assert.equal(violations.length, 3);
      assert.equal(
        violations.filter((item) => item.rule.name === 'registration-has-no-dependencies').length,
        2,
      );
      assert(violations.some((item) => item.rule.name === 'domain-has-no-browser-globals'));
      assert(!violations.some((item) => item.from.endsWith('valid.registration.ts')));
    },
  );
});

test('nested registration sidecars retain zero-import and browser-global protection', async () => {
  await fixture(
    {
      'src/lib/apps/feature/deep/typed.registration.ts':
        "import type { Metadata } from '../../../../data/types'; export const registration: Metadata = { id: 'typed' };",
      'src/lib/apps/feature/lazy.registration.ts':
        "export const registration = { id: 'lazy', load: () => import('./host') };",
      'src/lib/apps/feature/browser.registration.ts':
        "export const registration = { id: 'browser', title: globalThis.document.title };",
      'src/lib/apps/feature/deep/valid.registration.ts':
        "export const registration = { id: 'valid', kind: 'canvas', w: 200, h: 100 } as const;",
      'src/lib/apps/feature/host.ts': 'export const host = true;',
      'src/data/types.ts': 'export interface Metadata { id: string }',
    },
    ({ violations }) => {
      assert.equal(violations.length, 3);
      assert.equal(
        violations.filter((item) => item.rule.name === 'registration-has-no-dependencies').length,
        2,
      );
      assert(violations.some((item) => item.rule.name === 'domain-has-no-browser-globals'));
      assert(!violations.some((item) => item.from.endsWith('valid.registration.ts')));
    },
  );
});
