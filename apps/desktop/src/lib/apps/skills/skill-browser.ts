import {
  SkillBrowser,
  type SkillCategory,
  type SkillRecord,
  type SkillTreeKey,
} from './skill-browser-model';
import { claimSurface, createLifetime } from '../../ui/browser/lifetime';

/** DOM composition for the technology tree; the model owns its selection and search policy. */
export function mountSkillBrowser(
  root: HTMLElement,
  categories: readonly SkillCategory[],
  initialSkill?: string,
): () => void {
  const model = new SkillBrowser(categories);
  if (initialSkill) model.reveal(initialSkill);
  const document = root.ownerDocument;
  const view = document.defaultView;
  if (!view) throw new Error('Technology browser requires a window');
  const get = <T extends HTMLElement>(selector: string): T => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing technology control: ${selector}`);
    return element;
  };
  const search = get<HTMLInputElement>('#skill-search');
  const tree = get<HTMLElement>('.device-tree');
  const properties = get<HTMLDialogElement>('#skill-properties');
  const learning = get<HTMLDialogElement>('#skill-learning');
  const help = get<HTMLDialogElement>('#skill-help');
  const title = get('#skill-title');
  const note = get('#skill-note');
  const summary = get('#skill-summary');
  const meter = root.querySelector<HTMLElement>('#skill-meter');
  const meterLabel = root.querySelector<HTMLElement>('#skill-meter-label');
  const meterValue = root.querySelector<HTMLElement>('#skill-meter-value');
  const meterBar = root.querySelector<HTMLElement>('#skill-meter-bar');
  const empty = get('#skill-empty');
  const count = get('#skill-count');
  const treeTitle = get('#skill-tree-title');
  const propertyTitle = get('#skill-property-title');
  const propertyValues = get('#skill-property-values');
  const details = get<HTMLButtonElement>('[data-skill-command="details"]');
  const nodes = [...root.querySelectorAll<HTMLButtonElement>('[data-skill-node]')];
  const groups = [...root.querySelectorAll<HTMLElement>('[data-skill-group]')];
  const lifetime = createLifetime();
  lifetime.defer(claimSurface(root));
  let showDetails = false;
  lifetime.defer(() => {
    for (const dialog of [properties, learning, help]) {
      if (dialog.open) dialog.close();
    }
    if (meter) meter.hidden = true;
    if (meterValue) meterValue.textContent = '';
    meterBar?.replaceChildren();
    root.classList.remove('skill-ready', 'skill-show-details');
  });
  function fields(target: HTMLElement, values: readonly [string, string][]): void {
    const fragment = document.createDocumentFragment();
    for (const [label, value] of values) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      fragment.append(dt, dd);
    }
    target.replaceChildren(fragment);
  }
  function values(skill: SkillRecord): [string, string][] {
    return [
      [
        'Category',
        categories.find((group) => group.id === skill.category)?.title ?? skill.category,
      ],
      ['Experience', skill.years > 0 ? `${skill.years} years` : 'Exploring'],
      ['Self-assessment', `${skill.level} / 100`],
      ['Keywords', skill.keywords.join(', ')],
    ];
  }
  function render(focus = false): void {
    const state = model.snapshot();
    const visible = new Set(state.rows.map((row) => row.id));
    for (const group of groups) {
      const id = group.dataset.skillGroup ?? '';
      group.hidden = !state.groups.some((item) => item.id === id);
      const children = group.querySelector<HTMLElement>('[data-skill-children]');
      if (children) children.hidden = !state.expanded.includes(id);
      const marker = group.querySelector('[data-expand-mark]');
      if (marker) marker.textContent = state.expanded.includes(id) ? '−' : '+';
    }
    for (const node of nodes) {
      const id = node.dataset.skillNode ?? '';
      node.hidden = !visible.has(id);
      node.setAttribute('aria-selected', String(id === state.focused));
      node.tabIndex = id === state.focused ? 0 : -1;
      if (id.startsWith('group:'))
        node.setAttribute('aria-expanded', String(state.expanded.includes(id.slice(6))));
    }
    const category = state.groups.find((group) => `group:${group.id}` === state.focused);
    title.textContent = state.selected?.name ?? category?.title ?? 'Device Manager';
    note.textContent = state.selected?.note ?? category?.description ?? '';
    if (meter && meterLabel && meterValue && meterBar) {
      if (state.selected) {
        meter.hidden = false;
        meterLabel.textContent = 'Self-assessment';
        meterValue.textContent = `${state.selected.level}%`;
        const activeCells = Math.max(1, Math.round(state.selected.level / 10));
        const cells = document.createDocumentFragment();
        for (let i = 0; i < 10; i++) {
          const cell = document.createElement('span');
          cell.className = 'skill-meter-cell';
          cell.dataset.active = String(i < activeCells);
          cells.append(cell);
        }
        meterBar.replaceChildren(cells);
      } else if (category) {
        const avg = Math.round(
          category.skills.reduce((sum, item) => sum + item.level, 0) /
            Math.max(1, category.skills.length),
        );
        meter.hidden = false;
        meterLabel.textContent = 'Category average';
        meterValue.textContent = `${avg}%`;
        const activeCells = Math.max(1, Math.round(avg / 10));
        const cells = document.createDocumentFragment();
        for (let i = 0; i < 10; i++) {
          const cell = document.createElement('span');
          cell.className = 'skill-meter-cell';
          cell.dataset.active = String(i < activeCells);
          cells.append(cell);
        }
        meterBar.replaceChildren(cells);
      } else {
        meter.hidden = true;
        meterBar.replaceChildren();
      }
    }
    fields(
      summary,
      state.selected
        ? values(state.selected)
        : category
          ? [['Technologies', String(category.skills.length)]]
          : [],
    );
    empty.hidden = state.matches > 0;
    tree.hidden = state.matches === 0;
    count.textContent = state.query
      ? `${state.matches} ${state.matches === 1 ? 'match' : 'matches'}`
      : `${state.total} technologies · ${categories.length} categories`;
    treeTitle.textContent = state.query ? `Results for “${search.value.trim()}”` : 'MiraHikari';
    if (!state.selected && !category) showDetails = false;
    root.classList.toggle('skill-show-details', showDetails);
    details.textContent = showDetails ? 'Tree' : 'Details';
    details.title = showDetails ? 'Show technologies' : 'Show selection details';
    details.setAttribute('aria-expanded', String(showDetails));
    const disabledCommands: Record<string, boolean> = {
      properties: !state.selected,
      details: !state.selected && !category,
      clear: !search.value,
      expand: !state.groups.some((group) => !state.expanded.includes(group.id)),
      collapse: !state.groups.some((group) => state.expanded.includes(group.id)),
    };
    root.querySelectorAll<HTMLButtonElement>('[data-skill-command]').forEach((button) => {
      button.disabled = disabledCommands[button.dataset.skillCommand ?? ''] ?? false;
    });
    if (focus) {
      const selected = nodes.find((node) => node.dataset.skillNode === state.focused);
      selected?.focus({ preventScroll: true });
      selected?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
  function showProperties(): void {
    const skill = model.snapshot().selected;
    if (!skill) return;
    propertyTitle.textContent = skill.name;
    fields(propertyValues, [...values(skill), ['Notes', skill.note]]);
    if (!properties.open) properties.showModal();
  }
  function command(value: string): void {
    root
      .querySelectorAll<HTMLDetailsElement>('[data-hybrid-menubar] details[open]')
      .forEach((menu) => (menu.open = false));
    switch (value) {
      case 'properties':
        showProperties();
        return;
      case 'close-properties':
        properties.close();
        return;
      case 'learning':
        if (!learning.open) learning.showModal();
        return;
      case 'close-learning':
        learning.close();
        return;
      case 'help':
        if (!help.open) help.showModal();
        return;
      case 'close-help':
        help.close();
        return;
      case 'expand':
        model.expandAll();
        break;
      case 'collapse':
        model.collapseAll();
        break;
      case 'details':
        showDetails = !showDetails;
        break;
      case 'clear':
        search.value = '';
        model.search('');
        showDetails = false;
        search.focus();
        break;
    }
    render();
  }
  try {
    lifetime.listen(root, 'click', (event) => {
      if (!(event.target instanceof view.Element)) return;
      const action = event.target.closest<HTMLButtonElement>('[data-skill-command]');
      if (action && !action.disabled) {
        command(action.dataset.skillCommand ?? '');
        return;
      }
      const node = event.target.closest<HTMLButtonElement>('[data-skill-node]');
      if (!node) return;
      const id = node.dataset.skillNode ?? '';
      if (id.startsWith('group:')) model.toggle(id.slice(6));
      else model.select(id);
      render(true);
    });
    lifetime.listen(tree, 'dblclick', (event) => {
      if (event.target instanceof view.Element && event.target.closest('[data-skill-name]'))
        showProperties();
    });
    lifetime.listen(tree, 'keydown', (event) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        model.move(event.key as SkillTreeKey);
        render(true);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const state = model.snapshot();
        if (state.focused?.startsWith('group:')) {
          model.toggle(state.focused.slice(6));
          render(true);
        } else showProperties();
      }
    });
    lifetime.listen(root, 'keydown', (event) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        [properties, learning, help].some((dialog) => dialog.open)
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        search.focus();
        search.select();
      } else if (event.key === 'F1') {
        event.preventDefault();
        command('help');
      } else if (event.key === 'Escape' && event.target === search && search.value) {
        event.preventDefault();
        command('clear');
      } else if (
        event.target === search &&
        (event.key === 'ArrowDown' || event.key === 'Enter') &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        model.snapshot().focused
      ) {
        event.preventDefault();
        showDetails = false;
        render(true);
      }
    });
    lifetime.listen(search, 'input', () => {
      model.search(search.value);
      showDetails = false;
      render();
    });
    lifetime.listen(view, 'pagehide', (event) => {
      if (!event.persisted) lifetime.dispose();
    });
    model.search(search.value);
    render();
    root.classList.add('skill-ready');
  } catch (error) {
    lifetime.dispose();
    throw error;
  }
  return lifetime.dispose;
}
