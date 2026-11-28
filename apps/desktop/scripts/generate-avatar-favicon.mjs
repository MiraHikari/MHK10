// Generates the stylized pixel-art avatar favicon set from public/profile/avatar.webp.
//
// Rendering pipeline (per size): lanczos3 downsample (keeps facial structure
// far better than a raw nearest drop) -> saturation/contrast lift -> palette
// quantization with dithering off, which flattens the image into the clean
// cel-shaded blocks characteristic of pixel art. Large sizes are nearest
// upscales of the 32px core so every block stays square and sharp.
//
//   favicon-pixel-16.png   16px core (ICO small frame)
//   favicon-pixel-32.png   32px core (browser icon, the artwork master)
//   favicon-pixel-180.png  nearest upscale of the core (apple-touch)
//   favicon.ico            container holding the 16 + 32 PNG frames
//   favicon.svg            <rect> grid of the 32px core (crispEdges)
//
// The 16/32/180/ico set is mirrored into apps/general/public/ so the classic
// and Win95 display modes swap favicons without a build step. Run manually via
// `npm run favicons:generate`; outputs are committed.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(here, '../public/profile/avatar.webp');
const output = resolve(here, '../public');

/** Stylized pixel core at the given size; returns an encoded PNG buffer. */
function renderCore(size, colors) {
  return sharp(SOURCE)
    .resize(size, size, { kernel: 'lanczos3', fit: 'cover' })
    .modulate({ saturation: 1.25 })
    .linear(1.12, -14)
    .png({ palette: true, colors, dither: 0 })
    .toBuffer();
}

const png32 = await renderCore(32, 48);
// The 16px frame is a nearest drop of the 32px core so both share one palette
// family instead of quantizing independently.
const png16 = await sharp(png32)
  .resize(16, 16, { kernel: 'nearest' })
  .png({ palette: true, colors: 32, dither: 0 })
  .toBuffer();
const png180 = await sharp(png32).resize(180, 180, { kernel: 'nearest' }).png().toBuffer();

await writeFile(join(output, 'favicon-pixel-16.png'), png16);
await writeFile(join(output, 'favicon-pixel-32.png'), png32);
await writeFile(join(output, 'favicon-pixel-180.png'), png180);

// ICO container (Vista+ supports PNG frames) with the 16 and 32 sizes.
function icoContainer(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(frames.length, 4);
  const entries = [];
  let offset = 6 + 16 * frames.length;
  for (const { size, data } of frames) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0); // width
    entry.writeUInt8(size === 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette size
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...frames.map((frame) => frame.data)]);
}

await writeFile(
  join(output, 'favicon.ico'),
  icoContainer([
    { size: 16, data: png16 },
    { size: 32, data: png32 },
  ]),
);

// SVG twin: one <rect> per core pixel so it stays crisp at any scale.
const { data, info } = await sharp(png32).raw().toBuffer({ resolveWithObject: true });
const alpha = info.channels === 4;
let rects = '';
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * info.channels;
    const a = alpha ? data[i + 3] : 255;
    if (a < 8) continue;
    const fill = `rgb(${data[i]},${data[i + 1]},${data[i + 2]})`;
    rects +=
      a < 250
        ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}" opacity="${(a / 255).toFixed(2)}"/>`
        : `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`;
  }
}
await writeFile(
  join(output, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${info.width} ${info.height}" shape-rendering="crispEdges"><title>MHK10</title>${rects}</svg>\n`,
);

// Mirror the pixel set into the classic site inside this workspace (its own
// classic favicon.webp is untouched).
const sibling = resolve(here, '../../general/public');
await mkdir(sibling, { recursive: true });
await writeFile(join(sibling, 'favicon-pixel-16.png'), png16);
await writeFile(join(sibling, 'favicon-pixel-32.png'), png32);
await writeFile(join(sibling, 'favicon-pixel-180.png'), png180);
await writeFile(join(sibling, 'favicon.ico'), await readFile(join(output, 'favicon.ico')));
console.log(`Mirrored pixel favicons into ${sibling}.`);

console.log('Generated stylized pixel avatar favicons (16/32/180 png, ico, svg).');
