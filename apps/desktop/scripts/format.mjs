import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { format } from 'vite-plus/fmt';
import { format as formatAstro } from 'prettier';
import { formatOptions, isFormattable } from '../../../scripts/format-policy.mjs';

const root = resolve(import.meta.dirname, '..');
const baselineFile = resolve(root, 'scripts/format-baseline.json');
const normalize = (source) => source.replace(/\r\n/g, '\n');
const hash = (source) => createHash('sha256').update(normalize(source)).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const baseline = JSON.parse(await readFile(baselineFile, 'utf8'));
if (baseline.version !== 1 || typeof baseline.commit !== 'string' || !baseline.files) {
  throw new Error('Unsupported format baseline.');
}
const baselinePath = 'apps/desktop/scripts/format-baseline.json';
const previousVersions = git(
  'log',
  '-2',
  '--format=%H',
  '--',
  baselinePath,
  'scripts/format-baseline.json',
)
  .trim()
  .split('\n')
  .filter(Boolean);
for (const commit of previousVersions) {
  let previous;
  try {
    previous = JSON.parse(git('show', `${commit}:${baselinePath}`));
  } catch {
    previous = JSON.parse(git('show', `${commit}:scripts/format-baseline.json`));
  }
  if (
    baseline.commit !== previous.commit ||
    Object.keys(baseline.files).some((file) => !Object.hasOwn(previous.files, file))
  ) {
    throw new Error('The format baseline may only shrink; removed entries cannot be restored.');
  }
}
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const check = args.includes('--check');
const prune = args.includes('--prune-baseline');
const supplied = args.filter((arg) => !arg.startsWith('--'));
const files = [
  ...new Set(
    supplied.length
      ? supplied.map((file) => file.replaceAll('\\', '/').replace(/^\.\//, ''))
      : git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0'),
  ),
].filter(isFormattable);

async function formatted(file, source) {
  if (file.endsWith('.astro')) {
    const { sortPackageJson: _unused, ...options } = formatOptions;
    return formatAstro(source, {
      ...options,
      filepath: file,
      parser: 'astro',
      plugins: ['prettier-plugin-astro'],
    });
  }
  const result = await format(file, source, formatOptions);
  if (result.errors.length) {
    throw new Error(`${file}: ${result.errors.map((error) => error.message).join('; ')}`);
  }
  return result.code;
}

// Baseline hashes must belong to the original snapshot, never to a new violation.
for (const [file, digest] of Object.entries(baseline.files)) {
  let original;
  try {
    original = git('show', `${baseline.commit}:${file}`);
  } catch {
    throw new Error(`Invalid format baseline entry: ${file}`);
  }
  if (!isFormattable(file) || hash(original) !== digest) {
    throw new Error(`Format baseline must retain its original hash: ${file}`);
  }
}

const failures = [];
let unchanged = 0;
let changed = 0;
for (const file of files.sort()) {
  let source;
  try {
    source = await readFile(resolve(root, file), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    continue;
  }
  const inherited = hash(source) === baseline.files[file];
  // A plain format command changes only touched/new files unless paths are supplied.
  if (inherited && !supplied.length && !prune) {
    unchanged++;
    continue;
  }
  const output = await formatted(file, source);
  if (normalize(source) === output) continue;
  if (inherited && (check || prune)) {
    unchanged++;
    continue;
  }
  if (check || prune) failures.push(file);
  else {
    await writeFile(resolve(root, file), output);
    changed++;
  }
}

if (prune) {
  for (const file of Object.keys(baseline.files)) {
    if (supplied.length && !files.includes(file)) continue;
    let source;
    try {
      source = await readFile(resolve(root, file), 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (source === undefined || normalize(source) === (await formatted(file, source))) {
      delete baseline.files[file];
    }
  }
  await writeFile(baselineFile, `${JSON.stringify(baseline, null, 2)}\n`);
}

if (failures.length) {
  console.error(
    `Format these changed/new files with npm run format -- <paths>:\n${failures.join('\n')}`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `Formatting checked ${files.length} files; ${unchanged} unchanged legacy files; ${changed} formatted.`,
  );
}
