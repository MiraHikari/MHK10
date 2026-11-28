import { STORAGE_KEYS } from '../../../data/storage-keys';
import { createLifetime } from '../../ui/browser/lifetime';
import type { InputController } from '../../ui/canvas/input';
import type { AudioService } from '../audio/pcspeaker';
// Monitor controls stay reachable with the browser's Tab key.

import { chooseDisplayMetrics, type DesktopZoom } from './viewport';
import { CLASSIC_SIZE, type DisplayMetrics, type ResolutionMode } from '../../gfx/display-metrics';

export function mountMonitor(
  canvas: HTMLCanvasElement,
  options: { mode(): ResolutionMode; changed(metrics: DisplayMetrics): void },
  input: InputController,
  audio: AudioService,
) {
  const lifetime = createLifetime();
  try {
    const machine = document.getElementById('machine')!;
    const viewport = document.getElementById('viewport')!;
    const crt = document.getElementById('crt')!;
    const scaleButton = document.getElementById('scale-toggle')!;
    const crtButton = document.getElementById('crt-toggle')!;
    const fullscreenButton = document.getElementById('fullscreen') as HTMLButtonElement;
    const help = document.getElementById('help-dialog') as HTMLDialogElement;
    const keyboardButton = document.getElementById('keyboard-toggle')!;
    const keyboardPanel = document.getElementById('keyboard-panel') as HTMLFormElement;
    const textInput = document.getElementById('desktop-text') as HTMLTextAreaElement;
    let pixelScale = true;
    let scanlines = true;
    let zoom: DesktopZoom = 'fit';
    const zoomButton = document.getElementById('mobile-zoom');
    const panButton = document.getElementById('mobile-pan');
    const setPan = (enabled: boolean) => {
      canvas.dataset.pan = String(enabled);
      machine.classList.toggle('is-panning', enabled);
      canvas.style.touchAction = enabled ? 'pan-x pan-y' : 'none';
      panButton?.setAttribute('aria-pressed', String(enabled));
      if (panButton) panButton.textContent = enabled ? 'Pan: on' : 'Pan';
      input.queueInput({ cancel: true, px: -100, py: -100 });
    };
    try {
      pixelScale = localStorage.getItem(STORAGE_KEYS.pixelScale) !== 'false';
      scanlines = localStorage.getItem(STORAGE_KEYS.crt) !== 'false';
    } catch {
      /* Storage may be unavailable in private browsing. */
    }

    const save = (key: string, value: boolean) => {
      try {
        localStorage.setItem(key, String(value));
      } catch {
        /* Session-only preference. */
      }
    };
    const resize = () => {
      const metrics = chooseDisplayMetrics({
        width: viewport.clientWidth,
        height: viewport.clientHeight,
        pixelScale,
        zoom,
        mode: options.mode(),
        devicePixelRatio: window.devicePixelRatio,
        coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
      });
      options.changed(metrics);
      crt.style.width = `${metrics.cssWidth}px`;
      crt.style.height = `${metrics.cssHeight}px`;
      crt.style.aspectRatio = `${metrics.width} / ${metrics.height}`;
      crt.style.setProperty('--logical-height', String(metrics.height));
      canvas.dataset.resolutionMode = metrics.mode;
      scaleButton.setAttribute('aria-pressed', String(pixelScale));
      const scrollable = zoom !== 'fit';
      viewport.classList.toggle('is-zoomed', scrollable);
      if (zoomButton) {
        zoomButton.textContent = zoom === 'fit' ? 'Zoom' : zoom === 'actual' ? '100%' : '200%';
        zoomButton.setAttribute(
          'aria-label',
          zoom === 'fit' ? 'Zoom: Fit' : zoom === 'actual' ? 'Zoom: 100%' : 'Zoom: 200%',
        );
      }
      if (panButton instanceof HTMLButtonElement) panButton.disabled = !scrollable;
      // Centering can land on a half CSS pixel. Align the monitor origin to the device grid too.
      crt.style.transform = '';
      const bounds = crt.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const dx = Math.round(bounds.left * ratio) / ratio - bounds.left;
      const dy = Math.round(bounds.top * ratio) / ratio - bounds.top;
      if (dx || dy) crt.style.transform = `translate(${dx}px,${dy}px)`;
    };
    if (zoomButton)
      lifetime.listen(zoomButton, 'click', () => {
        zoom = zoom === 'fit' ? 'actual' : zoom === 'actual' ? 'double' : 'fit';
        if (zoom === 'fit') setPan(false);
        resize();
      });
    if (panButton) lifetime.listen(panButton, 'click', () => setPan(canvas.dataset.pan !== 'true'));
    // Follow the visual viewport when a phone keyboard or browser toolbar is visible.
    const resizeViewport = () => {
      machine.style.setProperty(
        '--visible-height',
        `${window.visualViewport?.height ?? window.innerHeight}px`,
      );
    };
    const refreshViewport = () => {
      resizeViewport();
      resize();
    };
    if (window.visualViewport) lifetime.listen(window.visualViewport, 'resize', refreshViewport);
    lifetime.listen(window, 'resize', refreshViewport);
    resizeViewport();
    let lastPoint = { px: CLASSIC_SIZE.width / 2, py: CLASSIC_SIZE.height / 2 };
    const rememberPoint = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      lastPoint = {
        px: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
        py: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
      };
    };
    lifetime.listen(canvas, 'pointerdown', rememberPoint);
    lifetime.listen(canvas, 'pointermove', rememberPoint);
    document.querySelectorAll<HTMLButtonElement>('[data-desktop-key]').forEach((button) => {
      lifetime.listen(button, 'click', () => {
        canvas.focus({ preventScroll: true });
        audio.primeAudio();
        input.queueInput({ key: button.dataset.desktopKey });
      });
    });
    document.querySelectorAll<HTMLButtonElement>('[data-desktop-wheel]').forEach((button) => {
      lifetime.listen(button, 'click', () => {
        canvas.focus({ preventScroll: true });
        input.queueInput({ ...lastPoint, wheel: Number(button.dataset.desktopWheel) });
      });
    });
    const rightButton = document.getElementById('right-click-toggle')!;
    lifetime.listen(rightButton, 'click', () => {
      const enabled = canvas.dataset.rightClick !== 'true';
      canvas.dataset.rightClick = String(enabled);
      rightButton.setAttribute('aria-pressed', String(enabled));
      rightButton.textContent = enabled ? 'Right*' : 'Right';
      rightButton.setAttribute(
        'aria-label',
        enabled ? 'Next tap applies a right click' : 'Right click',
      );
    });
    lifetime.listen(keyboardButton, 'click', () => {
      const composer = machine.querySelector<HTMLInputElement>(
        '[data-assistant-composer]:not([hidden]) #assistant-message',
      );
      if (composer) {
        keyboardPanel.hidden = true;
        keyboardButton.setAttribute('aria-expanded', 'false');
        composer.focus();
        return;
      }
      keyboardPanel.hidden = !keyboardPanel.hidden;
      keyboardButton.setAttribute('aria-expanded', String(!keyboardPanel.hidden));
      if (keyboardPanel.hidden) canvas.focus({ preventScroll: true });
      else textInput.focus({ preventScroll: true });
    });
    lifetime.listen(keyboardPanel, 'submit', (event) => {
      event.preventDefault();
      if (!textInput.value) return;
      // The browser owns composition until Insert is pressed, so IME and paste work.
      const value = textInput.value.replace(/\r\n?/g, '\n');
      canvas.focus({ preventScroll: true });
      audio.primeAudio();
      input.queueInput({ typed: value });
      textInput.value = '';
      document.getElementById('keyboard-status')!.textContent =
        'Text inserted. Use Enter / Send when ready.';
    });
    const updateCrt = () => {
      crt.classList.toggle('clean', !scanlines);
      crtButton.setAttribute('aria-pressed', String(scanlines));
    };
    lifetime.listen(scaleButton, 'click', () => {
      pixelScale = !pixelScale;
      save(STORAGE_KEYS.pixelScale, pixelScale);
      resize();
    });
    lifetime.listen(crtButton, 'click', () => {
      scanlines = !scanlines;
      save(STORAGE_KEYS.crt, scanlines);
      updateCrt();
    });
    fullscreenButton.hidden = !document.fullscreenEnabled;
    lifetime.listen(fullscreenButton, 'click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await machine.requestFullscreen();
      } catch {
        fullscreenButton.textContent = 'Unavailable';
      }
    });
    lifetime.listen(document, 'fullscreenchange', () => {
      fullscreenButton.textContent = document.fullscreenElement
        ? 'Exit full screen'
        : 'Full screen';
      resize();
    });
    lifetime.listen(document.getElementById('help')!, 'click', () => help.showModal());
    lifetime.listen(help, 'close', () => canvas.focus({ preventScroll: true }));
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    lifetime.defer(() => observer.disconnect());
    updateCrt();
    resize();
    return { refresh: resize, dispose: lifetime.dispose };
  } catch (error) {
    lifetime.dispose();
    throw error;
  }
}
