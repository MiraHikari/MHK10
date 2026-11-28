import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite-plus';
import type { MediaRecord } from '../../src/data/media';
import type { mountHybridUi } from '../../src/lib/ui/browser/hybrid-ui';
import type { mountImageBrowser } from '../../src/lib/apps/acdsee/image-browser';
import type { mountPersonalProperties } from '../../src/lib/apps/profile/personal-properties';
import type { mountReader } from '../../src/lib/apps/reader/reader';
import type { mountSkillBrowser } from '../../src/lib/apps/skills/skill-browser';
import type { NativeFileResult } from '../../src/lib/os/files/native-file-bridge';
import type { SkillCategory } from '../../src/lib/apps/skills/skill-browser-model';

const clients = {
  Reader: {
    route: '/blog/colophon/',
    selector: '#microsoft-reader',
    module: 'apps/reader/reader.ts',
    mount: 'mountReader',
    resources: { observers: 1, messages: 0, urls: 0 },
  },
  ACDSee: {
    route: '/acdsee/',
    selector: '#image-browser',
    module: 'apps/acdsee/image-browser.ts',
    mount: 'mountImageBrowser',
    resources: { observers: 1, messages: 0, urls: 0 },
  },
  Profile: {
    route: '/about/',
    selector: '[data-personal-properties]',
    module: 'apps/profile/personal-properties.ts',
    mount: 'mountPersonalProperties',
    resources: { observers: 0, messages: 0, urls: 0 },
  },
  'Device Manager': {
    route: '/skills/',
    selector: '#skill-manager',
    module: 'apps/skills/skill-browser.ts',
    mount: 'mountSkillBrowser',
    resources: { observers: 0, messages: 0, urls: 0 },
  },
} as const;
type Client = keyof typeof clients;

declare global {
  interface Window {
    BrowserSessions: {
      mountReader: typeof mountReader;
      mountImageBrowser: typeof mountImageBrowser;
      mountHybridUi: typeof mountHybridUi;
      mountPersonalProperties: typeof mountPersonalProperties;
      mountSkillBrowser: typeof mountSkillBrowser;
      skillGroups: readonly SkillCategory[];
    };
    browserSession: { mount(): () => void; dispose?: () => void };
    browserResources: {
      observers: Set<ResizeObserver>;
      observersCreated: number;
      messages: Set<EventListenerOrEventListenerObject>;
      urls: Set<string>;
      urlsCreated: number;
      failObserve: boolean;
    };
    pendingImageWork: { ready: boolean; closed: number; release(): void };
    pendingProfileCopy: { values: string[]; settle(): void };
    capturedImagePointer?: number;
    slideshowTicks: number;
    hybridResources: { observers: number; listeners: number; observeCalls: number };
    readerWork: { releaseRead(): void; saveResult: 'cancelled' | 'failed' | 'session' };
  }
}

const sampleUrl = '/images/previews/profile/avatar.png';
const records: MediaRecord[] = ['First', 'Second'].map((name, index) => ({
  id: `session-image-${index + 1}`,
  title: `${name} image`,
  alt: `${name} image`,
  preview: sampleUrl,
  display: sampleUrl,
  original: sampleUrl,
  date: '2026-10-10',
  folders: ['Profile'],
  image: { width: 96, height: 96, bytes: 3652, format: 'PNG' },
}));
let bundle: Promise<string> | undefined;

function clientBundle(): Promise<string> {
  return (bundle ??= (async () => {
    const entry = 'virtual:browser-sessions';
    const source = [
      ...Object.values(clients).map((client) => [client.module, client.mount]),
      ['ui/browser/hybrid-ui.ts', 'mountHybridUi'],
    ]
      .map(([name, mount]) => {
        const path = fileURLToPath(new URL(`../../src/lib/${name}`, import.meta.url));
        return `export { ${mount} } from ${JSON.stringify(path.replaceAll('\\', '/'))};`;
      })
      .concat(
        `export { skillGroups } from ${JSON.stringify(fileURLToPath(new URL('../../src/data/profile.ts', import.meta.url)).replaceAll('\\', '/'))};`,
      )
      .join('\n');
    const built = await build({
      configFile: false,
      logLevel: 'silent',
      plugins: [
        {
          name: 'browser-sessions',
          resolveId: (id) => (id === entry ? `\0${entry}` : undefined),
          load: (id) => (id === `\0${entry}` ? source : undefined),
        },
      ],
      build: {
        write: false,
        emptyOutDir: false,
        minify: false,
        lib: { entry, formats: ['iife'], name: 'BrowserSessions' },
        rolldownOptions: { input: entry },
      },
    });
    const output = Array.isArray(built) ? built[0] : built;
    if (!('output' in output)) throw new Error('Expected an in-memory browser client bundle');
    const script = output.output.find((item) => item.type === 'chunk');
    if (!script) throw new Error('The browser client bundle has no JavaScript');
    return script.code;
  })());
}

