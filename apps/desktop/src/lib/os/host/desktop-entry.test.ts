import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const fixture = vi.hoisted(() => ({
  runtime: { files: {}, dispose: vi.fn() },
  shell: { mount: vi.fn(), dispose: vi.fn(), setAudioMuted: vi.fn() },
  htmlApps: [] as Array<{ id: string; html: string }>,
}));
vi.mock('./browser-runtime', () => ({ createBrowserRuntime: vi.fn(() => fixture.runtime) }));
vi.mock('../desktop/shell', () => ({ createShell: vi.fn(() => fixture.shell) }));
vi.mock('../../apps/eager', () => ({ APPS: [] }));
vi.mock('../files/save-dialog', () => ({ createSaveDialogApp: vi.fn() }));
vi.mock('./html-apps', () => ({ htmlApps: fixture.htmlApps }));

import { mountDesktopEntry } from './desktop-entry';
import { createShell } from '../desktop/shell';
import { createBrowserRuntime } from './browser-runtime';

let canvas: object;
let hint: { textContent: string; remove: ReturnType<typeof vi.fn> };
let removeClass: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  fixture.shell.mount.mockResolvedValue(undefined);
  canvas = {};
  hint = { textContent: 'Starting MHK10', remove: vi.fn() };
  removeClass = vi.fn();
  vi.stubGlobal('document', {
    getElementById: (id: string) => ({ screen: canvas, 'boot-hint': hint })[id],
    documentElement: { classList: { remove: removeClass } },
  });
  vi.stubGlobal('localStorage', { getItem: () => null });
  vi.stubGlobal('location', {
    href: 'https://mhk10.example.com/',
    pathname: '/',
    search: '',
    hash: '',
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('desktop entry ownership', () => {
  it('releases the runtime and exposes the startup fallback when Shell construction fails', async () => {
    vi.mocked(createShell).mockImplementationOnce(() => {
      throw new Error('Shell construction failed');
    });
    await expect(mountDesktopEntry(true)).resolves.toBeUndefined();
    expect(fixture.runtime.dispose).toHaveBeenCalledOnce();
    expect(fixture.shell.dispose).not.toHaveBeenCalled();
    expect(hint.textContent).toBe('MHK10 could not start. Reload to try again.');
    expect(removeClass).toHaveBeenCalledWith('hybrid-mode');
    await expect(mountDesktopEntry(true)).resolves.toBe(fixture.shell);
    expect(fixture.shell.mount).toHaveBeenCalledWith(canvas);
    expect(hint.remove).toHaveBeenCalledOnce();
    expect(fixture.runtime.dispose).toHaveBeenCalledOnce();
  });

  it('uses the same startup fallback when runtime construction fails', async () => {
    vi.mocked(createBrowserRuntime).mockImplementationOnce(() => {
      throw new Error('Runtime construction failed');
    });
    await expect(mountDesktopEntry(false)).resolves.toBeUndefined();
    expect(fixture.runtime.dispose).not.toHaveBeenCalled();
    expect(createShell).not.toHaveBeenCalled();
    expect(hint.textContent).toBe('MHK10 could not start. Reload to try again.');
  });

  it('lets a constructed Shell release its runtime after mounting fails', async () => {
    fixture.shell.mount.mockRejectedValueOnce(new Error('Mount failed'));
    await expect(mountDesktopEntry(false)).resolves.toBe(fixture.shell);
    expect(fixture.shell.dispose).toHaveBeenCalledOnce();
    expect(fixture.runtime.dispose).not.toHaveBeenCalled();
    expect(hint.remove).not.toHaveBeenCalled();
  });

  it('strips the fusion shell parameter from the current page html app url', async () => {
    fixture.htmlApps.push({ id: 'home', html: '/pages/home.html' });
    vi.stubGlobal('location', {
      href: 'https://mhk10.example.com/?shell=full',
      pathname: '/',
      search: '?shell=full',
      hash: '',
    });
    await mountDesktopEntry(true);
    const apps = vi.mocked(createShell).mock.calls[0]?.[0] as Array<{ id: string; html: string }>;
    expect(apps[0]?.html).toBe('/');
  });

  it('mutes the boot sound before mounting a framed full-shell desktop', async () => {
    vi.stubGlobal('window', { self: {}, top: {} });
    vi.stubGlobal('location', {
      href: 'https://mhk10.example.com/?shell=full',
      pathname: '/',
      search: '?shell=full',
      hash: '',
    });
    await mountDesktopEntry(true);
    expect(fixture.shell.setAudioMuted).toHaveBeenCalledWith(true);
    expect(fixture.shell.setAudioMuted.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.shell.mount.mock.invocationCallOrder[0]!,
    );
  });

  it('leaves standalone and single-window desktops unmuted at boot', async () => {
    await mountDesktopEntry(true);
    expect(fixture.shell.setAudioMuted).not.toHaveBeenCalled();
    vi.stubGlobal('window', { self: {}, top: {} });
    vi.stubGlobal('location', {
      href: 'https://mhk10.example.com/?shell=home',
      pathname: '/',
      search: '?shell=home',
      hash: '',
    });
    await mountDesktopEntry(true);
    expect(fixture.shell.setAudioMuted).not.toHaveBeenCalled();
  });
});
