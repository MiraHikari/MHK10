import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createKounterClient } from './browser-kounter';
import { FLAG_WINDOW_MS, SITE_PV_TARGET, SITE_UV_TARGET } from './kounter-model';

const NOW = 1_750_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

interface MockResponse {
  status?: number;
  body?: unknown;
  throws?: boolean;
}

type Respond = (url: string, init?: RequestInit) => MockResponse;

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

function jsonBody(init?: RequestInit): unknown {
  const body = init?.body;
  if (typeof body !== 'string') throw new Error('Expected a JSON string request body');
  return JSON.parse(body);
}

function harness(respond: Respond = () => ({ body: { code: 0, data: { time: 10 } } })) {
  const state = {
    flags: {} as unknown,
    writes: [] as Array<Readonly<Record<string, number>>>,
    events: [] as string[],
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    state.events.push(init?.method === 'POST' ? 'post' : `get:${url}`);
    const result = respond(url, init);
    if (result.throws) throw new TypeError('NetworkError');
    return new Response(JSON.stringify(result.body ?? {}), { status: result.status ?? 200 });
  });
  const client = createKounterClient({
    // Trailing slashes must not produce double slashes in request URLs.
    serverUrl: 'https://kounter.example///',
    storage: {
      read: () => {
        state.events.push('read');
        return state.flags;
      },
      write: (flags) => {
        state.events.push('write');
        state.writes.push({ ...flags });
        state.flags = { ...flags };
      },
    },
    fetch: fetchMock,
  });
  return { client, fetchMock, state };
}

const readResponse: Respond = (url, init) => {
  if (init?.method === 'POST') return { body: { code: 0, data: [] } };
  if (url.includes(`target=${SITE_PV_TARGET}`)) return { body: { code: 0, data: { time: 100 } } };
  if (url.includes(`target=${SITE_UV_TARGET}`)) return { body: { code: 0, data: { time: 30 } } };
  return { status: 500 };
};

afterEach(() => {
  vi.useRealTimers();
});

describe('getCount', () => {
  it('parses a successful counter response', async () => {
    const { client, fetchMock } = harness(() => ({ body: { code: 0, data: { time: 42 } } }));
    await expect(client.getCount(SITE_PV_TARGET)).resolves.toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://kounter.example/api/counter?target=site-pv');
  });

  it('encodes the target in the query string', async () => {
    const { client, fetchMock } = harness();
    await client.getCount('/blog/a b');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://kounter.example/api/counter?target=%2Fblog%2Fa%20b',
    );
  });

  it('silently returns 0 for HTTP or shape failures', async () => {
    for (const respond of [
      () => ({ status: 500 }),
      () => ({ body: { code: 1000, message: 'boom' } }),
      () => ({ body: { code: 0 } }),
      () => ({ body: { code: 0, data: { time: '42' } } }),
      () => ({ body: { code: 0, data: [] } }),
    ] satisfies Respond[]) {
      const { client } = harness(respond);
      await expect(client.getCount(SITE_PV_TARGET)).resolves.toBe(0);
    }
  });

  it('silently returns 0 on network or JSON failures', async () => {
    const network = harness(() => ({ throws: true }));
    await expect(network.client.getCount(SITE_PV_TARGET)).resolves.toBe(0);

    const fetchMock = vi.fn(async () => new Response('{broken', { status: 200 }));
    const client = createKounterClient({
      serverUrl: 'https://kounter.example',
      storage: { read: () => ({}), write: () => {} },
      fetch: fetchMock,
    });
    await expect(client.getCount(SITE_PV_TARGET)).resolves.toBe(0);
  });
});

