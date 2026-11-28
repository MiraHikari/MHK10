import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

const subscriptions = vi.hoisted(() => ({ cleanup: [] as (() => void)[] }));

// Exercise the subscribed store without mounting a component in Node.
vi.mock('react', () => ({
  useSyncExternalStore: (
    subscribe: (listener: () => void) => () => void,
    getSnapshot: () => unknown,
  ) => {
    subscriptions.cleanup.push(subscribe(() => {}));
    return getSnapshot();
  },
}));

async function fixture(
  options: {
    enabled?: boolean;
    width?: number;
    pathname?: string;
    coarse?: boolean;
    stored?: string;
    answered?: boolean;
    connection?: { saveData?: boolean; effectiveType?: string };
  } = {},
) {
  vi.resetModules();
  vi.stubEnv('PUBLIC_DESK_URL', options.enabled === false ? '' : 'https://desk.example');
  const local = new Map<string, string>();
  const session = new Map<string, string>();
  if (options.stored) local.set('mirahikari-portfolio:pref:display-mode', options.stored);
  if (options.answered) session.set('mirahikari-portfolio:ui:desktop-offer', '1');
  const dataset: Record<string, string> = {};
  const storage = (values: Map<string, string>) => ({
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  const host = Object.assign(new EventTarget(), {
    innerWidth: options.width ?? 1440,
    location: { pathname: options.pathname ?? '/' },
    localStorage: storage(local),
    sessionStorage: storage(session),
    matchMedia: (query: string) => ({
      matches: query.includes('coarse') ? options.coarse === true : options.coarse !== true,
    }),
  });
  vi.stubGlobal('window', host);
  vi.stubGlobal('navigator', { connection: options.connection });
  vi.stubGlobal('document', {
    documentElement: { dataset },
    head: { querySelector: () => null },
  });
  const offer = await import('./useDesktopOffer');
  const mode = await import('./useDisplayMode');
  const entry = await import('./useDisplayModeEntry');
  return { offer, mode, entry, host, local, session };
}

afterEach(() => {
  subscriptions.cleanup.forEach((unsubscribe) => unsubscribe());
  subscriptions.cleanup = [];
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Desktop recommendation store', () => {
  it('shows an explicit offer while leaving the general site selected', async () => {
    const c = await fixture();
    expect(c.offer.useDesktopOffer().state).toBe('offer');
    expect(c.mode.getDisplayMode()).toBe('classic');
    expect(c.local.size).toBe(0);
    c.offer.dismissDesktopOffer();
    expect(c.offer.useDesktopOffer().state).toBe('hidden');
    expect(c.session.get('mirahikari-portfolio:ui:desktop-offer')).toBe('1');
    expect(c.mode.getDisplayMode()).toBe('classic');
  });

  it('enters and remembers the desktop only after accepting', async () => {
    const c = await fixture();
    expect(c.offer.useDesktopOffer().state).toBe('offer');
    c.offer.acceptDesktopOffer();
    expect(c.offer.useDesktopOffer().state).toBe('offer');
    expect(c.mode.getDisplayMode()).toBe('win95');
    expect(c.local.get('mirahikari-portfolio:pref:display-mode')).toBe('win95');
    c.mode.commitDisplayMode('win95');
    expect(c.offer.useDesktopOffer().state).toBe('hidden');
  });

  it('keeps the original recommendation available after a cancelled connection', async () => {
    const c = await fixture();
    expect(c.offer.useDesktopOffer().state).toBe('offer');
    c.offer.acceptDesktopOffer();
    c.mode.setDisplayMode('classic');
    c.mode.commitDisplayMode('classic');
    expect(c.offer.useDesktopOffer().state).toBe('offer');
    expect(c.local.get('mirahikari-portfolio:pref:display-mode')).toBe('classic');
  });

  it.each([
    { width: 900 },
    { connection: { saveData: true } },
    { connection: { effectiveType: '2g' } },
    { connection: { effectiveType: 'slow-2g' } },
  ])('uses a dismissible hint for narrow or metered entry %j', async (options) => {
    const c = await fixture(options);
    expect(c.offer.useDesktopOffer().state).toBe('hint');
    expect(c.mode.getDisplayMode()).toBe('classic');
    c.offer.dismissDesktopHint();
    expect(c.offer.useDesktopOffer().state).toBe('hidden');
    expect(c.session.get('mirahikari-portfolio:ui:desktop-hint')).toBe('1');
  });

  it('keeps the hint on a phone, where the viewport is not desktop-class', async () => {
    const c = await fixture({ width: 390, coarse: true });
    expect(c.offer.useDesktopOffer().state).toBe('hint');
    expect(c.mode.getDisplayMode()).toBe('classic');
    c.offer.dismissDesktopHint();
    expect(c.offer.useDesktopOffer().state).toBe('hidden');
    expect(c.session.get('mirahikari-portfolio:ui:desktop-hint')).toBe('1');
  });

  it.each([
    { enabled: false },
    { pathname: '/blog/colophon/' },
    { stored: 'classic' },
    { stored: 'win95' },
    { answered: true },
  ])('does not recommend over an existing choice or deep link %j', async (options) => {
    const c = await fixture(options);
    expect(c.offer.useDesktopOffer().state).toBe('hidden');
  });

  it('uses the phone entry check if a visitor resizes before accepting the offer', async () => {
    const c = await fixture();
    expect(c.offer.useDesktopOffer().state).toBe('offer');
    c.host.innerWidth = 390;
    c.offer.acceptDesktopOffer();
    expect(c.entry.useDesktopEntryNotice().open).toBe(true);
    expect(c.mode.getDisplayMode()).toBe('classic');
    c.entry.confirmDesktopEntry();
    expect(c.mode.getDisplayMode()).toBe('win95');
  });

  it.each([{ width: 1440 }, { width: 390, coarse: true }])(
    'closes the offer or hint when another entry selects the desktop %j',
    async (options) => {
      const c = await fixture(options);
      expect(c.offer.useDesktopOffer().state).not.toBe('hidden');
      c.mode.setDisplayMode('win95');
      c.mode.setDisplayMode('classic');
      expect(c.offer.useDesktopOffer().state).toBe('hidden');
    },
  );
});
