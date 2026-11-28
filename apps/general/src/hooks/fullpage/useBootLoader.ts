import { useEffect } from 'react';
import {
  BOOT_MASK_SAFETY_MS,
  BOOT_READY_BUFFER_MS,
  BOOT_READY_EVENT,
  createBootSequence,
} from '@/lib/boot-sequence';

declare global {
  interface Window {
    __loaderDone?: boolean;
  }
}

/**
 * Remove the mask and hand the page back its foreground. Used only when the
 * inline loader script never ran at all, so completion never happened; every
 * working path removes the element itself and leaves nothing to do.
 */
function releaseMask(): void {
  document.getElementById('boot-loader')?.remove();
  document.documentElement.removeAttribute('aria-busy');
}

/**
 * DOM adapter for the boot sequence.
 *
 * The inline loader script is the single writer of `window.__loaderDone` and
 * the only owner of mask removal. This hook reads the flag once at mount to
 * absorb a completion that happened before hydration, listens for the inline
 * script's `portfolio:loader-ready` event, and otherwise lets the sequence's
 * content timeout (`BOOT_CONTENT_TIMEOUT_MS`, owner `'app'`) complete it.
 *
 * Once complete, `onReady` runs after `BOOT_READY_BUFFER_MS`: the loader starts
 * its fade-out while the preheated Hero content enters underneath, so the mask
 * and content cross-fade instead of leaving a gap.
 *
 * `BOOT_MASK_SAFETY_MS` is not a second opinion about *completion* — the
 * sequence owns that. It is the guard for an inline script that never armed its
 * own deadline (a CSP without `unsafe-inline`, or a blocker that dropped the
 * `is:inline` payload), which would otherwise leave the overlay covering a
 * page that this hook has already handed over.
 */
export function useBootLoader(onReady: () => void) {
  useEffect(() => {
    const sequence = createBootSequence();
    let bufferId = 0;
    let safetyId = 0;

    const handleLoaderReady = () => sequence.complete('inline');

    const unsubscribe = sequence.subscribe(() => {
      window.removeEventListener(BOOT_READY_EVENT, handleLoaderReady);
      bufferId = window.setTimeout(onReady, BOOT_READY_BUFFER_MS);
    });

    if (window.__loaderDone) {
      // The inline script completed before this effect attached; absorb it.
      sequence.complete('inline');
    } else {
      window.addEventListener(BOOT_READY_EVENT, handleLoaderReady, { once: true });
    }
    // Deliberately not cancelled by completion: the sequence can complete via
    // its own content timeout while the inline script never ran at all, which
    // is exactly the case this guards. `releaseMask` is a no-op once the inline
    // script has removed the element.
    safetyId = window.setTimeout(releaseMask, BOOT_MASK_SAFETY_MS);

    return () => {
      window.removeEventListener(BOOT_READY_EVENT, handleLoaderReady);
      window.clearTimeout(bufferId);
      window.clearTimeout(safetyId);
      unsubscribe();
      sequence.dispose();
    };
  }, [onReady]);
}
