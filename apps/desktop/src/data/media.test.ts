import { existsSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { portfolio } from './profile';
import { mediaCatalog, mediaFileInfo, mediaForAsset } from './media';
import { localImageSrc, portfolioAsset, portfolioPreview } from './images';
import originalAssets from '../../docs/personal-assets.generated.json';

const originalPath = (item: { imageSrc: string; downloadSrc?: string }): string =>
  item.downloadSrc ?? item.imageSrc;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('publication originals and media identity', () => {
  it('opens display pictures and records every bundled or R2 camera original', () => {
    for (const item of [...portfolio.gallery, ...portfolio.honors]) {
      if (!('imageSrc' in item) || !item.imageSrc) continue;
      const record = mediaForAsset(portfolioPreview(item.imageSrc));
      expect(record).toBeDefined();
      expect(record?.display).toBe(portfolioAsset(item.imageSrc));
      const source = originalPath(item);
      expect(record?.original).toBe(portfolioAsset(source));
      const original = new URL(`../../public${localImageSrc(record!.original)}`, import.meta.url);
      // Camera originals resolve to R2; retained metadata still drives ACDSee
      // properties. Bundled WebP originals additionally match their local bytes.
      expect(record?.file?.width).toBeGreaterThan(0);
      expect(record?.file?.bytes).toBeGreaterThan(0);
      if (existsSync(original)) expect(record?.file?.bytes).toBe(statSync(original).size);
      expect(mediaForAsset(source)?.id).toBe(record?.id);
    }
  });

  it('retains byte-identical authored gallery and honor assets', () => {
    for (const asset of originalAssets) {
      const bytes = readFileSync(new URL(`../../public${asset.path}`, import.meta.url));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
    }
  });

  it('retains media IDs, metadata and native library files with a configured shared CDN', async () => {
    vi.stubEnv('PUBLIC_IMAGE_BASE_URL', 'https://static.example.com');
    vi.resetModules();
    const remote = await import('./media');
    const files = await import('./public-files');
    expect(remote.mediaCatalog.map(({ id }) => id)).toEqual(mediaCatalog.map(({ id }) => id));
    expect(files.publicLibrary.files.filter(({ kind }) => kind === 'image')).toHaveLength(
      mediaCatalog.length,
    );
    for (const record of remote.mediaCatalog) {
      expect(remote.mediaFileInfo(record.original)).toEqual(
        mediaFileInfo(localImageSrc(record.original, 'https://static.example.com')),
      );
      if (record.original.startsWith('https://'))
        expect(record.original).toMatch(/^https:\/\/static\.example\.com\/images\//);
      const file = files.publicLibrary.files.find(({ id }) => id === `library:image:${record.id}`)!;
      const path = files.publicAssetPath(file.assetId!)!;
      expect(path).toMatch(/^\/(?!\/)/);
      const info = remote.mediaFileInfo(path)!;
      expect(file.size).toBe(info.bytes);
      expect(file.mime).toBe(
        info.format === 'SVG'
          ? 'image/svg+xml'
          : info.format === 'JPEG'
            ? 'image/jpeg'
            : `image/${info.format.toLowerCase()}`,
      );
    }
  });
});
