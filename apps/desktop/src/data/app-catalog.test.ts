import { describe, expect, it } from 'vite-plus/test';
import {
  APP_CATALOG,
  appMetadata,
  appRoute,
  canvasAppRoutes,
  desktopShortcuts,
  resolveAppId,
  startMenuApps,
} from './app-catalog';

describe('application catalog', () => {
  interface Entry {
    command?: string;
    children?: readonly Entry[];
  }
  const commands = (entries: readonly Entry[]): string[] =>
    entries.flatMap((entry) => (entry.command ? [entry.command] : commands(entry.children ?? [])));
  it('keeps unique identities and routes while preserving both About URLs', () => {
    expect(new Set(APP_CATALOG.map((app) => app.id)).size).toBe(APP_CATALOG.length);
    expect(resolveAppId('about', 'hybrid')).toBe('profile');
    expect(resolveAppId('about', 'canvas')).toBe('system-about');
    expect(appRoute('profile')).toBe('/about/');
    expect(appRoute('system-about')).toBe('/apps/about/');
    expect(canvasAppRoutes.find((app) => app.slug === 'about')?.id).toBe('system-about');
    expect(canvasAppRoutes.some((app) => app.id.startsWith('$'))).toBe(false);
  });

  it('projects windows, menu commands and shortcuts from the same metadata', () => {
    for (const host of ['canvas', 'hybrid'] as const) {
      const menuCommands = commands(startMenuApps(host));
      for (const shortcut of desktopShortcuts(host)) {
        expect(menuCommands).toContain(shortcut.id);
        expect(shortcut.icon).toBe(
          appMetadata(shortcut.id as Parameters<typeof appMetadata>[0]).icon,
        );
      }
    }
    expect(commands(startMenuApps('hybrid'))).toContain('diagnostics');
    expect(commands(startMenuApps('hybrid'))).not.toContain('system-about');
  });
});
