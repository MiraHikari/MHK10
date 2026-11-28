import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { mountImagePresentation } from './image-presentation';

function fixture() {
  const images = [
    {
      src: '/original.png',
      dataset: { originalSrc: '/original.png', pixelSrc: '/pixel.png' },
      style: { imageRendering: 'auto' },
      getAttribute: () => '/original.png',
    },
  ];
  const root = { dataset: { imageStyle: 'original' } };
  const observers: { run: () => void; disconnect: ReturnType<typeof vi.fn> }[] = [];
  const observe = vi.fn();
  const window = new EventTarget();
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', { documentElement: root, body: {}, querySelectorAll: () => images });
  vi.stubGlobal('localStorage', { getItem: () => '{}' });
  vi.stubGlobal(
    'MutationObserver',
    class {
      disconnect = vi.fn();
      observe = observe;
      constructor(readonly run: () => void) {
        observers.push(this);
      }
    },
  );
  return { images, root, observers, observe, window };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('image presentation lifetime', () => {
  it('rolls back both observers if observing additions fails and can mount again', () => {
    const current = fixture();
    current.observe
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw new Error('Observe failed');
      });
    expect(() => mountImagePresentation()).toThrow('Observe failed');
    expect(current.observers.every((observer) => observer.disconnect.mock.calls.length === 1)).toBe(
      true,
    );
    const dispose = mountImagePresentation();
    current.root.dataset.imageStyle = 'pixel';
    current.observers[2].run();
    expect(current.images[0].src).toBe('/pixel.png');
    dispose();
    dispose();
    expect(current.observers.every((observer) => observer.disconnect.mock.calls.length === 1)).toBe(
      true,
    );
  });

  it('ignores queued observer callbacks after disposal and unregisters storage handling', () => {
    const current = fixture();
    const remove = vi.spyOn(current.window, 'removeEventListener');
    const dispose = mountImagePresentation();
    dispose();
    current.root.dataset.imageStyle = 'pixel';
    current.observers.forEach((observer) => observer.run());
    expect(current.images[0].src).toBe('/original.png');
    expect(remove.mock.calls.map(([name]) => name).sort()).toEqual(['pagehide', 'storage']);
  });
});
