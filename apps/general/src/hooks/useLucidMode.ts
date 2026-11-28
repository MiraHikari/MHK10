import { useSyncExternalStore } from 'react';

/**
 * 「灵光模式」— the Konami easter egg.
 *
 * While it is on, the WebGL veil speeds up and drifts through the hue wheel and
 * the section accent keeps cycling. It is deliberately session-only: nothing is
 * persisted, so a reload always returns to the composed default.
 *
 * Kept in module scope so App and the command palette share the same choice.
 */

const listeners = new Set<() => void>();
let enabled = false;

export function getLucidMode() {
  return enabled;
}

export function setLucidMode(next: boolean) {
  if (enabled === next) return;
  enabled = next;
  listeners.forEach((listener) => listener());
}

export function toggleLucidMode() {
  setLucidMode(!enabled);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLucidMode() {
  return useSyncExternalStore(subscribe, getLucidMode, () => false);
}
