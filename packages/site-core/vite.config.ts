import { defineConfig } from 'vite-plus';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: 'site-core',
    include: ['src/**/*.test.ts'],
    maxWorkers: 4,
  },
});
