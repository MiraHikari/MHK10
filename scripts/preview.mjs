import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { preview } from 'vite-plus';

// Preview serves only the deployable site configuration. Verification builds
// live under `.verify/` and must never be exposed as the site origin.
const root = resolve(import.meta.dirname, '..');
const sites = [
  { name: 'general', directory: resolve(root, 'apps/general'), port: 4321 },
  { name: 'desktop', directory: resolve(root, 'apps/desktop'), port: 4322 },
];
for (const site of sites) {
  if (!existsSync(resolve(site.directory, 'dist/index.html'))) {
    throw new Error(
      `Missing ${site.name} site build at ${resolve(site.directory, 'dist')}. Run npm run build first.`,
    );
  }
}

await Promise.all(
  sites.map((site) =>
    preview({
      configFile: false,
      root: site.directory,
      build: { outDir: 'dist' },
      preview: { host: '127.0.0.1', port: site.port, strictPort: true },
    }),
  ),
);
