/**
 * OpenKounter 纯域模型：target 常量、24h 去重窗口、响应/flag 解析与访问计划。
 *
 * 不读写浏览器全局，也不发起请求；存储与 fetch 由 adapters 注入。
 */

/** 全站 PV / UV 计数器 key（与 OpenKounter 后台约定一致，与 portfolio 站共用） */
export const SITE_PV_TARGET = 'site-pv';
export const SITE_UV_TARGET = 'site-uv';
export const DEFAULT_KOUNTER_URL = 'https://counter.example.com';

export function resolveKounterServerUrl(value?: string): string {
  return (value?.trim() || DEFAULT_KOUNTER_URL).replace(/\/+$/, '');
}

/** 同一 target 两次计数的去重窗口（24h） */
export const FLAG_WINDOW_MS = 24 * 60 * 60 * 1000;

/** 去重 flag：target → 最近一次计数时间戳（ms） */
export type KounterFlags = Record<string, number>;

/** 全站统计（含本次访问的自增） */
export interface SiteStats {
  /** 全站 PV（含本次访问） */
  pv: number;
  /** 全站 UV（24h 窗口内已计过则不含本次） */
  uv: number;
}

/** GET /api/counter 的严格解析结果 */
export type CounterResponse = { ok: true; count: number } | { ok: false };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 本机开发环境判断：本地只读不写，避免污染线上数据 */
export function isLocalhost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/** 千分位格式化，如 12345 → "12,345" */
export function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

/** 严格解析 GET 响应；任何结构不符都视为失败（调用方静默降级为 0）。 */
export function parseCounterResponse(value: unknown): CounterResponse {
  if (!isRecord(value) || typeof value.code !== 'number' || value.code !== 0) {
    return { ok: false };
  }
  const data = value.data;
  if (
    !isRecord(data) ||
    typeof data.time !== 'number' ||
    !Number.isInteger(data.time) ||
    data.time < 0
  ) {
    return { ok: false };
  }
  return { ok: true, count: data.time };
}

/** 严格解析去重 flag；损坏/非对象视为空，丢弃非数值条目。 */
export function parseFlags(value: unknown): KounterFlags {
  if (!isRecord(value)) return {};
  const flags: KounterFlags = {};
  for (const [target, timestamp] of Object.entries(value)) {
    if (typeof timestamp === 'number' && Number.isFinite(timestamp)) flags[target] = timestamp;
  }
  return flags;
}

/**
 * 该 target 本次是否应计入（24h 窗口去重，按 target 粒度独立记录）。
 * flag 缺失或不是数值时视为应计。
 */
export function shouldCount(flags: Readonly<KounterFlags>, target: string, now: number): boolean {
  const last = flags[target];
  return typeof last !== 'number' || now - last >= FLAG_WINDOW_MS;
}

/** 返回记录该 target 计数时间戳后的新 flag（不修改入参）。 */
export function markCounted(
  flags: Readonly<KounterFlags>,
  target: string,
  now: number,
): KounterFlags {
  return { ...flags, [target]: now };
}

/** 一次访问的计数计划；UV 标记已写入 flags，调用方应在自增前持久化。 */
export interface VisitPlan {
  /** 非本机环境才写计数 */
  writable: boolean;
  /** 24h 窗口内首次访问，UV 需要自增 */
  incUv: boolean;
  /** 需要 batch_inc 的 target；不可写时为空 */
  targets: readonly string[];
  /** 已包含 UV 标记的 flag（不可写或无 UV 时原样返回） */
  flags: Readonly<KounterFlags>;
}

/**
 * 规划本次访问：可写时 PV 总是计数，UV 仅在 24h 窗口外计数。
 * 不修改入参；UV 标记已在返回的 flags 中。
 */
export function planVisit(hostname: string, flags: Readonly<KounterFlags>, now: number): VisitPlan {
  const writable = !isLocalhost(hostname);
  const incUv = writable && shouldCount(flags, SITE_UV_TARGET, now);
  return {
    writable,
    incUv,
    targets: writable ? [SITE_PV_TARGET, ...(incUv ? [SITE_UV_TARGET] : [])] : [],
    flags: incUv ? markCounted(flags, SITE_UV_TARGET, now) : flags,
  };
}
