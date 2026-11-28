/**
 * 博客版权与许可声明的单一来源。
 * 文章页脚（ArticleCopyright）、JSON-LD、RSS/Atom 订阅源与
 * Markdown 导出共用这里的常量与构造函数。
 */
import { profile } from '@/data/profile';

export { SITE_ORIGIN } from '@/data/site-origin';

export const BLOG_LICENSE = {
  id: 'CC BY-NC-SA 4.0',
  name: '知识共享 署名-非商业性使用-相同方式共享 4.0 国际许可协议',
  url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans',
} as const;

/** 许可协议的三项条款拆解，供版权块以分类标签展示。 */
export const BLOG_LICENSE_TERMS = [
  { code: 'BY', label: '署名' },
  { code: 'NC', label: '非商业性使用' },
  { code: 'SA', label: '相同方式共享' },
] as const;

/** 博客首篇发布年份，版权年份区间的起点。 */
export const COPYRIGHT_START_YEAR = 2026;

/** 「© 2026 MiraHikari」；跨年自动延展为「© 2026–2027 MiraHikari」。 */
export function copyrightLine(now: Date = new Date()): string {
  const year = now.getFullYear();
  const range =
    year > COPYRIGHT_START_YEAR ? `${COPYRIGHT_START_YEAR}–${year}` : `${COPYRIGHT_START_YEAR}`;
  return `© ${range} ${profile.name}`;
}

/** 页脚转载要求说明。 */
export const REPRINT_NOTE =
  '转载请于文首注明原文链接与作者；商业使用或超出许可范围的二次创作，请事先联系作者获得授权。';

/** AI 参与内容在版权块中的附加法律说明。 */
export const AI_LEGAL_NOTE =
  '其中 AI 生成部分的著作权归属在现行法律下尚不明确；在司法实践进一步明朗前，' +
  '本站就自身可授权部分按上述同一许可证对外授权。';

/** 订阅源 / 导出场景使用的单行许可摘要。 */
export function articleLicenseSummary(): string {
  return `${copyrightLine()} · ${BLOG_LICENSE.id} ${BLOG_LICENSE.url}`;
}
