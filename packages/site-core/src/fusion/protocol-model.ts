import { parseStoredReaderState } from './reading-storage-model';
import type { ReaderState } from './reading-model';

export const FUSION_NAMESPACE = 'mhk-fusion';
export const FUSION_VERSION = 1;
/** Query parameters that select and configure a fused presentation. */
export const FUSION_QUERY = Object.freeze({
  shell: 'shell',
  full: 'full',
  view: 'view',
  classic: 'classic',
  win95: 'win95',
});
export const FUSION_EVENTS = Object.freeze({
  readerState: 'mhk10:reader-state',
  readingState: 'mhk-fusion:reading-state',
  syncError: 'mhk-fusion:sync-error',
  flushReading: 'mhk-fusion:flush-reading',
  restoreReading: 'mhk-fusion:restore-reading',
  location: 'mhk-fusion:location',
});
export type FusionDestination =
  | { kind: 'home' | 'profile' | 'projects' | 'blog' }
  | { kind: 'skills' | 'gallery' | 'friends'; id?: string }
  | { kind: 'project' | 'tag'; id: string }
  | { kind: 'article'; id: string; anchor?: string };
type Envelope = {
  ns: typeof FUSION_NAMESPACE;
  version: typeof FUSION_VERSION;
  session: string;
  request: number;
};
export type FusionPayload =
  | { type: 'hello' | 'startup' | 'suspend' | 'resume' }
  | { type: 'ready' | 'failed'; acknowledged?: number }
  | { type: 'suspended'; acknowledged: number; destination: FusionDestination }
  | { type: 'navigate' | 'location' | 'request-classic'; destination: FusionDestination }
  | { type: 'reading'; baseline: ReaderState; state: ReaderState }
  | { type: 'reading-ack'; acknowledged: number; state: ReaderState }
  | { type: 'sync-error'; acknowledged: number; error: string };
export type FusionMessage = Envelope & FusionPayload;
export function fusionMessage(
  session: string,
  request: number,
  payload: FusionPayload,
): FusionMessage {
  return { ns: FUSION_NAMESPACE, version: FUSION_VERSION, session, request, ...payload };
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const identifier = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 160 &&
  /^[\p{L}\p{N}_./-]+$/u.test(value) &&
  !value.split('/').includes('..');
const boundedMessage = (value: unknown): boolean => {
  try {
    return JSON.stringify(value).length <= 2000000;
  } catch {
    return false;
  }
};
const contentName = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 160 &&
  /^[\p{L}\p{N}_./+ -]+$/u.test(value) &&
  !value.split('/').includes('..');

export function parseFusionDestination(value: unknown): FusionDestination | null {
  if (!record(value)) return null;
  switch (value.kind) {
    case 'home':
    case 'profile':
    case 'projects':
    case 'blog':
      return { kind: value.kind };
    case 'skills':
      return value.id === undefined
        ? { kind: 'skills' }
        : contentName(value.id)
          ? { kind: 'skills', id: value.id }
          : null;
    case 'gallery':
    case 'friends':
      return value.id === undefined
        ? { kind: value.kind }
        : identifier(value.id)
          ? { kind: value.kind, id: value.id }
          : null;
    case 'project':
    case 'tag':
      return identifier(value.id) ? { kind: value.kind, id: value.id } : null;
    case 'article':
      return identifier(value.id) && (value.anchor === undefined || identifier(value.anchor))
        ? { kind: value.kind, id: value.id, ...(value.anchor ? { anchor: value.anchor } : {}) }
        : null;
    default:
      return null;
  }
}

/** Reconstruct only the allowlisted schema; arbitrary storage and commands never cross the seam. */
export function parseFusionMessage(value: unknown): FusionMessage | null {
  if (
    !record(value) ||
    value.ns !== FUSION_NAMESPACE ||
    value.version !== FUSION_VERSION ||
    typeof value.session !== 'string' ||
    !/^[a-zA-Z0-9-]{8,80}$/.test(value.session) ||
    !Number.isSafeInteger(value.request) ||
    (value.request as number) < 0
  )
    return null;
  const envelope: Envelope = {
    ns: FUSION_NAMESPACE,
    version: FUSION_VERSION,
    session: value.session,
    request: value.request as number,
  };
  switch (value.type) {
    case 'hello':
    case 'startup':
    case 'suspend':
    case 'resume':
      return { ...envelope, type: value.type };
    case 'ready':
    case 'failed':
      if (value.acknowledged === undefined) return { ...envelope, type: value.type };
      return Number.isSafeInteger(value.acknowledged) && (value.acknowledged as number) >= 0
        ? { ...envelope, type: value.type, acknowledged: value.acknowledged as number }
        : null;
    case 'suspended': {
      const destination = parseFusionDestination(value.destination);
      return destination &&
        Number.isSafeInteger(value.acknowledged) &&
        (value.acknowledged as number) >= 0
        ? {
            ...envelope,
            type: 'suspended',
            acknowledged: value.acknowledged as number,
            destination,
          }
        : null;
    }
    case 'navigate':
    case 'location':
    case 'request-classic': {
      const destination = parseFusionDestination(value.destination);
      return destination ? { ...envelope, type: value.type, destination } : null;
    }
    case 'reading': {
      if (!boundedMessage(value)) return null;
      const baseline = parseStoredReaderState(value.baseline);
      const state = parseStoredReaderState(value.state);
      return baseline.ok && state.ok
        ? { ...envelope, type: value.type, baseline: baseline.state, state: state.state }
        : null;
    }
    case 'reading-ack': {
      if (
        !Number.isSafeInteger(value.acknowledged) ||
        (value.acknowledged as number) < 0 ||
        !boundedMessage(value)
      )
        return null;
      const state = parseStoredReaderState(value.state);
      return state.ok
        ? {
            ...envelope,
            type: 'reading-ack',
            acknowledged: value.acknowledged as number,
            state: state.state,
          }
        : null;
    }
    case 'sync-error':
      return Number.isSafeInteger(value.acknowledged) &&
        (value.acknowledged as number) >= 0 &&
        typeof value.error === 'string' &&
        value.error.length <= 1000
        ? {
            ...envelope,
            type: 'sync-error',
            acknowledged: value.acknowledged as number,
            error: value.error,
          }
        : null;
    default:
      return null;
  }
}

/** Configuration must name exact HTTP(S) origins, without credentials or path wildcards. */
export function parseFusionOrigins(value: string): string[] {
  const origins = new Set<string>();
  for (const raw of value.split(/[\s,]+/)) {
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (
        (url.protocol === 'https:' || url.protocol === 'http:') &&
        !url.hostname.includes('*') &&
        !url.username &&
        !url.password &&
        url.pathname === '/' &&
        !url.search &&
        !url.hash
      )
        origins.add(url.origin);
    } catch {
      /* Invalid configuration disables that origin. */
    }
  }
  return [...origins];
}

