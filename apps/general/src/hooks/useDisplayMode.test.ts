import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

async function load(enabled: boolean, deployment?: string) {
  vi.resetModules();
  vi.stubEnv('PUBLIC_DESK_URL', deployment ?? (enabled ? 'https://desk.example' : ''));
  const dataset: Record<string, string> = {};
  const favicons = {
    icon: { href: '/favicon.webp?v=classic' },
    apple: { href: '/favicon-180.png?v=classic' },
  };
  const records = new Map<string, string>();
  const window = Object.assign(new EventTarget(), {
    localStorage: {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => {
        records.set(key, value);
      },
      removeItem: (key: string) => {
        records.delete(key);
      },
    },
  });
  vi.stubGlobal('document', {
    documentElement: { dataset },
    head: {
      querySelector: (selector: string) =>
        selector.includes('"apple"') ? favicons.apple : favicons.icon,
    },
  });
  vi.stubGlobal('window', window);
  const module = await import('./useDisplayMode');
  return { module, dataset, records, window, favicons };
}

const DISPLAY_MODE_KEY = 'mirahikari-portfolio:pref:display-mode';

describe('display mode store', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });
  it('hydrates lazily from the pre-hydration dataset', async () => {
    const { module, dataset } = await load(true);
    dataset.displayTarget = 'win95';
    expect(module.getDisplayMode()).toBe('win95');
    expect(module.getVisibleDisplayMode()).toBe('classic');
    expect(module.DESK_EMBED_ENABLED).toBe(true);
  });
  it('bypasses the desktop entirely when PUBLIC_DESK_URL is not configured', async () => {
    const { module, dataset } = await load(false);
    dataset.displayTarget = 'win95';
    expect(module.DESK_EMBED_ENABLED).toBe(false);
    expect(module.getDisplayMode()).toBe('classic');
    module.setDisplayMode('win95');
    expect(module.getDisplayMode()).toBe('classic');
  });
  it('signals content readiness once with PUBLIC_DESK_URL unset', async () => {
    const { module, window } = await load(false);
    const ready = vi.fn();
    window.addEventListener('portfolio:boot-ready', ready);
    module.markBootReady();
    module.markBootReady();
    expect(ready).toHaveBeenCalledOnce();
  });
  it.each(['not a URL', 'http://desk.example', 'https://username:secret@desk.example'])(
    'bypasses invalid deployment %s even with a saved desktop choice',
    async (deployment) => {
      const { module, dataset, records } = await load(true, deployment);
      records.set(DISPLAY_MODE_KEY, 'win95');
      dataset.displayTarget = 'win95';
      expect(module.PUBLIC_DESK_URL).toBe('');
      expect(module.DESK_EMBED_ENABLED).toBe(false);
      expect(module.getDisplayMode()).toBe('classic');
      module.setDisplayMode('win95');
      expect(module.getDisplayMode()).toBe('classic');
      expect(module.getVisibleDisplayMode()).toBe('classic');
      expect(records.get(DISPLAY_MODE_KEY)).toBe('win95');
    },
  );
  it('keeps the prepainted desktop favicon through boot and follows an explicit return', async () => {
    const { module, dataset, favicons } = await load(true);
    dataset.displayTarget = 'win95';
    favicons.icon.href = '/favicon-pixel-32.png?v=win95';
    favicons.apple.href = '/favicon-pixel-180.png?v=win95';

    module.markBootReady();
    expect(module.getVisibleDisplayMode()).toBe('classic');
    expect(favicons.icon.href).toBe('/favicon-pixel-32.png?v=win95');
    expect(favicons.apple.href).toBe('/favicon-pixel-180.png?v=win95');

    module.commitDisplayMode('win95');
    expect(favicons.icon.href).toBe('/favicon-pixel-32.png?v=win95');
    module.setDisplayMode('classic');
    expect(favicons.icon.href).toBe('/favicon.webp?v=classic');
    expect(favicons.apple.href).toBe('/favicon-180.png?v=classic');
  });
  it('persists an explicit choice and keeps the target in sync when committing', async () => {
    const { module, dataset, records } = await load(true);
    dataset.displayTarget = 'classic';
    expect(module.getDisplayMode()).toBe('classic');
    module.setDisplayMode('win95');
    expect(module.getDisplayMode()).toBe('win95');
    expect(dataset.displayTarget).toBe('win95');
    expect(records.get(DISPLAY_MODE_KEY)).toBe('win95');
    // Readiness is what reveals the presentation; the target alone does not.
    // The controller publishes both datasets, so the visible signal stays
    // classic rather than becoming win95.
    expect(dataset.displayMode).toBe('classic');
    module.commitDisplayMode('win95');
    expect(dataset.displayMode).toBe('win95');
    expect(module.getVisibleDisplayMode()).toBe('win95');
    module.setDisplayMode('classic');
    expect(records.get(DISPLAY_MODE_KEY)).toBe('classic');
    module.commitDisplayMode('classic');
    expect(module.getVisibleDisplayMode()).toBe('classic');
  });
  it('honors persist:false for session-only transitions', async () => {
    const { module, dataset, records } = await load(true);
    dataset.displayTarget = 'classic';
    module.setDisplayMode('win95', { persist: false });
    expect(module.getDisplayMode()).toBe('win95');
    expect(records.has(DISPLAY_MODE_KEY)).toBe(false);
  });
  it('never reveals a desktop whose target was abandoned', async () => {
    const { module, dataset } = await load(true);
    dataset.displayTarget = 'win95';
    expect(module.getDisplayMode()).toBe('win95');
    module.setDisplayMode('classic');
    module.commitDisplayMode('win95');
    expect(dataset.displayMode).not.toBe('win95');
    expect(module.getVisibleDisplayMode()).toBe('classic');
  });
  it('keeps the target signal consistent when committing a completed state again', async () => {
    const { module, dataset } = await load(true);
    dataset.displayTarget = 'win95';
    expect(module.getDisplayMode()).toBe('win95');
    module.commitDisplayMode('classic');
    expect(dataset.displayMode).toBe('classic');
    // Simulate a stale DOM target; a no-op commit repairs it from the store.
    dataset.displayTarget = 'classic';
    module.commitDisplayMode('classic');
    expect(dataset.displayTarget).toBe('win95');
  });
  it('falls back to the general site without overwriting the stored preference', async () => {
    const { module, dataset, records } = await load(true);
    dataset.displayTarget = 'win95';
    records.set(DISPLAY_MODE_KEY, 'win95');
    module.setDisplayMode('win95', { persist: false });
    module.failDisplayMode();
    expect(module.getDisplayMode()).toBe('classic');
    expect(module.getVisibleDisplayMode()).toBe('classic');
    expect(records.get(DISPLAY_MODE_KEY)).toBe('win95');
  });
  it('releases the boot mask exactly once across mark and failure paths', async () => {
    const { module, dataset, window } = await load(true);
    dataset.displayTarget = 'win95';
    let readyEvents = 0;
    window.addEventListener('portfolio:boot-ready', () => {
      readyEvents++;
    });
    module.markBootReady();
    module.markBootReady();
    module.failDisplayMode();
    expect(readyEvents).toBe(1);
  });
  it('releases the boot mask once when a failure arrives first', async () => {
    const { module, dataset, window } = await load(true);
    dataset.displayTarget = 'win95';
    let readyEvents = 0;
    window.addEventListener('portfolio:boot-ready', () => {
      readyEvents++;
    });
    module.failDisplayMode();
    module.markBootReady();
    expect(readyEvents).toBe(1);
  });
  it('flushes reading only for a real target change', async () => {
    const { module, dataset, window } = await load(true);
    dataset.displayTarget = 'classic';
    let flushes = 0;
    window.addEventListener('mhk-fusion:flush-reading', () => {
      flushes++;
    });
    module.setDisplayMode('classic');
    expect(flushes).toBe(0);
    module.setDisplayMode('win95');
    expect(flushes).toBe(1);
    module.setDisplayMode('win95');
    expect(flushes).toBe(1);
    expect(dataset.displayTarget).toBe('win95');
  });
});
