import { analyzeArchitecture } from './architecture/check.mjs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? sourceFiles(join(directory, entry.name))
          : [join(directory, entry.name)],
      ),
    )
  ).flat();
}
const duplicateFusion = [];
for (const file of await sourceFiles('src')) {
  if (!/\.(?:ts|tsx|astro)$/.test(file) || /(?:\.test\.ts|\.d\.ts)$/.test(file)) continue;
  if (/["'`]mhk-fusion(?::[^"'`]+)?["'`]/.test(await readFile(file, 'utf8')))
    duplicateFusion.push(file);
}
for (const file of duplicateFusion) console.error(`fusion-uses-shared-constants: ${file}`);

const result = await analyzeArchitecture();
for (const violation of result.violations) {
  console.error(
    `${violation.rule.name}: ${violation.from} → ${violation.to}`.replaceAll('.astro.ts', '.astro'),
  );
}
if (result.violations.length || duplicateFusion.length) process.exitCode = 1;
else
  console.log(
    `Verified ${result.modules.length} modules, including ${result.astroCount} Astro files: domain boundaries and runtime cycles.`,
  );
