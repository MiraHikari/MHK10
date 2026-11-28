/**
 * 内容集合通用加载 hook。
 * 从 GitHub 仓库列出指定目录下指定扩展名的文件，解析 frontmatter 与正文。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getBranchHeadSha, getTextFile, listRepoPaths } from '@/admin/github/store';
import { splitFrontmatter } from '@/admin/content/frontmatter';

export interface CollectionItem {
  path: string;
  id: string;
  data: Record<string, unknown>;
  body: string;
}

interface UseCollectionState {
  headSha: string | null;
  items: CollectionItem[] | null;
  loading: boolean;
  error: string | null;
}

function normalizeDir(dir: string): string {
  return dir.endsWith('/') ? dir.slice(0, -1) : dir;
}

function extractId(path: string, dir: string, ext: string): string {
  const normalizedDir = normalizeDir(dir);
  const prefix = `${normalizedDir}/`;
  const relative = path.startsWith(prefix) ? path.slice(prefix.length) : path;
  return ext && relative.endsWith(ext) ? relative.slice(0, -ext.length) : relative;
}

export async function loadCollection(
  dir: string,
  exts: readonly string[],
): Promise<{ items: CollectionItem[]; headSha: string }> {
  const headSha = await getBranchHeadSha();
  const allPaths = await listRepoPaths(dir, headSha);
  const matchedPaths = allPaths.filter((path) => exts.some((ext) => path.endsWith(ext)));

  const items: CollectionItem[] = [];

  for (let i = 0; i < matchedPaths.length; i += 6) {
    const chunk = matchedPaths.slice(i, i + 6);
    const chunkItems = await Promise.all(
      chunk.map(async (path) => {
        const ext = exts.find((e) => path.endsWith(e)) ?? '';
        const raw = await getTextFile(path, headSha);
        const { data, body } = splitFrontmatter(raw);
        return {
          path,
          id: extractId(path, dir, ext),
          data,
          body,
        };
      }),
    );
    items.push(...chunkItems);
  }

  return { items, headSha };
}

export function useCollection(
  dir: string,
  exts: readonly string[],
): UseCollectionState & { reload: () => void } {
  const [state, setState] = useState<UseCollectionState>({
    headSha: null,
    items: null,
    loading: true,
    error: null,
  });

  const requestIdRef = useRef(0);
  const extensionKey = exts.join('\0');
  const reload = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setState({ items: null, headSha: null, loading: true, error: null });
    loadCollection(dir, extensionKey.split('\0'))
      .then(({ items, headSha }) => {
        if (requestId !== requestIdRef.current) return;
        setState({ items, headSha, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (requestId !== requestIdRef.current) return;
        const message = error instanceof Error ? error.message : '加载失败';
        setState({ items: null, headSha: null, loading: false, error: message });
      });
  }, [dir, extensionKey]);

  useEffect(() => {
    reload();
    return () => {
      requestIdRef.current += 1;
    };
  }, [reload]);

  return { ...state, reload };
}
