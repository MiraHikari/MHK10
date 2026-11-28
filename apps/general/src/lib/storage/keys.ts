import { SHARED_READING_STORAGE_KEY, SHARED_SERVICE_KEYS } from '@mhk/site-core/storage/keys';

/**
 * 全站 Web Storage 统一入口（key 单一事实来源）。
 *
 * 规范：`mirahikari-portfolio:{category}:…`
 * - pref:  持久偏好
 * - cache: 最近项 / 进度 / 本机标记
 * - ui:    一次性 UX 标记
 * - admin:cred: / admin:ui:  管理端（与访客隔离）
 *
 * key 字符串只允许出现在 STORAGE_CATALOG 一处；`STORAGE_KEYS` 命名别名
 * 从 catalog 派生，`StorageKeyId` 类型约束所有读写只能使用 catalog 中的 key。
 *
 * 读写推荐使用便捷封装（readStorage / writeStorage / readJsonStorage…）：
 * 自动按 persistence 选择 local/session，SSR 与隐私模式安全。底层
 * readStorageItem 系列仅在需要显式传入 storage 对象时使用。
 *
 * 隐私说明表格文案维护在 `src/data/privacy.ts`（inventory 测试核对覆盖）。
 *
 * 跨呈现服务身份（OpenKounter flags、Giscus session）由
 * `@mhk/site-core/storage/keys` 提供。通用版的 Giscus 会话属于 giscus.app
 * iframe 的 origin，不在本 catalog 中；桌面版评论窗口写入同一裸键。
 */

export type StorageAudience = 'visitor' | 'admin';
export type StoragePersistence = 'local' | 'session';
export type StorageCategory = 'pref' | 'cache' | 'ui' | 'admin';

export interface StorageKeyMeta {
  /** 命名别名 id（STORAGE_KEYS 的键名） */
  readonly id: string;
  readonly key: string;
  readonly category: StorageCategory;
  readonly audience: StorageAudience;
  readonly persistence: StoragePersistence;
  /**
   * 跨呈现服务的逻辑身份（`@mhk/site-core/storage/keys`）。物理 key 仍按
   * origin 保留；该字段只用于把本地键与桌面版的同服务键对齐。
   */
  readonly sharedId?: string;
}

/** canonical key 前缀（隐私说明与 inventory 测试引用） */
export const STORAGE_KEY_PREFIX = 'mirahikari-portfolio:';

export const STORAGE_CATALOG = [
  {
    id: 'motionLevel',
    key: 'mirahikari-portfolio:pref:motion-level',
    category: 'pref',
    audience: 'visitor',
    persistence: 'local',
  },
  {
    id: 'displayMode',
    key: 'mirahikari-portfolio:pref:display-mode',
    category: 'pref',
    audience: 'visitor',
    persistence: 'local',
  },
  {
    id: 'perfTier',
    key: 'mirahikari-portfolio:pref:perf-tier',
    category: 'pref',
    audience: 'visitor',
    persistence: 'local',
  },
  {
    id: 'privacyLang',
    key: 'mirahikari-portfolio:pref:privacy-lang',
    category: 'pref',
    audience: 'visitor',
    persistence: 'local',
  },
  {
    id: 'visitorReader',
    key: SHARED_READING_STORAGE_KEY,
    category: 'cache',
    audience: 'visitor',
    persistence: 'local',
  },
  {
    id: 'blogScroll',
    key: 'mirahikari-portfolio:cache:blog-scroll',
    category: 'cache',
    audience: 'visitor',
    persistence: 'local',
  },
  {
    id: 'cmdRecents',
    key: 'mirahikari-portfolio:cache:cmd-recents',
    category: 'cache',
    audience: 'visitor',
    persistence: 'local',
  },
  {
    id: 'cmdRecentArticles',
    key: 'mirahikari-portfolio:cache:cmd-recent-articles',
    category: 'cache',
    audience: 'visitor',
    persistence: 'local',
  },
  {
    id: 'kounterFlags',
    key: 'mirahikari-portfolio:cache:kounter-flags',
    category: 'cache',
    audience: 'visitor',
    persistence: 'local',
    sharedId: SHARED_SERVICE_KEYS.kounterFlags,
  },
  {
    id: 'shortcutHintSeen',
    key: 'mirahikari-portfolio:ui:shortcut-hint-seen',
    category: 'ui',
    audience: 'visitor',
    persistence: 'local',
  },
  {
    id: 'loaderSeen',
    key: 'mirahikari-portfolio:ui:loader-seen',
    category: 'ui',
    audience: 'visitor',
    persistence: 'session',
  },
  {
    // Retained identity for a retired notice; the presentation no longer writes it.
    id: 'perfNoticeDismissed',
    key: 'mirahikari-portfolio:ui:perf-notice-dismissed',
    category: 'ui',
    audience: 'visitor',
    persistence: 'session',
  },
  {
    id: 'desktopEntryNotice',
    key: 'mirahikari-portfolio:ui:desktop-entry-notice',
    category: 'ui',
    audience: 'visitor',
    persistence: 'session',
  },
  {
    // The general site offers the desktop instead of entering it silently.
    // Answering the offer (enter or stay) closes it for the rest of the session.
    id: 'desktopOffer',
    key: 'mirahikari-portfolio:ui:desktop-offer',
    category: 'ui',
    audience: 'visitor',
    persistence: 'session',
  },
  {
    // Narrow windows and metered visits get a one-line pointer to the
    // screen-edge switch instead of the full offer; shown once per session.
    id: 'desktopHint',
    key: 'mirahikari-portfolio:ui:desktop-hint',
    category: 'ui',
    audience: 'visitor',
    persistence: 'session',
  },
  {
    // Set when a desktop handoff fails: keeps the saved win95 preference but
    // suppresses automatic desktop entry until the session ends or the visitor
    // enters explicitly. Session-scoped on purpose.
    id: 'desktopFailed',
    key: 'mirahikari-portfolio:ui:desktop-failed',
    category: 'ui',
    audience: 'visitor',
    persistence: 'session',
  },
  {
    id: 'adminGhPat',
    key: 'mirahikari-portfolio:admin:cred:gh-pat',
    category: 'admin',
    audience: 'admin',
    persistence: 'local',
  },
  {
    id: 'adminR2',
    key: 'mirahikari-portfolio:admin:cred:r2',
    category: 'admin',
    audience: 'admin',
    persistence: 'local',
  },
  {
    id: 'adminPendingProjectImage',
    key: 'mirahikari-portfolio:admin:ui:pending-project-image',
    category: 'admin',
    audience: 'admin',
    persistence: 'local',
  },
] as const satisfies readonly StorageKeyMeta[];

