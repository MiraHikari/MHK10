import { defineConfig } from 'astro/config';
import { SITE_ORIGIN } from './src/data/site-origin.ts';

export default defineConfig({
  site: SITE_ORIGIN,
  trailingSlash: 'always',
  devToolbar: { enabled: false },
  // Verification builds choose a private configuration directory; the site
  // build keeps Astro's default so deployment always serves `dist`.
  outDir: process.env.MHK_OUT_DIR ?? './dist',
});
