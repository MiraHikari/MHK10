import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

/**
 * OpenKounter 客户端单元测试。
 * 采用 url.test.ts 同款模式：vi.resetModules + 动态 import，
 * 隔离模块级 siteStatsPromise 缓存；fetch / localStorage 均在 node
 * 环境手工 stub。
 */

const storage = new Map<string, string>();

async function loadModule() {
  return import('@/lib/kounter');
}

function stubLocalStorage() {
  const storageObj = {
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
  // storage 便捷封装经 window.localStorage 访问：node 环境 stub 全局 window。
  vi.stubGlobal('window', { localStorage: storageObj, sessionStorage: storageObj });
}

function mockFetchJson(
  predicate: (url: string, init?: RequestInit) => { status?: number; body?: unknown },
) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const { status = 200, body = {} } = predicate(url, init);
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const NOW = 1_750_000_000_000;

/** The configured server base; assertions derive from it instead of a literal. */
async function serverUrl() {
  const { KOUNTER_SERVER_URL } = await loadModule();
  return KOUNTER_SERVER_URL;
}

beforeEach(() => {
  storage.clear();
  stubLocalStorage();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.resetModules();
});

describe('articleTarget', () => {
  it('生成与站点 URL 一致的 target key', async () => {
    const { articleTarget } = await loadModule();
    expect(articleTarget('hello-world')).toBe('/blog/hello-world');
    expect(articleTarget('advx-2026-hangzhou')).toBe('/blog/advx-2026-hangzhou');
  });
});

describe('isLocalhost', () => {
  it('本机 hostname 判定', async () => {
    const { isLocalhost } = await loadModule();
    expect(isLocalhost('localhost')).toBe(true);
    expect(isLocalhost('127.0.0.1')).toBe(true);
    expect(isLocalhost('[::1]')).toBe(true);
    expect(isLocalhost('www.example.com')).toBe(false);
    expect(isLocalhost('192.168.1.5')).toBe(false);
  });
});

describe('getCount', () => {
  it('成功解析计数', async () => {
    const fetchMock = mockFetchJson((url) => ({
      body: { code: 0, data: { time: 42, target: 'site-pv' } },
      ...(url.includes('/api/counter?target=') ? {} : { status: 500 }),
    }));
    const { getCount } = await loadModule();
    await expect(getCount('site-pv')).resolves.toBe(42);
    expect(fetchMock).toHaveBeenCalledWith(`${await serverUrl()}/api/counter?target=site-pv`);
  });

  it('HTTP 非 2xx 静默返回 0', async () => {
    mockFetchJson(() => ({ status: 500 }));
    const { getCount } = await loadModule();
    await expect(getCount('site-pv')).resolves.toBe(0);
  });

  it('code 非 0 静默返回 0', async () => {
    mockFetchJson(() => ({ body: { code: 1000, message: 'boom' } }));
    const { getCount } = await loadModule();
    await expect(getCount('site-pv')).resolves.toBe(0);
  });

  it('网络异常静默返回 0', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('NetworkError');
    });
    vi.stubGlobal('fetch', fetchMock);
    const { getCount } = await loadModule();
    await expect(getCount('site-pv')).resolves.toBe(0);
  });
});

describe('incrementCounts', () => {
  it('发送 batch_inc 载荷；空数组不发请求', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: input.toString(), init });
      return new Response(JSON.stringify({ code: 0, data: [] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { incrementCounts } = await loadModule();

    await incrementCounts(['site-pv', '/blog/a']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls[0].url).toBe(`${await serverUrl()}/api/counter`);
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      action: 'batch_inc',
      requests: [{ target: 'site-pv' }, { target: '/blog/a' }],
    });

    await incrementCounts([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('失败静默不抛错', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('NetworkError');
      }),
    );
    const { incrementCounts } = await loadModule();
    await expect(incrementCounts(['site-pv'])).resolves.toBeUndefined();
  });
});

