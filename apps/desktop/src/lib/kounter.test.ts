import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { DEFAULT_KOUNTER_URL } from '@mhk/site-core/kounter/kounter-model';

/**
 * 桌面版组合根测试：确认共享客户端仍使用桌面版裸 localStorage 键，
 * 并保留本地只读与页面挂载行为。
 */

const storage = new Map<string, string>();
const NOW = 1_750_000_000_000;

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
  vi.stubGlobal('localStorage', storageObj);
}

async function loadModule() {
  return import('./kounter');
}

function stubFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Response) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(input, init),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

beforeEach(() => {
  storage.clear();
  stubLocalStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('desktop kounter wrapper', () => {
  it('re-exports the shared targets, formatter and server URL', async () => {
    const kounter = await loadModule();
    expect(kounter.SITE_PV_TARGET).toBe('site-pv');
    expect(kounter.SITE_UV_TARGET).toBe('site-uv');
    expect(kounter.formatCount(12345)).toBe('12,345');
    expect(kounter.KOUNTER_SERVER_URL).toBe(DEFAULT_KOUNTER_URL);
  });

  it('keeps the raw kounter-flags localStorage key', async () => {
    const { markCounted, shouldCount } = await loadModule();
    markCounted('site-uv', NOW);

    expect(JSON.parse(storage.get('kounter-flags') ?? '{}')).toEqual({ 'site-uv': NOW });
    expect(storage.has('mirahikari-portfolio:cache:kounter-flags')).toBe(false);
    expect(shouldCount('site-uv', NOW)).toBe(false);
    expect(shouldCount('site-uv', NOW + 24 * 60 * 60 * 1000)).toBe(true);
  });

  it('stays read-only on localhost', async () => {
    const fetchMock = stubFetch(
      () => new Response(JSON.stringify({ code: 0, data: { time: 10 } }), { status: 200 }),
    );
    const { getSiteStats } = await loadModule();

    await expect(getSiteStats('localhost')).resolves.toEqual({ pv: 10, uv: 10 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([, init]) => init === undefined)).toBe(true);
    expect(storage.size).toBe(0);
  });

  it('marks UV in the raw key before incrementing a writable host', async () => {
    const events: string[] = [];
    stubFetch((input, init) => {
      if (init?.method === 'POST') {
        events.push('post');
        return new Response(JSON.stringify({ code: 0, data: [] }), { status: 200 });
      }
      events.push(urlOf(input).includes('site-pv') ? 'get-pv' : 'get-uv');
      return new Response(JSON.stringify({ code: 0, data: { time: 10 } }), { status: 200 });
    });
    const { getSiteStats } = await loadModule();

    await expect(getSiteStats('www.example.com')).resolves.toEqual({ pv: 11, uv: 11 });
    expect(JSON.parse(storage.get('kounter-flags') ?? '{}')).toEqual({
      'site-uv': expect.any(Number),
    });
    expect(events).toEqual(['get-pv', 'get-uv', 'post']);
  });

  it('mounts the formatted status into data-kounter-status nodes', async () => {
    const nodes = [{ textContent: '' }, { textContent: '' }];
    vi.stubGlobal('location', { hostname: 'www.example.com' });
    vi.stubGlobal('document', { querySelectorAll: () => nodes });
    stubFetch((_input, init) =>
      init?.method === 'POST'
        ? new Response(JSON.stringify({ code: 0, data: [] }), { status: 200 })
        : new Response(JSON.stringify({ code: 0, data: { time: 10 } }), { status: 200 }),
    );
    const { mountKounterStatus } = await loadModule();

    mountKounterStatus();
    await vi.waitFor(() => {
      expect(nodes.map((node) => node.textContent)).toEqual([
        'Visits 11 · Guests 11',
        'Visits 11 · Guests 11',
      ]);
    });
  });
});
