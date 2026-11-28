import type { CanvasApp } from '../os/host/app-contracts';
import { APP_CATALOG } from '../../data/app-catalog';
import { isCanvasApp } from './index';

const modules = import.meta.glob<Record<string, unknown>>('./**/*.app.ts', { eager: true });
const applications = new Map<string, CanvasApp>();
for (const module of Object.values(modules)) {
  for (const value of Object.values(module)) {
    if (!isCanvasApp(value)) continue;
    if (applications.has(value.id)) throw new Error(`Duplicate application: ${value.id}`);
    if (!APP_CATALOG.some((app) => app.id === value.id && app.kind === 'canvas'))
      throw new Error(`Application is missing from the catalog: ${value.id}`);
    applications.set(value.id, value);
  }
}
export const APPS: CanvasApp[] = APP_CATALOG.filter((app) => app.kind === 'canvas').map(
  (metadata) => {
    const app = applications.get(metadata.id);
    if (!app) throw new Error(`Application has no implementation: ${metadata.id}`);
    return app;
  },
);