export function destinationFromUrl(
  url: URL,
  presentation: 'general' | 'desktop',
): FusionDestination | null {
  const path = url.pathname.replace(/\/$/, '') || '/';
  const item = url.searchParams.get('item') ?? undefined;
  let destination: unknown;
  if (path === '/') destination = { kind: 'home' };
  else if (path === '/about')
    destination =
      presentation === 'desktop' && url.hash === '#friends'
        ? { kind: 'friends', id: item }
        : presentation === 'desktop' && url.hash.startsWith('#project-')
          ? { kind: 'project', id: decodePart(url.hash.slice(9)) }
          : presentation === 'desktop' && url.hash === '#projects'
            ? {
                kind: url.searchParams.has('project') ? 'project' : 'projects',
                id: url.searchParams.get('project'),
              }
            : { kind: 'profile' };
  else if (path === '/projects')
    destination = item
      ? { kind: 'project', id: item }
      : url.hash.startsWith('#project-')
        ? { kind: 'project', id: decodePart(url.hash.slice(9)) }
        : { kind: 'projects' };
  else if (path === '/skills' || path === '/gallery' || path === '/friends' || path === '/network')
    destination = { kind: path === '/network' ? 'friends' : path.slice(1), id: item };
  else if (path === '/acdsee' && !url.searchParams.has('file'))
    destination = { kind: 'gallery', id: url.searchParams.get('media') ?? item ?? undefined };
  else if (path === '/blog') destination = { kind: 'blog' };
  else if (path.startsWith('/blog/tag/'))
    destination = { kind: 'tag', id: decodePart(path.slice(10)) };
  else if (path.startsWith('/blog/'))
    destination = {
      kind: 'article',
      id: decodePart(path.slice(6)),
      ...(url.hash ? { anchor: decodePart(url.hash.slice(1)) } : {}),
    };
  return parseFusionDestination(destination);
}
function decodePart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

export function destinationPath(
  destination: FusionDestination,
  presentation: 'general' | 'desktop',
): string {
  switch (destination.kind) {
    case 'home':
      return '/';
    case 'profile':
      return '/about/';
    case 'projects':
      return presentation === 'desktop' ? '/about/#projects' : '/projects';
    case 'project':
      return presentation === 'desktop'
        ? `/about/#project-${encodeURIComponent(destination.id)}`
        : `/projects?item=${encodeURIComponent(destination.id)}`;
    case 'blog':
      return '/blog/';
    case 'article':
      return `/blog/${destination.id.split('/').map(encodeURIComponent).join('/')}/${destination.anchor ? `#${encodeURIComponent(destination.anchor)}` : ''}`;
    case 'tag':
      return `/blog/tag/${encodeURIComponent(destination.id)}/`;
    case 'skills':
      return `/skills/${destination.id ? `?item=${encodeURIComponent(destination.id)}` : ''}`;
    case 'gallery':
      return presentation === 'desktop' && destination.id
        ? `/acdsee/?media=${encodeURIComponent(destination.id)}`
        : `/gallery/${destination.id ? `?item=${encodeURIComponent(destination.id)}` : ''}`;
    case 'friends':
      return presentation === 'desktop'
        ? `/about/${destination.id ? `?item=${encodeURIComponent(destination.id)}` : ''}#friends`
        : `/friends/${destination.id ? `?item=${encodeURIComponent(destination.id)}` : ''}`;
  }
}
export function sameDestination(a: FusionDestination, b: FusionDestination): boolean {
  return destinationPath(a, 'general') === destinationPath(b, 'general');
}
