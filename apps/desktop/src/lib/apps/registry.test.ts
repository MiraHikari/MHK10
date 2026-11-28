import { describe, expect, it, vi } from 'vite-plus/test';
import { APP_CATALOG } from '../../data/app-catalog';
import { personalApps } from '../os/host/html-apps';

vi.mock('./calculator/calculator.registration', () => {
  throw new Error('Canvas discovery must not load registration sidecars.');
});

describe('application registration', () => {
  it('loads a requested application without the eager desktop registry', async () => {
    const { loadApp } = await import('./index');
    expect(await loadApp('calculator')).toMatchObject({ id: 'calculator', kind: 'canvas' });
    expect(await loadApp('unknown-app')).toBeUndefined();
  });
  it('discovers explicit canvas entry points in catalog order without loading sidecars', async () => {
    const { APPS } = await import('./eager');
    expect(APPS.map((app) => app.id)).toEqual(
      APP_CATALOG.filter((app) => app.kind === 'canvas').map((app) => app.id),
    );
    expect(APPS.every((app) => typeof app.createSession === 'function')).toBe(true);
    expect(APPS.some((app) => app.id.startsWith('$'))).toBe(false);
  });

  it('exposes HTML applications without fake state or drawing methods', () => {
    expect(personalApps.map((app) => app.id)).toEqual(
      APP_CATALOG.filter((app) => app.kind === 'html').map((app) => app.id),
    );
    for (const app of personalApps) {
      expect(app.html).toMatch(/^\//);
      expect(app).not.toHaveProperty('create');
      expect(app).not.toHaveProperty('draw');
      expect(app).not.toHaveProperty('createSession');
    }
  });
});
