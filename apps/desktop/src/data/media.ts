import { gallery } from './gallery';
import { portfolio, profile, projects, portfolioAsset, portfolioPreview } from './profile';
import articlePhotos from './article-photos.json';
import localFileSource from './media-files.json';
import remoteFileSource from './media-originals.json';
import { localImageSrc } from './images';

export interface MediaFileInfo {
  width: number;
  height: number;
  bytes: number;
  format: string;
}
export interface MediaRecord {
  id: string;
  title: string;
  alt: string;
  preview: string;
  display: string;
  original: string;
  date: string;
  folders: string[];
  image: MediaFileInfo;
  file?: MediaFileInfo;
  local?: boolean;
}
// Bundled files win; R2-only camera originals retain the metadata captured when
// they were imported so ACDSee properties and size sorting stay accurate offline.
const fileInfo: Record<string, MediaFileInfo> = { ...remoteFileSource, ...localFileSource };
/** Metadata is keyed by the bundled asset, never by a deployment-specific URL. */
export const mediaFileInfo = (asset: string): MediaFileInfo | undefined =>
  fileInfo[localImageSrc(asset)];
const records = new Map<string, MediaRecord>();
const publicationOriginal = (item: { imageSrc: string; downloadSrc?: string }): string =>
  portfolioAsset(item.downloadSrc ?? item.imageSrc);
function add(
  record: Omit<MediaRecord, 'id' | 'image' | 'file' | 'display'> & { display?: string },
  width = 720,
  height = 480,
): void {
  const existing = records.get(record.preview);
  if (existing) {
    existing.folders = [...new Set([...existing.folders, ...record.folders])];
    if (record.original !== record.preview && !record.original.endsWith('-display.webp')) {
      existing.original = record.original;
      existing.file = mediaFileInfo(record.original);
    }
    return;
  }
  records.set(record.preview, {
    ...record,
    display: record.display ?? record.original,
    id: record.preview
      .replace(/^\/images\/previews\//, '')
      .replace(/\.[^.]+$/, '')
      .replaceAll('/', '--'),
    image: mediaFileInfo(record.preview) ?? { width, height, bytes: 0, format: 'SVG' },
    file: mediaFileInfo(record.original),
  });
}
for (const item of gallery)
  add(
    {
      title: item.title,
      alt: item.alt,
      preview: item.preview,
      display: item.display,
      original: item.original,
      date: item.year,
      folders: [`Pictures/${item.category}`],
    },
    item.width,
    item.height,
  );
for (const item of projects)
  add({
    title: item.title,
    alt: `${item.title} 项目画面`,
    preview: portfolioPreview(item.image),
    original: portfolioAsset(item.image),
    date: item.date,
    folders: ['Projects'],
  });
for (const item of portfolio.honors)
  if (item.imageSrc)
    add({
      title: item.title,
      alt: item.imageAlt,
      preview: portfolioPreview(item.imageSrc),
      display: portfolioAsset(item.imageSrc),
      original: publicationOriginal(item),
      date: item.date,
      folders: ['Honors'],
    });
add({
  title: profile.name,
  alt: portfolio.profile.avatarAlt,
  preview: portfolioPreview(portfolio.profile.avatar),
  original: portfolioAsset(portfolio.profile.avatar),
  date: '',
  folders: ['Profile'],
});
for (const item of articlePhotos)
  add({
    title: item.caption,
    alt: item.alt,
    preview: portfolioPreview(item.src),
    original: portfolioAsset(item.full),
    display: portfolioAsset(item.src),
    date: item.date ?? '',
    folders: ['Articles/AdventureX 2026'],
  });

export const mediaCatalog: readonly MediaRecord[] = [...records.values()];
export function mediaHref(asset: string): string {
  const record = mediaForAsset(asset);
  return record ? `/acdsee/?media=${encodeURIComponent(record.id)}` : '/acdsee/';
}

export function mediaForAsset(asset: string): MediaRecord | undefined {
  const local = localImageSrc(asset);
  return mediaCatalog.find((item) =>
    [item.preview, item.original, item.display].some((path) => localImageSrc(path) === local),
  );
}
