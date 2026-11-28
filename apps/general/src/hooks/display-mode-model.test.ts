import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { FUSION_QUERY } from '@mhk/site-core/fusion/protocol-model';
import { STORAGE_KEYS } from '@/lib/storage/keys';
import {
  DISPLAY_MODE_BOOTSTRAP,
  parseDisplayMode,
  resolveDisplayMode,
  stripViewParam,
} from './display-mode-model';

const root = {
  enabled: true,
};

describe('display mode bootstrap', () => {
  it('hydrates a stored choice before hydration runs', () => {
    expect(resolveDisplayMode({ ...root, stored: 'win95' })).toBe('win95');
    expect(resolveDisplayMode({ ...root, stored: 'classic' })).toBe('classic');
  });

  it('keeps the stored presentation when the visitor opens a deep link directly', () => {
    expect(resolveDisplayMode({ ...root, stored: 'win95' })).toBe('win95');
    expect(resolveDisplayMode({ ...root, stored: 'classic' })).toBe('classic');
  });

  it('always paints the general site when no presentation was chosen', () => {
    // No silent takeover: the desktop is offered on the hero, not entered.
    expect(resolveDisplayMode(root)).toBe('classic');
    expect(resolveDisplayMode({ ...root, explicit: null })).toBe('classic');
  });

  it('never replaces an explicit route choice or the desktop kill switch', () => {
    expect(resolveDisplayMode({ ...root, explicit: 'classic', stored: 'win95' })).toBe('classic');
    expect(resolveDisplayMode({ ...root, explicit: 'win95' })).toBe('win95');
    expect(resolveDisplayMode({ ...root, enabled: false, explicit: 'win95' })).toBe('classic');
    expect(resolveDisplayMode({ ...root, enabled: false })).toBe('classic');
  });

  it('ignores malformed explicit and stored values', () => {
    expect(resolveDisplayMode({ ...root, explicit: 'desktop', stored: 'win95' })).toBe('win95');
    expect(resolveDisplayMode({ ...root, explicit: null, stored: { mode: 'win95' } })).toBe(
      'classic',
    );
    expect(parseDisplayMode('WIN95')).toBeNull();
    expect(parseDisplayMode(undefined)).toBeNull();
    expect(parseDisplayMode('classic')).toBe('classic');
  });

  it('clamps a saved desktop preference after a failed handoff this session', () => {
    // The saved preference is preserved in storage; only the resolved target
    // falls back to classic for the rest of the session.
    expect(resolveDisplayMode({ ...root, stored: 'win95', failedThisSession: 'win95' })).toBe(
      'classic',
    );
    expect(resolveDisplayMode({ ...root, stored: 'classic', failedThisSession: 'win95' })).toBe(
      'classic',
    );
  });

  it('lets an explicit route choice beat the session cooldown', () => {
    expect(
      resolveDisplayMode({
        ...root,
        explicit: 'win95',
        stored: 'win95',
        failedThisSession: 'win95',
      }),
    ).toBe('win95');
    expect(resolveDisplayMode({ ...root, explicit: 'classic', failedThisSession: 'win95' })).toBe(
      'classic',
    );
  });

  it('ignores malformed and other cooldown values', () => {
    expect(resolveDisplayMode({ ...root, stored: 'win95', failedThisSession: 'classic' })).toBe(
      'win95',
    );
    expect(
      resolveDisplayMode({ ...root, stored: 'win95', failedThisSession: { mode: 'win95' } }),
    ).toBe('win95');
    expect(resolveDisplayMode({ ...root, stored: 'win95', failedThisSession: undefined })).toBe(
      'win95',
    );
  });

  it('never resolves a desktop target with the kill switch, even explicitly', () => {
    expect(
      resolveDisplayMode({
        ...root,
        enabled: false,
        stored: 'win95',
        failedThisSession: 'win95',
      }),
    ).toBe('classic');
  });
});

