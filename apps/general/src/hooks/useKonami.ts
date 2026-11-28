import { useEffect, useRef } from 'react';

/** ↑ ↑ ↓ ↓ ← → ← → B A */
export const KONAMI_SEQUENCE = [
  'arrowup',
  'arrowup',
  'arrowdown',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'arrowleft',
  'arrowright',
  'b',
  'a',
] as const;

/** Progress resets if the visitor pauses longer than this between keys. */
const STEP_TIMEOUT_MS = 1500;

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return TYPING_TAGS.has(target.tagName) || target.isContentEditable;
}

/**
 * Fires `onMatch` when a key sequence is entered in order.
 * Keys are compared case-insensitively against `event.key`.
 */
export function useKonami(onMatch: () => void, sequence: readonly string[] = KONAMI_SEQUENCE) {
  const onMatchRef = useRef(onMatch);
  onMatchRef.current = onMatch;

  useEffect(() => {
    let progress = 0;
    let lastKeyAt = 0;

    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;

      const now = event.timeStamp;
      if (progress > 0 && now - lastKeyAt > STEP_TIMEOUT_MS) progress = 0;
      lastKeyAt = now;

      const key = event.key.toLowerCase();
      if (key === sequence[progress]) {
        progress += 1;
      } else {
        // Allow a mistyped key to still start a fresh attempt.
        progress = key === sequence[0] ? 1 : 0;
      }

      if (progress === sequence.length) {
        progress = 0;
        onMatchRef.current();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sequence]);
}
