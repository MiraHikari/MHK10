import { FUSION_EVENTS, type FusionDestination } from '@mhk/site-core/fusion/protocol-model';
import { STORAGE_KEYS, readStorage, removeStorage, writeStorage } from '@/lib/storage/keys';
import { parseDisplayMode, stripViewParam, type DisplayMode } from './display-mode-model';
import { parseDesktopDeployment } from './desktop-deployment-model';
import { syncFavicon } from './useDocumentHead';
import {
  INITIAL_PRESENTATION_STATE,
  reducePresentation,
  type PresentationEffect,
  type PresentationEvent,
  type PresentationState,
} from './presentation-model';

/** Desktop deployment URL (injected at build time). Empty bypasses Win95. */
export const PUBLIC_DESK_URL = parseDesktopDeployment(import.meta.env.PUBLIC_DESK_URL) ?? '';
export const DESK_EMBED_ENABLED = PUBLIC_DESK_URL !== '';

/**
 * Every side effect the presentation reducer can request. The browser adapter
 * below is the single writer of the display datasets and presentation storage;
 * tests inject fakes instead of touching a DOM.
 */
export interface PresentationPorts {
  /** Prehydration facts: the target written by the inline script and the
   * session cooldown it may not have been able to apply. */
  readonly readInitial: () => {
    readonly target: DisplayMode;
    readonly visible: DisplayMode;
    readonly failedThisSession?: unknown;
  };
  readonly storage: {
    writeDisplayMode(mode: DisplayMode): void;
    writeCooldown(mode: DisplayMode): void;
    clearCooldown(): void;
  };
  readonly dom: {
    /** Publish the target and visible datasets together. */
    paint(target: DisplayMode, visible: DisplayMode): void;
    bootReady(): void;
    focus(selector: string): void;
    flushReading(): void;
    restoreReading(destination: FusionDestination): void;
  };
  /** Strip `?view` once the boot decision has been made. */
  readonly consumeViewParam?: () => void;
  readonly dispose?: () => void;
}

export interface PresentationController {
  getSnapshot(): PresentationState;
  subscribe(listener: () => void): () => void;
  send(event: PresentationEvent): void;
  /** Boot has read the prehydration facts; later starts are no-ops. */
  isStarted(): boolean;
  start(): void;
  dispose(): void;
}

export interface PresentationOptions {
  /** `PUBLIC_DESK_URL` is configured. Defaults to enabled for injected fakes. */
  readonly enabled?: boolean;
}