describe('incrementCounts', () => {
  it('sends one batch_inc request and skips empty batches', async () => {
    const { client, fetchMock } = harness(() => ({ body: { code: 0, data: [] } }));
    await client.incrementCounts([SITE_PV_TARGET, '/blog/a']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://kounter.example/api/counter');
    expect(init?.method).toBe('POST');
    expect(jsonBody(init)).toEqual({
      action: 'batch_inc',
      requests: [{ target: SITE_PV_TARGET }, { target: '/blog/a' }],
    });

    await client.incrementCounts([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('swallows network and HTTP failures', async () => {
    const network = harness(() => ({ throws: true }));
    await expect(network.client.incrementCounts([SITE_PV_TARGET])).resolves.toBeUndefined();

    const http = harness(() => ({ status: 503 }));
    await expect(http.client.incrementCounts([SITE_PV_TARGET])).resolves.toBeUndefined();
  });
});

describe('flag storage port', () => {
  it('reads, marks and reuses the injected storage', () => {
    const { client, state } = harness();
    expect(client.shouldCount(SITE_UV_TARGET, NOW)).toBe(true);

    client.markCounted(SITE_UV_TARGET, NOW);
    expect(state.writes).toEqual([{ 'site-uv': NOW }]);
    expect(client.shouldCount(SITE_UV_TARGET, NOW)).toBe(false);
    expect(client.shouldCount(SITE_UV_TARGET, NOW + DAY)).toBe(true);
    expect(client.shouldCount(SITE_UV_TARGET, NOW + DAY - 1)).toBe(false);
  });

  it('treats unreadable or malformed storage as empty', () => {
    const cases = harness();
    cases.state.flags = '{broken';
    expect(cases.client.shouldCount(SITE_UV_TARGET, NOW)).toBe(true);

    cases.state.flags = { 'site-uv': 'yesterday' };
    expect(cases.client.shouldCount(SITE_UV_TARGET, NOW)).toBe(true);

    const throwing = createKounterClient({
      serverUrl: 'https://kounter.example',
      storage: {
        read: () => {
          throw new Error('storage denied');
        },
        write: () => {
          throw new Error('storage denied');
        },
      },
      fetch: vi.fn(async () => new Response('{}', { status: 200 })),
    });
    expect(throwing.shouldCount(SITE_UV_TARGET, NOW)).toBe(true);
    expect(() => throwing.markCounted(SITE_UV_TARGET, NOW)).not.toThrow();
  });
});

describe('getSiteStats', () => {
  it('reads counters, marks UV, then increments both targets', async () => {
    const { client, fetchMock, state } = harness(readResponse);
    await expect(client.getSiteStats('www.example.com')).resolves.toEqual({
      pv: 101,
      uv: 31,
    });

    const postCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(postCalls).toHaveLength(1);
    expect(jsonBody(postCalls[0][1])).toEqual({
      action: 'batch_inc',
      requests: [{ target: SITE_PV_TARGET }, { target: SITE_UV_TARGET }],
    });
    expect(state.writes).toEqual([{ 'site-uv': expect.any(Number) }]);
    // UV must be persisted before the increment request is issued.
    expect(state.events.indexOf('write')).toBeGreaterThanOrEqual(0);
    expect(state.events.indexOf('write')).toBeLessThan(state.events.indexOf('post'));
  });

  it('caches the module promise per client', async () => {
    const { client, fetchMock } = harness(readResponse);
    const first = client.getSiteStats('www.example.com');
    const second = client.getSiteStats('www.example.com');
    expect(second).toBe(first);
    await expect(first).resolves.toEqual({ pv: 101, uv: 31 });
    await expect(second).resolves.toEqual({ pv: 101, uv: 31 });
    expect(fetchMock).toHaveBeenCalledTimes(3); // GET pv + GET uv + POST
  });

  it('does not share the cache between clients', async () => {
    const one = harness(readResponse);
    const two = harness(readResponse);
    await one.client.getSiteStats('www.example.com');
    await two.client.getSiteStats('www.example.com');
    expect(one.fetchMock).toHaveBeenCalledTimes(3);
    expect(two.fetchMock).toHaveBeenCalledTimes(3);
  });

  it('increments only PV when UV was counted within 24h', async () => {
    const { client, fetchMock, state } = harness(readResponse);
    state.flags = { 'site-uv': Date.now() - 1000 };

    await expect(client.getSiteStats('www.example.com')).resolves.toEqual({
      pv: 101,
      uv: 30,
    });
    expect(state.writes).toEqual([]);

    const postCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(jsonBody(postCalls[0][1])).toEqual({
      action: 'batch_inc',
      requests: [{ target: SITE_PV_TARGET }],
    });
  });

  it('counts UV again exactly at the 24h boundary', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { client, state } = harness(readResponse);
    state.flags = { 'site-uv': NOW - FLAG_WINDOW_MS };

    await expect(client.getSiteStats('www.example.com')).resolves.toEqual({
      pv: 101,
      uv: 31,
    });
    expect(state.writes).toEqual([{ 'site-uv': NOW }]);
  });

  it('stays read-only on localhost without touching storage', async () => {
    const { client, fetchMock, state } = harness(() => ({
      body: { code: 0, data: { time: 10 } },
    }));
    await expect(client.getSiteStats('localhost')).resolves.toEqual({ pv: 10, uv: 10 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([, init]) => init === undefined)).toBe(true);
    expect(state.events).not.toContain('read');
    expect(state.writes).toEqual([]);
  });

  it('still reports the optimistic +1 when the increment fails', async () => {
    const { client, state } = harness((_url, init) =>
      init?.method === 'POST' ? { throws: true } : { body: { code: 0, data: { time: 10 } } },
    );
    await expect(client.getSiteStats('www.example.com')).resolves.toEqual({
      pv: 11,
      uv: 11,
    });
    // The UV mark is written before the failing request, avoiding repeat counts.
    expect(state.writes).toHaveLength(1);
    expect(state.events.indexOf('write')).toBeLessThan(state.events.indexOf('post'));
  });
});
