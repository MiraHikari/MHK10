/**
 * OpenKounter 访客统计客户端（桌面版组合根）。
 *
 * 共享实现位于 `@mhk/site-core/kounter`；本文件只保留桌面版的存储键
 * （裸 localStorage `kounter-flags`）与页面挂载逻辑。
 *
 * 构建期不发起任何请求；fetch 只发生在浏览器端（SiteLayout 挂载脚本）。
 * 请求失败一律静默降级为 0 / 不计数，不影响站点可用性。
 */

import { createKounterClient } from '@mhk/site-core/kounter/browser-kounter';
import { SHARED_SERVICE_KEYS } from '@mhk/site-core/storage/keys';
import {
  SITE_PV_TARGET,
  SITE_UV_TARGET,
  formatCount,
  isLocalhost,
  resolveKounterServerUrl,
  type SiteStats,
} from '@mhk/site-core/kounter/kounter-model';

/** OpenKounter 服务基座（已去尾斜杠）；可用 PUBLIC_KOUNTER_URL 覆盖 */
export const KOUNTER_SERVER_URL = resolveKounterServerUrl(import.meta.env.PUBLIC_KOUNTER_URL);

/** 全站 PV / UV 计数器 key（与 OpenKounter 后台约定一致，与 portfolio 站共用） */
export { SITE_PV_TARGET, SITE_UV_TARGET };
export { formatCount, isLocalhost };
export type { SiteStats };

/** 去重 flag 的 localStorage 键（桌面版沿用共享的裸键身份） */
const FLAGS_KEY = SHARED_SERVICE_KEYS.kounterFlags;

function readFlags(): unknown {
  try {
    return JSON.parse(localStorage.getItem(FLAGS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeFlags(flags: Readonly<Record<string, number>>): void {
  try {
    localStorage.setItem(FLAGS_KEY, JSON.stringify(flags));
  } catch {
    /* 存储不可用时视为应计（计一次，不重复写） */
  }
}

const client = createKounterClient({
  serverUrl: KOUNTER_SERVER_URL,
  storage: { read: readFlags, write: writeFlags },
});

/** 读取单个计数器；任何失败静默返回 0 */
export const { getCount, incrementCounts, shouldCount, markCounted, getSiteStats } = client;

/**
 * 挂载站点统计：计数一次，并把 PV/UV 填入页面上所有 [data-kounter-status]
 * 元素（目前是 About 页状态栏）。找不到显示位时计数照常发生。
 */
export function mountKounterStatus(): void {
  void getSiteStats(location.hostname)
    .then((stats) => {
      const text = `Visits ${formatCount(stats.pv)} · Guests ${formatCount(stats.uv)}`;
      for (const node of document.querySelectorAll('[data-kounter-status]')) {
        node.textContent = text;
      }
    })
    .catch(() => {
      /* 静默：统计不可用不影响页面 */
    });
}
