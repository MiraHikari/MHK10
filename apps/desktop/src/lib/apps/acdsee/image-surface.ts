import type { ImageBrowserSnapshot } from './image-browser-model';
import { imageProcessingSource } from './image-source-model';
import { paintImageCopy } from './browser-image-copy';
import {
  applyImagePalette,
  hasImageAdjustments,
  imageTransformGeometry,
} from './image-processing-model';
import { createLifetime } from '../../ui/browser/lifetime';

type ImageSurfaceState = Pick<
  ImageBrowserSnapshot,
  'selected' | 'zoom' | 'rotation' | 'flipX' | 'flipY' | 'adjustments' | 'comparing'
>;

/** Owns image loading, adjusted preview, pan capture and resize observation for one viewer. */
export class ImageSurface {
  private readonly lifetime = createLifetime();
  private readonly stage: HTMLElement;
  private readonly view: HTMLImageElement;
  private readonly container: HTMLElement;
  private readonly dimensions: HTMLElement;
  private readonly zoomLabel: HTMLElement;
  private readonly adjusted: HTMLCanvasElement;
  private state: ImageSurfaceState | undefined;
  private pixel = false;
  private epoch = 0;
  private pending: { id: string; src: string; image: HTMLImageElement } | undefined;
  private loaded: { id: string; src: string; image: HTMLImageElement } | undefined;
  private drag: { id: number; x: number; y: number } | undefined;
  private previewSignature = '';
  private previewFailed = false;
  private effectiveZoom = 1;

  constructor(
    root: HTMLElement,
    private readonly report: (message: string) => void,
    private readonly imageBase = '',
  ) {
    const get = <T extends HTMLElement>(selector: string): T => {
      const element = root.querySelector<T>(selector);
      if (!element) throw new Error(`Missing image surface element: ${selector}`);
      return element;
    };
    this.stage = get('#image-stage');
    this.view = get('#image-view');
    this.container = get('#image-surface');
    this.dimensions = get('#image-dimensions');
    this.zoomLabel = get('#image-zoom');
    this.adjusted = document.createElement('canvas');
    try {
      this.preserve(this.view, [
        'src',
        'srcset',
        'sizes',
        'alt',
        'hidden',
        'style',
        'data-rotation',
        'data-flip-x',
        'data-flip-y',
      ]);
      this.preserve(this.container, ['style']);
      this.preserve(this.stage, ['data-pan']);
      const dimensions = this.dimensions.textContent;
      const zoom = this.zoomLabel.textContent;
      this.lifetime.defer(() => {
        this.dimensions.textContent = dimensions;
        this.zoomLabel.textContent = zoom;
      });
      this.adjusted.id = 'image-adjusted';
      this.adjusted.hidden = true;
      this.adjusted.setAttribute('role', 'img');
      this.lifetime.defer(() => {
        this.adjusted.width = 0;
        this.adjusted.height = 0;
        this.adjusted.remove();
      });
      this.container.append(this.adjusted);
      this.lifetime.defer(() => this.suspend());
      this.lifetime.defer(() => this.clearImage());
      this.lifetime.listen(this.stage, 'pointerdown', (event) => {
        if (event.button !== 0 || !this.state?.selected || this.state.zoom === 'fit') return;
        this.suspend();
        this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
        this.stage.setPointerCapture(event.pointerId);
        this.stage.focus();
        event.preventDefault();
      });
      this.lifetime.listen(this.stage, 'pointermove', (event) => {
        const drag = this.drag;
        if (!drag || drag.id !== event.pointerId) return;
        this.stage.scrollLeft += drag.x - event.clientX;
        this.stage.scrollTop += drag.y - event.clientY;
        drag.x = event.clientX;
        drag.y = event.clientY;
      });
      const endDrag = (event: PointerEvent) => {
        if (this.drag?.id === event.pointerId) this.suspend();
      };
      this.lifetime.listen(this.stage, 'pointerup', endDrag);
      this.lifetime.listen(this.stage, 'pointercancel', endDrag);
      this.lifetime.listen(this.stage, 'lostpointercapture', endDrag);
      const observer = new ResizeObserver(() => this.refresh());
      this.lifetime.defer(() => observer.disconnect());
      observer.observe(this.stage);
    } catch (error) {
      this.lifetime.dispose();
      throw error;
    }
  }

  get zoom(): number {
    return this.effectiveZoom;
  }

  /** Replaces the desired presentation; stale image loads cannot adopt or draw it. */
  render(state: ImageSurfaceState, pixel: boolean): void {
    if (this.lifetime.disposed) return;
    this.state = state;
    this.pixel = pixel;
    const item = state.selected;
    if (!item) {
      this.clearImage();
      this.view.removeAttribute('src');
      this.view.removeAttribute('srcset');
      this.view.hidden = true;
      this.adjusted.hidden = true;
      this.dimensions.textContent = '';
      this.zoomLabel.textContent = '';
      return;
    }
    const source = pixel ? item.preview : imageProcessingSource(item, this.imageBase);
    if (this.loaded?.id === item.id && this.loaded.src === source) {
      this.refresh();
      return;
    }
    if (this.pending?.id === item.id && this.pending.src === source) return;
    this.clearImage();
    this.adjusted.hidden = true;
    this.view.style.visibility = '';
    this.view.hidden = true;
    const revision = this.epoch;
    // An independent image owns each load's callbacks. Changing the visible element's
    // handlers alone cannot distinguish an already queued event for an older source.
    const image = new Image();
    this.pending = { id: item.id, src: source, image };
    image.onload = () => {
      if (this.lifetime.disposed || revision !== this.epoch) return;
      image.onload = null;
      image.onerror = null;
      this.pending = undefined;
      this.loaded = { id: item.id, src: source, image };
      this.view.srcset = image.srcset;
      this.view.sizes = image.sizes;
      this.view.src = source;
      this.view.hidden = false;
      this.stage.scrollLeft = 0;
      this.stage.scrollTop = 0;
      this.refresh();
    };
    image.onerror = () => {
      if (this.lifetime.disposed || revision !== this.epoch) return;
      this.clearImage();
      this.report('Unable to load image');
    };
    // Retain the semantic original URL and the smaller catalogue display rendition.
    image.srcset = '';
    image.sizes = '1px';
    image.src = source;
  }

