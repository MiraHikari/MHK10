import type { createLifetime } from '../../ui/browser/lifetime';
import {
  ReaderNavigationModel,
  type ReaderNavigationEntry,
  type ReaderNavigationTarget,
} from './reader-navigation-model';

export interface ReaderNavigationActions {
  /** Current book destinations. An empty list makes navigation unavailable. */
  entries(): readonly ReaderNavigationEntry[];
  /** Synchronous dispatch may open another Reader dialog. */
  activate(target: ReaderNavigationTarget): void;
}

/** Own Jump To interaction and teardown inside the Reader session's lifetime. */
export function mountReaderNavigation(
  root: HTMLElement,
  lifetime: ReturnType<typeof createLifetime>,
  actions: ReaderNavigationActions,
) {
  const get = <T extends HTMLElement>(selector: string): T => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing Reader navigation element: ${selector}`);
    return element;
  };
  const document = root.ownerDocument;
  const dialog = get<HTMLDialogElement>('#reader-jump');
  const query = get<HTMLInputElement>('#reader-jump-query');
  const results = get<HTMLElement>('#reader-jump-results');
  const count = get<HTMLElement>('#reader-jump-count');
  const go = get<HTMLButtonElement>('#reader-jump-go');
  const form = get<HTMLFormElement>('#reader-jump-form');
  const cancel = get<HTMLButtonElement>('[data-reader-navigation-close]');
  const viewport = get<HTMLElement>('#reader-viewport');
  const model = new ReaderNavigationModel();
  let returnFocus: HTMLElement | undefined;

  function close(restoreFocus = true): void {
    const previous = returnFocus;
    returnFocus = undefined;
    if (dialog.open) dialog.close();
    query.setAttribute('aria-expanded', 'false');
    query.removeAttribute('aria-activedescendant');
    if (!restoreFocus || lifetime.disposed) return;
    const available =
      previous?.isConnected &&
      root.contains(previous) &&
      previous.getClientRects().length > 0 &&
      !previous.closest('[inert]') &&
      !previous.matches(':disabled');
    (available ? previous : viewport).focus({ preventScroll: true });
  }
  lifetime.defer(() => {
    close(false);
    model.update([]);
    results.replaceChildren();
    query.value = '';
    count.textContent = '';
    go.disabled = true;
  });

  function render(): void {
    const state = model.snapshot();
    const fragment = document.createDocumentFragment();
    let activeOption: HTMLButtonElement | undefined;
    for (const [index, entry] of state.results.entries()) {
      const option = document.createElement('button');
      option.type = 'button';
      option.tabIndex = -1;
      option.id = `reader-jump-option-${index}`;
      option.dataset.readerJump = entry.id;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(entry.id === state.activeId));
      const kind = document.createElement('span');
      kind.className = 'reader-jump-kind';
      kind.textContent = entry.target.kind[0].toUpperCase() + entry.target.kind.slice(1);
      const copy = document.createElement('span');
      copy.className = 'reader-jump-copy';
      const label = document.createElement('span');
      label.className = 'reader-jump-label';
      label.textContent = entry.label;
      const detail = document.createElement('span');
      detail.className = 'reader-jump-detail';
      detail.textContent = entry.detail;
      copy.append(label, detail);
      option.append(kind, copy);
      fragment.append(option);
      if (entry.id === state.activeId) activeOption = option;
    }
    results.replaceChildren(fragment);
    go.disabled = !activeOption;
    if (activeOption) {
      query.setAttribute('aria-activedescendant', activeOption.id);
      activeOption.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } else query.removeAttribute('aria-activedescendant');
    count.textContent =
      state.total === 0
        ? 'No matching destinations.'
        : state.total > state.results.length
          ? `Showing ${state.results.length} of ${state.total}. Refine your search.`
          : `${state.total} destination${state.total === 1 ? '' : 's'}. Up / Down to choose.`;
  }

  function refresh(): void {
    if (lifetime.disposed || !dialog.open) return;
    const entries = actions.entries();
    if (!entries.length) {
      close(false);
      return;
    }
    model.update(entries, query.value);
    render();
  }

  function open(): boolean {
    if (lifetime.disposed || root.querySelector('dialog[open]')) return false;
    const entries = actions.entries();
    if (!entries.length) return false;
    root
      .querySelectorAll<HTMLDetailsElement>('[data-hybrid-menubar] details[open]')
      .forEach((menu) => (menu.open = false));
    const active = document.activeElement;
    returnFocus = active instanceof HTMLElement && root.contains(active) ? active : undefined;
    query.value = '';
    model.update([]);
    model.update(entries);
    dialog.showModal();
    query.setAttribute('aria-expanded', 'true');
    render();
    query.focus({ preventScroll: true });
    return true;
  }

  function activate(id: string | undefined): void {
    if (!id || lifetime.disposed || !dialog.open) return;
    const entry = actions.entries().find((item) => item.id === id);
    if (!entry) {
      refresh();
      if (dialog.open) {
        count.textContent = 'That destination is no longer available. Choose another.';
        query.focus();
      }
      return;
    }
    close(false);
    actions.activate(entry.target);
    if (!lifetime.disposed && !root.querySelector('dialog[open]'))
      viewport.focus({ preventScroll: true });
  }

  lifetime.listen(query, 'input', refresh);
  lifetime.listen(query, 'keydown', (event) => {
    if (event.defaultPrevented || event.isComposing || !dialog.open) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      model.move(event.key === 'ArrowDown' ? 1 : -1);
      render();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      activate(model.snapshot().activeId);
    }
  });
  lifetime.listen(form, 'submit', (event) => {
    event.preventDefault();
    activate(model.snapshot().activeId);
  });
  lifetime.listen(results, 'click', (event) => {
    if (!(event.target instanceof Element)) return;
    const destination = event.target.closest<HTMLButtonElement>('[data-reader-jump]');
    if (destination) activate(destination.dataset.readerJump);
  });
  lifetime.listen(cancel, 'click', () => close());
  lifetime.listen(dialog, 'cancel', (event) => {
    event.preventDefault();
    close();
  });
  lifetime.listen(root, 'keydown', (event) => {
    if (event.defaultPrevented || event.isComposing) return;
    const shortcut =
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === 'k';
    const activeDialog = root.querySelector('dialog[open]');
    if (activeDialog) {
      if (activeDialog !== dialog) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      } else if (shortcut) {
        event.preventDefault();
        query.focus();
      }
      return;
    }
    const typing =
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement ||
      (event.target instanceof HTMLElement && event.target.isContentEditable);
    if (shortcut && !typing && open()) event.preventDefault();
  });

  return { open, refresh };
}
