/**
 * 图片 URL 解析：全站图片统一托管在对象存储（Cloudflare R2）后方的 CDN 域名上，
 * EdgeOne 回源 R2 公开地址并缓存。
 * 数据文件（profile.json、content frontmatter）只保存以 `/images/` 开头的站内路径；
 * 渲染时经 resolveImageSrc 拼上 CDN 基座。未配置基座时原样返回，
 * 回退到同源 public/images 下的本地副本（迁移前的开发/回滚路径）。
 */

import {
  CANONICAL_IMAGE_PREFIX,
  createImageResolver,
  normalizeImageBase,
} from '@mhk/site-core/media/image-path';

/** 图片 CDN 基座地址（已去尾斜杠），未配置时为空串 */
export const IMAGE_BASE_URL = normalizeImageBase(import.meta.env.PUBLIC_IMAGE_BASE_URL);

const resolver = createImageResolver({
  localPrefix: CANONICAL_IMAGE_PREFIX,
  base: IMAGE_BASE_URL,
});

/**
 * 把 `/images/...` 站内路径解析为完整图片 URL。
 * 非 `/images/` 路径（绝对 URL、blob:、`/og-image.webp` 等）一律原样透传。
 */
export function resolveImageSrc(src: string | null | undefined): string {
  return resolver.public(src);
}
