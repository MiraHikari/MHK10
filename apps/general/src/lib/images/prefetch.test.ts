import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const created: string[] = [];
const mockImages: MockImage[] = [];

class MockImage {
  decoding = '';
  #src = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  set src(value: string) {
    this.#src = value;
    created.push(value);
    mockImages.push(this);
  }

  get src() {
    return this.#src;
  }

  complete(success = true) {
    if (success) this.onload?.();
    else this.onerror?.();
  }
}

async function loadModule() {
  return import('@/lib/images/prefetch');
}

beforeEach(() => {
  vi.resetModules();
  created.length = 0;
  mockImages.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('prefetchImage', () => {
  it('SSR 环境（无 window）为空操作', async () => {
    const { prefetchImage } = await loadModule();
    expect(() => prefetchImage('/images/gallery/a.webp')).not.toThrow();
    expect(created).toEqual([]);
  });

  it('构造 Image 预取解析后的 URL', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('Image', MockImage);
    vi.stubGlobal('navigator', { connection: { saveData: false } });
    const { prefetchImage } = await loadModule();
    prefetchImage('/images/gallery/a.webp');
    expect(created).toEqual(['/images/gallery/a.webp']);
  });

  it('同一 URL 去重，仅预取一次', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('Image', MockImage);
    vi.stubGlobal('navigator', { connection: { saveData: false } });
    const { prefetchImage } = await loadModule();
    prefetchImage('/images/a.webp');
    prefetchImage('/images/a.webp');
    prefetchImage('/images/b.webp');
    expect(created).toEqual(['/images/a.webp', '/images/b.webp']);
  });

  it('空输入不触发预取', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('Image', MockImage);
    vi.stubGlobal('navigator', { connection: { saveData: false } });
    const { prefetchImage } = await loadModule();
    prefetchImage('');
    prefetchImage(null);
    prefetchImage(undefined);
    expect(created).toEqual([]);
  });

  it('省流模式下 prefetchImage 不创建 Image', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('Image', MockImage);
    vi.stubGlobal('navigator', { connection: { saveData: true } });
    const { prefetchImage, shouldConserveData } = await loadModule();
    expect(shouldConserveData()).toBe(true);
    prefetchImage('/images/a.webp');
    expect(created).toEqual([]);
  });

  it.each(['2g', 'slow-2g'])('%s 弱网下 prefetchImage 不创建 Image', async (effectiveType) => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('Image', MockImage);
    vi.stubGlobal('navigator', { connection: { effectiveType } });
    const { prefetchImage, shouldConserveData } = await loadModule();
    expect(shouldConserveData()).toBe(true);
    prefetchImage('/images/a.webp');
    expect(created).toEqual([]);
  });
});

describe('shouldRenderEager', () => {
  it('默认网络下返回 true（eager 渲染）', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', {});
    const { shouldRenderEager } = await loadModule();
    expect(shouldRenderEager()).toBe(true);
  });

  it('省流模式下返回 false（降为 lazy 渲染）', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', { connection: { saveData: true } });
    const { shouldRenderEager } = await loadModule();
    expect(shouldRenderEager()).toBe(false);
  });

  it('2G 弱网下返回 false（降为 lazy 渲染）', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', { connection: { effectiveType: '2g' } });
    const { shouldRenderEager } = await loadModule();
    expect(shouldRenderEager()).toBe(false);
  });

  it('SSR 环境（无 navigator）返回 false', async () => {
    vi.stubGlobal('navigator', undefined);
    const { shouldRenderEager } = await loadModule();
    expect(shouldRenderEager()).toBe(false);
  });
});

