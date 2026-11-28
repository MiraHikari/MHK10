/**
 * 隐私说明双语内容源（单一事实来源）。
 *
 * 渲染方：`src/components/blog/PrivacyArticle.tsx`（按浏览器语言自动显示，
 * 可手动切换并记忆）。本机存储表格从 `STORAGE_CATALOG` 自动派生，
 * 每行的 Kind / Purpose 文案在 `STORAGE_KEY_PURPOSES` 维护；
 * inventory 测试核对 catalog 与本文档的覆盖关系。
 */

import { STORAGE_CATALOG, STORAGE_KEYS, type StorageAudience } from '@/lib/storage/keys';

export type PrivacyLang = 'zh' | 'en';

export interface Localized {
  readonly zh: string;
  readonly en: string;
}

/** 本机存储表格行的双语文案（key → 表格内容） */
export interface StorageKeyCopy {
  /** 表格 Kind 列 */
  readonly kind: Localized;
  /** 表格 Purpose 列 */
  readonly purpose: Localized;
}

export const STORAGE_KEY_PURPOSES: Record<string, StorageKeyCopy> = {
  [STORAGE_KEYS.motionLevel]: {
    kind: { zh: '动效', en: 'Motion' },
    purpose: { zh: '记住动效档位', en: 'Remembers motion level' },
  },
  [STORAGE_KEYS.displayMode]: {
    kind: { zh: '显示模式', en: 'Display mode' },
    purpose: {
      zh: '记住 Win95 桌面 / 经典站点偏好',
      en: 'Remembers Win95 desktop vs. classic site preference',
    },
  },
  [STORAGE_KEYS.perfTier]: {
    kind: { zh: '性能', en: 'Perf tier' },
    purpose: { zh: '记住手动性能档位', en: 'Remembers manual motion-performance tier' },
  },
  [STORAGE_KEYS.privacyLang]: {
    kind: { zh: '隐私语言', en: 'Privacy language' },
    purpose: { zh: '记住隐私说明语言', en: 'Remembers privacy notice language' },
  },
  [STORAGE_KEYS.visitorReader]: {
    kind: { zh: '共享阅读', en: 'Shared reading' },
    purpose: {
      zh: '通用版与 Win95 版共享的阅读进度、偏好、书签和批注；仅与配置的桌面站点交换。',
      en: 'Reading position, preferences, bookmarks and notes shared with the configured Win95 site.',
    },
  },
  [STORAGE_KEYS.blogScroll]: {
    kind: { zh: '进度', en: 'Scroll' },
    purpose: { zh: '恢复阅读位置', en: 'Restores reading position' },
  },
  [STORAGE_KEYS.cmdRecents]: {
    kind: { zh: '命令', en: 'Cmd recents' },
    purpose: { zh: '命令面板最近项', en: 'Recent command palette items' },
  },
  [STORAGE_KEYS.cmdRecentArticles]: {
    kind: { zh: '文章', en: 'Recent articles' },
    purpose: { zh: '命令面板最近文章', en: 'Recent articles in the palette' },
  },
  [STORAGE_KEYS.kounterFlags]: {
    kind: { zh: '阅读', en: 'Views' },
    purpose: { zh: '阅读计数 24h 去重标志', en: '24h dedupe for view counting' },
  },
  [STORAGE_KEYS.shortcutHintSeen]: {
    kind: { zh: '提示', en: 'Shortcut hint' },
    purpose: { zh: '快捷键提示是否已读', en: 'Whether the shortcut tip was shown' },
  },
  [STORAGE_KEYS.loaderSeen]: {
    kind: { zh: '启动', en: 'Boot loader' },
    purpose: { zh: '本次会话启动动画', en: 'Session boot animation seen' },
  },
  [STORAGE_KEYS.perfNoticeDismissed]: {
    kind: { zh: '已停用提示', en: 'Retired notice' },
    purpose: {
      zh: '旧性能提示的会话标记；当前页面不再写入，关闭会话后清除',
      en: 'Retired performance-notice marker; no longer written and cleared with the session',
    },
  },
  [STORAGE_KEYS.desktopEntryNotice]: {
    kind: { zh: '提示', en: 'Entry notice' },
    purpose: {
      zh: '本次会话移动端进入 Win95 桌面的提示是否已确认',
      en: 'Whether the mobile Win95 entry notice was accepted this session',
    },
  },
  [STORAGE_KEYS.desktopOffer]: {
    kind: { zh: '桌面推荐', en: 'Desktop offer' },
    purpose: {
      zh: '本次会话是否已回应「试试 MHK10 桌面」推荐，回应后不再出现',
      en: 'Whether this session answered the MHK10 desktop offer; it stays closed afterwards',
    },
  },
  [STORAGE_KEYS.desktopHint]: {
    kind: { zh: '切换提示', en: 'Switch hint' },
    purpose: {
      zh: '本次会话是否已关闭呈现切换提示',
      en: 'Whether this session dismissed the presentation switch hint',
    },
  },
  [STORAGE_KEYS.desktopFailed]: {
    kind: { zh: '桌面回退', en: 'Desktop fallback' },
    purpose: {
      zh: '本次会话 Win95 桌面连接失败后暂停自动进入；显式进入会清除。',
      en: 'Pauses automatic Win95 entry for this session after a failed handoff; explicit entry clears it.',
    },
  },
  [STORAGE_KEYS.adminGhPat]: {
    kind: { zh: 'GitHub PAT', en: 'GitHub PAT' },
    purpose: { zh: '管理端 PAT', en: 'Admin GitHub token' },
  },
  [STORAGE_KEYS.adminR2]: {
    kind: { zh: 'R2 凭据', en: 'R2 credentials' },
    purpose: { zh: '管理端 R2 凭据', en: 'Admin R2 credentials' },
  },
  [STORAGE_KEYS.adminPendingProjectImage]: {
    kind: { zh: '待处理图片', en: 'Pending image' },
    purpose: { zh: '项目图草稿交接', en: 'One-shot project image handoff' },
  },
} as const satisfies Record<string, StorageKeyCopy>;

