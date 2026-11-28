/** Own browser resources as a group. Disposing never saves or closes an application. */
export function createLifetime() {
  const cleanups: (() => void)[] = [];
  let disposed = false;
  const defer = (cleanup: () => void) => {
    if (disposed) cleanup();
    else cleanups.push(cleanup);
  };
  type Events = WindowEventMap & DocumentEventMap & HTMLElementEventMap & MediaQueryListEventMap;
  return {
    get disposed() {
      return disposed;
    },
    defer,
    listen<K extends keyof Events>(
      target: EventTarget,
      type: K,
      listener: (event: Events[K]) => void,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (disposed) return;
      const handler = listener as EventListener;
      target.addEventListener(type, handler, options);
      defer(() => target.removeEventListener(type, handler, options));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const errors: unknown[] = [];
      for (const cleanup of cleanups.splice(0).reverse()) {
        try {
          cleanup();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) console.error('Some desktop resources could not be released', errors);
    },
  };
}

const surfaces = new WeakSet<HTMLElement>();

/** A duplicate mount must not silently discard the existing editor session. */
export function claimSurface(surface: HTMLElement): () => void {
  if (surfaces.has(surface)) throw new Error('This surface already has an active session');
  surfaces.add(surface);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    surfaces.delete(surface);
  };
}
