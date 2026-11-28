import { deriveAccent } from '@/lib/accent';

/** One soft radial blob in a section's ambient mesh-gradient layer. */
export interface SectionMeshBlob {
  readonly color: string;
  /** Centre position as a percentage of the viewport. */
  readonly x: number;
  readonly y: number;
  /** Blob diameter relative to the viewport's larger edge (1 = full edge). */
  readonly scale: number;
}

export interface Section {
  readonly id: string;
  readonly en: string;
  readonly zh: string;
  readonly path: string;
  readonly watermark: string;
  readonly bg: string;
  readonly isDark: boolean;
  /** Section identity colour driving the rail, chrome and transition wipe. */
  readonly accent: string;
  /** Lifted variant of `accent`, readable as a highlight on dark surfaces. */
  readonly accentSoft: string;
  /** Colour the WebGL veil drifts toward for this section. */
  readonly veilTint: string;
  readonly mesh: readonly SectionMeshBlob[];
}

/**
 * Widens the blob tuple so every section shares one `readonly SectionMeshBlob[]`
 * type — a union of `as const` tuples would break `.map()` at the call sites.
 */
const mesh = (...blobs: SectionMeshBlob[]): readonly SectionMeshBlob[] => blobs;

export const SECTIONS = [
  {
    id: 'about',
    en: 'ABOUT',
    zh: '关于',
    path: '/about',
    watermark: 'ABOUT',
    bg: '#FAFAFA',
    isDark: false,
    accent: '#B4552D',
    accentSoft: '#E08B5A',
    veilTint: '#C9825E',
    mesh: mesh(
      { color: '#E8A87C', x: 16, y: 22, scale: 0.9 },
      { color: '#B4552D', x: 84, y: 74, scale: 0.66 },
      { color: '#F0D3B8', x: 48, y: 100, scale: 1.05 },
    ),
  },
  {
    id: 'projects',
    en: 'WORKS',
    zh: '项目',
    path: '/projects',
    watermark: 'WORKS',
    bg: '#0A0A0A',
    isDark: true,
    accent: '#0E7490',
    accentSoft: '#3FB6CE',
    veilTint: '#0B5A70',
    mesh: mesh(
      { color: '#0E7490', x: 80, y: 26, scale: 0.88 },
      { color: '#3FB6CE', x: 18, y: 72, scale: 0.6 },
      { color: '#062F3C', x: 50, y: 104, scale: 1.15 },
    ),
  },
  {
    id: 'skills',
    en: 'SKILLS',
    zh: '技能',
    path: '/skills',
    watermark: 'SKILLS',
    bg: '#FFFFFF',
    isDark: false,
    accent: '#5B21B6',
    accentSoft: '#A78BFA',
    veilTint: '#7C5BC7',
    mesh: mesh(
      { color: '#C4B5FD', x: 24, y: 18, scale: 0.92 },
      { color: '#5B21B6', x: 78, y: 70, scale: 0.58 },
      { color: '#E4DCFB', x: 52, y: 102, scale: 1.08 },
    ),
  },
  {
    id: 'gallery',
    en: 'GALLERY',
    zh: '影集',
    path: '/gallery',
    watermark: 'GALLERY',
    bg: '#0A0A0A',
    isDark: true,
    accent: '#0F766E',
    accentSoft: '#4FC3B4',
    veilTint: '#0C5F58',
    mesh: mesh(
      { color: '#0F766E', x: 74, y: 20, scale: 0.9 },
      { color: '#4FC3B4', x: 20, y: 76, scale: 0.58 },
      { color: '#052E2B', x: 48, y: 102, scale: 1.14 },
    ),
  },
  {
    id: 'blog',
    en: 'BLOG',
    zh: '博客',
    path: '/blog',
    watermark: 'BLOG',
    bg: '#0A0A0A',
    isDark: true,
    accent: '#4338CA',
    accentSoft: '#8B92F0',
    veilTint: '#3730A3',
    mesh: mesh(
      { color: '#4338CA', x: 20, y: 28, scale: 0.94 },
      { color: '#8B92F0', x: 82, y: 70, scale: 0.6 },
      { color: '#181542', x: 50, y: 104, scale: 1.12 },
    ),
  },
  {
    id: 'friends',
    en: 'LINKS',
    zh: '友链',
    path: '/friends',
    watermark: 'LINKS',
    bg: '#0A0A0A',
    isDark: true,
    accent: '#BE123C',
    accentSoft: '#FB7185',
    veilTint: '#8C1032',
    mesh: mesh(
      { color: '#BE123C', x: 76, y: 24, scale: 0.9 },
      { color: '#FB7185', x: 22, y: 72, scale: 0.58 },
      { color: '#3B0A18', x: 50, y: 103, scale: 1.12 },
    ),
  },
] as const satisfies readonly Section[];

