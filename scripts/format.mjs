import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { format } from 'vite-plus/fmt';
import { format as formatAstro } from 'prettier';
import { formatOptions } from './format-policy.mjs';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const check = args.includes('--check');
const supplied = args
  .filter((arg) => !arg.startsWith('--'))
  .map((file) => file.replaceAll('\\', '/'));
const desktop = supplied
  .filter((file) => file.startsWith('apps/desktop/'))
  .map((file) => file.slice('apps/desktop/'.length));
if (!supplied.length || desktop.length) {
  const result = spawnSync(
    process.execPath,
    [resolve(root, 'apps/desktop/scripts/format.mjs'), ...(check ? ['--check'] : []), ...desktop],
    { cwd: resolve(root, 'apps/desktop'), stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const files = supplied.length
  ? supplied
  : execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
      cwd: root,
      encoding: 'utf8',
    }).split('\0');
const failures = [];
let changed = 0;
for (const file of [...new Set(files)].sort()) {
  if (file.startsWith('apps/desktop/') || file === 'package-lock.json') continue;
  if (!/\.(?:[cm]?[jt]sx?|astro|css|jsonc?|md|ya?ml|html)$/.test(file)) continue;
  let source;
  try {
    source = await readFile(resolve(root, file), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  let output;
  if (file.endsWith('.astro')) {
    const { sortPackageJson: _unused, ...options } = formatOptions;
    output = await formatAstro(source, {
      ...options,
      parser: 'astro',
      plugins: ['prettier-plugin-astro'],
    });
  } else {
    const result = await format(file, source, formatOptions);
    if (result.errors.length)
      throw new Error(`${file}: ${result.errors.map((error) => error.message).join('; ')}`);
    output = result.code;
  }
  if (source.replace(/\r\n/g, '\n') === output) continue;
  if (check) failures.push(file);
  else {
    await writeFile(resolve(root, file), output);
    changed++;
  }
}
if (failures.length) {
  console.error(`Format changed/new files with npm run format -- <paths>:\n${failures.join('\n')}`);
  process.exitCode = 1;
} else console.log(`Workspace formatting checked; ${changed} formatted.`);
