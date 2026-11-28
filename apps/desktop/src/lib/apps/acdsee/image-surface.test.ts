import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { ImageSurface } from './image-surface';
import { ImageBrowser } from './image-browser-model';
import { paintImageCopy } from './browser-image-copy';
import type { MediaRecord } from '../../../data/media';

vi.mock('./browser-image-copy', () => ({ paintImageCopy: vi.fn() }));

class ElementFixture extends EventTarget {
  readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly children: ElementFixture[] = [];
  readonly captures = new Set<number>();
  readonly listeners = new Set<EventListenerOrEventListenerObject>();
  textContent = '';
  id = '';
  hidden = false;
  width = 0;
  height = 0;
  clientWidth = 204;
  clientHeight = 104;
  scrollLeft = 0;
  scrollTop = 0;
  removed = false;
  focus = vi.fn();
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
  append(element: ElementFixture) {
    this.children.push(element);
  }
  remove() {
    this.removed = true;
  }
  setPointerCapture(id: number) {
    this.captures.add(id);
  }
  releasePointerCapture(id: number) {
    this.captures.delete(id);
  }
  hasPointerCapture(id: number) {
    return this.captures.has(id);
  }
  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ) {
    super.addEventListener(type, listener, options);
    if (listener) this.listeners.add(listener);
  }
  override removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ) {
    super.removeEventListener(type, listener, options);
    if (listener) this.listeners.delete(listener);
  }
  getContext() {
    return { getImageData: () => ({ data: new Uint8ClampedArray(0) }), putImageData: vi.fn() };
  }
}
class ImageFixture extends ElementFixture {
  src = '';
  srcset = '';
  sizes = '';
  alt = '';
  naturalWidth = 400;
  naturalHeight = 200;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
}
function fixture() {
  const images: ImageFixture[] = [];
  const observers: { disconnect: ReturnType<typeof vi.fn>; resize: () => void }[] = [];
  const observe = vi.fn();
  vi.stubGlobal(
    'Image',
    class extends ImageFixture {
      constructor() {
        super();
        images.push(this);
      }
    },
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      disconnect = vi.fn();
      constructor(readonly resize: () => void) {
        observers.push(this);
      }
      observe = observe;
    },
  );
  vi.stubGlobal('document', { createElement: () => new ElementFixture() });
  const makeRoot = () => {
    const stage = new ElementFixture();
    const view = new ImageFixture();
    const container = new ElementFixture();
    const dimensions = new ElementFixture();
    const zoom = new ElementFixture();
    const elements: Record<string, ElementFixture> = {
      '#image-stage': stage,
      '#image-view': view,
      '#image-surface': container,
      '#image-dimensions': dimensions,
      '#image-zoom': zoom,
    };
    const root = {
      querySelector: (selector: string) => elements[selector],
    } as unknown as HTMLElement;
    return { stage, view, container, dimensions, zoom, root };
  };
  return { images, observers, observe, makeRoot };
}
const records: MediaRecord[] = ['first', 'second'].map((id) => ({
  id,
  title: id,
  alt: id,
  original: `/${id}.png`,
  display: `/${id}-display.png`,
  preview: `/${id}-pixel.png`,
  date: '',
  folders: [],
  image: { width: 400, height: 200, bytes: 3, format: 'PNG' },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(paintImageCopy).mockReset();
});

describe('ImageSurface', () => {
  it('rejects stale load callbacks and interleaves independent sizes, transforms and pixel presentation', () => {
    const current = fixture();
    const firstRoot = current.makeRoot();
    const secondRoot = current.makeRoot();
    secondRoot.stage.clientWidth = 404;
    secondRoot.stage.clientHeight = 404;
    const first = new ImageSurface(firstRoot.root, vi.fn());
    const second = new ImageSurface(secondRoot.root, vi.fn());
    const firstModel = new ImageBrowser(records);
    const secondModel = new ImageBrowser(records);
    first.render(firstModel.snapshot(), false);
    const late = current.images[0].onload!;
    firstModel.move(1);
    first.render(firstModel.snapshot(), false);
    secondModel.rotate();
    second.render(secondModel.snapshot(), true);
    current.images[2].onload!();
    current.images[1].onload!();
    late();
    expect(firstRoot.view.src).toBe('/second-display.png');
    expect(firstRoot.view.srcset).toBe('');
    expect(firstRoot.view.dataset.rotation).toBe('0');
    expect(first.zoom).toBe(0.5);
    expect(firstRoot.container.style.width).toBe('200px');
    expect(secondRoot.view.src).toBe('/first-pixel.png');
    expect(secondRoot.view.dataset.rotation).toBe('90');
    expect(secondRoot.dimensions.textContent).toBe('400 × 200 Pixel preview');
    expect(second.zoom).toBe(1);
    first.dispose();
    first.dispose();
    late();
    expect(current.observers[0].disconnect).toHaveBeenCalledOnce();
    expect(firstRoot.container.children[0].removed).toBe(true);
    secondModel.setZoom(2);
    second.render(secondModel.snapshot(), true);
    expect(secondRoot.container.style.height).toBe('800px');
    expect(current.observers[1].disconnect).not.toHaveBeenCalled();
    second.dispose();
  });

  it('caches unchanged adjusted previews, recovers after draw failure and compares without losing edits', () => {
    const current = fixture();
    const elements = current.makeRoot();
    const report = vi.fn();
    const surface = new ImageSurface(elements.root, report);
    const model = new ImageBrowser(records);
    model.adjust({ brightness: 10 });
    surface.render(model.snapshot(), false);
    current.images[0].onload!();
    surface.refresh();
    expect(paintImageCopy).toHaveBeenCalledOnce();
    expect(elements.container.children[0].hidden).toBe(false);
    vi.mocked(paintImageCopy).mockImplementationOnce(() => {
      throw new Error('Draw failed');
    });
    model.rotate();
    surface.render(model.snapshot(), false);
    expect(elements.container.children[0].hidden).toBe(true);
    expect(elements.view.style.visibility).toBe('');
    expect(report).toHaveBeenLastCalledWith(
      'Pixel processing is unavailable for this image. Open a local copy to adjust it.',
    );
    surface.refresh();
    expect(elements.container.children[0].hidden).toBe(false);
    expect(report).toHaveBeenLastCalledWith('');
    model.compare(true);
    surface.render(model.snapshot(), false);
    expect(elements.container.children[0].hidden).toBe(true);
    model.compare(false);
    surface.render(model.snapshot(), false);
    expect(paintImageCopy).toHaveBeenCalledTimes(3);
    surface.dispose();
    expect(elements.container.children[0].width).toBe(0);
  });

  it('owns pan capture through fit, cancellation and disposal and unregisters all listeners', () => {
    const current = fixture();
    const elements = current.makeRoot();
    const surface = new ImageSurface(elements.root, vi.fn());
    const model = new ImageBrowser(records);
    model.setZoom(2);
    surface.render(model.snapshot(), false);
    current.images[0].onload!();
    const pointer = (type: string, x: number, y: number) =>
      elements.stage.dispatchEvent(
        Object.assign(new Event(type, { cancelable: true }), {
          pointerId: 7,
          button: 0,
          clientX: x,
          clientY: y,
        }),
      );
    pointer('pointerdown', 20, 20);
    pointer('pointermove', 10, 15);
    expect(elements.stage.hasPointerCapture(7)).toBe(true);
    expect([elements.stage.scrollLeft, elements.stage.scrollTop]).toEqual([10, 5]);
    model.setZoom('fit');
    surface.render(model.snapshot(), false);
    expect(elements.stage.hasPointerCapture(7)).toBe(false);
    model.setZoom(2);
    surface.render(model.snapshot(), false);
    pointer('pointerdown', 20, 20);
    pointer('pointercancel', 20, 20);
    expect(elements.stage.hasPointerCapture(7)).toBe(false);
    pointer('pointerdown', 20, 20);
    surface.dispose();
    expect(elements.stage.hasPointerCapture(7)).toBe(false);
    expect(elements.stage.listeners.size).toBe(0);
  });

  it('rolls back failed observation and can be mounted again with no old callbacks', () => {
    const current = fixture();
    const elements = current.makeRoot();
    current.observe.mockImplementationOnce(() => {
      throw new Error('Observe failed');
    });
    expect(() => new ImageSurface(elements.root, vi.fn())).toThrow('Observe failed');
    expect(current.observers[0].disconnect).toHaveBeenCalledOnce();
    expect(elements.stage.listeners.size).toBe(0);
    expect(elements.container.children[0].removed).toBe(true);
    const surface = new ImageSurface(elements.root, vi.fn());
    const model = new ImageBrowser(records);
    surface.render(model.snapshot(), false);
    const late = current.images[0].onload!;
    surface.dispose();
    late();
    expect(elements.view.src).toBe('');
    const remounted = new ImageSurface(elements.root, vi.fn());
    remounted.render(model.snapshot(), false);
    current.images[1].onload!();
    expect(elements.view.src).toBe('/first-display.png');
    remounted.dispose();
  });
});