export type SectionId = (typeof SECTIONS)[number]['id'];

/**
 * 首屏章节 id（原第一屏 Home 已删除）。`/` 由 index.astro 服务并以该章节
 * 渲染；路径反查的兜底也落到这里。
 */
export const ROOT_SECTION_ID = SECTIONS[0].id;

export const SECTION_MAP: Record<SectionId, (typeof SECTIONS)[number]> = SECTIONS.reduce(
  (acc, section) => {
    acc[section.id] = section;
    return acc;
  },
  {} as Record<SectionId, (typeof SECTIONS)[number]>,
);

/**
 * Legacy URL → section aliases. Kept so old links (e.g. the retired /honors
 * page) still resolve to the section that absorbed the content instead of 404ing.
 * `SECTION_PATH_MAP` merges these over the canonical paths; `LEGACY_ROUTES`
 * additionally keeps static pages generated for them (see pages/[section].astro).
 */
export const LEGACY_PATH_ALIASES: Record<string, SectionId> = {
  '/honors': 'about',
};

/** Legacy routes that still get static pages, rendered by their mapped section. */
export const LEGACY_ROUTES: readonly { path: string; sectionId: SectionId }[] = Object.entries(
  LEGACY_PATH_ALIASES,
).map(([path, sectionId]) => ({ path, sectionId }));

export const SECTION_PATH_MAP: Record<string, SectionId> = {
  ...SECTIONS.reduce(
    (acc, section) => {
      acc[normalizeSectionPath(section.path)] = section.id;
      return acc;
    },
    {} as Record<string, SectionId>,
  ),
  ...LEGACY_PATH_ALIASES,
};

// ROUTED_SECTIONS excludes 'blog' because it has dedicated routes (list +
// per-article) that carry article data; [section].astro only generates the
// uniform single-section pages. `/` 本身由 index.astro 服务，不在其列。
export const ROUTED_SECTIONS = SECTIONS.filter((section) => section.id !== 'blog');

export function isSectionId(value: string | undefined): value is SectionId {
  return !!value && SECTIONS.some((section) => section.id === value);
}

export function getSectionIndex(sectionId: string | undefined) {
  return SECTIONS.findIndex((section) => section.id === sectionId);
}

export function getSectionPath(sectionId: SectionId) {
  return SECTION_MAP[sectionId]?.path ?? '/';
}

export function normalizeSectionPath(pathname: string) {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return normalized === '/' ? '/' : `/${normalized.replace(/^\/+/, '')}`;
}

export function getSectionIdFromPath(pathname: string): SectionId {
  const normalized = normalizeSectionPath(pathname);
  // `/`（与一切未登记路径）落到根章节：index.astro 以 ROOT_SECTION_ID 渲染。
  return SECTION_PATH_MAP[normalized] ?? ROOT_SECTION_ID;
}

export function sectionAccentTokens(section: (typeof SECTIONS)[number]) {
  return deriveAccent(section.accent, section.accentSoft, section.isDark);
}
