// 扫描 gallery/honors/blog/projects 的图片原图，生成展示用 WebP。
// 产物命名：
//   - gallery/honors/blog: <原名>-display.webp（长边 1920），blog 支持按文章分子目录递归
//   - projects: 主图本身已是展示图，不生成额外派生图
// 幂等：目标比源新则跳过。
import { readdir, stat } from 'node:fs/promises';
import { join, extname, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import {
  DISPLAY_LONG_EDGE,
  WEBP_QUALITY,
} from '../../../packages/site-core/src/media/derivatives.ts';
const ROOT = fileURLToPath(new URL('../public/images', import.meta.url));

const folders = ['gallery', 'honors', 'blog', 'projects'];
const INPUT_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

async function* listImages(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      yield* listImages(join(dir, entry.name));
      continue;
    }
    const ext = extname(entry.name).toLowerCase();
    if (!INPUT_EXTS.has(ext)) continue;
    // 排除已生成的 display 产物
    if (/\b-display$/i.test(entry.name.replace(/\.[^.]+$/, ''))) continue;
    yield join(dir, entry.name);
  }
}

async function shouldSkip(src, dest) {
  try {
    const srcStat = await stat(src);
    const destStat = await stat(dest);
    return destStat.mtime >= srcStat.mtime;
  } catch {
    return false;
  }
}

function formatBytes(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(2)}MB`;
}

function makePipeline(src, longEdge) {
  return sharp(src)
    .resize({
      width: longEdge,
      height: longEdge,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY, effort: 4 });
}

async function optimize() {
  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const folder of folders) {
    const dir = join(ROOT, folder);

    for await (const src of listImages(dir)) {
      const name = basename(src);
      const stem = name.replace(/\.[^.]+$/, '');
      const isProjects = folder === 'projects';

      try {
        const srcStat = await stat(src);

        if (isProjects) {
          console.log(`SKIP  ${folder}/${name}（主图已作为展示图）`);
          skipped++;
        } else {
          // display 产物与源文件同目录（blog 按文章分子目录时保持就地生成）
          const displayDest = join(dirname(src), `${stem}-display.webp`);
          const displaySkip = await shouldSkip(src, displayDest);

          if (displaySkip) {
            console.log(`SKIP  ${folder}/${name} → ${stem}-display.webp`);
            skipped++;
            continue;
          }

          await makePipeline(src, DISPLAY_LONG_EDGE).toFile(displayDest);

          const displayStat = await stat(displayDest);
          const displayRatio = ((displayStat.size / srcStat.size) * 100).toFixed(1);
          console.log(
            `WRITE ${folder}/${name}: ${formatBytes(srcStat.size)} → ${folder}/${stem}-display.webp: ${formatBytes(displayStat.size)} (${displayRatio}%)`,
          );
          processed++;
        }
      } catch (err) {
        console.error(
          `ERROR ${folder}/${name}: ${err instanceof Error ? err.message : String(err)}`,
        );
        errors++;
      }
    }
  }

  console.log(`\n完成：处理 ${processed} 张，跳过 ${skipped} 张，错误 ${errors} 张。`);
  if (errors > 0) {
    process.exitCode = 1;
  }
}

optimize().catch((err) => {
  console.error(err);
  process.exit(1);
});
