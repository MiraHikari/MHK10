import { useCallback, useState } from 'react';
import { STORAGE_KEYS, readJsonStorage, writeJsonStorage } from '@/lib/storage/keys';
import type { StorageKeyId } from '@/lib/storage/keys';

const RECENTS_KEY = STORAGE_KEYS.cmdRecents;
const MAX_RECENTS = 6;

const RECENT_ARTICLES_KEY = STORAGE_KEYS.cmdRecentArticles;
const MAX_RECENT_ARTICLES = 10;

function toStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

// 模块级缓存：saveRecent 每次执行命令都会写，反复 JSON.parse 是纯浪费（js-cache-storage）。
// 写后同步更新缓存，跨实例共享。null = 未 hydrate。
let cachedRecents: string[] | null = null;
let cachedRecentArticleSlugs: string[] | null = null;

function loadJsonList(key: StorageKeyId): string[] {
  return toStringList(readJsonStorage<string[]>(key) ?? []);
}

function loadRecents(): string[] {
  if (cachedRecents === null) cachedRecents = loadJsonList(RECENTS_KEY);
  return cachedRecents;
}

function loadRecentArticleSlugs(): string[] {
  if (cachedRecentArticleSlugs === null) {
    cachedRecentArticleSlugs = loadJsonList(RECENT_ARTICLES_KEY);
  }
  return cachedRecentArticleSlugs;
}

function saveList(key: StorageKeyId, value: readonly string[]): void {
  writeJsonStorage(key, value);
}

function pushUnique(list: readonly string[], id: string, max: number): string[] {
  return [id, ...list.filter((item) => item !== id)].slice(0, max);
}

export function useCommandRecents() {
  const [recents, setRecents] = useState<string[]>(() => loadRecents());
  const [recentArticleSlugs, setRecentArticleSlugs] = useState<string[]>(() =>
    loadRecentArticleSlugs(),
  );

  const saveRecent = useCallback((id: string) => {
    const trimmed = pushUnique(loadRecents(), id, MAX_RECENTS);
    cachedRecents = trimmed;
    saveList(RECENTS_KEY, trimmed);
    setRecents(trimmed);
  }, []);

  const saveRecentArticleSlug = useCallback((slug: string) => {
    const trimmed = pushUnique(loadRecentArticleSlugs(), slug, MAX_RECENT_ARTICLES);
    cachedRecentArticleSlugs = trimmed;
    saveList(RECENT_ARTICLES_KEY, trimmed);
    setRecentArticleSlugs(trimmed);
  }, []);

  const refreshRecents = useCallback(() => {
    cachedRecents = null;
    setRecents(loadRecents());
  }, []);

  const refreshRecentArticles = useCallback(() => {
    cachedRecentArticleSlugs = null;
    setRecentArticleSlugs(loadRecentArticleSlugs());
  }, []);

  return {
    recents,
    recentArticleSlugs,
    saveRecent,
    saveRecentArticleSlug,
    refreshRecents,
    refreshRecentArticles,
  };
}
