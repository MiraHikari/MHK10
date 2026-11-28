import { afterEach, expect, it, vi } from 'vite-plus/test';
import { canvasFixture, makeTestCanvas } from '../../gfx/canvas-fixture';
import { createPointerLayer } from './pointer-layer';

const mounted: ReturnType<typeof createPointerLayer>[] = [];
afterEach(() => {
  mounted.splice(0).forEach((pointer) => pointer.dispose());
  vi.unstubAllGlobals();
});

function setup(
  options: { staticParent?: boolean; failAppend?: boolean; noContext?: boolean } = {},
) {
  const raster = canvasFixture();
  const layer = Object.assign(raster.canvas, {
    style: {} as Record<string, string>,
    setAttribute: vi.fn(),
    remove: vi.fn(),
  });
  const screenRaster = canvasFixture();
  const parent = {
    style: { position: '' },
    append: vi.fn(() => {
      if (options.failAppend) throw new Error('Append failed');
    }),
  };
  const screen = Object.assign(screenRaster.canvas, {
    parentElement: parent,
    offsetLeft: 7,
    offsetTop: 9,
    getBoundingClientRect: () => ({ width: 1280, height: 720 }),
  });
  let first = true;
  vi.stubGlobal('document', {
    createElement: () => {
      if (!first) return makeTestCanvas();
      first = false;
      return layer;
    },
  });
  vi.stubGlobal('getComputedStyle', () => ({
    position: options.staticParent ? 'static' : 'relative',
  }));
  if (options.noContext) layer.getContext = (() => null) as HTMLCanvasElement['getContext'];
  const mount = () => {
    const pointer = createPointerLayer(screen as unknown as HTMLCanvasElement);
    mounted.push(pointer);
    return pointer;
  };
  return {
    mount,
    layer,
    context: raster.context,
    screen,
    screenContext: screenRaster.context,
    parent,
  };
}

it('resizes its own raster and draws past the former desktop limits', () => {
  const current = setup();
  const pointer = current.mount();
  current.screen.width = 960;
  current.screen.height = 536;
  pointer.draw(900, 500, 'arrow', true);
  expect([current.layer.width, current.layer.height]).toEqual([960, 536]);
  expect(current.context.clearRect).toHaveBeenCalledWith(0, 0, 960, 536);
  expect(current.context.drawImage).toHaveBeenCalledWith(expect.anything(), 900, 500, 12, 19);
  expect(current.screenContext.clearRect).not.toHaveBeenCalled();
  expect(current.screenContext.drawImage).not.toHaveBeenCalled();
});

it('keeps integer pointer drawing in a transparent overlay without touching the screen target', () => {
  const current = setup();
  const pointer = current.mount();
  pointer.draw(100.9, 70.9, 'arrow', true);
  expect(current.context.drawImage).toHaveBeenCalledWith(expect.anything(), 100, 70, 12, 19);
  expect(current.layer.style.pointerEvents).toBe('none');
  expect(Number(current.layer.style.zIndex)).toBeGreaterThan(2);
  expect(current.layer.style.width).toBe('1280px');
  expect(current.layer.style.height).toBe('720px');
  expect(current.screenContext.drawImage).not.toHaveBeenCalled();
});

it('skips clear and cursor writes when the pointer and cursor kind stay put', () => {
  const current = setup();
  const pointer = current.mount();
  pointer.draw(10.2, 10.4, 'arrow', true);
  current.context.clearRect.mockClear();
  const left = current.layer.style.left;
  pointer.draw(10.8, 10.2, 'arrow', true);
  expect(current.context.clearRect).not.toHaveBeenCalled();
  expect(current.layer.style.left).toBe(left);
  pointer.draw(10.8, 10.2, 'ibeam', true);
  expect(current.context.clearRect).toHaveBeenCalledTimes(1);
});

it('clears the last pointer when leaving the monitor or entering a hidden phase', () => {
  const current = setup();
  const pointer = current.mount();
  pointer.draw(-100, -100, 'arrow', true);
  pointer.draw(10, 10, 'arrow', false);
  expect(current.context.clearRect).toHaveBeenCalledTimes(2);
  expect(current.context.drawImage).not.toHaveBeenCalled();
});

it('restores only its own context after a draw failure and leaves the other pointer usable', () => {
  const first = setup();
  const pointerA = first.mount();
  const second = setup();
  const pointerB = second.mount();
  first.context.drawImage.mockImplementationOnce(() => {
    throw new Error('Drawing failed');
  });
  expect(() => pointerA.draw(10, 10, 'arrow', true)).toThrow('Drawing failed');
  expect(first.context.restore).toHaveBeenCalledOnce();
  expect(second.context.restore).not.toHaveBeenCalled();
  pointerB.draw(20, 30, 'arrow', true);
  pointerA.dispose();
  pointerA.dispose();
  pointerB.draw(30, 40, 'arrow', true);
  expect(second.context.drawImage).toHaveBeenLastCalledWith(expect.anything(), 30, 40, 12, 19);
  expect(first.layer.remove).toHaveBeenCalledOnce();
  expect(second.layer.remove).not.toHaveBeenCalled();
  const frames = first.context.clearRect.mock.calls.length;
  pointerA.draw(40, 50, 'arrow', true);
  expect(first.context.clearRect).toHaveBeenCalledTimes(frames);
});

it('restores parent positioning and releases the owned canvas after initialization failure', () => {
  for (const options of [{ failAppend: true }, { noContext: true }]) {
    const current = setup({ ...options, staticParent: true });
    expect(current.mount).toThrow();
    expect(current.parent.style.position).toBe('');
    expect(current.layer.remove).toHaveBeenCalledOnce();
  }
});