export function createPresentation(
  ports: PresentationPorts,
  options: PresentationOptions = {},
): PresentationController {
  const enabled = options.enabled ?? true;
  let state = INITIAL_PRESENTATION_STATE;
  let started = false;
  let disposed = false;
  const listeners = new Set<() => void>();

  function apply(effect: PresentationEffect): void {
    switch (effect.type) {
      case 'persist':
        ports.storage.writeDisplayMode(effect.target);
        return;
      case 'clear-cooldown':
        ports.storage.clearCooldown();
        return;
      case 'write-cooldown':
        ports.storage.writeCooldown(effect.target);
        return;
      case 'paint':
        ports.dom.paint(effect.target, effect.visible);
        return;
      case 'flush-reading':
        ports.dom.flushReading();
        return;
      case 'boot-ready':
        ports.dom.bootReady();
        return;
      case 'focus':
        ports.dom.focus(effect.selector);
        return;
      case 'restore-reading':
        ports.dom.restoreReading(effect.destination);
        return;
    }
  }

  function send(event: PresentationEvent): void {
    if (disposed) return;
    const next = reducePresentation(state, event, { enabled });
    const changed = next.state !== state;
    state = next.state;
    // Effects observe reducer order: persist/flush → paint → restore/focus.
    for (const effect of next.effects) apply(effect);
    if (changed) {
      for (const listener of [...listeners]) listener();
    }
  }

  return {
    getSnapshot() {
      return state;
    },
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    send,
    isStarted() {
      return started;
    },
    start() {
      if (started || disposed) return;
      started = true;
      const initial = ports.readInitial();
      ports.consumeViewParam?.();
      send({
        type: 'boot',
        target: initial.target,
        failedThisSession: initial.failedThisSession,
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      ports.dispose?.();
    },
  };
}

/**
 * Browser adapter. Construction is SSR-safe: every port reads `document` or
 * `window` only when the controller starts or applies an effect.
 */
function browserPorts(): PresentationPorts {
  const readDataset = (): DOMStringMap | null =>
    typeof document === 'undefined' ? null : document.documentElement.dataset;
  let focusFrame = 0;

  return {
    readInitial() {
      const dataset = readDataset();
      const target = parseDisplayMode(dataset?.displayTarget ?? dataset?.displayMode) ?? 'classic';
      return {
        target: DESK_EMBED_ENABLED && target === 'win95' ? 'win95' : 'classic',
        visible: parseDisplayMode(dataset?.displayMode) ?? 'classic',
        failedThisSession: readStorage(STORAGE_KEYS.desktopFailed),
      };
    },
    storage: {
      writeDisplayMode(mode) {
        writeStorage(STORAGE_KEYS.displayMode, mode);
      },
      writeCooldown(mode) {
        writeStorage(STORAGE_KEYS.desktopFailed, mode);
      },
      clearCooldown() {
        removeStorage(STORAGE_KEYS.desktopFailed);
      },
    },
    dom: {
      paint(target, visible) {
        const root = document.documentElement;
        root.dataset.displayTarget = target;
        root.dataset.displayMode = visible;
        // Boot already painted the chosen target before React hydrates. The
        // controller follows that target throughout startup and real switches.
        syncFavicon(target);
      },
      bootReady() {
        window.dispatchEvent(new CustomEvent('portfolio:boot-ready'));
      },
      focus(selector) {
        const trigger = desktopEntry?.trigger;
        desktopEntry = null;
        if (typeof window.requestAnimationFrame !== 'function') return;
        window.cancelAnimationFrame(focusFrame);
        focusFrame = window.requestAnimationFrame(() => {
          focusFrame = 0;
          if (readDataset()?.displayTarget !== 'classic') return;
          if (trigger?.isConnected) {
            trigger.focus({ preventScroll: true });
            if (document.activeElement === trigger) return;
          }
          document.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
        });
      },
      flushReading() {
        window.dispatchEvent(new Event(FUSION_EVENTS.flushReading));
      },
      restoreReading(destination) {
        window.dispatchEvent(
          new CustomEvent(FUSION_EVENTS.restoreReading, { detail: destination }),
        );
      },
    },
    consumeViewParam() {
      try {
        const href = window.location.href;
        // The inline script already persisted the explicit choice; the URL
        // only carried it into boot. Keep every other parameter intact.
        const next = stripViewParam(href);
        if (next === href) return;
        window.history.replaceState(window.history.state, '', next);
      } catch {
        // No history/location (SSR, tests, restricted embeds): the query is
        // harmless to leave in place.
      }
    },
    dispose() {
      if (focusFrame) window.cancelAnimationFrame(focusFrame);
    },
  };
}

let browserController: PresentationController | undefined;
let desktopEntry: { trigger: HTMLElement; edge: DOMRect; docked: boolean } | null = null;

export function rememberDesktopEntry(trigger?: HTMLElement): void {
  if (typeof HTMLElement === 'undefined') return;
  const source = trigger ?? document.activeElement;
  if (!(source instanceof HTMLElement) || source === document.body) {
    desktopEntry = null;
    return;
  }
  const dock = source.closest('[data-desktop-entry-anchor]');
  desktopEntry = {
    trigger: source,
    edge: (dock ?? source).getBoundingClientRect(),
    docked: dock !== null,
  };
}

export function getDesktopEntry() {
  return desktopEntry;
}

/** The one browser controller; created lazily and never at import time. */
export function getPresentation(): PresentationController {
  browserController ??= createPresentation(browserPorts(), { enabled: DESK_EMBED_ENABLED });
  return browserController;
}

/**
 * Release the browser controller. A later `getPresentation()` creates a fresh
 * instance that boots from the datasets again, which is what a remounted
 * island needs; the facade derives its started state from the new controller.
 */
export function disposePresentation(): void {
  browserController?.dispose();
  browserController = undefined;
  desktopEntry = null;
}
