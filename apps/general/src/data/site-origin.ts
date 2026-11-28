// Single source of truth for the deployed origin. Consumed by astro.config.mjs,
// layouts/pages, and node-side scripts (verify-site) — keep it free of any
// other import so both bundlers and plain node can load it.
//
// The owner configures the production origin through PUBLIC_SITE_ORIGIN
// (EdgeOne Pages build variable or a local .env). Vite replaces
// `import.meta.env.*` statically in builds; plain-node consumers (verify-site)
// read `process.env` instead, so both paths see the same override. The
// example.com fallback keeps a fresh clone buildable without configuration.
function envOrigin(): string | undefined {
  // Vite statically replaces import.meta.env.*; in plain node this object is
  // undefined and process.env is consulted instead.
  const fromVite = (
    import.meta as unknown as { env?: Record<string, string | undefined> }
  ).env?.PUBLIC_SITE_ORIGIN?.trim();
  if (fromVite) return fromVite;
  const fromNode =
    typeof process !== 'undefined' ? process.env?.PUBLIC_SITE_ORIGIN?.trim() : undefined;
  return fromNode || undefined;
}

export const SITE_ORIGIN = envOrigin() ?? 'https://www.example.com';