describe('stripViewParam', () => {
  it.each([
    ['https://example.com/?view=win95', '/'],
    ['https://example.com/?view=', '/'],
    ['https://example.com/blog/colophon/?view=classic', '/blog/colophon/'],
    ['https://example.com/blog/?view=win95&keep=1#notes', '/blog/?keep=1#notes'],
    ['https://example.com/?a=1&view=win95&a=2', '/?a=1&a=2'],
    ['https://example.com/?view=desktop&a=1', '/?a=1'],
    ['https://example.com/?view=win95#top', '/#top'],
    ['/?view=win95&keep=1', '/?keep=1'],
    ['https://example.com/a#view=win95', 'https://example.com/a#view=win95'],
    ['https://example.com/a?keep=1#view=win95', 'https://example.com/a?keep=1#view=win95'],
  ])('%s -> %s', (href, expected) => {
    expect(stripViewParam(href)).toBe(expected);
  });
});

/* ------------------------------------------------------------------ *
 * The inline prehydration script cannot import this module, so it
 * mirrors the predicate. Execute the real script body against the same
 * decision table to catch drift.
 * ------------------------------------------------------------------ */

function inlineScriptBody(): string {
  const source = readFileSync(new URL('../layouts/Layout.astro', import.meta.url), 'utf8');
  const scripts = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  const body = scripts.find((match) => match[1].includes('displayModeKey'))?.[1];
  if (!body) throw new Error('Layout.astro no longer contains the display-mode boot script');
  return body;
}

interface InlineScenario {
  explicit?: string;
  stored?: string;
  failedThisSession?: string;
  pathname: string;
  viewportWidth: number;
  finePointer: boolean;
  conserveData?: boolean;
}

interface InlineResult {
  target: string;
  stored: string | null;
  failed: string | null;
}

function runInlineScript(scenario: InlineScenario): InlineResult {
  const dataset: Record<string, string> = {};
  const local = new Map<string, string>();
  const session = new Map<string, string>();
  if (scenario.stored !== undefined) local.set(STORAGE_KEYS.displayMode, scenario.stored);
  if (scenario.failedThisSession !== undefined) {
    session.set(STORAGE_KEYS.desktopFailed, scenario.failedThisSession);
  }
  vi.stubGlobal('location', {
    search: scenario.explicit ? `?view=${scenario.explicit}` : '',
    pathname: scenario.pathname,
  });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => local.set(key, value),
    removeItem: (key: string) => local.delete(key),
  });
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => session.get(key) ?? null,
    setItem: (key: string, value: string) => session.set(key, value),
    removeItem: (key: string) => session.delete(key),
  });
  vi.stubGlobal('navigator', {
    connection: scenario.conserveData ? { saveData: true } : undefined,
  });
  vi.stubGlobal('window', {
    matchMedia: (query: string) => ({
      matches: query.includes('min-width')
        ? scenario.viewportWidth >= DISPLAY_MODE_BOOTSTRAP.minWidth
        : scenario.finePointer,
    }),
  });
  vi.stubGlobal('document', { documentElement: { dataset } });

  const preamble = [
    `const displayModeKey = ${JSON.stringify(STORAGE_KEYS.displayMode)};`,
    `const displayFailedKey = ${JSON.stringify(STORAGE_KEYS.desktopFailed)};`,
    `const fusionQuery = ${JSON.stringify(FUSION_QUERY)};`,
  ].join('\n');
  // The wrapper scopes the define:vars constants per run; `const` at the top
  // level of runInThisContext would otherwise persist across scenarios.
  runInThisContext(`(() => {\n${preamble}\n${inlineScriptBody()}\n})()`, {
    filename: 'Layout.astro#display-mode',
  });

  return {
    target: dataset.displayTarget ?? 'classic',
    stored: local.get(STORAGE_KEYS.displayMode) ?? null,
    failed: session.get(STORAGE_KEYS.desktopFailed) ?? null,
  };
}