export type StorageKeyName = (typeof STORAGE_CATALOG)[number]['id'];
export type StorageKeyId = (typeof STORAGE_CATALOG)[number]['key'];

/** 命名别名 → canonical key（从 catalog 派生，保持字面量类型）。 */
export const STORAGE_KEYS = Object.fromEntries(STORAGE_CATALOG.map(({ id, key }) => [id, key])) as {
  [Name in StorageKeyName]: Extract<(typeof STORAGE_CATALOG)[number], { id: Name }>['key'];
};

const STORAGE_KEY_BY_ID = Object.fromEntries(
  STORAGE_CATALOG.map((entry) => [entry.key, entry]),
) as Record<StorageKeyId, (typeof STORAGE_CATALOG)[number]>;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** 读 canonical；storage 不可用或操作抛错时返回 null（不向上抛）。 */
export function readStorageItem(storage: StorageLike, canonical: StorageKeyId): string | null {
  try {
    return storage.getItem(canonical);
  } catch {
    return null;
  }
}

export function writeStorageItem(
  storage: StorageLike,
  canonical: StorageKeyId,
  value: string,
): void {
  storage.setItem(canonical, value);
}

export function removeStorageItem(storage: StorageLike, canonical: StorageKeyId): void {
  storage.removeItem(canonical);
}

/* ------------------------------------------------------------------ *
 * 便捷封装（推荐入口）：调用方只传 catalog key，不再传 storage 对象   *
 * 或处理 JSON / try-catch；local vs session 由 catalog 的 persistence *
 * 元数据自动决定。SSR（window 不存在）时读返回 null、写静默忽略。    *
 * 参数类型限定为 StorageKeyId，从类型上保证只能使用 catalog 中的 key。*
 * ------------------------------------------------------------------ */

function getStorageFor(canonical: StorageKeyId): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return STORAGE_KEY_BY_ID[canonical].persistence === 'session'
      ? window.sessionStorage
      : window.localStorage;
  } catch {
    // 隐私模式 / 禁用站点数据：storage 属性访问本身会抛，视为不可用。
    return null;
  }
}

/** 读 canonical；SSR 或存储不可用时返回 null */
export function readStorage(canonical: StorageKeyId): string | null {
  const storage = getStorageFor(canonical);
  return storage ? readStorageItem(storage, canonical) : null;
}

/** 写 canonical；SSR 或存储不可用时静默忽略 */
export function writeStorage(canonical: StorageKeyId, value: string): void {
  const storage = getStorageFor(canonical);
  if (!storage) return;
  try {
    writeStorageItem(storage, canonical, value);
  } catch {
    // 存储已满 / 隐私模式：静默忽略
  }
}

/** 删除 canonical；SSR 或存储不可用时静默忽略 */
export function removeStorage(canonical: StorageKeyId): void {
  const storage = getStorageFor(canonical);
  if (!storage) return;
  try {
    removeStorageItem(storage, canonical);
  } catch {
    // 静默忽略
  }
}

/** 读 JSON 值；无值 / JSON 损坏 / SSR 时返回 null */
export function readJsonStorage<T>(canonical: StorageKeyId): T | null {
  const raw = readStorage(canonical);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** 写 JSON 值（自动 stringify） */
export function writeJsonStorage(canonical: StorageKeyId, value: unknown): void {
  writeStorage(canonical, JSON.stringify(value));
}
