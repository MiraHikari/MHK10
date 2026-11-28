import { describe, expect, it } from 'vite-plus/test';
import {
  ROOT_SECTION_ID,
  SECTIONS,
  SECTION_MAP,
  SECTION_PATH_MAP,
  ROUTED_SECTIONS,
  isSectionId,
  getSectionIndex,
  getSectionPath,
  normalizeSectionPath,
  getSectionIdFromPath,
} from '@/lib/sections';

describe('SECTION_MAP registry derivation', () => {
  it('maps every section id to its definition', () => {
    for (const section of SECTIONS) {
      expect(SECTION_MAP[section.id]).toBe(section);
    }
  });

  it('contains exactly the same keys as SECTIONS ids', () => {
    const ids = SECTIONS.map((s) => s.id);
    expect(Object.keys(SECTION_MAP).sort()).toEqual([...ids].sort());
  });

  it('roots the site on about now that the Home screen is gone', () => {
    expect(SECTIONS[0].id).toBe('about');
    expect(ROOT_SECTION_ID).toBe('about');
    expect(SECTIONS.map((s) => s.id as string)).not.toContain('home');
  });
});

describe('SECTION_PATH_MAP derivation', () => {
  it('resolves every canonical section path to its id', () => {
    for (const section of SECTIONS) {
      const normalized = normalizeSectionPath(section.path);
      expect(SECTION_PATH_MAP[normalized]).toBe(section.id);
    }
  });

  it('leaves the root path unmapped (index.astro owns /)', () => {
    expect(SECTION_PATH_MAP['/']).toBeUndefined();
  });
});

describe('ROUTED_SECTIONS derivation', () => {
  it('excludes blog', () => {
    const ids = ROUTED_SECTIONS.map((s) => s.id);
    expect(ids).not.toContain('blog');
  });

  it('includes all other sections in order', () => {
    const expected = SECTIONS.filter((s) => s.id !== 'blog').map((s) => s.id);
    expect(ROUTED_SECTIONS.map((s) => s.id)).toEqual(expected);
  });
});

describe('normalizeSectionPath', () => {
  it('strips trailing slashes', () => {
    expect(normalizeSectionPath('/about/')).toBe('/about');
    expect(normalizeSectionPath('/about///')).toBe('/about');
  });

  it('preserves root as /', () => {
    expect(normalizeSectionPath('/')).toBe('/');
    expect(normalizeSectionPath('///')).toBe('/');
  });

  it('normalizes leading slashes to a single one', () => {
    expect(normalizeSectionPath('//about')).toBe('/about');
  });
});

describe('getSectionIdFromPath', () => {
  it('resolves canonical paths', () => {
    expect(getSectionIdFromPath('/about')).toBe('about');
    expect(getSectionIdFromPath('/projects')).toBe('projects');
  });

  it('falls back to the root section for unknown paths and /', () => {
    expect(getSectionIdFromPath('/nonexistent')).toBe(ROOT_SECTION_ID);
    expect(getSectionIdFromPath('/')).toBe(ROOT_SECTION_ID);
  });

  it('handles trailing slashes gracefully', () => {
    expect(getSectionIdFromPath('/skills/')).toBe('skills');
  });
});

describe('isSectionId', () => {
  it('returns true for valid ids', () => {
    for (const section of SECTIONS) {
      expect(isSectionId(section.id)).toBe(true);
    }
  });

  it('returns false for invalid values', () => {
    expect(isSectionId('nonexistent')).toBe(false);
    expect(isSectionId(undefined)).toBe(false);
    expect(isSectionId('')).toBe(false);
  });
});

describe('getSectionIndex / getSectionPath', () => {
  it('returns correct index for each section', () => {
    SECTIONS.forEach((section, i) => {
      expect(getSectionIndex(section.id)).toBe(i);
    });
  });

  it('returns -1 for unknown id', () => {
    expect(getSectionIndex('unknown')).toBe(-1);
  });

  it('returns the path for a valid section', () => {
    expect(getSectionPath('about')).toBe('/about');
  });
});