async function openClient(
  page: Page,
  client: Client,
  route: string = clients[client].route,
): Promise<void> {
  const { selector } = clients[client];
  const response = await page.request.get(route);
  expect(response.ok()).toBe(true);
  const html = await response.text();
  await page.route('**/__browser-session-test', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>',
    }),
  );
  await page.goto('/__browser-session-test');
  await page.evaluate(
    ({ html, client, selector }) => {
      const source = new DOMParser().parseFromString(html, 'text/html');
      source
        .querySelectorAll('script:not([type="application/json"])')
        .forEach((node) => node.remove());
      const root = source.querySelector(selector);
      if (!root) throw new Error(`Missing ${client} server-rendered root`);
      document.documentElement.className = 'is-embedded';
      document.documentElement.dataset.theme = 'std';
      for (const style of source.querySelectorAll('link[rel="stylesheet"], style'))
        document.head.append(document.importNode(style, true));
      document.body.replaceChildren(document.importNode(root, true));
    },
    { html, client, selector },
  );
  await page.addScriptTag({ content: await clientBundle() });
  await page.evaluate(
    ({ client, records, selector }) => {
      const root = document.querySelector<HTMLElement>(selector);
      if (!root) throw new Error('Missing browser client root');
      const mounts = {
        Reader: () => window.BrowserSessions.mountReader(root),
        ACDSee: () => window.BrowserSessions.mountImageBrowser(root, records),
        Profile: () => window.BrowserSessions.mountPersonalProperties(root),
        'Device Manager': () =>
          window.BrowserSessions.mountSkillBrowser(root, window.BrowserSessions.skillGroups),
      };
      window.browserSession = {
        mount: mounts[client],
      };
      const resources = (window.browserResources = {
        observers: new Set<ResizeObserver>(),
        observersCreated: 0,
        messages: new Set<EventListenerOrEventListenerObject>(),
        urls: new Set<string>(),
        urlsCreated: 0,
        failObserve: false,
      });
      window.ResizeObserver = class extends ResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          super(callback);
          resources.observers.add(this);
          resources.observersCreated++;
        }
        observe(target: Element, options?: ResizeObserverOptions): void {
          if (resources.failObserve) {
            resources.failObserve = false;
            throw new Error('Injected ResizeObserver.observe failure');
          }
          super.observe(target, options);
        }
        disconnect(): void {
          super.disconnect();
          resources.observers.delete(this);
        }
      };
      const add = EventTarget.prototype.addEventListener;
      const remove = EventTarget.prototype.removeEventListener;
      EventTarget.prototype.addEventListener = function (type, listener, options) {
        add.call(this, type, listener, options);
        if (this !== window || type !== 'message' || !listener) return;
        const signal = typeof options === 'object' ? options.signal : undefined;
        if (signal?.aborted) return;
        resources.messages.add(listener);
        if (signal)
          add.call(signal, 'abort', () => resources.messages.delete(listener), { once: true });
      };
      EventTarget.prototype.removeEventListener = function (type, listener, options) {
        remove.call(this, type, listener, options);
        if (this === window && type === 'message' && listener) resources.messages.delete(listener);
      };
      const createUrl = URL.createObjectURL.bind(URL);
      const revokeUrl = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (object) => {
        const url = createUrl(object);
        resources.urls.add(url);
        resources.urlsCreated++;
        return url;
      };
      URL.revokeObjectURL = (url) => {
        revokeUrl(url);
        resources.urls.delete(url);
      };
    },
    { client, records, selector },
  );
}

async function resourceCounts(page: Page) {
  return page.evaluate(() => ({
    observers: window.browserResources.observers.size,
    messages: window.browserResources.messages.size,
    urls: window.browserResources.urls.size,
  }));
}

async function filterProfileProjects(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Projects', exact: true }).click();
  const query = page.getByRole('searchbox', { name: 'Find projects', exact: true });
  await query.fill('Injective');
  await expect(
    page.getByRole('listbox', { name: 'Projects', exact: true }).getByRole('option'),
  ).toHaveCount(1);
  await expect(page.locator('[data-project-id="xengine"]')).toBeVisible();
  await expect(query).toBeFocused();
  await expect(query).toHaveValue('Injective');
}

