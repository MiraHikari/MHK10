import { createLifetime } from '../../ui/browser/lifetime';
import { resolveAppHref } from '../desktop/desktop-state';
import { THEMES } from '../../gfx/palette';
import { resolveGlobalShortcut } from '../../ui/browser/keyboard-shortcuts';

export type BridgeMessage =
  | { type: 'doom95:open'; id: string; href?: string }
  | { type: 'doom95:focus' | 'doom95:close'; id: string }
  | { type: 'doom95:start' }
  | { type: 'doom95:theme'; theme: string }
  | { type: 'doom95:doom'; value: number };

/** Parse untrusted messages before dispatch. Legacy protocol names remain compatible. */
export function parseBridgeMessage(value: unknown): BridgeMessage | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  switch (data.type) {
    case 'doom95:open':
      if (
        typeof data.id !== 'string' ||
        data.id.length > 80 ||
        (data.href !== undefined && typeof data.href !== 'string')
      )
        return null;
      return { type: data.type, id: data.id, href: data.href as string | undefined };
    case 'doom95:focus':
    case 'doom95:close':
      return typeof data.id === 'string' && data.id.length <= 80
        ? { type: data.type, id: data.id }
        : null;
    case 'doom95:start':
      return { type: data.type };
    case 'doom95:theme': {
      const theme = data.theme ?? data.value;
      return typeof theme === 'string' && Object.hasOwn(THEMES, theme)
        ? { type: data.type, theme }
        : null;
    }
    case 'doom95:doom':
      return typeof data.value === 'number' &&
        Number.isFinite(data.value) &&
        data.value >= 0 &&
        data.value <= 99.9
        ? { type: data.type, value: data.value }
        : null;
    default:
      return null;
  }
}

/** Personal documents need a bridge, not a second desktop implementation. */
export function mountEmbeddedBridge(): () => void {
  const lifetime = createLifetime();
  if (window.self === window.top) return lifetime.dispose;
  document.documentElement.classList.add('is-embedded');
  lifetime.listen(window, 'message', (event) => {
    if (event.origin !== location.origin || event.source !== window.parent) return;
    const data = parseBridgeMessage(event.data);
    if (data?.type === 'doom95:theme') {
      document.documentElement.dataset.theme = data.theme;
      window.dispatchEvent(new CustomEvent('doom95:theme', { detail: { theme: data.theme } }));
    }
  });
  lifetime.listen(document, 'click', (event) => {
    if (
      event.defaultPrevented ||
      !(event.target instanceof Element) ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = event.target.closest<HTMLAnchorElement>('[data-app-link]');
    const id = link?.dataset.appLink;
    if (
      !link ||
      !id ||
      !resolveAppHref(id, link.getAttribute('href') ?? undefined, location.origin)
    )
      return;
    event.preventDefault();
    window.parent.postMessage(
      { type: 'doom95:open', id, href: link.getAttribute('href') ?? undefined },
      location.origin,
    );
  });
  lifetime.listen(document, 'pointerdown', () => {
    const id = document.querySelector<HTMLElement>('#primary-window')?.dataset.window;
    if (id) window.parent.postMessage({ type: 'doom95:focus', id }, location.origin);
  });
  lifetime.listen(document, 'keydown', (event) => {
    if (resolveGlobalShortcut(event) !== 'StartMenu') return;
    event.preventDefault();
    window.parent.postMessage({ type: 'doom95:start' }, location.origin);
  });
  lifetime.listen(window, 'pagehide', (event) => {
    if (!event.persisted) lifetime.dispose();
  });
  return lifetime.dispose;
}
