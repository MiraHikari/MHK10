import { claimSurface, createLifetime } from '../../ui/browser/lifetime';
import { ProjectBrowser } from './project-browser-model';

/** Enhance the authored Properties sheet while preserving its native links and fallback document. */
export function mountPersonalProperties(root: HTMLElement): () => void {
  const lifetime = createLifetime();
  lifetime.defer(claimSurface(root));
  try {
    mountPropertiesSession(root, lifetime);
  } catch (error) {
    lifetime.dispose();
    throw error;
  }
  return lifetime.dispose;
}

function mountPropertiesSession(
  root: HTMLElement,
  lifetime: ReturnType<typeof createLifetime>,
): void {
  const get = <T extends HTMLElement>(selector: string): T => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing Properties element: ${selector}`);
    return element;
  };
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('.properties-tabs [role="tab"]')];
  const panels = [...root.querySelectorAll<HTMLElement>('.properties-body > [role="tabpanel"]')];
  const links = [...root.querySelectorAll<HTMLAnchorElement>('[data-project-select]')];
  const records = [...root.querySelectorAll<HTMLElement>('[data-project-id]')];
  const close = get<HTMLButtonElement>('[data-properties-close]');
  const status = get('[data-properties-status]');
  const tools = get('[data-project-tools]');
  const query = get<HTMLInputElement>('#project-query');
  const tag = get<HTMLSelectElement>('#project-tag');
  const order = get<HTMLSelectElement>('#project-sort');
  const list = get('[data-project-list]');
  const empty = get('[data-project-empty]');
  const recordArea = get('.project-records');
  const contactCopy = get<HTMLButtonElement>('[data-contact-copy]');
  const contactValue = get<HTMLInputElement>('[data-contact-value]');
  const contactFeedback = get('[data-contact-feedback]');
  const originalRows = [...list.children];
  const rows = new Map<string, HTMLElement>();
  for (const link of links) {
    const id = link.dataset.projectSelect;
    const row = link.closest('li');
    if (!id || !row) throw new Error('A project link is missing its identity or list row.');
    rows.set(id, row);
  }
  const projects = new ProjectBrowser(
    records.map((record) => {
      const id = record.dataset.projectId;
      if (!id || !rows.has(id)) throw new Error('A project record is missing its matching link.');
      const text = (selector: string) => record.querySelector(selector)?.textContent?.trim() ?? '';
      return {
        id,
        title: text('h3'),
        date: record.querySelector('time')?.dateTime ?? '',
        tags: [...record.querySelectorAll('[data-project-tag]')].map(
          (item) => item.textContent?.trim() ?? '',
        ),
        description: text('[data-project-description]'),
        summary: text('[data-project-summary]'),
        highlights: [...record.querySelectorAll('[data-project-highlights] li')].map(
          (item) => item.textContent?.trim() ?? '',
        ),
      };
    }),
  );
  let currentTab = 'general';
  let copyRequest = 0;

  function preserveAttributes(element: HTMLElement, names: readonly string[]): void {
    const values = names.map((name) => [name, element.getAttribute(name)] as const);
    lifetime.defer(() => {
      for (const [name, value] of values) {
        if (value === null) element.removeAttribute(name);
        else element.setAttribute(name, value);
      }
    });
  }
  preserveAttributes(root, ['class']);
  for (const element of [
    ...panels,
    ...records,
    ...rows.values(),
    tools,
    empty,
    close,
    contactCopy,
    contactValue,
  ])
    preserveAttributes(element, ['hidden']);
  for (const element of [...tabs, ...links])
    preserveAttributes(element, ['aria-selected', 'tabindex']);
  for (const control of [query, tag, order]) {
    const value = control.value;
    lifetime.defer(() => {
      control.value = value;
    });
  }
  const initialStatus = status.textContent;
  const initialFeedback = contactFeedback.textContent;
  lifetime.defer(() => {
    list.replaceChildren(...originalRows);
    status.textContent = initialStatus;
    contactFeedback.textContent = initialFeedback;
  });

  function render(): void {
    if (lifetime.disposed) return;
    const view = projects.snapshot();
    const visible = new Set(view.items.map((item) => item.id));
    const orderedRows = [
      ...view.items.map((item) => rows.get(item.id)!),
      ...[...rows].filter(([id]) => !visible.has(id)).map(([, row]) => row),
    ];
    if (orderedRows.some((row, index) => list.children[index] !== row)) list.append(...orderedRows);
    for (const tab of tabs) {
      const active = tab.id === `${currentTab}-tab`;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    for (const panel of panels) panel.hidden = panel.id !== `${currentTab}-panel`;
    for (const link of links) {
      const id = link.dataset.projectSelect!;
      const active = id === view.selected?.id;
      rows.get(id)!.hidden = !visible.has(id);
      link.setAttribute('aria-selected', String(active));
      link.tabIndex = active ? 0 : -1;
    }
    for (const record of records) record.hidden = record.dataset.projectId !== view.selected?.id;
    empty.hidden = view.items.length > 0;
    if (query.value !== view.query) query.value = view.query;
    if (tag.value !== view.tag) tag.value = view.tag;
    if (order.value !== view.sort) order.value = view.sort;
    status.textContent =
      currentTab === 'projects'
        ? view.selected
          ? `Project ${view.items.findIndex((item) => item.id === view.selected?.id) + 1} of ${view.items.length}${view.items.length !== view.total ? ` (${view.total} total)` : ''}`
          : 'No matching projects'
        : (tabs.find((tab) => tab.id === `${currentTab}-tab`)?.textContent?.trim() ?? 'Ready');
  }
  function writeHash(fragment: string): void {
    if (location.hash !== `#${fragment}`) history.pushState(null, '', `#${fragment}`);
  }
  function selectProject(
    id: string,
    options: { reveal?: boolean; updateUrl?: boolean; focus?: boolean } = {},
  ): void {
    const selected = options.reveal ? projects.reveal(id) : projects.select(id);
    if (!selected) return;
    currentTab = 'projects';
    if (options.updateUrl !== false) writeHash(`project-${id}`);
    render();
    recordArea.scrollTo({ top: 0 });
    if (options.focus) {
      const link = links.find((item) => item.dataset.projectSelect === id);
      link?.focus({ preventScroll: true });
      link?.scrollIntoView({ block: 'nearest' });
    }
  }
  function readHash(): void {
    const fragment = location.hash.slice(1);
    const project = records.find((record) => record.id === fragment);
    if (project) selectProject(project.dataset.projectId!, { reveal: true, updateUrl: false });
    else {
      currentTab =
        fragment === 'friends'
          ? 'contact'
          : tabs.some((tab) => tab.id === `${fragment}-tab`)
            ? fragment
            : 'general';
      render();
    }
  }
  function filterProjects(): void {
    projects.configure({ query: query.value, tag: tag.value });
    render();
    recordArea.scrollTo({ top: 0 });
  }
  root.classList.add('properties-ready');
  tools.hidden = false;
  contactCopy.hidden = false;
  close.hidden = window.self === window.top;
  for (const tab of tabs)
    lifetime.listen(tab, 'click', () => {
      currentTab = tab.id.replace(/-tab$/, '');
      writeHash(currentTab);
      render();
    });
  for (const link of links) {
    lifetime.listen(link, 'click', (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      selectProject(link.dataset.projectSelect!);
    });
    lifetime.listen(link, 'keydown', (event) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      if (
        event.key === 'Home' ||
        event.key === 'End' ||
        event.key === 'ArrowDown' ||
        event.key === 'ArrowUp'
      ) {
        event.preventDefault();
        projects.move(event.key);
        const selected = projects.snapshot().selected;
        if (selected) selectProject(selected.id, { focus: true });
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectProject(link.dataset.projectSelect!);
      }
    });
  }
  for (const link of root.querySelectorAll<HTMLAnchorElement>('[data-project-jump]'))
    lifetime.listen(link, 'click', (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      selectProject(link.dataset.projectJump!, { reveal: true, focus: true });
    });
  for (const link of root.querySelectorAll<HTMLAnchorElement>('[data-tab-jump]'))
    lifetime.listen(link, 'click', (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const targetTab = link.dataset.tabJump;
      if (!targetTab || !tabs.some((item) => item.id === `${targetTab}-tab`)) return;
      event.preventDefault();
      currentTab = targetTab;
      writeHash(currentTab);
      render();
    });
  lifetime.listen(query, 'input', (event) => {
    if (!(event instanceof InputEvent) || !event.isComposing) filterProjects();
  });
  lifetime.listen(query, 'compositionend', filterProjects);
  lifetime.listen(tag, 'change', filterProjects);
  lifetime.listen(order, 'change', () => {
    const sort = order.value;
    if (sort !== 'curated' && sort !== 'newest' && sort !== 'name') return;
    projects.configure({ sort });
    render();
  });
  lifetime.listen(get('[data-project-clear]'), 'click', () => {
    projects.configure({ query: '', tag: '' });
    render();
    query.focus();
  });
  lifetime.listen(contactCopy, 'click', () => {
    const request = ++copyRequest;
    const fallback = () => {
      if (lifetime.disposed || request !== copyRequest) return;
      contactValue.hidden = false;
      contactValue.focus();
      contactValue.select();
      contactFeedback.textContent = 'Address selected. Use Copy to keep it.';
    };
    const clipboard = navigator.clipboard;
    if (!clipboard) return fallback();
    void clipboard.writeText(contactValue.value).then(() => {
      if (lifetime.disposed || request !== copyRequest) return;
      contactValue.hidden = true;
      contactFeedback.textContent = 'Email copied.';
    }, fallback);
  });
  lifetime.listen(close, 'click', () => {
    if (window.self !== window.top)
      window.parent.postMessage({ type: 'doom95:close', id: 'profile' }, location.origin);
  });
  lifetime.listen(window, 'hashchange', readHash);
  lifetime.listen(window, 'popstate', readHash);
  lifetime.listen(window, 'pagehide', (event) => {
    if (!event.persisted) lifetime.dispose();
  });
  readHash();
}
