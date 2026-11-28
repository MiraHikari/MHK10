/**
 * Shared profile data resolution (single source for both presentations).
 *
 * The tracked `content/profile.json` is the template. The site owner's
 * gitignored `content/local/profile.json` replaces it whole when present —
 * there is no deep merge, because a partially merged biography is worse than
 * a missing one. `import.meta.glob` over the optional local path stays empty
 * without the file, so a clone resolves the template in every environment
 * (Vite build, Astro build, Vitest) and the owner's checkout resolves their
 * real data the same way everywhere. Types come from the tracked template.
 */
import template from '../../content/profile.json';

const locals = import.meta.glob<typeof template>('../../content/local/profile.json', {
  eager: true,
  import: 'default',
});

const profileData: typeof template = Object.values(locals)[0] ?? template;
export default profileData;
