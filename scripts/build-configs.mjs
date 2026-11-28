import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FUSION_DESKTOP_ORIGIN,
  FUSION_GENERAL_ORIGIN,
  KOUNTER_OFFLINE_URL,
  VERIFY_DIST,
} from './verify-config.mjs';

/**
 * One build per verification configuration. Each plan compiles an application
 * with the origins that its browser suite expects and writes to a private
 * output directory, so verification never overwrites the deployable `dist`
 * tree or reuses a build made for a different origin pair.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const astro = resolve(root, 'node_modules/astro/bin/astro.mjs');

export const BUILD_PLANS = [
  {
    target: 'e2e',
    app: 'desktop',
    outDir: VERIFY_DIST.e2e,
    env: { PUBLIC_KOUNTER_URL: KOUNTER_OFFLINE_URL },
  },
  {
    target: 'fusion',
    app: 'general',
    outDir: VERIFY_DIST.fusionGeneral,
    env: {
      PUBLIC_DESK_URL: FUSION_DESKTOP_ORIGIN,
      PUBLIC_KOUNTER_URL: KOUNTER_OFFLINE_URL,
    },
  },
  {
    target: 'fusion',
    app: 'desktop',
    outDir: VERIFY_DIST.fusionDesktop,
    env: {
      PUBLIC_PARENT_ORIGINS: FUSION_GENERAL_ORIGIN,
      PUBLIC_GENERAL_URL: FUSION_GENERAL_ORIGIN,
      PUBLIC_KOUNTER_URL: KOUNTER_OFFLINE_URL,
    },
  },
];

/** The deterministic identity written beside every successful build. */
export function buildStamp(plan) {
  return {
    app: plan.app,
    env: Object.fromEntries(
      Object.entries(plan.env).sort(([left], [right]) => (left < right ? -1 : 1)),
    ),
    target: plan.target,
  };
}

/** Build one configuration into `outDir` (root-relative unless absolute). */
export function buildConfiguration(plan, outDir = plan.outDir) {
  const output = resolve(root, outDir);
  console.log(`\nBuilding ${plan.target} ${plan.app} → ${output}`);
  const result = spawnSync(process.execPath, [astro, 'build'], {
    cwd: resolve(root, 'apps', plan.app),
    stdio: 'inherit',
    env: { ...process.env, ...plan.env, MHK_OUT_DIR: output },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Astro build for ${plan.target} ${plan.app} exited with status ${result.status ?? 'unknown'}.`,
    );
  }
  writeFileSync(join(output, '.mhk-build.json'), `${JSON.stringify(buildStamp(plan), null, 2)}\n`);
  return output;
}

/** Fail fast when a prebuilt directory is missing or was built for another plan. */
export function assertPrebuilt(plan, outDir = plan.outDir) {
  const output = resolve(root, outDir);
  const stampPath = join(output, '.mhk-build.json');
  if (!existsSync(stampPath)) {
    throw new Error(`Missing build stamp ${stampPath}; run npm run build:verify first.`);
  }
  let actual;
  try {
    actual = JSON.parse(readFileSync(stampPath, 'utf8'));
  } catch {
    throw new Error(`Unreadable build stamp ${stampPath}; run npm run build:verify again.`);
  }
  const expected = buildStamp(plan);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Prebuilt output at ${output} does not match the ${plan.target} ${plan.app} configuration; run npm run build:verify again.`,
    );
  }
  if (!existsSync(join(output, 'index.html'))) {
    throw new Error(
      `Prebuilt output at ${output} has no index.html; run npm run build:verify again.`,
    );
  }
  return output;
}

/** Build every configuration for the selected targets exactly once. */
export function buildTargets(targets = BUILD_PLANS.map((plan) => plan.target)) {
  const selected = new Set(targets);
  const known = new Set(BUILD_PLANS.map((plan) => plan.target));
  for (const target of selected) {
    if (!known.has(target)) {
      throw new Error(
        `Unknown build target "${target}". Available targets: ${[...known].join(', ')}.`,
      );
    }
  }
  const outputs = [];
  for (const plan of BUILD_PLANS) {
    if (!selected.has(plan.target)) continue;
    outputs.push(buildConfiguration(plan));
  }
  return outputs;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    buildTargets(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
