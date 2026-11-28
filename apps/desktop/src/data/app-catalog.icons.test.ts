import { existsSync } from 'node:fs';
import { expect, it } from 'vite-plus/test';
import { APP_CATALOG, appIconFile } from './app-catalog';
it('ships both generated icon sizes for every catalog application', () => {
  const missing = APP_CATALOG.flatMap((app) =>
    [`${appIconFile(app.id)}.svg`, `${appIconFile(app.id)}-32.svg`].filter(
      (name) => !existsSync(new URL(`../../public/icons/${name}`, import.meta.url)),
    ),
  );
  expect(missing, 'Missing generated icons; run node scripts/generate-app-icons.mjs.').toEqual([]);
});