const exerciseClient: Record<Client, (page: Page) => Promise<void>> = {
  Reader: async (page) => {
    await page.locator('.reader-tools [data-reader-command="note"]').click();
    await page.locator('#reader-note-text').fill('Written after remount.');
    await page.locator('[data-reader-command="save-note"]').click();
    await expect(page.locator('#reader-notes .reader-notebook-item')).toHaveCount(1);
    await expect(page.locator('#reader-notes')).toContainText('Written after remount.');
  },
  ACDSee: async (page) => {
    await expect(page.locator('#image-list [role="option"]')).toHaveCount(2);
    await expect(page.locator('#image-view')).toHaveAttribute('data-rotation', '0');
    await page.locator('.image-toolbar [data-command="next"]').click();
    await expect(page.locator('#image-title')).toHaveText('Second image');
    await page.locator('.image-toolbar [data-command="rotate-right"]').click();
    await expect(page.locator('#image-view')).toHaveAttribute('data-rotation', '90');
  },
  Profile: filterProfileProjects,
  'Device Manager': async (page) => {
    const search = page.getByRole('searchbox', { name: 'Find', exact: true });
    await search.fill('Rust');
    await search.press('Enter');
    const rust = page.getByRole('treeitem', { name: 'Rust', exact: true });
    await expect(rust).toBeFocused();
    await rust.press('ArrowLeft');
    const systems = page.locator('[data-skill-node="group:DESKTOP"]');
    await systems.press('Enter');
    await expect(systems).toHaveAttribute('aria-expanded', 'false');
    await expect(rust).toBeHidden();
    await systems.press('Enter');
    await systems.press('ArrowRight');
    await rust.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Technology Properties' })).toBeVisible();
  },
};

for (const client of Object.keys(clients) as Client[]) {
  test(`${client} rejects duplicate mounts and keeps the replacement session usable`, async ({
    page,
  }, info) => {
    await openClient(page, client);
    if (client === 'Reader')
      await expect(page.locator('.reader-tools [data-reader-command="bookmark"]')).toBeDisabled();
    const result = await page.evaluate(() => {
      const session = window.browserSession;
      const NativeImage = window.Image;
      const loads: HTMLImageElement[] = [];
      window.Image = class extends NativeImage {
        constructor(width?: number, height?: number) {
          super(width, height);
          loads.push(this);
        }
      };
      const previousDispose = session.mount();
      const duplicateError = () => {
        try {
          session.mount();
          return '';
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      };
      const duplicate = duplicateError();
      const previousImage = loads.at(-1);
      const previousLoad = previousImage?.onload;
      previousDispose();
      session.dispose = session.mount();
      const image = loads.at(-1);
      const currentLoad = image?.onload;
      // Simulate a native load callback already queued before disposal.
      if (previousImage && previousLoad) previousLoad.call(previousImage, new Event('load'));
      previousDispose();
      window.Image = NativeImage;
      return {
        duplicate,
        replacement: duplicateError(),
        loadHandlerPreserved: !image || (!!currentLoad && image.onload === currentLoad),
      };
    });
    expect(result.duplicate).toContain('active session');
    expect(result.replacement).toContain('active session');
    expect(result.loadHandlerPreserved).toBe(true);
    expect(await resourceCounts(page)).toEqual(clients[client].resources);
    await exerciseClient[client](page);
    await info.attach(`${client} after remount`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await page.evaluate(() => {
      window.browserSession.dispose!();
      window.browserSession.dispose!();
    });
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    if (client === 'Reader')
      await expect(page.locator('.reader-tools [data-reader-command="bookmark"]')).toBeDisabled();
    expect(await resourceCounts(page)).toEqual({ observers: 0, messages: 0, urls: 0 });
  });
}

test('Reader preserves complete-article pagination across resize and remount', async ({
  page,
}, info) => {
  await openClient(page, 'Reader', '/blog/advx-2026-hangzhou/');
  await page.evaluate(() => {
    window.browserSession.dispose = window.browserSession.mount();
  });
  await expect(page.locator('#reader-prose .photo-figure')).toHaveCount(44);
  await page.locator('.reader-tools [data-reader-command="options"]').click();
  await page.locator('#reader-layout').selectOption('pages');
  await page.locator('#reader-font').selectOption('24');
  await page.locator('[data-reader-command="close-options"]').click();
  await expect(page.locator('#microsoft-reader')).toHaveAttribute('data-layout', 'pages');
  const viewport = page.locator('#reader-viewport');
  await viewport.press('End');
  await expect(page.locator('#reader-progress')).toHaveText('100%');
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: size.width - 40, height: size.height - 60 });
  await expect
    .poll(() =>
      page
        .locator('#reader-prose p')
        .last()
        .evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const viewport = document.querySelector('#reader-viewport')!.getBoundingClientRect();
          return bounds.left < viewport.right && bounds.right > viewport.left;
        }),
    )
    .toBe(true);
  await expect(page.locator('#reader-progress')).toHaveText('100%');
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.browserSession.dispose!();
    window.browserSession.dispose = window.browserSession.mount();
  });
  await expect(page.locator('#microsoft-reader')).toHaveAttribute('data-layout', 'pages');
  await expect(page.locator('#reader-progress')).toHaveText('100%');
  await page.screenshot({ path: info.outputPath('reader-complete-article-pagination.png') });
  await page.evaluate(() => window.browserSession.dispose!());
  expect(await resourceCounts(page)).toEqual({ observers: 0, messages: 0, urls: 0 });
});

