import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';
import { FUSION_QUERY } from '@mhk/site-core/fusion/protocol-model';

const files = [
  {
    path: '../../../layouts/SiteLayout.astro',
    expressions: [
      'fusionQuery: FUSION_QUERY',
      'get(fusionQuery.shell) === fusionQuery.full',
      'get(FUSION_QUERY.shell) === FUSION_QUERY.full',
    ],
  },
  {
    path: './desktop-entry.ts',
    expressions: ['get(FUSION_QUERY.shell) === FUSION_QUERY.full', 'delete(FUSION_QUERY.shell)'],
  },
  {
    path: './embed-host.ts',
    expressions: ['set(FUSION_QUERY.view, FUSION_QUERY.classic)'],
  },
];

describe('fusion query contract', () => {
  it('publishes the presentation query values shared with the general site', () => {
    expect(FUSION_QUERY).toEqual({
      shell: 'shell',
      full: 'full',
      view: 'view',
      classic: 'classic',
      win95: 'win95',
    });
  });

  it('uses the shared constant and values at every query call site', () => {
    for (const { path, expressions } of files) {
      const source = readFileSync(new URL(path, import.meta.url), 'utf8');
      for (const expression of expressions) {
        expect(source, `${path}: ${expression}`).toContain(expression);
      }
      expect(source, path).not.toMatch(
        /searchParams\.(?:get|set|has|delete)\([^)]*['"](?:view|shell|full|classic|win95)['"]/,
      );
    }
  });
});
