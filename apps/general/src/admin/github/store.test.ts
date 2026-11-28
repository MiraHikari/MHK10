import { beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { MockedFunction } from 'vite-plus/test';
import { GITHUB_BRANCH } from '@/admin/config';
import { setStoredToken } from '@/admin/github/client';
import { commitFiles, deleteFiles, listRepoPaths } from '@/admin/github/store';

interface MockResponse {
  matchUrl?: string;
  matchMethod?: string;
  status?: number;
  body?: unknown;
}

const storage = new Map<string, string>();

beforeAll(() => {
  // 模拟浏览器环境，使 localStorage 相关函数在 Node 测试环境中可用
  // @ts-expect-error 故意覆盖全局 window
  globalThis.window = globalThis;
  globalThis.localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => storage.clear(),
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    get length() {
      return storage.size;
    },
  } as unknown as Storage;
});

beforeEach(() => {
  storage.clear();
  setStoredToken('test-pat');
  (globalThis.fetch as MockedFunction<typeof fetch>).mockReset?.();
});

function createMockFetch(responses: MockResponse[]) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method ?? 'GET';
    const next = responses.shift();

    if (!next) {
      return new Response(`unexpected request ${method} ${url}`, { status: 500 });
    }

    if (next.matchUrl && !url.includes(next.matchUrl)) {
      return new Response(`url mismatch: expected ${next.matchUrl}, got ${url}`, { status: 500 });
    }

    if (next.matchMethod && method !== next.matchMethod) {
      return new Response(`method mismatch: expected ${next.matchMethod}, got ${method}`, {
        status: 500,
      });
    }

    const status = next.status ?? 200;
    const body = next.body !== undefined ? JSON.stringify(next.body) : '';
    return new Response(body, { status });
  });
}

function findCall(method: string, urlSnippet: string) {
  const calls = (globalThis.fetch as MockedFunction<typeof fetch>).mock.calls;
  return calls.find((call) => {
    const url = call[0].toString();
    const reqMethod = call[1]?.method ?? 'GET';
    return reqMethod === method && url.includes(urlSnippet);
  });
}

function parseBody(call: ReturnType<typeof findCall>): unknown {
  if (!call || !call[1]?.body) return undefined;
  return JSON.parse(call[1].body as string);
}

describe('listRepoPaths', () => {
  it('按前缀过滤并剔除非 blob 条目', async () => {
    globalThis.fetch = createMockFetch([
      {
        matchUrl: `/repos/MiraHikari/example-owner/example-content-repo/git/trees/${GITHUB_BRANCH}?recursive=1`,
        body: {
          tree: [
            { path: 'packages/site-core/content/blog/post-1.md', type: 'blob' },
            { path: 'packages/site-core/content/blog/assets', type: 'tree' },
            { path: 'packages/site-core/content/projects/p1.md', type: 'blob' },
            { path: 'packages/site-core/content/blog/post-2.md', type: 'blob' },
          ],
          truncated: false,
        },
      },
    ]);

    const paths = await listRepoPaths('packages/site-core/content/blog/');
    expect(paths).toEqual([
      'packages/site-core/content/blog/post-1.md',
      'packages/site-core/content/blog/post-2.md',
    ]);
  });

  it('truncated 为 true 时抛出错误', async () => {
    globalThis.fetch = createMockFetch([
      {
        matchUrl: `/repos/MiraHikari/example-owner/example-content-repo/git/trees/${GITHUB_BRANCH}?recursive=1`,
        body: { tree: [], truncated: true },
      },
    ]);

    await expect(listRepoPaths('packages/site-core/content/blog/')).rejects.toThrow(
      '仓库文件树过大',
    );
  });
});

