import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { E2E_PORT, VERIFY_DIST } from './verify-config.mjs';

const root = resolve(import.meta.dirname, '..');
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run verification with npm run verify.');

/**
 * Every workspace must expose the gates the root runner will invoke. A rename
 * or a missing workspace must fail here, not silently skip a verification
 * step. `@mhk/site-core` is a library with no built site, so it intentionally
 * has no `verify:site` gate. An explicitly empty array marks an intentional
 * exception; a workspace with no entry at all is a verification failure.
 */
const requiredGates = {
  '@mhk/general': ['check', 'lint', 'test', 'verify:architecture', 'verify:site'],
  '@mhk/desktop': ['check', 'lint', 'test', 'verify:architecture', 'verify:site'],
  '@mhk/site-core': ['check', 'lint', 'test', 'verify:architecture'],
};

function workspaceManifests() {
  const manifests = new Map();
  for (const group of ['apps', 'packages']) {
    for (const entry of readdirSync(resolve(root, group), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = resolve(root, group, entry.name, 'package.json');
      let source;
      try {
        source = readFileSync(path, 'utf8');
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      const manifest = JSON.parse(source);
      manifests.set(manifest.name, { path, manifest });
    }
  }
  return manifests;
}

const manifests = workspaceManifests();
const problems = [];
for (const [name, gates] of Object.entries(requiredGates)) {
  const workspace = manifests.get(name);
  if (!workspace) {
    problems.push(`Missing workspace ${name}.`);
    continue;
  }
  for (const gate of gates) {
    if (typeof workspace.manifest.scripts?.[gate] !== 'string') {
      problems.push(`${workspace.path} is missing the "${gate}" script.`);
    }
  }
}
for (const name of manifests.keys()) {
  if (!Object.hasOwn(requiredGates, name)) {
    problems.push(
      `Workspace ${name} has no required-gate entry; list it (or an intentional empty gate list) in scripts/verify.mjs.`,
    );
  }
}
if (problems.length) {
  for (const problem of problems) console.error(problem);
  console.error(`Verification preflight failed with ${problems.length} problem(s).`);
  process.exit(1);
}

const steps = [
  { name: 'check' },
  { name: 'lint' },
  { name: 'format:check' },
  { name: 'verify:architecture' },
  { name: 'content:check' },
  { name: 'test' },
  { name: 'build' },
  { name: 'verify:site' },
  // Build each verification configuration once, after the site build and its
  // validation. These outputs live under `.verify/`, never in `dist`.
  { name: 'build:verify' },
  {
    name: 'test:e2e',
    env: {
      MHK_E2E_PREBUILT: '1',
      MHK_E2E_PORT: String(E2E_PORT),
      MHK_DESKTOP_DIST: VERIFY_DIST.e2e,
    },
  },
  {
    name: 'test:e2e:fusion',
    env: {
      MHK_FUSION_PREBUILT: '1',
      MHK_FUSION_GENERAL_DIST: VERIFY_DIST.fusionGeneral,
      MHK_FUSION_DESKTOP_DIST: VERIFY_DIST.fusionDesktop,
    },
  },
];

for (const step of steps) {
  console.log(`\nVerifying ${step.name}…`);
  const result = spawnSync(process.execPath, [npm, 'run', step.name], {
    stdio: 'inherit',
    cwd: root,
    env: { ...process.env, ...step.env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