export interface PrivacySection {
  readonly id: string;
  /** 缺省则不渲染节标题（开头引言段） */
  readonly title?: Localized;
  readonly paragraphs?: readonly Localized[];
  readonly listItems?: readonly Localized[];
  /** 渲染本机存储表格，行从 STORAGE_CATALOG 按 audience 自动派生 */
  readonly tableAudience?: StorageAudience;
}

export const PRIVACY_SECTIONS: readonly PrivacySection[] = [
  {
    id: 'intro',
    paragraphs: [
      {
        zh: '本站是个人作品集，不设访客账号。阅读偏好、高亮与近期记录保存在你的浏览器本地，不会上传到本站服务器。',
        en: 'This is a personal site with no visitor accounts. Reading preferences, highlights, and recent items stay in your browser and are not uploaded to this site’s servers.',
      },
    ],
  },
  {
    id: 'what-we-process',
    title: { zh: '本站如何处理信息', en: 'What we process' },
    paragraphs: [
      {
        zh: '本站不使用广告追踪。阅读与访问次数由自部署的 Open Kounter（counter.example.com）累计，仅记录次数，不采集身份、不做访客画像；计数去重标志保存在本机（见下表）。页面请求还会经过托管与 CDN，可能产生常规访问日志。',
        en: 'There is no ad tracking. Page-view counts are tallied by a self-hosted Open Kounter instance (counter.example.com); it records only counts, never identity, and does not build visitor profiles. The counting dedupe flag is stored on-device (see below). Requests also pass through hosting and CDN infrastructure and may produce routine access logs.',
      },
    ],
  },
  {
    id: 'on-device-storage',
    title: { zh: '本机存储', en: 'On-device storage' },
    paragraphs: [
      {
        zh: '访客相关键均以 `mirahikari-portfolio:` 为前缀。清除本站站点数据，或使用隐私模式，即可移除。',
        en: 'Visitor keys use the `mirahikari-portfolio:` prefix. Clear this site’s data in your browser, or use a private window, to remove them.',
      },
    ],
    tableAudience: 'visitor',
  },
  {
    id: 'admin-storage',
    title: { zh: '管理端（非访客）', en: 'Admin only' },
    paragraphs: [
      {
        zh: '`/admin` 仅供站点管理员。GitHub PAT 与 R2 凭据只保存在管理员本机，与访客数据隔离。',
        en: '`/admin` is for the site operator only. The GitHub PAT and R2 credentials stay on that browser and are separate from visitor data.',
      },
    ],
    tableAudience: 'admin',
  },
  {
    id: 'third-parties',
    title: { zh: '第三方', en: 'Third parties' },
    listItems: [
      {
        zh: '腾讯云 EdgeOne — 站点托管与边缘分发。',
        en: 'Tencent EdgeOne — hosting and edge delivery.',
      },
      {
        zh: 'Cloudflare R2（static.example.com）— 图片等静态资源投递，不用于追踪。',
        en: 'Cloudflare R2 (static.example.com) — image and static delivery; not used for tracking.',
      },
      {
        zh: 'Open Kounter（counter.example.com）— 自部署的阅读 / 访问计数服务，只累计次数，不用于追踪。',
        en: 'Open Kounter (counter.example.com) — self-hosted view/visit counter; counts only, no tracking.',
      },
      {
        zh: 'Giscus / GitHub — 博客等处的评论经 iframe 加载；留言进入 GitHub Discussions。使用评论时适用对方条款，并可能涉及第三方 Cookie 或账号。',
        en: 'Giscus / GitHub — comments load in an iframe; posts go to GitHub Discussions. Using comments means their terms apply, and third-party cookies or accounts may be involved.',
      },
    ],
    paragraphs: [
      {
        zh: '本站自身不以 Cookie 做访客追踪。评论等第三方仅在你使用相关功能时才会介入。',
        en: 'This site does not use cookies for visitor tracking. Third parties such as comments only engage when you use those features.',
      },
    ],
  },
  {
    id: 'choices',
    title: { zh: '你的选择', en: 'Your choices' },
    listItems: [
      {
        zh: '清除浏览器中本站的站点数据。',
        en: 'Clear this site’s data in your browser.',
      },
      {
        zh: '不打开或不滚动到评论区，通常不会加载 Giscus。',
        en: 'Skip the comments section to avoid loading Giscus.',
      },
      {
        zh: '动效档位可在命令面板（⌘K / Ctrl+K）中调整。',
        en: 'Motion level can be changed in the command palette (⌘K / Ctrl+K).',
      },
    ],
  },
  {
    id: 'contact',
    title: { zh: '联系', en: 'Contact' },
    paragraphs: [
      {
        zh: '疑问可邮件联系 {email}。本页随站点能力变更而更新，以文首日期为准。',
        en: 'Questions: {email}. This notice may change with the site; the date above is authoritative.',
      },
    ],
  },
];

/** 表格列标题（按语言） */
export const STORAGE_TABLE_HEADERS: Record<
  PrivacyLang,
  { kind: string; key: string; purpose: string }
> = {
  zh: { kind: '类型', key: 'Key', purpose: '用途' },
  en: { kind: 'Kind', key: 'Key', purpose: 'Purpose' },
};

/** 表格标题（按语言） */
export const STORAGE_TABLE_TITLES: Record<PrivacyLang, Record<StorageAudience, string>> = {
  zh: { visitor: '访客', admin: '管理端' },
  en: { visitor: 'Visitors', admin: 'Admin only' },
};

/** inventory 辅助：catalog 与双语文案的覆盖关系（测试用） */
export function storageCatalogEntries(audience: StorageAudience) {
  return STORAGE_CATALOG.filter((entry) => entry.audience === audience);
}
