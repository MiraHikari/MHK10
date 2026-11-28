import { createLifetime } from '../../ui/browser/lifetime';
import type { InputController } from '../../ui/canvas/input';
import type { AudioService } from '../audio/pcspeaker';
// screen.ts: the canvas host — DOM events in, shell frames out.
// Maps pointer coordinates to the 640x360 virtual screen, feeds io, and runs the rAF loop
// through the shell. This is the only file that touches the DOM outside the shell's mount.

import { resolveGlobalShortcut } from '../../ui/browser/keyboard-shortcuts';

export function mountDesktop(
  cv: HTMLCanvasElement,
  input: InputController,
  audio: AudioService,
  size = { w: 640, h: 360 },
): () => void {
  const lifetime = createLifetime();
  const trackModifiers = (
    event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>,
  ) => {
    if (event.ctrlKey || event.metaKey) input.io.keyDown.add('Control');
    else input.io.keyDown.delete('Control');
    if (event.shiftKey) input.io.keyDown.add('Shift');
    else input.io.keyDown.delete('Shift');
    if (event.altKey) input.io.keyDown.add('Alt');
    else input.io.keyDown.delete('Alt');
  };
  const toCanvas = (e: PointerEvent): { px: number; py: number } => {
    const r = cv.getBoundingClientRect();
    return {
      px: Math.round(((e.clientX - r.left) / r.width) * (cv.width || size.w)),
      py: Math.round(((e.clientY - r.top) / r.height) * (cv.height || size.h)),
    };
  };

  let tracking = false;
  let capturedPointer: number | null = null;
  let lastTouch: { x: number; y: number; px: number; py: number; time: number } | null = null;
  let touchAnchor: { px: number; py: number } | null = null;
  const releaseCapture = () => {
    const pointerId = capturedPointer;
    capturedPointer = null;
    if (pointerId !== null && cv.hasPointerCapture(pointerId)) cv.releasePointerCapture(pointerId);
  };
  const cancelInput = () => {
    tracking = false;
    touchAnchor = null;
    lastTouch = null;
    input.io.keyDown.clear();
    input.cancelPointerInput();
    releaseCapture();
  };
  lifetime.defer(cancelInput);
  try {
    lifetime.listen(cv, 'pointerdown', (e) => {
      if (!e.isPrimary) return;
      if (cv.dataset.pan === 'true') return;
      cv.focus({ preventScroll: true });
      trackModifiers(e);
      audio.primeAudio();
      cv.setPointerCapture(e.pointerId);
      capturedPointer = e.pointerId;
      tracking = true;
      let { px, py } = toCanvas(e);
      touchAnchor = null;
      if (e.pointerType === 'touch') {
        // Double taps tolerate finger drift in physical screen pixels at any scale.
        if (
          lastTouch &&
          e.timeStamp - lastTouch.time < 450 &&
          Math.hypot(e.clientX - lastTouch.x, e.clientY - lastTouch.y) < 16
        ) {
          px = lastTouch.px;
          py = lastTouch.py;
          touchAnchor = { px, py };
        }
        lastTouch = { x: e.clientX, y: e.clientY, px, py, time: e.timeStamp };
      }
      const right =
        e.button === 2 || (e.pointerType === 'touch' && cv.dataset.rightClick === 'true');
      if (right && cv.dataset.rightClick === 'true') {
        cv.dataset.rightClick = 'false';
        const button = document.getElementById('right-click-toggle');
        button?.setAttribute('aria-pressed', 'false');
        if (button) button.textContent = 'Right';
      }
      input.queueInput({ px, py, down: !right && e.button === 0, rdown: right });
      e.preventDefault();
    });
    lifetime.listen(cv, 'pointermove', (e) => {
      if (!e.isPrimary) return;
      if (cv.dataset.pan === 'true') return;
      if (
        touchAnchor &&
        lastTouch &&
        Math.hypot(e.clientX - lastTouch.x, e.clientY - lastTouch.y) < 16
      ) {
        input.queueInput(touchAnchor);
        return;
      }
      touchAnchor = null;
      const { px, py } = toCanvas(e);
      input.queueInput({ px, py });
    });
    const release = (e: PointerEvent) => {
      if (!e.isPrimary || !tracking) return;
      tracking = false;
      const { px, py } = touchAnchor ?? toCanvas(e);
      input.queueInput({ px, py, down: false, rdown: false });
      releaseCapture();
    };
    lifetime.listen(cv, 'pointerup', release);
    lifetime.listen(cv, 'pointercancel', cancelInput);
    lifetime.listen(cv, 'pointerleave', () => {
      if (!tracking) input.queueInput({ px: -100, py: -100 });
    });
    lifetime.listen(cv, 'lostpointercapture', (event) => {
      if (event.pointerId !== capturedPointer) return;
      capturedPointer = null;
      if (tracking) cancelInput();
    });
    lifetime.listen(cv, 'blur', cancelInput);
    lifetime.listen(cv, 'contextmenu', (e) => e.preventDefault());
    lifetime.listen(
      cv,
      'wheel',
      (e) => {
        if (cv.dataset.pan === 'true') return;
        input.queueInput({ wheel: Math.sign(e.deltaY) });
        e.preventDefault();
      },
      { passive: false },
    );

    // keyboard: printable characters go through io.typed, special keys through io.keyPressed
    const SPECIAL = new Set([
      'Enter',
      'Backspace',
      'Delete',
      'Home',
      'End',
      'Escape',
      'Tab',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'PageUp',
      'PageDown',
      'F1',
      'F2',
      'F3',
      'F4',
      'F6',
      'F7',
      'F8',
      'F9',
      'F5',
      'F10',
      'F11',
      'F12',
    ]);
    lifetime.listen(window, 'keydown', (e) => {
      if (document.activeElement !== cv || e.isComposing) return;
      trackModifiers(e);
      audio.primeAudio();
      const shortcut = resolveGlobalShortcut(e);
      const modifiers = { control: e.ctrlKey || e.metaKey, shift: e.shiftKey, alt: e.altKey };
      if (shortcut) {
        input.queueInput({ key: shortcut, modifiers });
        e.preventDefault();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return; // browser shortcuts pass through
      if (e.key === 'Tab') {
        if (cv.dataset.captureTab === 'true') {
          input.queueInput({ key: 'Tab' });
          e.preventDefault();
        }
        return; // Outside modal dialogs, allow access to the host controls.
      }
      if (e.key.length === 1) {
        input.queueInput({ typed: e.key, key: e.key, modifiers });
        e.preventDefault();
      } else if (SPECIAL.has(e.key)) {
        input.queueInput({ key: e.key, modifiers });
        e.preventDefault();
      }
    });
    lifetime.listen(window, 'keyup', (e) => {
      input.io.keyDown.delete(e.key);
      if (document.activeElement === cv) trackModifiers(e);
    });
    lifetime.listen(window, 'blur', cancelInput);
  } catch (error) {
    lifetime.dispose();
    throw error;
  }
  return lifetime.dispose;
}
