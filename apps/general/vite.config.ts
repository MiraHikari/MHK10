import { defineConfig } from 'vite-plus';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    name: 'general',
    root: import.meta.dirname,
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    // The architecture gate owns its Node test runner; Vitest cannot collect
    // `node:test` cases from the same file.
    exclude: ['scripts/verify-architecture.test.mjs'],
    maxWorkers: 4,
  },
});
