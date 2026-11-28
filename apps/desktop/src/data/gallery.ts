import { portfolio, portfolioAsset, portfolioPreview } from './profile';

const categoryNames: Record<string, string> = {
  SCENERY: '风景',
  CITY: '城市',
  ADVENTUREX: 'AdventureX',
  CAMPUS: '校园',
  CULTURE: '文化',
  LIFE: '生活',
};
const photographs = portfolio.gallery.map((photo) => ({
  id: photo.imageSrc.split('/').at(-1)!.replace('-display.webp', ''),
  title: photo.title,
  english: photo.category,
  category: categoryNames[photo.category] ?? photo.category,
  description: `${photo.location} · ${photo.dateLabel}`,
  alt: photo.imageAlt,
  src: portfolioAsset(photo.imageSrc),
  preview: portfolioPreview(photo.imageSrc),
  display: portfolioAsset(photo.imageSrc),
  original: portfolioAsset(photo.downloadSrc ?? photo.imageSrc),
  year: photo.year,
  width: photo.width,
  height: photo.height,
}));
export const gallery = photographs.map((item, index) => ({
  ...item,
  number: String(index + 1).padStart(2, '0'),
}));