describe('prefetchImagesOnIdle', () => {
  it('省流模式下不调度', async () => {
    const ric = vi.fn();
    vi.stubGlobal('window', { requestIdleCallback: ric });
    vi.stubGlobal('navigator', { connection: { saveData: true } });
    vi.stubGlobal('Image', MockImage);
    const { prefetchImagesOnIdle } = await loadModule();
    const cancel = prefetchImagesOnIdle(['/images/a.webp']);
    expect(cancel).toBeUndefined();
    expect(ric).not.toHaveBeenCalled();
    expect(created).toEqual([]);
  });

  it('2G 弱网下不调度', async () => {
    const ric = vi.fn();
    vi.stubGlobal('window', { requestIdleCallback: ric });
    vi.stubGlobal('navigator', { connection: { effectiveType: '2g' } });
    const { prefetchImagesOnIdle } = await loadModule();
    expect(prefetchImagesOnIdle(['/images/a.webp'])).toBeUndefined();
    expect(ric).not.toHaveBeenCalled();
  });

  it('优先走 requestIdleCallback，取消函数生效', async () => {
    const cancelIdleCallback = vi.fn();
    const requestIdleCallback = vi.fn((cb: () => void) => {
      cb();
      return 42;
    });
    vi.stubGlobal('window', { requestIdleCallback, cancelIdleCallback });
    vi.stubGlobal('navigator', { connection: { saveData: false } });
    vi.stubGlobal('Image', MockImage);
    const { prefetchImagesOnIdle } = await loadModule();
    const cancel = prefetchImagesOnIdle(['/images/a.webp'], 1500);
    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 1500,
    });
    expect(created).toEqual(['/images/a.webp']);
    cancel?.();
    expect(cancelIdleCallback).toHaveBeenCalledWith(42);
  });

  it('无 requestIdleCallback 时降级 setTimeout', async () => {
    const setTimeoutSpy = vi.fn(() => 7);
    const clearTimeoutSpy = vi.fn();
    vi.stubGlobal('window', {
      setTimeout: setTimeoutSpy,
      clearTimeout: clearTimeoutSpy,
    });
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('Image', MockImage);
    const { prefetchImagesOnIdle } = await loadModule();
    const cancel = prefetchImagesOnIdle(['/images/a.webp']);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 300);
    cancel?.();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(7);
  });

  it('并发上限为 2 时不同时发起超过 2 个请求', async () => {
    const requestIdleCallback = vi.fn((cb: () => void) => {
      cb();
      return 42;
    });
    vi.stubGlobal('window', { requestIdleCallback });
    vi.stubGlobal('navigator', { connection: { saveData: false } });
    vi.stubGlobal('Image', MockImage);
    const { prefetchImagesOnIdle } = await loadModule();

    prefetchImagesOnIdle(
      ['/images/1.webp', '/images/2.webp', '/images/3.webp', '/images/4.webp'],
      2000,
      2,
    );

    expect(mockImages.length).toBe(2);
    expect(mockImages.map((img) => img.src)).toEqual(['/images/1.webp', '/images/2.webp']);

    mockImages[0].complete();
    expect(mockImages.length).toBe(3);
    expect(mockImages[2].src).toBe('/images/3.webp');

    mockImages[1].complete();
    expect(mockImages.length).toBe(4);
    expect(mockImages[3].src).toBe('/images/4.webp');

    mockImages[2].complete();
    mockImages[3].complete();
    expect(mockImages.length).toBe(4);
  });

  it('取消后不再启动新的加载', async () => {
    const cancelIdleCallback = vi.fn();
    const requestIdleCallback = vi.fn((cb: () => void) => {
      cb();
      return 42;
    });
    vi.stubGlobal('window', { requestIdleCallback, cancelIdleCallback });
    vi.stubGlobal('navigator', { connection: { saveData: false } });
    vi.stubGlobal('Image', MockImage);
    const { prefetchImagesOnIdle } = await loadModule();

    const cancel = prefetchImagesOnIdle(
      ['/images/1.webp', '/images/2.webp', '/images/3.webp'],
      2000,
      1,
    );

    expect(mockImages.length).toBe(1);
    expect(mockImages[0].src).toBe('/images/1.webp');

    cancel?.();
    mockImages[0].complete();
    expect(mockImages.length).toBe(1);
  });
});
