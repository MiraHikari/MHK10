/**
 * OpenKounter 访客统计客户端（通用版组合根）。
 *
 * 共享实现位于 `@mhk/site-core/kounter`；本文件只保留通用版的存储封装
 * （`@/lib/storage/keys`）与文章 target 规则。
 *
 * 服务端渲染（SSG 构建期 / SSR 渲染）不发起任何请求；所有 fetch 只允许
 * 发生在浏览器端生命周期（useEffect）中。请求失败一律静默降级为 0 /
 * 不计数，不影响站点可用性。
 */

import { createKounterClient } from '@mhk/site-core/kounter/browser-kounter';
import {
  SITE_PV_TARGET,
  SITE_UV_TARGET,
  formatCount,
  isLocalhost,
  resolveKounterServerUrl,
  type SiteStats,
} from '@mhk/site-core/kounter/kounter-model';
import { STORAGE_KEYS, readJsonStorage, writeJsonStorage } from '@/lib/storage/keys';

/** OpenKounter 服务基座（已去尾斜杠）；可用 PUBLIC_KOUNTER_URL 覆盖 */
export const KOUNTER_SERVER_URL = resolveKounterServerUrl(import.meta.env.PUBLIC_KOUNTER_URL);

/** 全站 PV / UV 计数器 key（与 OpenKounter 后台约定一致） */
export { SITE_PV_TARGET, SITE_UV_TARGET };
export { formatCount, isLocalhost };
export type { SiteStats };

/** 文章阅读数 target key，与站点 URL 一致（后台列表可读） */
export function articleTarget(slug: string): string {
  return `/blog/${slug}`;
}

const client = createKounterClient({
  serverUrl: KOUNTER_SERVER_URL,
  storage: {
    // Flags live only under the canonical catalog key.
    read: () => readJsonStorage<unknown>(STORAGE_KEYS.kounterFlags),
    write: (flags) => writeJsonStorage(STORAGE_KEYS.kounterFlags, flags),
  },
});

/** 读取单个计数器；任何失败静默返回 0 */
export const { getCount, incrementCounts, shouldCount, markCounted, getSiteStats } = client;
