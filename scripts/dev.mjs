import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const preview = process.argv.includes('--preview');
const astro = resolve(root, 'node_modules/astro/bin/astro.mjs');
const apps = [
  { name: 'general', port: 4321 },
  { name: 'desktop', port: 4322 },
];
const children = apps.map(({ name, port }) =>
  spawn(
    process.execPath,
    [astro, preview ? 'preview' : 'dev', '--host', '127.0.0.1', '--port', String(port)],
    {
      cwd: resolve(root, 'apps', name),
      stdio: 'inherit',
      env: {
        ...process.env,
        PUBLIC_DESK_URL: 'http://127.0.0.1:4322',
        PUBLIC_PARENT_ORIGINS: 'http://127.0.0.1:4321',
        PUBLIC_GENERAL_URL: 'http://127.0.0.1:4321',
      },
    },
  ),
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
for (const child of children) {
  child.on('error', (error) => {
    console.error(error);
    stop(1);
  });
  child.on('exit', (code) => stop(code ?? 1));
}
