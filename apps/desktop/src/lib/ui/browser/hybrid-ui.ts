import { createLifetime } from './lifetime';
import { mountBrowserComboboxes } from './browser-combobox';
import { navigateMenu } from '../canvas/menu-navigation';

const mounted = new WeakMap<Document | HTMLElement, () => void>();

/** Shared native-client controls. Original selects remain form/data adapters, never visible menus. */
export function mountHybridUi(root: Document | HTMLElement = document): () => void {
  mounted.get(root)?.();
  const owner = root.ownerDocument ?? (root.nodeType === 9 ? (root as Document) : null);
  if (!owner?.defaultView) return () => {};
  const lifetime = createLifetime();
  mounted.set(root, lifetime.dispose);
  lifetime.defer(() => {
    if (mounted.get(root) === lifetime.dispose) mounted.delete(root);
  });
  try {
    mountHybridUiSession(root, owner, lifetime);
  } catch (error) {
    lifetime.dispose();
    throw error;
  }
  return lifetime.dispose;
}

function mountHybridUiSession(
  root: Document | HTMLElement,
  doc: Document,
  lifetime: ReturnType<typeof createLifetime>,
): void {
  const view = doc.defaultView!;
  const host = root.nodeType === 9 ? doc.body : (root as HTMLElement);
  if (!host.classList.contains('hybrid-ui')) {
    lifetime.defer(() => host.classList.remove('hybrid-ui'));
    host.classList.add('hybrid-ui');
  }
  const isDisabled = (element: Element) =>
    element.matches(':disabled') || !!element.closest('[aria-disabled="true"]');
  const isInteractive = (element: Element) =>
    !isDisabled(element) && !element.closest('[hidden], [aria-hidden="true"], [inert]');
  const comboboxes = mountBrowserComboboxes(root, { isDisabled, isInteractive });
  lifetime.defer(comboboxes.dispose);

  const toolbars = new Map<
    HTMLElement,
    { original: Map<HTMLElement, string | null>; active?: HTMLElement }
  >();
  const menuStyles = new Map<HTMLElement, [string, string]>();
  let menuReturnFocus: HTMLElement | null = null;
  const restoreTabIndex = (item: HTMLElement, value: string | null) => {
    if (value === null) item.removeAttribute('tabindex');
    else item.setAttribute('tabindex', value);
  };
  const toolbarItems = (toolbar: HTMLElement) =>
    Array.from(
      toolbar.querySelectorAll<HTMLElement>('button:not([role="combobox"]), a[href]'),
    ).filter((item) => item.closest('[data-hybrid-toolbar]') === toolbar);
  // checkVisibility 一次判断 display / visibility / content-visibility，
  // 取代 getClientRects()（强制布局）+ getComputedStyle（强制样式解析）
  // 的两段式探测；不支持时退回原逻辑。
  const visibleToolbarItem = (item: HTMLElement) =>
    isInteractive(item) &&
    (typeof item.checkVisibility === 'function'
      ? item.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true })
      : item.getClientRects().length > 0 && view.getComputedStyle(item).visibility === 'visible');

  function refreshToolbar(toolbar: HTMLElement): HTMLElement[] {
    let state = toolbars.get(toolbar);
    if (!state) {
      state = { original: new Map() };
      toolbars.set(toolbar, state);
    }
    const items = toolbarItems(toolbar);
    state.original.forEach((value, item) => {
      if (!items.includes(item)) {
        restoreTabIndex(item, value);
        state.original.delete(item);
      }
    });
    for (const item of items)
      if (!state.original.has(item)) state.original.set(item, item.getAttribute('tabindex'));
    const available = items.filter(visibleToolbarItem);
    state.active =
      available.find((item) => item === doc.activeElement) ??
      available.find((item) => item === state.active) ??
      available[0];
    for (const item of items) {
      const tabIndex = item === state.active ? 0 : -1;
      if (item.getAttribute('tabindex') !== String(tabIndex)) item.tabIndex = tabIndex;
    }
    return available;
  }
  function refreshToolbars() {
    toolbars.forEach((state, toolbar) => {
      if (!root.contains(toolbar) || !toolbar.hasAttribute('data-hybrid-toolbar')) {
        state.original.forEach((value, item) => restoreTabIndex(item, value));
        toolbars.delete(toolbar);
      } else {
        // Release moved controls before another toolbar captures their authored attributes.
        state.original.forEach((value, item) => {
          if (!toolbar.contains(item) || item.closest('[data-hybrid-toolbar]') !== toolbar) {
            restoreTabIndex(item, value);
            state.original.delete(item);
          }
        });
      }
    });
    if (root instanceof view.HTMLElement && root.matches('[data-hybrid-toolbar]'))
      refreshToolbar(root);
    root.querySelectorAll<HTMLElement>('[data-hybrid-toolbar]').forEach(refreshToolbar);
  }
  function fitMenu(details: HTMLDetailsElement) {
    const panel = details.querySelector<HTMLElement>(':scope > :not(summary)');
    if (!panel || !details.open) return;
    if (!menuStyles.has(panel))
      menuStyles.set(panel, [
        panel.style.getPropertyValue('--hybrid-menu-max-height'),
        panel.style.getPropertyValue('--hybrid-menu-offset'),
      ]);
    const bounds = panel.getBoundingClientRect();
    const left = details.getBoundingClientRect().left;
    const offset = Math.max(2, Math.min(left, view.innerWidth - bounds.width - 2)) - left;
    const properties = {
      '--hybrid-menu-max-height': `${Math.max(0, Math.floor(view.innerHeight - bounds.top - 2))}px`,
      '--hybrid-menu-offset': `${Math.round(offset)}px`,
    };
    for (const [name, value] of Object.entries(properties))
      if (panel.style.getPropertyValue(name) !== value) panel.style.setProperty(name, value);
  }
  const restoreMenuStyle = (panel: HTMLElement, values: [string, string]) => {
    ['--hybrid-menu-max-height', '--hybrid-menu-offset'].forEach((name, index) => {
      if (values[index]) panel.style.setProperty(name, values[index]);
      else panel.style.removeProperty(name);
    });
  };
  function fitOpenMenus() {
    menuStyles.forEach((values, panel) => {
      if (!root.contains(panel)) {
        restoreMenuStyle(panel, values);
        menuStyles.delete(panel);
      }
    });
    root
      .querySelectorAll<HTMLDetailsElement>('[data-hybrid-menubar] details[open]')
      .forEach(fitMenu);
  }
  function menuMnemonic(menu: HTMLElement, key: string): boolean {
    const groups = Array.from(menu.querySelectorAll<HTMLDetailsElement>('details')).filter(
      (group) => {
        const summary = group.querySelector<HTMLElement>('summary');
        return !!summary && isInteractive(summary) && summary.getClientRects().length > 0;
      },
    );
    const selected = groups.findIndex((group) => group.contains(doc.activeElement));
    const decision = navigateMenu(
      groups.map((group, index) => {
        const summary = group.querySelector<HTMLElement>('summary')!;
        return {
          command: String(index),
          mnemonic: summary.dataset.mnemonic ?? summary.textContent?.trim().charAt(0),
        };
      }),
      selected,
      key,
    );
    if (decision.type !== 'choose' && decision.type !== 'highlight') return false;
    groups.forEach((group) => {
      group.open = false;
    });
    const next = groups[decision.type === 'choose' ? Number(decision.command) : decision.index];
    if (decision.type === 'choose') {
      next.open = true;
      fitMenu(next);
    }
    next.querySelector<HTMLElement>('summary')?.focus();
    return true;
  }
  lifetime.defer(() => {
    toolbars.forEach((state) =>
      state.original.forEach((value, item) => restoreTabIndex(item, value)),
    );
    toolbars.clear();
    menuStyles.forEach((values, panel) => restoreMenuStyle(panel, values));
    menuStyles.clear();
  });

  function reconcile() {
    comboboxes.refresh();
    refreshToolbars();
    fitOpenMenus();
  }
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (!lifetime.disposed) reconcile();
    });
  });
  lifetime.defer(() => observer.disconnect());
  const attributeFilter = [
    'disabled',
    'selected',
    'label',
    'hidden',
    'aria-disabled',
    'aria-hidden',
    'inert',
    'class',
    'style',
    'data-hybrid-toolbar',
  ];
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter,
  });
  for (let parent = root.parentElement; parent; parent = parent.parentElement)
    observer.observe(parent, { attributes: true, attributeFilter });
  lifetime.listen(view, 'resize', () => {
    refreshToolbars();
    fitOpenMenus();
  });
  lifetime.listen(root, 'focusin', (event) => {
    if (!(event.target instanceof view.HTMLElement)) return;
    const toolbar = event.target.closest<HTMLElement>('[data-hybrid-toolbar]');
    if (toolbar && root.contains(toolbar)) refreshToolbar(toolbar);
  });
  lifetime.listen(
    root,
    'click',
    (event) => {
      if (!(event.target instanceof view.Element)) return;
      const control = event.target.closest(
        'button, input, select, textarea, summary, a[href], [role="tab"], [role="treeitem"], [role="menuitem"], [role="combobox"]',
      );
      // File commands activate their hidden native picker from a visible button.
      // Preserve that browser interaction while still blocking disabled pickers.
      const filePicker = control instanceof view.HTMLInputElement && control.type === 'file';
      if (
        control &&
        root.contains(control) &&
        (isDisabled(control) || (!filePicker && !isInteractive(control)))
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    { capture: true },
  );
  lifetime.listen(
    doc,
    'toggle',
    (event) => {
      const details = event.target as HTMLDetailsElement;
      if (!root.contains(details)) return;
      const menu = details.closest?.('[data-hybrid-menubar]');
      if (menu && root.contains(menu) && details.open) {
        menu.querySelectorAll<HTMLDetailsElement>('details[open]').forEach((other) => {
          if (other !== details) other.open = false;
        });
        fitMenu(details);
      }
    },
    { capture: true },
  );
  lifetime.listen(doc, 'pointerdown', (event) => {
    root
      .querySelectorAll<HTMLDetailsElement>('[data-hybrid-menubar] details[open]')
      .forEach((details) => {
        if (!details.contains(event.target as Node)) details.open = false;
      });
  });
  lifetime.listen(doc, 'keydown', (event) => {
    if (event.defaultPrevented || event.isComposing) return;
    const target = event.target;
    const active = doc.activeElement instanceof view.HTMLElement ? doc.activeElement : null;
    const modalActive = !!active?.closest('dialog[open], [aria-modal="true"]');
    if (
      event.key === 'F10' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.shiftKey
    ) {
      if (modalActive) return;
      const first = Array.from(
        root.querySelectorAll<HTMLElement>('[data-hybrid-menubar] > details > summary'),
      ).find((summary) => isInteractive(summary) && summary.getClientRects().length > 0);
      if (!first) return;
      const current = active?.closest('[data-hybrid-menubar]');
      if (current && root.contains(current)) {
        current.querySelectorAll<HTMLDetailsElement>('details[open]').forEach((group) => {
          group.open = false;
        });
        menuReturnFocus?.focus();
        menuReturnFocus = null;
      } else {
        menuReturnFocus = active;
        first.focus();
      }
      event.preventDefault();
      return;
    }
    if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.length === 1) {
      if (modalActive) return;
      const menu = Array.from(root.querySelectorAll<HTMLElement>('[data-hybrid-menubar]')).find(
        (entry) => isInteractive(entry) && entry.getClientRects().length > 0,
      );
      if (menu && menuMnemonic(menu, event.key)) {
        event.preventDefault();
        return;
      }
    }
    if (!(target instanceof view.HTMLElement) || !root.contains(target) || !isInteractive(target))
      return;
    const toolbar = target.closest<HTMLElement>('[data-hybrid-toolbar]');
    if (
      toolbar &&
      root.contains(toolbar) &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
    ) {
      const items = refreshToolbar(toolbar);
      const index = items.indexOf(target);
      if (index >= 0) {
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
        event.preventDefault();
        items[next]?.focus();
        return;
      }
    }
    const tree = target.closest<HTMLElement>('[data-hybrid-tree]');
    if (
      tree &&
      root.contains(tree) &&
      !tree.hasAttribute('data-tree-controller') &&
      ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)
    ) {
      const rows = Array.from(tree.querySelectorAll<HTMLElement>('[role="treeitem"]')).filter(
        isInteractive,
      );
      const current = rows.indexOf(target.closest<HTMLElement>('[role="treeitem"]')!);
      const index =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? rows.length - 1
            : Math.max(
                0,
                Math.min(rows.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)),
              );
      event.preventDefault();
      rows[index]?.focus();
      rows[index]?.click();
      return;
    }
    const tablist = target.closest<HTMLElement>('[data-hybrid-tabs]');
    if (
      tablist &&
      root.contains(tablist) &&
      ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
    ) {
      const tabs = Array.from(tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]')).filter(
        isInteractive,
      );
      const index = tabs.indexOf(target.closest<HTMLButtonElement>('[role="tab"]')!),
        next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault();
      tabs[next]?.click();
      tabs[next]?.focus();
      return;
    }
    const menu = target.closest<HTMLElement>('[data-hybrid-menubar]');
    const details = target.closest<HTMLDetailsElement>('details');
    if (!menu || !details || !root.contains(menu) || !root.contains(details)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const summary = details.querySelector<HTMLElement>('summary')!;
    if (!details.open && event.key.length === 1 && menuMnemonic(menu, event.key)) {
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      details.open = true;
      fitMenu(details);
    }
    const items = Array.from(details.querySelectorAll<HTMLElement>('button, a[href]')).filter(
      (item) => isInteractive(item) && item.getClientRects().length > 0,
    );
    if (event.key === 'Escape') {
      details.open = false;
      summary.focus();
      event.preventDefault();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const index = items.indexOf(target),
        direction = event.key === 'ArrowDown' ? 1 : -1;
      items[
        index < 0
          ? direction > 0
            ? 0
            : items.length - 1
          : (index + direction + items.length) % items.length
      ]?.focus();
    } else if (details.open && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault();
      (event.key === 'Home' ? items[0] : items.at(-1))?.focus();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const menus = Array.from(menu.querySelectorAll<HTMLDetailsElement>('details')).filter(
        (entry) => {
          const summary = entry.querySelector<HTMLElement>('summary');
          return !!summary && isInteractive(summary);
        },
      );
      const next =
        menus[
          (menus.indexOf(details) + (event.key === 'ArrowRight' ? 1 : -1) + menus.length) %
            menus.length
        ];
      const wasOpen = details.open;
      details.open = false;
      if (next) {
        next.open = wasOpen;
        if (wasOpen) fitMenu(next);
        next.querySelector<HTMLElement>('summary')?.focus();
      }
    } else if (details.open && event.key.length === 1) {
      const decision = navigateMenu(
        items.map((item, index) => ({
          command: (item.dataset.menuCommand ?? item.id) || String(index),
          mnemonic: item.dataset.mnemonic ?? item.textContent?.trim().charAt(0),
        })),
        items.indexOf(target),
        event.key,
      );
      if (decision.type === 'highlight') {
        items[decision.index]?.focus();
        event.preventDefault();
      } else if (decision.type === 'choose') {
        const selected = items.find(
          (item, index) =>
            ((item.dataset.menuCommand ?? item.id) || String(index)) === decision.command,
        );
        selected?.click();
        details.open = false;
        event.preventDefault();
      }
    }
  });
  lifetime.listen(view, 'pagehide', (event) => {
    if (event.persisted) comboboxes.close();
    else lifetime.dispose();
  });
  reconcile();
}
