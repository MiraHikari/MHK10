import { describe, expect, it } from 'vite-plus/test';
import {
  LEGACY_PATH_ALIASES,
  LEGACY_ROUTES,
  ROOT_SECTION_ID,
  SECTIONS,
  getSectionIdFromPath,
  isSectionId,
  normalizeSectionPath,
} from '@/lib/sections';

describe('LEGACY_PATH_ALIASES', () => {
  it('maps /honors to about', () => {
    expect(LEGACY_PATH_ALIASES['/honors']).toBe('about');
  });

  it('every alias target is a valid section id', () => {
    for (const target of Object.values(LEGACY_PATH_ALIASES)) {
      expect(isSectionId(target)).toBe(true);
    }
  });

  it('alias keys do not cover any canonical path', () => {
    const canonicalPaths = SECTIONS.map((section) => normalizeSectionPath(section.path));
    for (const aliasPath of Object.keys(LEGACY_PATH_ALIASES)) {
      expect(canonicalPaths).not.toContain(aliasPath);
    }
  });
});

describe('LEGACY_ROUTES derivation', () => {
  it('produces one route entry per alias', () => {
    expect(LEGACY_ROUTES).toHaveLength(Object.keys(LEGACY_PATH_ALIASES).length);
  });

  it('each route has the correct path and sectionId', () => {
    for (const route of LEGACY_ROUTES) {
      expect(LEGACY_PATH_ALIASES[route.path]).toBe(route.sectionId);
    }
  });
});

describe('getSectionIdFromPath with legacy aliases', () => {
  it('resolves /honors to about via alias', () => {
    expect(getSectionIdFromPath('/honors')).toBe('about');
  });

  it('resolves /honors/ (trailing slash) to about', () => {
    expect(getSectionIdFromPath('/honors/')).toBe('about');
  });

  it('unknown legacy-looking paths fall back to the root section', () => {
    expect(getSectionIdFromPath('/old-page')).toBe(ROOT_SECTION_ID);
  });
});
