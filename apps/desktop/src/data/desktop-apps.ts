import { APP_CATALOG, appIconFile, type CatalogApp } from './app-catalog';

export interface DesktopApp {
  id: string;
  name: string;
  href: string;
  icon: string;
}
export const desktopApps: DesktopApp[] = (APP_CATALOG as readonly CatalogApp[])
  .filter((app) => !!app.route)
  .map((app) => ({ id: app.id, name: app.name, href: app.route!, icon: appIconFile(app.id) }));
export const pageShortcuts = desktopApps.filter(
  (app) => (APP_CATALOG as readonly CatalogApp[]).find((entry) => entry.id === app.id)?.shortcut,
);
