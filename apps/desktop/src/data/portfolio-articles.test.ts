import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';
import manifest from '../../docs/portfolio-articles.json';
import { mediaCatalog } from './media';
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const body = (value: string) => value.split('---').slice(2).join('---').trim();
function canonical(value: string): string {
  return value
    .replace(/^import .+;\s*$/gm, '')
    .replace(/<PhotoFigure\s+[\s\S]*?\/>/g, '')
    .replace(/<figure\b[\s\S]*?<\/figure>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/^>\s*\*\*(ALBUM|CREDIT|NOTE|RULE)\*\*\s*$/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}
const escape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
describe('imported portfolio articles', () => {
  it('retains the travelogue narrative while recording the authorized viewer-note revision', () => {
    for (const article of manifest.articles) {
      if (article.policy === 'retired-by-owner-2026-10-10') continue;
      const text = readFileSync(
        new URL(`../content/posts/${article.slug}.md`, import.meta.url),
        'utf8',
      );
      if ('canonicalTextSha256' in article)
        expect(
          hash(
            canonical(
              body(text).replace(
                '这是一篇包含 44 张照片的游记。点击照片可在 MHK10 的 ACDSee 中查看、缩放和切换图片，也可以通过原图入口打开源文件。图注与拍摄时间记录的是 2026 年 7 月的杭州行。',
                '这是一篇照片游记。点击任意照片可进入全屏相册：左右滑动翻页、双指缩放细看，`FULL RES` 可下载相机原图。',
              ),
            ),
          ),
        ).toBe(article.canonicalTextSha256);
    }
  });
  it('retains all 44 photo captions, alternatives, dimensions and dates with viewer links', () => {
    const article = manifest.articles.find((item) => item.slug === 'advx-2026-hangzhou')!;
    const text = readFileSync(
      new URL('../content/posts/advx-2026-hangzhou.md', import.meta.url),
      'utf8',
    );
    expect(article.photos).toHaveLength(44);
    expect(text.match(/class="photo-figure"/g)).toHaveLength(44);
    expect(text.match(/data-app-link="acdsee"/g)).toHaveLength(44);
    for (const photo of article.photos) {
      expect(text).toContain(`alt="${escape(photo.alt)}"`);
      expect(text).toContain(escape(photo.caption));
      expect(text).toContain(`width="${photo.width}" height="${photo.height}"`);
      if ('date' in photo) expect(text).toContain(`<time>${photo.date}</time>`);
      expect(text).toContain(photo.src);
    }
  });
  it('keeps every bundled source image byte-identical and records R2-only originals', () => {
    for (const asset of manifest.assets)
      expect(hash(readFileSync(new URL(`../../public${asset.target}`, import.meta.url)))).toBe(
        asset.sha256,
      );
    // Camera originals live on R2 under the canonical /images/ key. The audit
    // manifest retains their import hashes, but the checkout must not bundle them.
    for (const asset of manifest.remoteAssets) {
      expect(asset.source).toMatch(/^\/images\//);
      expect(asset.target).toMatch(/^\/images\//);
      expect(existsSync(new URL(`../../public${asset.target}`, import.meta.url))).toBe(false);
    }
    expect(new Set(mediaCatalog.map((item) => item.preview)).size).toBe(mediaCatalog.length);
    expect(new Set(mediaCatalog.map((item) => item.id)).size).toBe(mediaCatalog.length);
    expect(mediaCatalog).toHaveLength(81);
  });
});
