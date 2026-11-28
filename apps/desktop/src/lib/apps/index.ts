import type { CanvasApp } from '../os/host/app-contracts';
import { APP_CATALOG } from '../../data/app-catalog';
import { CANVAS_APPS } from '../../data/app-catalog.generated';

export function isCanvasApp(value: unknown): value is CanvasApp {
  return (
    !!value &&
    typeof value === 'object' &&
    'kind' in value &&
    value.kind === 'canvas' &&
    'id' in value &&
    typeof value.id === 'string' &&
    'title' in value &&
    typeof value.title === 'string' &&
    'w' in value &&
    typeof value.w === 'number' &&
    'h' in value &&
    typeof value.h === 'number' &&
    'createSession' in value &&
    typeof value.createSession === 'function'
  );
}

const modules = import.meta.glob<Record<string, unknown>>('./**/*.app.ts');
/** Standalone hosts import only this loader; the desktop's eager registry is separate. */
export async function loadApp(id: string): Promise<CanvasApp | undefined> {
  const metadata = CANVAS_APPS.find((app) => app.id === id);
  if (!metadata || !APP_CATALOG.some((app) => app.id === id && app.kind === 'canvas')) return;
  const load = modules[metadata.modulePath];
  if (!load) throw new Error(`Application has no implementation: ${id}`);
  const exports = await load();
  const matches = Object.values(exports).filter((value) => isCanvasApp(value) && value.id === id);
  if (matches.length !== 1) throw new Error(`Application implementation is ambiguous: ${id}`);
  return matches[0] as CanvasApp;
}