describe('24h 去重（shouldCount / markCounted）', () => {
  it('无记录时应当计数；记录后 24h 内不应重复计数', async () => {
    const { shouldCount, markCounted } = await loadModule();
    expect(shouldCount('site-uv', NOW)).toBe(true);

    markCounted('site-uv', NOW);
    expect(shouldCount('site-uv', NOW)).toBe(false);
    expect(shouldCount('site-uv', NOW + 23 * 60 * 60 * 1000)).toBe(false);
    expect(shouldCount('site-uv', NOW + 24 * 60 * 60 * 1000)).toBe(true);
  });

  it('不同 target 互不影响', async () => {
    const { shouldCount, markCounted } = await loadModule();
    markCounted('/blog/a', NOW);
    expect(shouldCount('/blog/a', NOW)).toBe(false);
    expect(shouldCount('/blog/b', NOW)).toBe(true);
  });

  it('localStorage 数据损坏时视为应计', async () => {
    storage.set('mirahikari-portfolio:cache:kounter-flags', '{oops');
    const { shouldCount } = await loadModule();
    expect(shouldCount('site-uv', NOW)).toBe(true);
  });

  it('ignores the retired open-kounter:flags key and counts from the canonical key', async () => {
    storage.set('open-kounter:flags', JSON.stringify({ 'site-uv': NOW - 1000 }));
    const { shouldCount, markCounted } = await loadModule();
    // The retired key is no longer read: no dedupe record is visible.
    expect(shouldCount('site-uv', NOW)).toBe(true);
    markCounted('site-uv', NOW + 1000);
    expect(storage.get('mirahikari-portfolio:cache:kounter-flags')).toContain('site-uv');
    // The retired record is left alone rather than deleted.
    expect(storage.get('open-kounter:flags')).toBe(JSON.stringify({ 'site-uv': NOW - 1000 }));
  });
});

describe('getSiteStats', () => {
  it('首次调用发起 GET + batch_inc 并返回含本次访问的显示值', async () => {
    const fetchMock = mockFetchJson((url, init) => {
      if (init?.method === 'POST') {
        return { body: { code: 0, data: [] } };
      }
      if (url.includes('target=site-pv')) {
        return { body: { code: 0, data: { time: 100 } } };
      }
      if (url.includes('target=site-uv')) {
        return { body: { code: 0, data: { time: 30 } } };
      }
      return { status: 500 };
    });

    const { getSiteStats } = await loadModule();
    await expect(getSiteStats('www.example.com')).resolves.toEqual({ pv: 101, uv: 31 });

    const postCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(postCalls).toHaveLength(1);
    expect(JSON.parse(String(postCalls[0][1]?.body))).toEqual({
      action: 'batch_inc',
      requests: [{ target: 'site-pv' }, { target: 'site-uv' }],
    });
  });

  it('module 级缓存：多次调用只请求一次、只计数一次', async () => {
    const fetchMock = mockFetchJson((_url, init) => {
      if (init?.method === 'POST') {
        return { body: { code: 0, data: [] } };
      }
      return { body: { code: 0, data: { time: 10 } } };
    });

    const { getSiteStats } = await loadModule();
    const first = getSiteStats('www.example.com');
    const second = getSiteStats('www.example.com');
    await expect(first).resolves.toEqual({ pv: 11, uv: 11 });
    await expect(second).resolves.toEqual({ pv: 11, uv: 11 });
    expect(fetchMock).toHaveBeenCalledTimes(3); // GET pv + GET uv + POST
    const postCount = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').length;
    expect(postCount).toBe(1);
  });

  it('24h 内 UV 已计过时只自增 PV，且 UV 显示不加 1', async () => {
    const fetchMock = mockFetchJson((_url, init) => {
      if (init?.method === 'POST') {
        return { body: { code: 0, data: [] } };
      }
      return { body: { code: 0, data: { time: 10 } } };
    });

    const { getSiteStats, markCounted, SITE_UV_TARGET } = await loadModule();
    markCounted(SITE_UV_TARGET, NOW);

    await expect(getSiteStats('www.example.com')).resolves.toEqual({ pv: 11, uv: 10 });

    const postCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(postCalls[0][1]?.body))).toEqual({
      action: 'batch_inc',
      requests: [{ target: 'site-pv' }],
    });
  });

  it('localhost 只读：不发送自增请求', async () => {
    const fetchMock = mockFetchJson(() => ({ body: { code: 0, data: { time: 10 } } }));

    const { getSiteStats } = await loadModule();
    await expect(getSiteStats('localhost')).resolves.toEqual({ pv: 10, uv: 10 });
    const postCount = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').length;
    expect(postCount).toBe(0);
  });
});

describe('formatCount', () => {
  it('千分位格式化', async () => {
    const { formatCount } = await loadModule();
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(12345)).toBe('12,345');
    expect(formatCount(1234567)).toBe('1,234,567');
  });
});
