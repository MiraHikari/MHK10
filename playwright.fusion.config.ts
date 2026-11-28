import { defineConfig, devices } from '@playwright/test';
import { FUSION_GENERAL_ORIGIN } from './scripts/verify-config.mjs';

const browserName = process.env.MHK_FUSION_BROWSER ?? 'chromium';
if (browserName !== 'chromium' && browserName !== 'firefox' && browserName !== 'webkit')
  throw new Error(`Unsupported MHK_FUSION_BROWSER: ${browserName}`);

/**
 * Cross-application fusion scenarios. The desktop's own suite lives in
 * apps/desktop/tests/e2e and is served from a single build; these tests need
 * both apps built with each other's local origins, so they own their server.
 */
export default defineConfig({
  testDir: './tests/fusion',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Both apps share one browser context per scenario and one pair of servers.
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: FUSION_GENERAL_ORIGIN,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: browserName === 'chromium' ? 'fusion' : `fusion-${browserName}`,
      use: {
        ...devices[
          browserName === 'webkit'
            ? 'Desktop Safari'
            : browserName === 'firefox'
              ? 'Desktop Firefox'
              : 'Desktop Chrome'
        ],
        browserName,
        viewport: { width: 1280, height: 900 },
      },
    },
  ],
  webServer: {
    command: 'node scripts/e2e-fusion-server.mjs',
    url: FUSION_GENERAL_ORIGIN,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
