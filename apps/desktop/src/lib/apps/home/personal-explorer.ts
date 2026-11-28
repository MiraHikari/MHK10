import { createLifetime } from '../../ui/browser/lifetime';

const mounted = new WeakMap<HTMLElement, () => void>();
/** Explorer-style selection is opt-in; unmodified anchors retain their real destinations. */
export function mountPersonalExplorer(root: HTMLElement): () => void {
  mounted.get(root)?.();
  const lifetime = createLifetime();
  try {
    const groups = [...root.querySelectorAll<HTMLElement>('[data-folder-items]')];
    const tree = [...root.querySelectorAll<HTMLAnchorElement>('[data-folder]')];
    const previews = [...root.querySelectorAll<HTMLElement>('[data-preview]')];
    const properties = root.querySelector<HTMLAnchorElement>('[data-explorer-properties]')!;
    const address = root.querySelector<HTMLInputElement>('#personal-location')!;
    const context = root.querySelector<HTMLElement>('.explorer-context')!;
    const initialClass = root.getAttribute('class');
    const visibility = [...groups, ...previews].map(
      (element) => [element, element.hidden] as const,
    );
    lifetime.defer(() => {
      if (initialClass === null) root.removeAttribute('class');
      else root.setAttribute('class', initialClass);
      for (const [element, hidden] of visibility) element.hidden = hidden;
      if (context) context.hidden = true;
      mounted.delete(root);
    });
    const selected = new Map<string, string>();
    const trail: string[] = [];
    let folder = 'home',
      activating = false;
    let foldersVisible = root.clientWidth >= 440;
    const items = () => [
      ...groups
        .find((group) => group.dataset.folderItems === folder)!
        .querySelectorAll<HTMLAnchorElement>('[data-explorer-item]'),
    ];
    const current = () =>
      items().find((item) => item.dataset.explorerItem === selected.get(folder)) ?? items()[0];
    const closeContext = () => {
      context.hidden = true;
    };
    function render() {
      const group = groups.find((item) => item.dataset.folderItems === folder)!;
      groups.forEach((item) => {
        item.hidden = item !== group;
      });
      const item = current();
      selected.set(folder, item.dataset.explorerItem!);
      items().forEach((link) => {
        link.setAttribute('aria-selected', String(link === item));
        link.tabIndex = link === item ? 0 : -1;
      });
      tree.forEach((link) => {
        const active = link.dataset.folder === folder;
        link.setAttribute('aria-selected', String(active));
        link.tabIndex = active ? 0 : -1;
      });
      previews.forEach((preview) => {
        preview.hidden = preview.dataset.preview !== item.dataset.explorerItem;
      });
      address.value = `MiraHikari\\${group.dataset.folderName}`;
      properties.href = item.dataset.properties ?? '/about/';
      root.querySelector('[data-explorer-count]')!.textContent = `${items().length} objects`;
      root.querySelector('[data-explorer-selection]')!.textContent = item.textContent?.trim() ?? '';
      root.querySelector<HTMLButtonElement>('[data-explorer-command="back"]')!.disabled =
        trail.length === 0;
      root.querySelector<HTMLButtonElement>('[data-explorer-command="up"]')!.disabled =
        folder === 'home';
      root.classList.toggle('show-folders', foldersVisible);
      root
        .querySelector('[data-explorer-command="folders"]')!
        .setAttribute('aria-pressed', String(foldersVisible));
    }
    function navigate(next: string, record = true, updateUrl = true) {
      if (!groups.some((group) => group.dataset.folderItems === next)) return;
      if (record && next !== folder) trail.push(folder);
      folder = next;
      if (updateUrl && location.hash !== `#folder-${folder}`)
        history.pushState(null, '', `#folder-${folder}`);
      closeContext();
      render();
    }
    function select(item: HTMLAnchorElement, focus = false) {
      selected.set(folder, item.dataset.explorerItem!);
      render();
      if (focus) {
        item.focus({ preventScroll: true });
        item.scrollIntoView({ block: 'nearest' });
      }
    }
    function activate(item = current()) {
      closeContext();
      if (item.dataset.targetFolder) {
        navigate(item.dataset.targetFolder);
        current().focus();
        return;
      }
      activating = true;
      try {
        item.click();
      } finally {
        activating = false;
      }
    }
    root.classList.add('explorer-ready');
    for (const link of tree) {
      lifetime.listen(link, 'click', (event) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(link.dataset.folder!);
      });
      lifetime.listen(link, 'keydown', (event) => {
        const index = tree.indexOf(link);
        const next =
          event.key === 'Home' || event.key === 'ArrowLeft'
            ? 0
            : event.key === 'End'
              ? tree.length - 1
              : event.key === 'ArrowDown' || event.key === 'ArrowRight'
                ? Math.min(tree.length - 1, index + 1)
                : event.key === 'ArrowUp'
                  ? Math.max(0, index - 1)
                  : -1;
        if (next >= 0) {
          event.preventDefault();
          navigate(tree[next].dataset.folder!);
          tree[next].focus();
        }
      });
    }
    for (const item of root.querySelectorAll<HTMLAnchorElement>('[data-explorer-item]')) {
      lifetime.listen(item, 'click', (event) => {
        if (activating || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        select(item);
      });
      lifetime.listen(item, 'dblclick', (event) => {
        if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
          event.preventDefault();
          activate(item);
        }
      });
      lifetime.listen(item, 'keydown', (event) => {
        const choices = items(),
          index = choices.indexOf(item);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? choices.length - 1
              : event.key === 'ArrowDown'
                ? Math.min(choices.length - 1, index + 1)
                : event.key === 'ArrowUp'
                  ? Math.max(0, index - 1)
                  : -1;
        if (next >= 0) {
          event.preventDefault();
          select(choices[next], true);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          activate(item);
        } else if (event.key === ' ') {
          event.preventDefault();
          select(item);
        }
      });
      lifetime.listen(item, 'contextmenu', (event) => {
        event.preventDefault();
        select(item);
        context.hidden = false;
        context.style.left = `${Math.max(2, Math.min(Math.round(event.clientX), innerWidth - context.offsetWidth - 2))}px`;
        context.style.top = `${Math.max(2, Math.min(Math.round(event.clientY), innerHeight - context.offsetHeight - 2))}px`;
        context.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
      });
    }
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-explorer-command]')) {
      lifetime.listen(button, 'click', () => {
        switch (button.dataset.explorerCommand) {
          case 'open':
            activate();
            break;
          case 'properties':
            closeContext();
            properties.click();
            break;
          case 'back': {
            const previous = trail.pop();
            if (previous) navigate(previous, false);
            break;
          }
          case 'up':
            navigate('home');
            break;
          case 'folders':
            foldersVisible = !foldersVisible;
            render();
            break;
        }
      });
    }
    lifetime.listen(context, 'keydown', (event) => {
      const choices = [...context.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
      if (event.key === 'Escape') {
        event.preventDefault();
        closeContext();
        current().focus();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const index = choices.indexOf(document.activeElement as HTMLButtonElement);
        choices[
          (index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length
        ]?.focus();
      }
    });
    lifetime.listen(document, 'pointerdown', (event) => {
      if (!context.contains(event.target as Node)) closeContext();
    });
    const fromHash = () => {
      const next = location.hash.replace(/^#folder-/, '');
      if (groups.some((group) => group.dataset.folderItems === next)) navigate(next, false, false);
    };
    lifetime.listen(window, 'hashchange', fromHash);
    lifetime.listen(window, 'popstate', fromHash);
    lifetime.listen(window, 'resize', closeContext);
    fromHash();
    render();
    const dispose = () => {
      if (lifetime.disposed) return;
      lifetime.dispose();
      closeContext();
    };
    lifetime.listen(window, 'pagehide', (event) => {
      closeContext();
      if (!event.persisted) dispose();
    });
    mounted.set(root, dispose);
    return dispose;
  } catch (error) {
    lifetime.dispose();
    throw error;
  }
}