test('Reader restores authored content and dialogs while rejecting a replaced native read', async ({
  page,
}) => {
  await openClient(page, 'Reader');
  const original = await page.locator('#reader-prose').textContent();
  await page.evaluate(async () => {
    history.replaceState(null, '', '/blog/?file=local-reader-test');
    const root = document.querySelector<HTMLElement>('#microsoft-reader')!;
    const oldRead = new Promise<NativeFileResult>((resolve) => {
      window.readerWork = {
        saveResult: 'cancelled',
        releaseRead: () =>
          resolve({
            status: 'read',
            file: {
              kind: 'text',
              id: 'old',
              title: 'Old.md',
              text: '# Old result',
              revision: 1,
              readonly: true,
            },
          }),
      };
    });
    const files = {
      read: () => oldRead,
      write: (): NativeFileResult => ({ status: 'cancelled' }),
      saveAs: async (): Promise<NativeFileResult> => ({ status: 'cancelled' }),
      open: (): NativeFileResult => ({ status: 'cancelled' }),
    };
    const oldDispose = window.BrowserSessions.mountReader(root, files);
    await Promise.resolve();
    oldDispose();
    window.browserSession.dispose = window.BrowserSessions.mountReader(root, {
      ...files,
      read: (): NativeFileResult => ({
        status: 'read',
        file: {
          kind: 'text',
          id: 'current',
          title: 'Current.md',
          text: '# Current file\n\nThis is the current text.',
          revision: 1,
          readonly: true,
        },
      }),
    });
    oldDispose();
    window.readerWork.releaseRead();
  });
  await expect(page.locator('#reader-prose')).toContainText('This is the current text.');
  await expect(page.locator('#reader-book-name')).toHaveText('Current.md');
  await page.locator('.reader-tools [data-reader-command="options"]').click();
  await expect(page.locator('#reader-options')).toBeVisible();
  await page.evaluate(() => window.browserSession.dispose!());
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('#reader-prose')).toHaveText(original!);
  expect(await resourceCounts(page)).toEqual({ observers: 0, messages: 0, urls: 0 });
});

test('Reader keeps notes after storage and export failures and reports native save cancellation', async ({
  page,
}, info) => {
  await openClient(page, 'Reader');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'doom95.reader.v2') throw new Error('Injected Reader storage failure');
      write.call(this, key, value);
    };
    window.readerWork = { saveResult: 'cancelled', releaseRead: () => {} };
    window.browserSession.dispose = window.BrowserSessions.mountReader(
      document.querySelector<HTMLElement>('#microsoft-reader')!,
      {
        read: (): NativeFileResult => ({ status: 'cancelled' }),
        write: (): NativeFileResult => ({ status: 'cancelled' }),
        open: (): NativeFileResult => ({ status: 'cancelled' }),
        saveAs: async (name, text): Promise<NativeFileResult> => {
          const status = window.readerWork.saveResult;
          if (status === 'session')
            return {
              status: 'saved',
              persisted: false,
              file: { kind: 'text', id: 'notes', title: name, text, readonly: false, revision: 1 },
            };
          return status === 'cancelled'
            ? { status }
            : { status, error: 'The notes could not be saved.' };
        },
      },
    );
  });
  await page.locator('.reader-tools [data-reader-command="note"]').click();
  await page.locator('#reader-note-text').fill('Keep this note through failed saving.');
  await page.locator('[data-reader-command="save-note"]').click();
  await expect(page.locator('#reader-notes')).toContainText(
    'Keep this note through failed saving.',
  );
  await expect(page.locator('#reader-notes')).toContainText('kept in this session');
  const menu = page.locator('[data-hybrid-menubar] summary').filter({ hasText: 'File' });
  for (const outcome of ['cancelled', 'failed', 'session'] as const) {
    await page.evaluate((outcome) => {
      window.readerWork.saveResult = outcome;
    }, outcome);
    await menu.click();
    await page.locator('[data-reader-command="save-notes"]').click();
    await expect(page.locator('#reader-feedback')).toHaveText(
      outcome === 'cancelled'
        ? 'Save cancelled.'
        : outcome === 'failed'
          ? 'The notes could not be saved.'
          : 'Notes saved in this session only.',
    );
  }
  await page.evaluate(() => {
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      HTMLAnchorElement.prototype.click = click;
      throw new Error('Injected download failure');
    };
  });
  await menu.click();
  await page.locator('[data-reader-command="backup-notebook"]').click();
  await expect(page.locator('#reader-feedback')).toContainText('download could not be started');
  expect(await resourceCounts(page)).toEqual({ observers: 1, messages: 0, urls: 0 });
  await menu.click();
  const pending = page.waitForEvent('download');
  await page.locator('[data-reader-command="backup-notebook"]').click();
  const download = await pending;
  expect(await readFile((await download.path())!, 'utf8')).toContain(
    'Keep this note through failed saving.',
  );
  await page.screenshot({ path: info.outputPath('reader-preserved-notebook.png') });
  await page.evaluate(() => window.browserSession.dispose!());
  expect(await resourceCounts(page)).toEqual({ observers: 0, messages: 0, urls: 0 });
  expect(errors).toEqual([]);
});