describe('inline prehydration parity', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const scenarios: InlineScenario[] = [
    { pathname: '/', viewportWidth: 1440, finePointer: true },
    { pathname: '/', viewportWidth: 390, finePointer: false },
    { pathname: '/blog/notes/', viewportWidth: 1440, finePointer: true },
    { pathname: '/', viewportWidth: 1440, finePointer: true, stored: 'win95' },
    { pathname: '/blog/notes/', viewportWidth: 1440, finePointer: true, stored: 'win95' },
    { pathname: '/', viewportWidth: 1440, finePointer: true, stored: 'classic' },
    { pathname: '/', viewportWidth: 1440, finePointer: true, conserveData: true },
    { pathname: '/', viewportWidth: 1440, finePointer: true, explicit: 'win95' },
    { pathname: '/', viewportWidth: 390, finePointer: false, explicit: 'win95' },
    { pathname: '/', viewportWidth: 1440, finePointer: true, explicit: 'classic' },
    {
      pathname: '/',
      viewportWidth: 1440,
      finePointer: true,
      stored: 'win95',
      failedThisSession: 'win95',
    },
    { pathname: '/', viewportWidth: 1440, finePointer: true, failedThisSession: 'win95' },
    {
      pathname: '/',
      viewportWidth: 1440,
      finePointer: true,
      explicit: 'win95',
      stored: 'win95',
      failedThisSession: 'win95',
    },
  ];

  it('mirrors resolveDisplayMode for the full decision table', () => {
    for (const scenario of scenarios) {
      const inline = runInlineScript(scenario);
      const explicit = parseDisplayMode(scenario.explicit ?? null);
      const stored = parseDisplayMode(scenario.stored ?? null);
      const resolved = resolveDisplayMode({
        enabled: true,
        explicit,
        stored,
        failedThisSession: scenario.failedThisSession,
      });
      expect(inline.target, JSON.stringify(scenario)).toBe(resolved);
    }
  });

  it('clears the cooldown only for an explicit route choice', () => {
    const explicit = runInlineScript({
      pathname: '/',
      viewportWidth: 1440,
      finePointer: true,
      explicit: 'win95',
      failedThisSession: 'win95',
    });
    expect(explicit.failed).toBeNull();
    expect(explicit.stored).toBe('win95');

    const automatic = runInlineScript({
      pathname: '/',
      viewportWidth: 1440,
      finePointer: true,
      stored: 'win95',
      failedThisSession: 'win95',
    });
    expect(automatic.failed).toBe('win95');
    // The saved preference survives the cooldown.
    expect(automatic.stored).toBe('win95');
  });

  it('does not persist an effective default while cooling down', () => {
    const cooling = runInlineScript({
      pathname: '/',
      viewportWidth: 1440,
      finePointer: true,
      failedThisSession: 'win95',
    });
    expect(cooling.target).toBe('classic');
    expect(cooling.stored).toBeNull();

    // No preference ever writes one: the desktop must be chosen explicitly.
    const normal = runInlineScript({ pathname: '/', viewportWidth: 1440, finePointer: true });
    expect(normal.target).toBe('classic');
    expect(normal.stored).toBeNull();
  });
});

describe('fusion query contract', () => {
  const files = [
    {
      path: '../components/embed/Win95Embed.tsx',
      expressions: ['searchParams.set(FUSION_QUERY.shell, FUSION_QUERY.full)'],
    },
    {
      path: '../layouts/Layout.astro',
      expressions: [
        'fusionQuery: FUSION_QUERY',
        'get(fusionQuery.view)',
        'fusionQuery.classic',
        'fusionQuery.win95',
      ],
    },
    {
      path: './display-mode-model.ts',
      expressions: ['has(FUSION_QUERY.view)', 'delete(FUSION_QUERY.view)'],
    },
  ];

  it('uses the shared constant and values at every query call site', () => {
    for (const { path, expressions } of files) {
      const source = readFileSync(new URL(path, import.meta.url), 'utf8');
      for (const expression of expressions) {
        expect(source, `${path}: ${expression}`).toContain(expression);
      }
      expect(source, path).not.toMatch(
        /searchParams\.(?:get|set|has|delete)\([^)]*['"](?:view|shell|full|classic|win95)['"]/,
      );
    }
  });
});
