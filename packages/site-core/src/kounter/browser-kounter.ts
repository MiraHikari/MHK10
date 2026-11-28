import {
  SITE_PV_TARGET,
  SITE_UV_TARGET,
  isLocalhost,
  markCounted as markFlag,
  parseCounterResponse,
  parseFlags,
  planVisit,
  shouldCount as flagAllowsCount,
  type KounterFlags,
  type SiteStats,
} from './kounter-model';

/**
 * 去重 flag 的持久化端口。`read()` 返回外部输入，由模型严格解析；
 * write 失败不得影响页面可用性（应用组合根负责静默处理）。
 */
export interface KounterStorage {
  read(): unknown;
  write(flags: Readonly<KounterFlags>): void;
}

export interface KounterClientOptions {
  /** OpenKounter 服务基座；尾斜杠会被去除 */
  serverUrl: string;
  storage: KounterStorage;
  /** 测试注入；缺省在调用时使用全局 fetch */
  fetch?: typeof fetch;
}

/** 两个站点共用的 OpenKounter 客户端接口 */
export interface KounterClient {
  /** 读取单个计数器；任何失败静默返回 0 */
  getCount(target: string): Promise<number>;
  /** 批量自增（batch_inc）；任何失败静默忽略 */
  incrementCounts(targets: readonly string[]): Promise<void>;
  /** 该 target 本次是否应计入（24h 窗口去重） */
  shouldCount(target: string, now?: number): boolean;
  /** 记录该 target 的计数时间戳 */
  markCounted(target: string, now?: number): void;
  /** 全站 PV/UV（含本次访问的自增），每个客户端独立缓存 */
  getSiteStats(hostname: string): Promise<SiteStats>;
}

/**
 * 创建 OpenKounter 客户端。
 *
 * 请求失败一律静默降级为 0 / 不计数；本机环境只读不写。
 * `siteStatsPromise` 是客户端级缓存：首个调用者发起 GET + batch_inc，
 * 后续调用直接复用结果，不会重复请求或重复计数。
 */
export function createKounterClient({
  serverUrl,
  storage,
  fetch: fetchImpl,
}: KounterClientOptions): KounterClient {
  const base = serverUrl.replace(/\/+$/, '');
  // 调用时再解析全局 fetch，运行期替换（测试 stub）仍然生效。
  const request: typeof fetch =
    fetchImpl ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));

  function readFlags(): KounterFlags {
    try {
      return parseFlags(storage.read());
    } catch {
      return {};
    }
  }

  function writeFlags(flags: Readonly<KounterFlags>): void {
    try {
      storage.write(flags);
    } catch {
      // 存储不可用时视为应计（计一次，不重复写）
    }
  }

  async function getCount(target: string): Promise<number> {
    try {
      const response = await request(`${base}/api/counter?target=${encodeURIComponent(target)}`);
      if (!response.ok) return 0;
      const parsed = parseCounterResponse(await response.json());
      return parsed.ok ? parsed.count : 0;
    } catch {
      return 0;
    }
  }

  async function incrementCounts(targets: readonly string[]): Promise<void> {
    if (targets.length === 0) return;
    try {
      const response = await request(`${base}/api/counter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'batch_inc',
          requests: targets.map((target) => ({ target })),
        }),
      });
      if (!response.ok) return;
      await response.json();
    } catch {
      // 静默降级
    }
  }

  function shouldCount(target: string, now = Date.now()): boolean {
    return flagAllowsCount(readFlags(), target, now);
  }

  function markCounted(target: string, now = Date.now()): void {
    writeFlags(markFlag(readFlags(), target, now));
  }

  let siteStatsPromise: Promise<SiteStats> | null = null;

  async function fetchSiteStats(hostname: string): Promise<SiteStats> {
    const [pv, uv] = await Promise.all([getCount(SITE_PV_TARGET), getCount(SITE_UV_TARGET)]);

    // 不可写时不读取存储（与旧实现的短路顺序一致）。
    const plan = planVisit(hostname, isLocalhost(hostname) ? {} : readFlags(), Date.now());
    // 先标记 UV 再自增；请求失败也不会在 24h 窗口内重复计数。
    if (plan.incUv) writeFlags(plan.flags);
    if (plan.writable) await incrementCounts(plan.targets);

    return {
      pv: pv + (plan.writable ? 1 : 0),
      uv: uv + (plan.incUv ? 1 : 0),
    };
  }

  function getSiteStats(hostname: string): Promise<SiteStats> {
    if (!siteStatsPromise) {
      siteStatsPromise = fetchSiteStats(hostname);
    }
    return siteStatsPromise;
  }

  return { getCount, incrementCounts, shouldCount, markCounted, getSiteStats };
}
