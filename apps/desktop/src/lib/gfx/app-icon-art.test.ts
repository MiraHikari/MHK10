import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vite-plus/test';
import {
  APP_ICON_ART,
  APP_ICON_DESKTOP_ART,
  APP_ICON_IDS,
  type AppIconId,
  appIconName,
  appIconStem,
  appIconUrl,
  iconUrl,
} from './app-icon-art';
import { APP_CATALOG } from '../../data/app-catalog';
import { PAL } from './palette';
import { APP_ICON_SOURCES, REACT95_ICONS } from './react95-icon-data';
import { ICON_SOURCES, readIconArtwork } from '../../../scripts/react95-icons.mjs';

describe('React95 shared icon assets', () => {
  it('derives every application icon from an existing pinned library asset without hand-drawn overrides', () => {
    for (const id of APP_ICON_IDS) {
      const key = APP_ICON_SOURCES[id];
      expect(Object.hasOwn(ICON_SOURCES, key), `${id} must name a library source`).toBe(true);
      const source = ICON_SOURCES[key as keyof typeof ICON_SOURCES];
      expect(APP_ICON_ART[id]).toBe(readIconArtwork(source, 16));
      expect(APP_ICON_DESKTOP_ART[id]).toBe(readIconArtwork(source, 32));
    }
  });
  it('covers the catalog, including dialogs and both About identities', () => {
    for (const app of APP_CATALOG) {
      expect(APP_ICON_IDS).toContain(app.id);
      expect(APP_ICON_SOURCES[app.id as AppIconId]).toBe(app.icon);
    }
  });
  it('distinguishes each application in folders and title bars', () => {
    const applications = APP_CATALOG.filter((app) => app.kind !== 'dialog');
    for (const artwork of [APP_ICON_ART, APP_ICON_DESKTOP_ART]) {
      const art = applications.map((app) => artwork[app.id as AppIconId]);
      expect(new Set(art).size).toBe(applications.length);
    }
  });
  it('distinguishes gallery zoom directions while sharing the magnifier frame', () => {
    for (const size of ['small', 'large'] as const) {
      expect(REACT95_ICONS['zoom-in'][size]).not.toBe(REACT95_ICONS['zoom-out'][size]);
    }
  });
  it('preserves the upstream provenance and checksums', () => {
    const directory = new URL('../../../public/icons/react95/', import.meta.url);
    const manifest = JSON.parse(readFileSync(new URL('source.json', directory), 'utf8')) as {
      revision: string;
      files: Record<string, string>;
    };
    expect(manifest.revision).toBe('1b94d9f59b5bb556b42bd9c3019051ef93bbaf24');
    for (const [file, hash] of Object.entries(manifest.files))
      expect(
        createHash('sha256')
          .update(readFileSync(new URL(file, directory)))
          .digest('hex'),
      ).toBe(hash);
    expect(readFileSync(new URL('LICENSE', directory), 'utf8')).toContain('Microsoft');
  });
  it.each(APP_ICON_IDS)('%s uses the same native-sized VGA pixels on Canvas and HTML', (id) => {
    for (const [size, artwork] of [
      [16, APP_ICON_ART[id]],
      [32, APP_ICON_DESKTOP_ART[id]],
    ] as const) {
      const rows = artwork.split('\n');
      expect(rows).toHaveLength(size);
      expect(rows.every((row) => row.length === size)).toBe(true);
      expect(
        [...artwork].every(
          (pixel) => pixel === '\n' || pixel === '.' || (!!PAL[pixel] && pixel !== 'l'),
        ),
      ).toBe(true);
      const svg = readFileSync(
        new URL(`../../../public${appIconUrl(id, size)}`, import.meta.url),
        'utf8',
      );
      expect(svg).toContain(`viewBox="0 0 ${size} ${size}"`);
      const pixels = Array.from({ length: size }, () =>
        Array<string | undefined>(size).fill(undefined),
      );
      for (const match of svg.matchAll(/<path fill="([^"]+)" d="M(\d+) (\d+)h1v1h-1z"\/>/g))
        pixels[Number(match[3])][Number(match[2])] = match[1];
      expect(pixels).toEqual(rows.map((row) => [...row].map((letter) => PAL[letter])));
    }
  });
  it('keeps internal names and both web sizes consistent', () => {
    expect(appIconStem('$saveas')).toBe('saveas');
    expect(appIconName('$saveas')).toBe('app_saveas');
    expect(appIconUrl('$saveas')).toBe('/icons/app-saveas.svg');
    expect(iconUrl('app-system-about', 32)).toBe('/icons/app-system-about-32.svg');
    expect(iconUrl('missing')).toBe('/icons/exe.svg');
  });
});