  /** Recalculate fit after the surrounding layout changes without reloading the image. */
  refresh(): void {
    const state = this.state;
    const loaded = this.loaded;
    if (this.lifetime.disposed || !state?.selected || loaded?.id !== state.selected.id) return;
    const image = loaded.image;
    const naturalW = image.naturalWidth;
    const naturalH = image.naturalHeight;
    if (!naturalW || !naturalH) return;
    const naturalGeometry = imageTransformGeometry(naturalW, naturalH, state);
    const hasViewport = this.stage.clientWidth > 0 && this.stage.clientHeight > 0;
    this.effectiveZoom =
      state.zoom === 'fit'
        ? hasViewport
          ? Math.min(
              1,
              Math.max(1, this.stage.clientWidth - 4) / naturalGeometry.width,
              Math.max(1, this.stage.clientHeight - 4) / naturalGeometry.height,
            )
          : 1
        : state.zoom;
    const width = Math.max(1, Math.round(naturalW * this.effectiveZoom));
    const height = Math.max(1, Math.round(naturalH * this.effectiveZoom));
    const geometry = imageTransformGeometry(width, height, state);
    this.container.style.width = `${geometry.width}px`;
    this.container.style.height = `${geometry.height}px`;
    this.view.alt = state.selected.alt;
    this.view.style.width = `${width}px`;
    this.view.style.height = `${height}px`;
    this.view.style.left = '0px';
    this.view.style.top = '0px';
    this.view.style.transformOrigin = '0 0';
    this.view.style.transform = `matrix(${geometry.matrix.join(',')})`;
    this.view.style.imageRendering = this.pixel ? 'pixelated' : 'auto';
    this.view.dataset.rotation = String(state.rotation);
    this.view.dataset.flipX = String(state.flipX);
    this.view.dataset.flipY = String(state.flipY);
    const edited = hasImageAdjustments(state.adjustments) && !state.comparing;
    this.adjusted.hidden = !edited;
    this.view.style.visibility = edited ? 'hidden' : '';
    if (!edited) this.clearPreviewFailure();
    else {
      const signature = JSON.stringify([
        loaded.id,
        loaded.src,
        state.rotation,
        state.flipX,
        state.flipY,
        state.adjustments,
        this.pixel,
      ]);
      try {
        if (signature !== this.previewSignature) {
          paintImageCopy(this.adjusted, image, naturalW, naturalH, state, {
            maxPixels: 1_000_000,
            maxEdge: 1280,
          });
          if (this.pixel) {
            const context = this.adjusted.getContext('2d');
            if (!context) throw new Error('Image preview unavailable');
            const pixels = context.getImageData(0, 0, this.adjusted.width, this.adjusted.height);
            applyImagePalette(pixels.data, this.adjusted.width);
            context.putImageData(pixels, 0, 0);
          }
          this.previewSignature = signature;
          this.clearPreviewFailure();
        }
        this.adjusted.style.width = `${geometry.width}px`;
        this.adjusted.style.height = `${geometry.height}px`;
        this.adjusted.style.imageRendering = this.pixel ? 'pixelated' : 'auto';
        this.adjusted.setAttribute('aria-label', `${state.selected.alt} — adjusted preview`);
      } catch {
        this.previewSignature = '';
        this.previewFailed = true;
        this.adjusted.hidden = true;
        this.view.style.visibility = '';
        this.report(
          'Pixel processing is unavailable for this image. Open a local copy to adjust it.',
        );
      }
    }
    this.stage.dataset.pan = String(state.zoom !== 'fit');
    if (state.zoom === 'fit') this.suspend();
    this.dimensions.textContent = `${naturalW} × ${naturalH}${this.pixel ? ' Pixel preview' : ''}`;
    this.zoomLabel.textContent =
      state.zoom === 'fit' && !hasViewport
        ? 'Fit'
        : `${Math.round(this.effectiveZoom * 100)}%${state.zoom === 'fit' ? ' Fit' : ''}`;
  }

  suspend(): void {
    const drag = this.drag;
    this.drag = undefined;
    if (drag && this.stage.hasPointerCapture(drag.id)) this.stage.releasePointerCapture(drag.id);
  }

  dispose(): void {
    this.lifetime.dispose();
  }

  private clearPreviewFailure(): void {
    if (this.previewFailed) this.report('');
    this.previewFailed = false;
  }

  private clearImage(): void {
    this.epoch++;
    this.suspend();
    for (const candidate of [this.pending, this.loaded]) {
      if (!candidate) continue;
      candidate.image.onload = null;
      candidate.image.onerror = null;
      candidate.image.removeAttribute('srcset');
      candidate.image.removeAttribute('src');
    }
    this.pending = undefined;
    this.loaded = undefined;
    this.previewSignature = '';
  }

  private preserve(element: HTMLElement, names: readonly string[]): void {
    const values = names.map((name) => [name, element.getAttribute(name)] as const);
    this.lifetime.defer(() => {
      for (const [name, value] of values) {
        if (value === null) element.removeAttribute(name);
        else element.setAttribute(name, value);
      }
    });
  }
}
