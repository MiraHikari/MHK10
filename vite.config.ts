import { defineConfig } from 'vite-plus';

const ignored = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.astro/**',
  '**/.edgeone/**',
  '**/.tmp/**',
  '**/.cache/**',
  '**/source-repo/**',
  '**/artifacts/**',
  '**/test-results/**',
  '**/playwright-report/**',
  '**/coverage/**',
  '**/public/vendor/**',
  '**/scripts/architecture/fixtures/**',
];

// Astro owns page compilation; Vite+ owns the workspace tools and task runner.
export default defineConfig({
  test: {
    projects: [
      'apps/desktop/vite.config.ts',
      'apps/general/vite.config.ts',
      'packages/site-core/vite.config.ts',
    ],
    maxWorkers: 4,
  },
  lint: {
    plugins: ['typescript', 'react'],
    ignorePatterns: ignored,
    options: { typeAware: true, typeCheck: true },
    rules: { 'typescript/no-explicit-any': 'error' },
  },
  // Keep these values aligned with scripts/format-policy.mjs, which the Node
  // formatters use; the CLI check is the verification source of truth.
  fmt: {
    tabWidth: 2,
    useTabs: false,
    singleQuote: true,
    semi: true,
    endOfLine: 'lf',
    printWidth: 100,
    sortPackageJson: false,
    ignorePatterns: [...ignored, '**/*.astro', 'package-lock.json'],
  },
});
