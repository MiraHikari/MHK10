import { STORAGE_KEYS, readJsonStorage, writeJsonStorage } from '@/lib/storage/keys';

/**
 * 阅读进度持久化：按文章 slug 记录滚动位置，重进文章时恢复。
 * key 见 `@/lib/storage/keys`（`mirahikari-portfolio:cache:blog-scroll`，
 * Record<slug, number>）；数值白名单校验（Number.isFinite && >= 0）。
 * 滚动归零是自校正的：用户滚回顶部后存储值变为 0，下次不再恢复。
 */

const STORAGE_KEY = STORAGE_KEYS.blogScroll;

/** 超过该阈值（px）才恢复滚动，避开头屏/短文章的误恢复。 */
export function shouldRestore(y: number): boolean {
  return Number.isFinite(y) && y > 160;
}

function readMap(): Record<string, number> {
  const parsed = readJsonStorage<Record<string, number>>(STORAGE_KEY);
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {};
}

function writeMap(map: Record<string, number>): void {
  writeJsonStorage(STORAGE_KEY, map);
}

/** 模块级缓存：hydrate 一次后写直达，避免滚动中每次 save 都整表 JSON.parse。 */
let cache: Record<string, number> | undefined;

function getAll(): Record<string, number> {
  if (cache === undefined) cache = readMap();
  return cache;
}

export function getSavedScroll(slug: string): number {
  const value = getAll()[slug];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function saveScroll(slug: string, y: number): void {
  if (!slug || !Number.isFinite(y) || y < 0) return;
  const map = getAll();
  map[slug] = Math.round(y);
  writeMap(map);
}