describe('commitFiles', () => {
  it('rejects stale checkout paths and generated projections before contacting GitHub', async () => {
    globalThis.fetch = vi.fn();
    for (const path of [
      'src/data/profile.json',
      'src/content/blog/old.md',
      'apps/desktop/src/data/portfolio-presentation.json',
      'packages/site-core/content/projects.generated.json',
      'packages/site-core/content/blog/../profile.json',
    ]) {
      await expect(commitFiles('invalid path', [{ path, text: 'body' }])).rejects.toThrow(
        '禁止写入仓库路径',
      );
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it('检测 base head 已变化并拒绝覆盖', async () => {
    globalThis.fetch = createMockFetch([
      { body: { sha: 'blob-sha' } },
      { body: { object: { sha: 'new-head-sha' } } },
    ]);

    await expect(
      commitFiles(
        'stale content',
        [{ path: 'packages/site-core/content/blog/stale.md', text: 'body' }],
        { expectedHeadSha: 'old-head-sha' },
      ),
    ).rejects.toThrow('内容已被其他提交修改');
  });

  it('按正确顺序调用 Git Data API 并构造 tree 条目', async () => {
    globalThis.fetch = createMockFetch([
      { body: { sha: 'blob-sha-text' } },
      { body: { sha: 'blob-sha-base64' } },
      { body: { object: { sha: 'head-sha' } } },
      { body: { tree: { sha: 'base-tree-sha' } } },
      { body: { sha: 'new-tree-sha' } },
      {
        body: {
          sha: 'commit-sha',
          html_url: 'https://github.com/example-owner/example-content-repo/commit/commit-sha',
        },
      },
      { body: { object: { sha: 'commit-sha' } } },
    ]);

    const result = await commitFiles('add content', [
      { path: 'packages/site-core/content/blog/a.md', text: '# hello' },
      { path: 'apps/general/public/images/gallery/x.webp', base64: 'dGVzdA==' },
    ]);

    expect(result.commitSha).toBe('commit-sha');
    expect(result.htmlUrl).toBe(
      'https://github.com/example-owner/example-content-repo/commit/commit-sha',
    );

    const textBlob = findCall('POST', '/git/blobs');
    expect(parseBody(textBlob)).toEqual({
      content: '# hello',
      encoding: 'utf-8',
    });

    const treeCall = findCall('POST', '/git/trees');
    expect(parseBody(treeCall)).toEqual({
      base_tree: 'base-tree-sha',
      tree: [
        {
          path: 'packages/site-core/content/blog/a.md',
          mode: '100644',
          type: 'blob',
          sha: 'blob-sha-text',
        },
        {
          path: 'apps/general/public/images/gallery/x.webp',
          mode: '100644',
          type: 'blob',
          sha: 'blob-sha-base64',
        },
      ],
    });
  });

  it('PATCH 422 时重试并成功后返回新 commit', async () => {
    globalThis.fetch = createMockFetch([
      // 第一次尝试：创建 blob + buildCommit
      { body: { sha: 'blob-sha-1' } },
      { body: { object: { sha: 'head-sha-1' } } },
      { body: { tree: { sha: 'base-tree-sha-1' } } },
      { body: { sha: 'new-tree-sha-1' } },
      {
        body: {
          sha: 'commit-sha-1',
          html_url: 'https://github.com/example-owner/example-content-repo/commit/commit-sha-1',
        },
      },
      { status: 422, body: { message: 'Update is not a fast forward' } },
      // 第二次尝试：仅 buildCommit
      { body: { object: { sha: 'head-sha-2' } } },
      { body: { tree: { sha: 'base-tree-sha-2' } } },
      { body: { sha: 'new-tree-sha-2' } },
      {
        body: {
          sha: 'commit-sha-2',
          html_url: 'https://github.com/example-owner/example-content-repo/commit/commit-sha-2',
        },
      },
      { body: { object: { sha: 'commit-sha-2' } } },
    ]);

    const result = await commitFiles('retry content', [
      { path: 'packages/site-core/content/blog/b.md', text: 'body' },
    ]);

    expect(result.commitSha).toBe('commit-sha-2');
    expect((globalThis.fetch as MockedFunction<typeof fetch>).mock.calls).toHaveLength(11);
  });

  it('PATCH 422 超过 3 次后抛出冲突错误', async () => {
    const responses: MockResponse[] = [{ body: { sha: 'blob-sha' } }];
    for (let i = 0; i < 3; i++) {
      responses.push({ body: { object: { sha: `head-${i}` } } });
      responses.push({ body: { tree: { sha: `base-tree-${i}` } } });
      responses.push({ body: { sha: `new-tree-${i}` } });
      responses.push({
        body: {
          sha: `commit-${i}`,
          html_url: `https://github.com/example-owner/example-content-repo/commit/commit-${i}`,
        },
      });
      responses.push({
        status: 422,
        body: { message: 'Update is not a fast forward' },
      });
    }

    globalThis.fetch = createMockFetch(responses);

    await expect(
      commitFiles('conflict content', [
        { path: 'packages/site-core/content/blog/c.md', text: 'body' },
      ]),
    ).rejects.toThrow('提交冲突，请刷新后重试');

    expect((globalThis.fetch as MockedFunction<typeof fetch>).mock.calls).toHaveLength(16);
  });
});

describe('deleteFiles', () => {
  it('rejects a deletion from an outdated editor snapshot', async () => {
    globalThis.fetch = createMockFetch([{ body: { object: { sha: 'new-head' } } }]);
    await expect(
      deleteFiles('remove stale article', ['packages/site-core/content/blog/a.md'], {
        expectedHeadSha: 'old-head',
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
  it('生成 sha 为 null 的 tree 条目以删除文件', async () => {
    globalThis.fetch = createMockFetch([
      { body: { object: { sha: 'head-sha' } } },
      { body: { tree: { sha: 'base-tree-sha' } } },
      { body: { sha: 'new-tree-sha' } },
      {
        body: {
          sha: 'commit-sha',
          html_url: 'https://github.com/example-owner/example-content-repo/commit/commit-sha',
        },
      },
      { body: { object: { sha: 'commit-sha' } } },
    ]);

    const result = await deleteFiles('remove files', [
      'packages/site-core/content/blog/old.md',
      'apps/general/public/images/honors/legacy.webp',
    ]);

    expect(result.commitSha).toBe('commit-sha');

    const treeCall = findCall('POST', '/git/trees');
    expect(parseBody(treeCall)).toEqual({
      base_tree: 'base-tree-sha',
      tree: [
        {
          path: 'packages/site-core/content/blog/old.md',
          mode: '100644',
          type: 'blob',
          sha: null,
        },
        {
          path: 'apps/general/public/images/honors/legacy.webp',
          mode: '100644',
          type: 'blob',
          sha: null,
        },
      ],
    });
  });
});
