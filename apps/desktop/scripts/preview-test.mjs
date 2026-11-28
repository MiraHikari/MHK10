import { resolve } from 'node:path';
import { preview } from 'vite-plus';
import {
  BUILD_PLANS,
  assertPrebuilt,
  buildConfiguration,
} from '../../../scripts/build-configs.mjs';
import { E2E_PORT, VERIFY_DIST } from '../../../scripts/verify-config.mjs';

// Playwright owns this server. The full gate prebuilds the same configuration
// once; a focused run builds on demand into the same private directory so it
// never serves a stale or site-origin `dist`.
const desktopRoot = resolve(import.meta.dirname, '..');
const workspaceRoot = resolve(desktopRoot, '../..');
const plan = BUILD_PLANS.find((entry) => entry.target === 'e2e' && entry.app === 'desktop');
if (!plan) throw new Error('Missing the e2e desktop build plan.');
const dist = resolve(workspaceRoot, process.env.MHK_DESKTOP_DIST ?? VERIFY_DIST.e2e);
const port = Number(process.env.MHK_E2E_PORT ?? E2E_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`MHK_E2E_PORT must be a valid TCP port, received ${process.env.MHK_E2E_PORT}.`);
}

if (process.env.MHK_E2E_PREBUILT === '1') {
  assertPrebuilt(plan, dist);
} else {
  buildConfiguration(plan, dist);
}

// Serve the completed static build without taking over the interactive preview session.
await preview({
  configFile: false,
  root: desktopRoot,
  build: { outDir: dist },
  preview: { host: '127.0.0.1', port, strictPort: true },
});
