import { writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { BITMAP_FONTS } from '../src/lib/gfx/bitmap-font.ts';

// A reproducible pixel wordmark; uses the attributed bitmap font already shipped by the site.
const png = new PNG({ width: 1200, height: 630 });
const colors = {
  teal: [0, 128, 128],
  navy: [0, 0, 128],
  silver: [192, 192, 192],
  white: [255, 255, 255],
  black: [0, 0, 0],
  gray: [128, 128, 128],
};
function rect(x, y, width, height, color) {
  for (let row = Math.max(0, y * 2); row < Math.min(630, (y + height) * 2); row++) {
    for (let col = Math.max(0, x * 2); col < Math.min(1200, (x + width) * 2); col++) {
      const index = (row * 1200 + col) * 4;
      png.data[index] = color[0];
      png.data[index + 1] = color[1];
      png.data[index + 2] = color[2];
      png.data[index + 3] = 255;
    }
  }
}
function text(value, x, baseline, scale, color, font = 'bold') {
  for (const character of value) {
    const glyph = BITMAP_FONTS[font][character.codePointAt(0)];
    if (!glyph) continue;
    glyph.rows.forEach((bits, row) => {
      for (let col = 0; col < 16; col++)
        if ((bits >>> col) & 1)
          rect(
            x + (glyph.x + col) * scale,
            baseline + (glyph.y + row) * scale,
            scale,
            scale,
            color,
          );
    });
    x += glyph.advance * scale;
  }
}
rect(0, 0, 600, 315, colors.teal);
rect(54, 42, 500, 238, colors.black);
rect(48, 36, 500, 238, colors.white);
rect(50, 38, 496, 234, colors.silver);
rect(53, 41, 490, 22, colors.navy);
text('MHK10 - PERSONAL DESKTOP', 61, 56, 1, colors.white);
rect(523, 45, 15, 14, colors.silver);
text('x', 527, 56, 1, colors.black);
text('MHK10', 90, 190, 10, colors.navy);
text('MiraHikari', 90, 230, 3, colors.black);
rect(56, 249, 484, 17, colors.gray);
rect(57, 250, 482, 15, colors.silver);
text('PICTURES  /  DOCUMENTS  /  PROJECTS', 66, 261, 1, colors.black, 'ui');
await writeFile(new URL('../public/social-card.png', import.meta.url), PNG.sync.write(png));
// favicon.svg is owned by scripts/generate-avatar-favicon.mjs (pixel avatar) —
// do not write it here or regeneration would clobber the avatar artwork.
console.log('Generated MHK10 social card.');
