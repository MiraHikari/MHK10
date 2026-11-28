import { defineConfig, devices } from '@playwright/test';
import { E2E_PORT } from '../../scripts/verify-config.mjs';

// The desktop suite owns a private port so a running dev server (4322) never
// answers for a verification build.
const port = process.env.MHK_E2E_PORT ?? String(E2E_PORT);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Each scenario runs the full canvas desktop and its HTML applications.
  // Match CI locally so parallel browsers do not starve rendering and input.
  workers: 2,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    reducedMotion: 'reduce',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node scripts/preview-test.mjs',
    url: baseURL,
    reuseExistingServer: false,
    // A focused run may build on demand before the server is ready.
    timeout: 180_000,
  },
});
