import { expect, it } from 'vite-plus/test';
import { imageProcessingSource } from './image-source-model';

it('uses the bundled display copy for publication pixel operations and preserves local blobs', () => {
  expect(
    imageProcessingSource({
      original: 'https://cdn.example/images/photo.jpg',
      display: '/images/photo-display.webp',
      preview: '/images/previews/photo.png',
    }),
  ).toBe('/images/photo-display.webp');
  expect(
    imageProcessingSource({
      original: 'https://cdn.example/photo.jpg',
      display: 'https://foreign.example/photo.webp',
      preview: '/images/previews/photo.png',
    }),
  ).toBe('/images/previews/photo.png');
  expect(
    imageProcessingSource({
      original: 'blob:local-image',
      display: 'blob:local-image',
      preview: 'blob:local-image',
      local: true,
    }),
  ).toBe('blob:local-image');
  expect(
    imageProcessingSource(
      {
        original: 'https://cdn.example/images/photo.jpg',
        display: 'https://cdn.example/images/photo-display.webp',
        preview: '/images/previews/photo.png',
      },
      'https://cdn.example',
    ),
  ).toBe('/images/photo-display.webp');
});
