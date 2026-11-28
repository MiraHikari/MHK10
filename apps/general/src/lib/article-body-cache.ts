const ARTICLE_BODY_CACHE_LIMIT = 3;
const PREFETCH_CONCURRENCY_LIMIT = 2;
const PREFETCH_QUEUE_LIMIT = 3;
/** 正文请求超时：超过即 reject，由调用方（ArticleView）进入错误态。 */
const ARTICLE_BODY_TIMEOUT_MS = 10000;

interface CachedBody {
  html: string;
  priority: number;
}

interface PendingBody {
  promise: Promise<string>;
  promote: boolean;
}

const bodyCache = new Map<string, CachedBody>();
const pendingBodies = new Map<string, PendingBody>();
const prefetchQueue: string[] = [];
const queuedPrefetches = new Set<string>();
let cachePriority = 0;
let activePrefetches = 0;

function articleFragmentPath(slug: string): string {
  const segments = slug.split('/').filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error(`Invalid article slug: ${slug}`);
  }

  return `/article-fragments/${segments.map(encodeURIComponent).join('/')}/`;
}

function readCachedBody(slug: string): string | undefined {
  const cached = bodyCache.get(slug);
  if (!cached) return undefined;

  cached.priority = ++cachePriority;
  return cached.html;
}

function rememberBody(slug: string, html: string, promote: boolean): string {
  const existing = bodyCache.get(slug);
  // Prefetches should not evict articles the user is actively reading.
  // When promote=false and the cache is full, only evict a previously
  // prefetched entry (priority === 0). If no stale prefetch exists, drop
  // the new body so promoted reads keep their three slots.
  if (!promote && !existing && bodyCache.size >= ARTICLE_BODY_CACHE_LIMIT) {
    const stalePrefetch = [...bodyCache].find(([, entry]) => entry.priority === 0)?.[0];
    if (!stalePrefetch) return html;
    bodyCache.delete(stalePrefetch);
  }

  bodyCache.set(slug, {
    html,
    priority: promote ? ++cachePriority : (existing?.priority ?? 0),
  });

  while (bodyCache.size > ARTICLE_BODY_CACHE_LIMIT) {
    let evictionSlug: string | undefined;
    let evictionPriority = Number.POSITIVE_INFINITY;
    for (const [candidateSlug, candidate] of bodyCache) {
      if (candidate.priority < evictionPriority && candidateSlug !== slug) {
        evictionSlug = candidateSlug;
        evictionPriority = candidate.priority;
      }
    }
    if (!evictionSlug) break;
    bodyCache.delete(evictionSlug);
  }

  return html;
}

function extractArticleBody(responseText: string): string {
  const documentNode = new DOMParser().parseFromString(responseText, 'text/html');
  const fragment = documentNode.querySelector<HTMLElement>('[data-article-fragment]');
  if (!fragment) {
    throw new Error('Article fragment response did not contain an article body.');
  }
  return fragment.innerHTML.trim();
}

function startArticleRequest(slug: string, promote: boolean): Promise<string> {
  const existing = pendingBodies.get(slug);
  if (existing) {
    existing.promote ||= promote;
    return existing.promise;
  }

  const pending: PendingBody = {
    promote,
    promise: Promise.resolve(''),
  };
  const request = fetch(articleFragmentPath(slug), {
    credentials: 'same-origin',
    headers: { Accept: 'text/html' },
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Article fragment request failed with ${response.status}.`);
      }
      return extractArticleBody(await response.text());
    })
    .then((html) => rememberBody(slug, html, pending.promote))
    .finally(() => {
      pendingBodies.delete(slug);
    });

  pending.promise = request;
  pendingBodies.set(slug, pending);
  return request;
}

function removeQueuedPrefetch(slug: string): void {
  if (!queuedPrefetches.delete(slug)) return;
  const index = prefetchQueue.indexOf(slug);
  if (index >= 0) prefetchQueue.splice(index, 1);
}

function drainPrefetchQueue(): void {
  while (activePrefetches < PREFETCH_CONCURRENCY_LIMIT && prefetchQueue.length > 0) {
    const slug = prefetchQueue.shift();
    if (!slug) return;
    queuedPrefetches.delete(slug);
    if (bodyCache.has(slug) || pendingBodies.has(slug)) continue;

    activePrefetches += 1;
    void startArticleRequest(slug, false)
      .catch(() => undefined) // 预取失败静默：下次读取仍会走 loadArticleBody 全链路重试
      .finally(() => {
        activePrefetches -= 1;
        drainPrefetchQueue();
      });
  }
}

/**
 * 给网络请求加超时：超时后 reject（底层请求继续在后台完成并进缓存，
 * 下次读取仍可命中）。只包在 promoted 读取路径上，预取不设时限。
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(
      () => reject(new Error(`Article body request timed out after ${ms}ms.`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

/**
 * Load one article body for reading. In-flight prefetches are promoted, while
 * only the three most recently read bodies remain in memory.
 */
export function loadArticleBody(slug: string): Promise<string> {
  const cached = readCachedBody(slug);
  if (cached !== undefined) return Promise.resolve(cached);

  removeQueuedPrefetch(slug);
  return withTimeout(startArticleRequest(slug, true), ARTICLE_BODY_TIMEOUT_MS);
}

/**
 * Warm likely next articles with a two-request concurrency limit and a short
 * latest-intent queue. Prefetch completion alone never outranks a read entry.
 */
export function prefetchArticleBody(slug: string): void {
  if (bodyCache.has(slug) || pendingBodies.has(slug) || queuedPrefetches.has(slug)) return;

  if (prefetchQueue.length >= PREFETCH_QUEUE_LIMIT) {
    const staleSlug = prefetchQueue.shift();
    if (staleSlug) queuedPrefetches.delete(staleSlug);
  }
  prefetchQueue.push(slug);
  queuedPrefetches.add(slug);
  drainPrefetchQueue();
}
