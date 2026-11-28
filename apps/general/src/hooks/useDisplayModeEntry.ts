import { useSyncExternalStore } from 'react';
import { STORAGE_KEYS, readStorage, writeStorage } from '@/lib/storage/keys';
import {
  DESK_EMBED_ENABLED,
  getDisplayMode,
  setDisplayMode,
  type DisplayMode,
} from './useDisplayMode';
import { needsDesktopEntryNotice } from './display-mode-entry-model';
import { rememberDesktopEntry } from './presentation-controller';

interface EntryNoticeState {
  readonly open: boolean;
}

const CLOSED: EntryNoticeState = { open: false };
const listeners = new Set<() => void>();
let state = CLOSED;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

function setOpen(open: boolean): void {
  if (state.open === open) return;
  state = open ? { open: true } : CLOSED;
  emit();
}

function readEntryContext() {
  if (typeof window === 'undefined') return null;
  return {
    enabled: DESK_EMBED_ENABLED,
    target: 'win95' as const,
    acknowledged: readStorage(STORAGE_KEYS.desktopEntryNotice) === '1',
    viewportWidth: window.innerWidth,
    coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
  };
}

/**
 * Single entry point for explicit presentation changes. Every UI surface
 * (side toggle, command palette, retry) uses this instead of calling
 * `setDisplayMode('win95')` directly, so a phone visitor cannot download and
 * reveal the desktop by accident.
 */
export function requestDisplayMode(next: DisplayMode, trigger?: HTMLElement): void {
  if (next === 'win95') {
    if (!DESK_EMBED_ENABLED || getDisplayMode() === next) return;
    rememberDesktopEntry(trigger);
    const context = readEntryContext();
    if (context && needsDesktopEntryNotice(context)) {
      setOpen(true);
      return;
    }
  }
  setDisplayMode(next);
}

/** The visitor chose the desktop after reading the warning. */
export function confirmDesktopEntry(): void {
  writeStorage(STORAGE_KEYS.desktopEntryNotice, '1');
  setOpen(false);
  setDisplayMode('win95');
}

/** The visitor chose to stay on the general site (the recommended action). */
export function dismissDesktopEntry(): void {
  setOpen(false);
}

export function useDesktopEntryNotice(): EntryNoticeState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => CLOSED,
  );
}
