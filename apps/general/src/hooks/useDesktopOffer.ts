import { useSyncExternalStore } from 'react';
import { STORAGE_KEYS, readStorage, writeStorage } from '@/lib/storage/keys';
import { shouldConserveData } from '@/lib/images/prefetch';
import { DESK_EMBED_ENABLED, setDisplayMode } from './useDisplayMode';
import { requestDisplayMode } from './useDisplayModeEntry';
import { getPresentation } from './presentation-controller';
import { shouldOfferDesktop } from './desktop-offer-model';
import { DISPLAY_MODE_BOOTSTRAP } from './display-mode-model';

export type DesktopOfferState = 'hidden' | 'offer' | 'hint';

interface Snapshot {
  readonly state: DesktopOfferState;
}

const HIDDEN: Snapshot = { state: 'hidden' };
const listeners = new Set<() => void>();
let snapshot: Snapshot = HIDDEN;
let resolved = false;
let acceptingOffer = false;

function emit(): void {
  for (const listener of [...listeners]) listener();
}

function publish(next: DesktopOfferState): void {
  if (snapshot.state === next) return;
  snapshot = { state: next };
  emit();
}

/** The visitor chose a presentation, so neither surface has anything to say. */
function hasSavedChoice(): boolean {
  return readStorage(STORAGE_KEYS.displayMode) !== null;
}

/**
 * The desktop is offered, never entered silently — the policy lives in
 * `desktop-offer-model.ts`; this store resolves it once per page load and
 * exposes accept/dismiss through the same entry path as every other toggle.
 * Desktop-class viewports get the full card; narrow or metered visits fall
 * back to the one-line pointer to the screen-edge switch.
 */
function resolve(): void {
  if (resolved || typeof window === 'undefined') return;
  resolved = true;
  if (window.location.pathname !== DISPLAY_MODE_BOOTSTRAP.rootPath || hasSavedChoice()) {
    publish('hidden');
    return;
  }
  const conserveData = shouldConserveData();
  const offered = shouldOfferDesktop({
    enabled: DESK_EMBED_ENABLED,
    hasChoice: false,
    answered: readStorage(STORAGE_KEYS.desktopOffer) === '1',
    pathname: window.location.pathname,
    viewportWidth: window.innerWidth,
    conserveData,
  });
  if (offered) {
    publish('offer');
    return;
  }
  // Narrow or metered visits keep the quieter one-line pointer to the
  // screen-edge switch instead of the full card.
  const narrow = window.innerWidth < DISPLAY_MODE_BOOTSTRAP.minWidth;
  if (
    DESK_EMBED_ENABLED &&
    (narrow || conserveData) &&
    readStorage(STORAGE_KEYS.desktopHint) !== '1'
  ) {
    publish('hint');
    return;
  }
  publish('hidden');
}

/** Client-only: resolving needs the browser, so it runs on first subscription. */
function subscribe(listener: () => void): () => void {
  resolve();
  listeners.add(listener);
  const presentation = getPresentation();
  const unsubscribe = presentation.subscribe(() => {
    const { target, visible } = presentation.getSnapshot();
    if (acceptingOffer) {
      if (visible === 'classic' && target === 'win95') return;
      acceptingOffer = false;
    }
    if (target === 'win95' || visible === 'win95') publish('hidden');
  });
  return () => {
    unsubscribe();
    listeners.delete(listener);
  };
}

export function useDesktopOffer(): Snapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => HIDDEN,
  );
}

/** The visitor accepts the recommendation and enters the desktop. */
export function acceptDesktopOffer(trigger?: HTMLButtonElement): void {
  acceptingOffer = true;
  writeStorage(STORAGE_KEYS.desktopOffer, '1');
  writeStorage(STORAGE_KEYS.desktopHint, '1');
  requestDisplayMode('win95', trigger);
}

/** The visitor declines: the general site stays and the offer closes. */
export function dismissDesktopOffer(): void {
  if (acceptingOffer) setDisplayMode('classic');
  acceptingOffer = false;
  writeStorage(STORAGE_KEYS.desktopOffer, '1');
  publish('hidden');
}

/** The narrow-viewport hint was read (shown once per session). */
export function dismissDesktopHint(): void {
  writeStorage(STORAGE_KEYS.desktopHint, '1');
  publish('hidden');
}
