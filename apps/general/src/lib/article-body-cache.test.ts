import { describe, expect, it, vi, beforeEach, afterEach } from 'vite-plus/test';

describe('article-body-cache', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<div data-article-fragment><p>body</p></div>'),
      }),
    );
    vi.stubGlobal(
      'DOMParser',
      class {
        parseFromString() {
          return {
            querySelector: () => ({ innerHTML: '<p>body</p>' }),
          };
        }
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function loadModule() {
    vi.resetModules();
    const mod = await import('@/lib/article-body-cache');
    return mod;
  }

  it('promoted reads form an LRU cache with a limit of 3', async () => {
    const { loadArticleBody } = await loadModule();

    await loadArticleBody('a');
    await loadArticleBody('b');
    await loadArticleBody('c');

    // Re-reading a should not fetch again.
    await loadArticleBody('a');

    // Loading a fourth promoted article evicts the least-recently read.
    await loadArticleBody('d');

    const fetch = vi.mocked(globalThis.fetch);
    expect(fetch).toHaveBeenCalledTimes(4);

    // 'b' was the least recently read after a was re-promoted.
    await loadArticleBody('b');
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it('promote=false prefetch only evicts stale prefetches, not promoted reads', async () => {
    const { loadArticleBody, prefetchArticleBody } = await loadModule();

    // Fill the cache with promoted read entries.
    await loadArticleBody('a');
    await loadArticleBody('b');
    await loadArticleBody('c');

    // Prefetch a new slug with promote=false while the cache is full.
    prefetchArticleBody('d');

    // Give the prefetch queue time to drain (mock fetch resolves immediately).
    await new Promise((resolve) => setTimeout(resolve, 0));

    // All three promoted reads should still be cached, so re-reading them
    // should not trigger additional network requests.
    await loadArticleBody('a');
    await loadArticleBody('b');
    await loadArticleBody('c');

    const fetch = vi.mocked(globalThis.fetch);
    // One extra fetch for the prefetch, but no refetches for a/b/c.
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('reuses an in-flight request when the same slug is requested twice', async () => {
    const { loadArticleBody } = await loadModule();

    const [first, second] = await Promise.all([loadArticleBody('a'), loadArticleBody('a')]);

    expect(first).toBe(second);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
  });

  it('网络请求超过 10s 超时后 reject（调用方据此进入错误态）', async () => {
    // fetch 永不返回：只验证超时路径。
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    const { loadArticleBody } = await loadModule();

    vi.useFakeTimers();
    try {
      const promise = loadArticleBody('slow');
      const assertion = expect(promise).rejects.toThrow(/timed out/i);
      await vi.advanceTimersByTimeAsync(10_100);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('已缓存正文不走网络也不受超时影响', async () => {
    const { loadArticleBody } = await loadModule();
    await loadArticleBody('a');

    vi.useFakeTimers();
    try {
      const promise = loadArticleBody('a');
      await vi.advanceTimersByTimeAsync(30_000);
      await expect(promise).resolves.toBe('<p>body</p>');
    } finally {
      vi.useRealTimers();
    }
  });
});
