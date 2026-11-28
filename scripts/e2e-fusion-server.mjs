import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite-plus';
import { BUILD_PLANS, assertPrebuilt, buildConfiguration } from './build-configs.mjs';
import { FUSION_DESKTOP_PORT, FUSION_GENERAL_PORT, VERIFY_DIST } from './verify-config.mjs';

// Fusion scenarios need both static builds to embed each other's real origin.
// The full gate prebuilds these exact configurations once; a focused run builds
// them on demand. Both are served from private directories on private ports,
// never from the developer's `dist` or ports.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generalDist = resolve(root, process.env.MHK_FUSION_GENERAL_DIST ?? VERIFY_DIST.fusionGeneral);
const desktopDist = resolve(root, process.env.MHK_FUSION_DESKTOP_DIST ?? VERIFY_DIST.fusionDesktop);

function plan(app) {
  const found = BUILD_PLANS.find((entry) => entry.target === 'fusion' && entry.app === app);
  if (!found) throw new Error(`Missing fusion build plan for ${app}.`);
  return found;
}

if (process.env.MHK_FUSION_PREBUILT === '1') {
  assertPrebuilt(plan('general'), generalDist);
  assertPrebuilt(plan('desktop'), desktopDist);
} else {
  buildConfiguration(plan('general'), generalDist);
  buildConfiguration(plan('desktop'), desktopDist);
}

await Promise.all([
  preview({
    configFile: false,
    root: resolve(root, 'apps/general'),
    build: { outDir: generalDist },
    preview: { host: '127.0.0.1', port: FUSION_GENERAL_PORT, strictPort: true },
  }),
  preview({
    configFile: false,
    root: resolve(root, 'apps/desktop'),
    build: { outDir: desktopDist },
    preview: { host: '127.0.0.1', port: FUSION_DESKTOP_PORT, strictPort: true },
  }),
]);
