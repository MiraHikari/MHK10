import { readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';
import shared from '@mhk/site-core/content-model/profile-data';
import {
  IMAGE_SUFFIXES,
  collectAuthoredOriginals,
  compareStrings,
  mediaBytesProblem,
  mediaInfoProblems,
  publishedPath,
  splitAuthoredOriginals,
} from '../../scripts/media-policy.mjs';
import articlePhotos from './article-photos.json';
import localFiles from './media-files.json';
import originalFiles from './media-originals.json';

const publicRoot = fileURLToPath(new URL('../../public', import.meta.url));
const imagesRoot = join(publicRoot, 'images');
const legacyGalleryRoot = join(publicRoot, 'gallery');

function filesUnder(directory: string): string[] {
  try {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? filesUnder(path) : [path];
    });
  } catch {
    return [];
  }
}

const authoredOriginals = collectAuthoredOriginals(shared, articlePhotos);
const { bundledOriginals, r2Only } = splitAuthoredOriginals(authoredOriginals);
const r2Keys = new Set(r2Only);
const expectedLocal = [
  ...filesUnder(imagesRoot).map((file) => publishedPath(publicRoot, file)),
  ...filesUnder(legacyGalleryRoot).map((file) => publishedPath(publicRoot, file)),
]
  .filter((path) => IMAGE_SUFFIXES.has(extname(path).toLowerCase()) && !r2Keys.has(path))
  .sort(compareStrings);

describe('publication media metadata', () => {
  it('records every authored original in exactly one metadata file', () => {
    expect(Object.keys(originalFiles).sort(compareStrings)).toEqual(r2Only);
    expect(new Set([...Object.keys(localFiles), ...Object.keys(originalFiles)]).size).toBe(
      Object.keys(localFiles).length + Object.keys(originalFiles).length,
    );
    for (const key of bundledOriginals) expect(localFiles).toHaveProperty(key);
    for (const key of r2Only) expect(localFiles).not.toHaveProperty(key);
    for (const key of [...r2Only, ...bundledOriginals]) {
      const present = [Object.hasOwn(localFiles, key), Object.hasOwn(originalFiles, key)].filter(
        Boolean,
      ).length;
      expect(present).toBe(1);
    }
  });

  it('reports malformed metadata without dereferencing it', () => {
    for (const malformed of [null, 'missing', []]) {
      expect(mediaInfoProblems('fixture', '/images/x.webp', malformed)).toEqual([
        'fixture: /images/x.webp is not an object',
      ]);
      expect(mediaBytesProblem('fixture', '/images/x.webp', malformed, 12)).toBeUndefined();
    }
    expect(mediaInfoProblems('fixture', '/images/x.webp', { width: 0, height: 1 })).toEqual([
      'fixture: /images/x.webp has no valid dimensions',
      'fixture: /images/x.webp has no format',
    ]);
  });

  it('keeps local metadata fresh for exactly the bundled image files', () => {
    expect(Object.keys(localFiles).sort(compareStrings)).toEqual(expectedLocal);
    for (const info of [...Object.values(localFiles), ...Object.values(originalFiles)]) {
      expect(info.width).toBeGreaterThan(0);
      expect(info.height).toBeGreaterThan(0);
      expect(info.bytes).toBeGreaterThan(0);
      expect(info.format).toBeTruthy();
    }
  });
});