for (const outcome of ['success', 'failure'] as const) {
  test(`Profile ignores a late clipboard ${outcome} after disposal and remount`, async ({
    page,
  }) => {
    await openClient(page, 'Profile');
    await page.evaluate((outcome) => {
      const pending: Window['pendingProfileCopy'] = (window.pendingProfileCopy = {
        values: [],
        settle: () => {},
      });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText(value: string): Promise<void> {
            pending.values.push(value);
            if (pending.values.length === 1)
              return new Promise<void>((resolve, reject) => {
                pending.settle = () =>
                  outcome === 'success'
                    ? resolve()
                    : reject(new DOMException('Clipboard unavailable', 'NotAllowedError'));
              });
            // The new session has the opposite outcome, so either stale handler would change its UI.
            if (pending.values.length === 2 && outcome === 'success')
              return Promise.reject(new DOMException('Clipboard unavailable', 'NotAllowedError'));
            return Promise.resolve();
          },
        },
      });
      window.browserSession.dispose = window.browserSession.mount();
    }, outcome);
    await page.getByRole('tab', { name: 'Contact', exact: true }).click();
    const copy = page.getByRole('button', { name: 'Copy email', exact: true });
    const address = page.locator('[data-contact-value]');
    const feedback = page.locator('[data-contact-feedback]');
    const email = await address.inputValue();
    await copy.click();
    expect(await page.evaluate(() => window.pendingProfileCopy.values)).toEqual([email]);
    await page.evaluate(() => {
      const oldDispose = window.browserSession.dispose!;
      oldDispose();
      window.browserSession.dispose = window.browserSession.mount();
      oldDispose();
    });
    await copy.click();
    const expected =
      outcome === 'success' ? 'Address selected. Use Copy to keep it.' : 'Email copied.';
    const focused = outcome === 'success' ? address : copy;
    await expect(feedback).toHaveText(expected);
    await expect(address).toHaveJSProperty('hidden', outcome === 'failure');
    await expect(focused).toBeFocused();
    await page.evaluate(async () => {
      window.pendingProfileCopy.settle();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    await expect(feedback).toHaveText(expected);
    await expect(address).toHaveJSProperty('hidden', outcome === 'failure');
    await expect(focused).toBeFocused();
    await copy.click();
    await expect(feedback).toHaveText('Email copied.');
    await expect(address).toBeHidden();
    await expect(copy).toBeFocused();
    expect(await page.evaluate(() => window.pendingProfileCopy.values)).toEqual([
      email,
      email,
      email,
    ]);
    await filterProfileProjects(page);
    await page.evaluate(() => window.browserSession.dispose!());
    expect(await resourceCounts(page)).toEqual(clients.Profile.resources);
  });
}

test('ACDSee restores its original markup and releases resources after initialization failures', async ({
  page,
}) => {
  for (const failure of ['observe', 'render'] as const) {
    await test.step(failure, async () => {
      await openClient(page, 'ACDSee');
      const failed = await page.evaluate((failure) => {
        const list = document.querySelector<HTMLElement>('#image-list')!;
        const originalList = list.innerHTML;
        const path = document.querySelector<HTMLInputElement>('#image-path')!;
        const placeholder = document.createComment('image path');
        if (failure === 'observe') window.browserResources.failObserve = true;
        else path.replaceWith(placeholder);
        let error = '';
        try {
          window.browserSession.mount();
        } catch (caught) {
          error = caught instanceof Error ? caught.message : String(caught);
        } finally {
          if (failure === 'render') placeholder.replaceWith(path);
        }
        return {
          error,
          restored: list.innerHTML === originalList,
          observersCreated: window.browserResources.observersCreated,
        };
      }, failure);
      expect(failed.error).toContain(
        failure === 'observe' ? 'ResizeObserver.observe failure' : '#image-path',
      );
      expect(failed.restored).toBe(true);
      expect(failed.observersCreated).toBe(1);
      expect(await resourceCounts(page)).toEqual({ observers: 0, messages: 0, urls: 0 });
      await page.evaluate(() => {
        window.browserSession.dispose = window.browserSession.mount();
      });
      await expect(page.locator('#image-list [role="option"]')).toHaveCount(2);
      await page.locator('.image-toolbar [data-command="next"]').click();
      await expect(page.locator('#image-title')).toHaveText('Second image');
      await page.evaluate(() => window.browserSession.dispose!());
      expect(await resourceCounts(page)).toEqual({ observers: 0, messages: 0, urls: 0 });
    });
  }
});

