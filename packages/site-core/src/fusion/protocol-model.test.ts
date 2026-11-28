import { describe, expect, it } from 'vite-plus/test';
import {
  destinationFromUrl,
  destinationPath,
  parseFusionDestination,
  parseFusionMessage,
  parseFusionOrigins,
  fusionMessage,
  FUSION_NAMESPACE,
  FUSION_VERSION,
} from './protocol-model';

describe('dual presentation destinations', () => {
  it.each([
    { kind: 'project', id: 'cloudflare-vmail' },
    { kind: 'skills', id: 'C++' },
    { kind: 'skills', id: 'TanStack Query' },
    { kind: 'gallery', id: '/images/gallery/photo-display.webp' },
    { kind: 'friends' },
  ] as const)('preserves item identity for $kind through both presentations', (destination) => {
    for (const presentation of ['general', 'desktop'] as const) {
      const path = destinationPath(destination, presentation);
      expect(destinationFromUrl(new URL(path, 'https://example.com'), presentation)).toEqual(
        destination,
      );
      expect(path).not.toMatch(/project-project-|skill-skill-/);
    }
  });
  it('accepts an empty image browser without leaking visitor files', () => {
    expect(destinationFromUrl(new URL('/acdsee/', 'https://example.com'), 'desktop')).toEqual({
      kind: 'gallery',
    });
    expect(
      destinationFromUrl(new URL('/acdsee/?file=private', 'https://example.com'), 'desktop'),
    ).toBeNull();
  });
  it.each([
    ['/blog/notes/hello/#part-one', 'article'],
    ['/about/?project=portfolio#projects', 'project'],
    ['/about/#projects', 'projects'],
    ['/network/?item=friend', 'friends'],
    ['/gallery/?item=photo', 'gallery'],
    ['/blog/tag/code/', 'tag'],
  ])('round trips %s through a stable identity', (path, kind) => {
    const destination = destinationFromUrl(new URL(path, 'https://desk.example'), 'desktop');
    expect(destination?.kind).toBe(kind);
    expect(
      destinationFromUrl(
        new URL(destinationPath(destination!, 'general'), 'https://general.example'),
        'general',
      ),
    ).toEqual(destination);
  });
  it('uses the same stable tag route in both presentations', () => {
    const destination = { kind: 'tag', id: '设计' } as const;
    expect(destinationPath(destination, 'general')).toBe('/blog/tag/%E8%AE%BE%E8%AE%A1/');
    expect(destinationPath(destination, 'desktop')).toBe('/blog/tag/%E8%AE%BE%E8%AE%A1/');
    expect(
      destinationFromUrl(
        new URL(`${destinationPath(destination, 'desktop')}?view=win95`, 'https://desk.example'),
        'desktop',
      ),
    ).toEqual(destination);
  });
  it('rejects executable, traversal and malformed destinations', () => {
    expect(parseFusionDestination({ kind: 'article', id: '../secrets' })).toBeNull();
    expect(parseFusionDestination({ kind: 'article', id: 'javascript:alert(1)' })).toBeNull();
    expect(
      destinationFromUrl(new URL('/blog/%E0%A4%A/', 'https://desk.example'), 'desktop'),
    ).toBeNull();
    expect(
      destinationFromUrl(new URL('/apps/notepad/?file=private', 'https://desk.example'), 'desktop'),
    ).toBeNull();
  });
});
describe('fusion protocol', () => {
  it('builds the shared versioned envelope', () => {
    expect(fusionMessage('session-1234', 2, { type: 'resume' })).toEqual({
      ns: FUSION_NAMESPACE,
      version: FUSION_VERSION,
      session: 'session-1234',
      request: 2,
      type: 'resume',
    });
  });
  const envelope = { ns: 'mhk-fusion', version: 1, session: 'session-1234', request: 1 };
  it('requires a versioned session and valid request identifier', () => {
    expect(parseFusionMessage({ ns: 'mhk-fusion', type: 'suspend' })).toBeNull();
    expect(parseFusionMessage({ ...envelope, version: 2, type: 'resume' })).toBeNull();
    expect(parseFusionMessage({ ...envelope, request: NaN, type: 'resume' })).toBeNull();
    expect(parseFusionMessage({ ...envelope, type: 'resume' })).toEqual({
      ...envelope,
      type: 'resume',
    });
    expect(parseFusionMessage({ ...envelope, type: 'startup' })).toEqual({
      ...envelope,
      type: 'startup',
    });
  });
  it('does not expose a generic storage or command channel', () => {
    expect(
      parseFusionMessage({ ...envelope, type: 'storage', key: 'credentials', value: 'x' }),
    ).toBeNull();
    expect(
      parseFusionMessage({
        ...envelope,
        type: 'reading',
        baseline: {},
        state: { version: 1, documents: { private: { notes: 'bad' } } },
      }),
    ).toBeNull();
    expect(
      parseFusionMessage({
        ...envelope,
        type: 'navigate',
        destination: { kind: 'profile', file: 'secret' },
      }),
    ).toEqual({ ...envelope, type: 'navigate', destination: { kind: 'profile' } });
  });
  it('correlates content readiness and suspended destinations with accepted requests', () => {
    expect(parseFusionMessage({ ...envelope, type: 'ready', acknowledged: 8 })).toEqual({
      ...envelope,
      type: 'ready',
      acknowledged: 8,
    });
    expect(parseFusionMessage({ ...envelope, type: 'failed', acknowledged: -1 })).toBeNull();
    expect(
      parseFusionMessage({
        ...envelope,
        type: 'suspended',
        acknowledged: 3,
        destination: { kind: 'article', id: 'notes/hello', anchor: 'part-one' },
      }),
    ).toEqual({
      ...envelope,
      type: 'suspended',
      acknowledged: 3,
      destination: { kind: 'article', id: 'notes/hello', anchor: 'part-one' },
    });
    expect(
      parseFusionMessage({ ...envelope, type: 'suspended', destination: { kind: 'home' } }),
    ).toBeNull();
  });
  it('accepts exact configured origins and rejects paths, credentials and wildcard origins', () => {
    expect(
      parseFusionOrigins('https://general.example, http://localhost:4321 https://general.example'),
    ).toEqual(['https://general.example', 'http://localhost:4321']);
    expect(
      parseFusionOrigins(
        'https://*.example https://user:pass@example https://example/path data:text/x,x',
      ),
    ).toEqual([]);
  });
});
