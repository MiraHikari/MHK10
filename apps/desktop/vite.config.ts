import { defineConfig } from 'vite-plus';

// Astro owns its Vite configuration. This file configures Vite+ and Vitest.
export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: 'desktop',
    root: import.meta.dirname,
    include: ['src/**/*.test.ts'],
    // Registry and catalog checks load the complete application graph.
    maxWorkers: 4,
  },
});