for (const phase of ['bitmap', 'preview'] as const) {
  test(`ACDSee ignores an old ${phase} result after disposal and remount`, async ({ page }) => {
    await openClient(page, 'ACDSee');
    await page.evaluate((phase) => {
      const work: Window['pendingImageWork'] = (window.pendingImageWork = {
        ready: false,
        closed: 0,
        release: () => {},
      });
      let first = true;
      if (phase === 'bitmap') {
        const decode = window.createImageBitmap.bind(window);
        window.createImageBitmap = ((...args: Parameters<typeof decode>) => {
          const delayed = first;
          first = false;
          return decode(...args).then((bitmap) => {
            if (!delayed) return bitmap;
            const close = bitmap.close.bind(bitmap);
            bitmap.close = () => {
              close();
              work.closed++;
            };
            return new Promise<ImageBitmap>((resolve) => {
              work.release = () => resolve(bitmap);
              work.ready = true;
            });
          });
        }) as typeof window.createImageBitmap;
      } else {
        const toBlob = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
          const delayed = first;
          first = false;
          toBlob.call(
            this,
            (blob) => {
              if (!delayed) callback(blob);
              else {
                work.release = () => callback(blob);
                work.ready = true;
              }
            },
            type,
            quality,
          );
        };
      }
      window.browserSession.dispose = window.browserSession.mount();
    }, phase);
    await page.locator('#image-open').setInputFiles({
      name: 'old-session.png',
      mimeType: 'image/png',
      buffer: await readFile(new URL(`../../public${sampleUrl}`, import.meta.url)),
    });
    await expect.poll(() => page.evaluate(() => window.pendingImageWork.ready)).toBe(true);
    await page.evaluate(() => {
      const oldDispose = window.browserSession.dispose!;
      oldDispose();
      window.browserSession.dispose = window.browserSession.mount();
      oldDispose();
    });
    await page.locator('.image-toolbar [data-command="next"]').click();
    await page.locator('#image-open').setInputFiles({
      name: 'unreadable.png',
      mimeType: 'image/png',
      buffer: Buffer.from('This is not an image.'),
    });
    await expect(page.locator('#image-feedback')).toHaveText('0 opened; 1 unreadable');
    await page.evaluate(async () => {
      window.pendingImageWork.release();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    if (phase === 'bitmap')
      expect(await page.evaluate(() => window.pendingImageWork.closed)).toBe(1);
    await expect(page.locator('#image-list [role="option"]')).toHaveCount(2);
    await expect(page.locator('#image-title')).toHaveText('Second image');
    await expect(page.locator('#image-feedback')).toHaveText('0 opened; 1 unreadable');
    expect(await page.evaluate(() => window.browserResources.urlsCreated)).toBe(0);
    expect(await resourceCounts(page)).toEqual({ observers: 1, messages: 0, urls: 0 });
    await page.evaluate(() => window.browserSession.dispose!());
    expect(await resourceCounts(page)).toEqual({ observers: 0, messages: 0, urls: 0 });
  });
}

test('ACDSee keeps accepted local batches when a later decode is superseded', async ({
  page,
}, info) => {
  await openClient(page, 'ACDSee');
  await page.evaluate(() => {
    window.browserSession.dispose = window.browserSession.mount();
  });
  const buffer = await readFile(new URL(`../../public${sampleUrl}`, import.meta.url));
  const input = page.locator('#image-open');
  await input.setInputFiles({ name: 'retained.png', mimeType: 'image/png', buffer });
  await expect(page.locator('#image-title')).toHaveText('retained.png');
  const retained = await page.locator('#image-original').getAttribute('href');
  await input.setInputFiles({ name: 'second.png', mimeType: 'image/png', buffer });
  await expect(page.locator('#image-feedback')).toHaveText('2 local images');
  await expect(page.locator('#image-list [role="option"]')).toHaveCount(2);
  await page.evaluate(() => {
    const decode = window.createImageBitmap.bind(window);
    const work: Window['pendingImageWork'] = (window.pendingImageWork = {
      ready: false,
      closed: 0,
      release: () => {},
    });
    let first = true;
    window.createImageBitmap = ((...args: Parameters<typeof decode>) => {
      const delayed = first;
      first = false;
      return decode(...args).then((bitmap) => {
        if (!delayed) return bitmap;
        const close = bitmap.close.bind(bitmap);
        bitmap.close = () => {
          close();
          work.closed++;
        };
        return new Promise<ImageBitmap>((resolve) => {
          work.release = () => resolve(bitmap);
          work.ready = true;
        });
      });
    }) as typeof window.createImageBitmap;
  });
  await input.setInputFiles({ name: 'superseded.png', mimeType: 'image/png', buffer });
  await expect.poll(() => page.evaluate(() => window.pendingImageWork.ready)).toBe(true);
  await input.setInputFiles({ name: 'latest.png', mimeType: 'image/png', buffer });
  await expect(page.locator('#image-title')).toHaveText('latest.png');
  await expect(page.locator('#image-feedback')).toHaveText('3 local images');
  await page.evaluate(async () => {
    window.pendingImageWork.release();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  expect(await page.evaluate(() => window.pendingImageWork.closed)).toBe(1);
  await expect(page.locator('#image-list [role="option"]')).toHaveCount(3);
  await expect(page.locator('#image-title')).toHaveText('latest.png');
  expect(await page.evaluate(async (url) => (await fetch(url!)).ok, retained)).toBe(true);
  expect(await resourceCounts(page)).toEqual({ observers: 1, messages: 0, urls: 6 });
  await page.screenshot({ path: info.outputPath('acdsee-cumulative-local-images.png') });
  await page.evaluate(() => window.browserSession.dispose!());
  expect(await resourceCounts(page)).toEqual({ observers: 0, messages: 0, urls: 0 });
});

test('ACDSee releases pointer capture and stops its slideshow when disposed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openClient(page, 'ACDSee');
  await page.evaluate(() => {
    window.browserSession.dispose = window.browserSession.mount();
  });
  await expect(page.locator('#image-view')).toHaveAttribute('data-rotation', '0');
  await page.locator('.image-toolbar [data-command="actual"]').click();
  await page.clock.install();
  await page.evaluate(() => {
    window.slideshowTicks = 0;
    const browserWindow: Window = window;
    const interval = browserWindow.setInterval.bind(browserWindow);
    browserWindow.setInterval = (handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
      interval(
        typeof handler === 'function'
          ? () => {
              window.slideshowTicks++;
              handler(...args);
            }
          : handler,
        timeout,
        ...args,
      );
  });
  const slideshow = page.locator('.image-toolbar [data-command="slideshow"]');
  await slideshow.click();
  await expect(slideshow).toHaveAttribute('aria-pressed', 'true');
  const stage = page.locator('#image-stage');
  await stage.evaluate((element) => {
    element.addEventListener(
      'gotpointercapture',
      (event) => {
        window.capturedImagePointer = (event as PointerEvent).pointerId;
      },
      { once: true },
    );
  });
  const bounds = await stage.boundingBox();
  expect(bounds).toBeTruthy();
  const x = bounds!.x + bounds!.width / 2;
  const y = bounds!.y + bounds!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 1, y + 1);
  expect(
    await stage.evaluate(
      (element) =>
        window.capturedImagePointer !== undefined &&
        element.hasPointerCapture(window.capturedImagePointer),
    ),
  ).toBe(true);
  await page.evaluate(() => window.browserSession.dispose!());
  expect(
    await stage.evaluate((element) => element.hasPointerCapture(window.capturedImagePointer!)),
  ).toBe(false);
  await page.mouse.up();
  await expect(slideshow).toHaveAttribute('aria-pressed', 'false');
  const position = await page.locator('#image-position').textContent();
  await page.clock.runFor(5500);
  expect(await page.evaluate(() => window.slideshowTicks)).toBe(0);
  await expect(page.locator('#image-position')).toHaveText(position!);
  expect(await resourceCounts(page)).toEqual({ observers: 0, messages: 0, urls: 0 });
});

async function expectNativeSelects(page: Page): Promise<void> {
  await expect(page.locator('button[role="combobox"], [role="listbox"]')).toHaveCount(0);
  await expect(page.locator('#hybrid-first')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#hybrid-first')).toHaveAttribute('tabindex', '3');
  await expect(page.locator('#hybrid-first-label')).toHaveAttribute('for', 'hybrid-first');
  expect(await page.locator('#hybrid-second').getAttribute('aria-hidden')).toBeNull();
  expect(await page.locator('#hybrid-second-label').getAttribute('for')).toBeNull();
  await expect(page.locator('.hybrid-select-native')).toHaveCount(0);
}

for (const failure of ['ancestor observation', 'global keydown', 'second select'] as const) {
  test(`Hybrid controls release a failed ${failure} initialization and remount cleanly`, async ({
    page,
  }) => {
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
      <section id="hybrid-session">
        <label id="hybrid-first-label" for="hybrid-first">First choice</label>
        <select id="hybrid-first" aria-hidden="false" tabindex="3"><option value="a">Alpha</option><option value="b">Beta</option><option value="c">Gamma</option></select>
        <label id="hybrid-second-label">Second choice<select id="hybrid-second"><option>One</option><option>Two</option></select></label>
        <output id="hybrid-selection">a / 0</output>
      </section>
    </body></html>`);
    await page.addStyleTag({
      path: fileURLToPath(new URL('../../src/styles/hybrid-ui.css', import.meta.url)),
    });
    await page.addScriptTag({ content: await clientBundle() });
    const error = await page.evaluate((failure) => {
      const root = document.querySelector<HTMLElement>('#hybrid-session')!;
      const first = document.querySelector<HTMLSelectElement>('#hybrid-first')!;
      const selection = document.querySelector<HTMLOutputElement>('#hybrid-selection')!;
      let changes = 0;
      first.addEventListener('change', () => {
        selection.textContent = `${first.value} / ${++changes}`;
      });
      const observers = new Set<MutationObserver>();
      const listeners: {
        target: EventTarget;
        type: string;
        listener: EventListenerOrEventListenerObject;
        capture: boolean;
      }[] = [];
      let observeCalls = 0;
      let armed = true;
      let registering = false;
      window.hybridResources = {
        get observers() {
          return observers.size;
        },
        get listeners() {
          return listeners.length;
        },
        get observeCalls() {
          return observeCalls;
        },
      };
      window.MutationObserver = class extends MutationObserver {
        constructor(callback: MutationCallback) {
          super(callback);
          observers.add(this);
        }
        observe(target: Node, options?: MutationObserverInit): void {
          observeCalls++;
          if (armed && failure === 'ancestor observation' && observeCalls === 2) {
            armed = false;
            throw new Error(`Injected ${failure} failure`);
          }
          super.observe(target, options);
        }
        disconnect(): void {
          super.disconnect();
          observers.delete(this);
        }
      };
      const add = EventTarget.prototype.addEventListener;
      const remove = EventTarget.prototype.removeEventListener;
      EventTarget.prototype.addEventListener = function (type, listener, options) {
        // Throw before native registration; a failed registration acquires no listener.
        if (
          registering &&
          armed &&
          failure === 'global keydown' &&
          this === document &&
          type === 'keydown'
        ) {
          armed = false;
          throw new Error(`Injected ${failure} failure`);
        }
        add.call(this, type, listener, options);
        if (!registering || !listener) return;
        const capture = typeof options === 'boolean' ? options : !!options?.capture;
        if (
          !listeners.some(
            (entry) =>
              entry.target === this &&
              entry.type === type &&
              entry.listener === listener &&
              entry.capture === capture,
          )
        )
          listeners.push({ target: this, type, listener, capture });
      };
      EventTarget.prototype.removeEventListener = function (type, listener, options) {
        remove.call(this, type, listener, options);
        const capture = typeof options === 'boolean' ? options : !!options?.capture;
        const index = listeners.findIndex(
          (entry) =>
            entry.target === this &&
            entry.type === type &&
            entry.listener === listener &&
            entry.capture === capture,
        );
        if (index >= 0) listeners.splice(index, 1);
      };
      const insert = Element.prototype.insertAdjacentElement;
      Element.prototype.insertAdjacentElement = function (position, element) {
        if (
          armed &&
          failure === 'second select' &&
          this === document.getElementById('hybrid-second')
        ) {
          armed = false;
          throw new Error(`Injected ${failure} failure`);
        }
        return insert.call(this, position, element);
      };
      window.browserSession = {
        mount: () => {
          registering = true;
          try {
            return window.BrowserSessions.mountHybridUi(root);
          } finally {
            registering = false;
          }
        },
      };
      try {
        window.browserSession.mount();
        return '';
      } catch (caught) {
        return caught instanceof Error ? caught.message : String(caught);
      }
    }, failure);
    expect(error).toBe(`Injected ${failure} failure`);
    expect(await page.evaluate(() => window.hybridResources.observers)).toBe(0);
    expect(await page.evaluate(() => window.hybridResources.listeners)).toBe(0);
    if (failure === 'ancestor observation')
      expect(await page.evaluate(() => window.hybridResources.observeCalls)).toBe(2);
    await expectNativeSelects(page);

    await page.evaluate(async () => {
      const label = document.createElement('label');
      label.textContent = 'Late choice';
      const select = document.createElement('select');
      select.id = 'hybrid-late';
      select.append(new Option('Late option'));
      label.append(select);
      document.getElementById('hybrid-session')!.append(label);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    await expectNativeSelects(page);
    expect(await page.locator('#hybrid-late').getAttribute('aria-hidden')).toBeNull();
    await page.evaluate(() => {
      window.browserSession.dispose = window.browserSession.mount();
    });
    await expect(page.locator('button[role="combobox"]')).toHaveCount(3);
    const combo = page.getByRole('combobox', { name: 'First choice', exact: true });
    await combo.press('End');
    await combo.press('Enter');
    await expect(page.locator('#hybrid-first')).toHaveValue('c');
    await expect(page.locator('#hybrid-selection')).toHaveText('c / 1');
    await expect(combo).toBeFocused();
    await combo.press('Enter');
    await expect(page.getByRole('listbox')).toBeVisible();
    expect(await page.evaluate(() => window.hybridResources.observers)).toBe(1);
    expect(await page.evaluate(() => window.hybridResources.listeners)).toBeGreaterThan(0);
    await page.evaluate(() => {
      window.browserSession.dispose!();
      window.browserSession.dispose!();
    });
    await expectNativeSelects(page);
    expect(await page.locator('#hybrid-late').getAttribute('aria-hidden')).toBeNull();
    expect(await page.evaluate(() => window.hybridResources.observers)).toBe(0);
    expect(await page.evaluate(() => window.hybridResources.listeners)).toBe(0);
  });
}
