import { describe, expect, it, vi } from 'vite-plus/test';
import { claimSurface, createLifetime } from './lifetime';

describe('resource ownership', () => {
  it('removes listeners and releases resources once in reverse order', () => {
    const scope = createLifetime();
    const target = new EventTarget();
    const effect = vi.fn();
    const order: number[] = [];
    scope.listen(target, 'click', effect);
    scope.defer(() => order.push(1));
    scope.defer(() => order.push(2));
    expect(scope.disposed).toBe(false);
    target.dispatchEvent(new Event('click'));
    scope.dispose();
    scope.dispose();
    expect(scope.disposed).toBe(true);
    target.dispatchEvent(new Event('click'));
    expect(effect).toHaveBeenCalledTimes(1);
    expect(order).toEqual([2, 1]);
    scope.defer(() => order.push(3));
    expect(order).toEqual([2, 1, 3]);
  });
});

describe.each([
  { kind: 'HTML element', create: () => ({}) as HTMLElement },
  { kind: 'canvas', create: () => ({}) as HTMLCanvasElement },
])('$kind session ownership', ({ create }) => {
  it('rejects duplicate mounts until the surface is released', () => {
    const surface = create();
    const lifetime = createLifetime();
    lifetime.defer(claimSurface(surface));
    expect(() => claimSurface(surface)).toThrow('active session');
    lifetime.dispose();

    const nextLifetime = createLifetime();
    nextLifetime.defer(claimSurface(surface));
    lifetime.dispose();
    expect(() => claimSurface(surface)).toThrow('active session');
    nextLifetime.dispose();
    claimSurface(surface)();
  });

  it('does not let an old release clear a newer claim', () => {
    const surface = create();
    const release = claimSurface(surface);
    release();
    const releaseNext = claimSurface(surface);

    release();
    expect(() => claimSurface(surface)).toThrow('active session');
    releaseNext();
    claimSurface(surface)();
  });
});
