import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';
import {
  CANONICAL_IMAGE_PREFIX,
  DESKTOP_IMAGE_PREFIX,
  DESKTOP_PREVIEW_PREFIX,
  createImageResolver,
} from '@mhk/site-core/media/image-path';
import {
  DISPLAY_SUFFIX,
  IMAGE_SUFFIXES,
  PREVIEW_CAPS,
  PREVIEW_SECTIONS,
  isDisplayCopy,
} from '../../scripts/media-policy.mjs';
import { VGA_COLORS } from '../lib/gfx/palette';

function quotedValues(source: string, pattern: RegExp): string[] {
  return [...(pattern.exec(source)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

describe('Python preview conventions', () => {
  const source = readFileSync(
    new URL('../../scripts/generate-portfolio-previews.py', import.meta.url),
    'utf8',
  );

  it('matches publication paths and the immutable VGA palette used by the desktop', () => {
    expect(source).toContain(`IMAGES_PREFIX = '${CANONICAL_IMAGE_PREFIX}'`);
    expect(source).toContain("'public' / 'images'");
    expect(DESKTOP_IMAGE_PREFIX).toBe('/images/');
    expect(DESKTOP_PREVIEW_PREFIX).toBe('/images/previews/');
    const palette = /colours = \[([\s\S]*?)\]/.exec(source)?.[1] ?? '';
    const colors = [...palette.matchAll(/\((\d+), (\d+), (\d+)\)/g)].map(
      (match) =>
        `#${match
          .slice(1)
          .map((value) => Number(value).toString(16).padStart(2, '0'))
          .join('')}`,
    );
    expect(colors).toEqual(VGA_COLORS);
  });

  it('shares image suffixes, preview sections and preview caps with media-policy', () => {
    expect(quotedValues(source, /IMAGE_SUFFIXES = \{([^}]*)\}/).sort()).toEqual(
      [...IMAGE_SUFFIXES].sort(),
    );
    expect(quotedValues(source, /PREVIEW_SECTIONS = \(([^)]*)\)/)).toEqual([...PREVIEW_SECTIONS]);
    const caps = Object.fromEntries(
      [
        ...(/PREVIEW_CAPS = \{([^}]*)\}/.exec(source)?.[1] ?? '').matchAll(
          /'(\w+)': \((\d+), (\d+)\)/g,
        ),
      ].map((match) => [match[1], { width: Number(match[2]), height: Number(match[3]) }]),
    );
    expect(caps).toEqual({
      profile: { width: PREVIEW_CAPS.profile.width, height: PREVIEW_CAPS.profile.height },
      default: { width: PREVIEW_CAPS.default.width, height: PREVIEW_CAPS.default.height },
    });
  });

  it('actually applies the shared sections, caps and display-copy rule', () => {
    expect(DISPLAY_SUFFIX).toBe('-display.webp');
    expect(isDisplayCopy('/images/gallery/photo-display.webp')).toBe(true);
    expect(isDisplayCopy('/images/gallery/photo.webp')).toBe(false);
    expect(source).toContain('for section in PREVIEW_SECTIONS:');
    expect(source).toContain("PREVIEW_CAPS.get(section, PREVIEW_CAPS['default'])");
    expect(source).toContain(`source.stem + '${DISPLAY_SUFFIX}'`);
    expect(source).toMatch(
      /if source\.with_name\(source\.stem \+ '-display\.webp'\)\.exists\(\):\s*\n\s*continue/,
    );
  });

  it('pins canonical-to-local and preview naming to the shared resolver', () => {
    const resolver = createImageResolver({
      localPrefix: DESKTOP_IMAGE_PREFIX,
      previewPrefix: DESKTOP_PREVIEW_PREFIX,
    });
    const cases = [
      [
        '/images/gallery/photo.webp',
        '/images/gallery/photo.webp',
        '/images/previews/gallery/photo.png',
      ],
      [
        '/images/blog/advx-2026/A.JPG',
        '/images/blog/advx-2026/A.JPG',
        '/images/previews/blog/advx-2026/A.png',
      ],
      [
        '/images/gallery/photo-display.webp',
        '/images/gallery/photo-display.webp',
        '/images/previews/gallery/photo-display.png',
      ],
      [
        '/images/profile/avatar.svg',
        '/images/profile/avatar.svg',
        '/images/previews/profile/avatar.png',
      ],
    ] as const;
    for (const [canonical, local, preview] of cases) {
      expect(resolver.local(canonical)).toBe(local);
      expect(resolver.preview(canonical)).toBe(preview);
    }
    // The Python generator derives the same names and always writes PNG previews.
    expect(source).toContain("return '/images/' + canonical[len(IMAGES_PREFIX):]");
    expect(source).toContain('relative = canonical[len(IMAGES_PREFIX):]');
    expect(source).toContain(".with_suffix('.png')");
  });
});
