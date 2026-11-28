import {
  type ReadingMode,
  type ReadingSpacing,
  type ReadingTheme,
  clampReaderZoom,
  stepReaderZoom,
  DEFAULT_READER_PREFERENCES,
} from '@mhk/site-core/fusion/reading-model';
import { FUSION_EVENTS } from '@mhk/site-core/fusion/protocol-model';
import { UNAVAILABLE_NATIVE_FILES, type NativeFileServices } from '../../os/host/app-contracts';
import {
  parseMarkdown,
  isMarkdownName,
  type InlineNode,
  type MarkdownBlock,
} from '../../ui/text/markdown';
import { claimSurface, createLifetime } from '../../ui/browser/lifetime';
import type {
  ReaderNavigationCommand,
  ReaderNavigationEntry,
  ReaderNavigationTarget,
} from './reader-navigation-model';
import { mountReaderNavigation } from './reader-navigation';
import { remainingReadingSeconds } from './reader-statistics-model';
import { readerIntent, type ReaderDialogName, type ReaderIntent } from './reader-commands';
import { ReaderSession, type ReaderCommand } from './reader-session';
import {
  createBrowserReaderStorage,
  subscribeSharedReaderState,
} from '@mhk/site-core/fusion/browser-reading';
import { mountReadingSurface, type ReadingSelection } from './reading-surface';
import {
  parseReaderPublication,
  readerCitation,
  type ReaderPublication,
} from './publication-model';
import sharedProfile from '@mhk/site-core/content-model/profile-data';

const NAVIGATION_COMMANDS: readonly {
  command: ReaderNavigationCommand;
  label: string;
  detail: string;
}[] = [
  { command: 'find', label: 'Find in book', detail: 'Ctrl+F' },
  { command: 'contents', label: 'Toggle contents', detail: 'Browse chapters' },
  { command: 'notebook', label: 'Toggle notebook', detail: 'Bookmarks and notes' },
  { command: 'options', label: 'Reading options', detail: 'Text, layout and theme' },
  { command: 'properties', label: 'Book properties', detail: 'Publication and reading estimates' },
  { command: 'focus', label: 'Focus reading', detail: 'F9' },
];
type Publication = ReaderPublication;

function appendInline(target: Node, nodes: InlineNode[]): void {
  for (const node of nodes) {
    if (node.type === 'text') {
      target.appendChild(document.createTextNode(node.value));
    } else if (node.type === 'code') {
      const code = document.createElement('code');
      code.textContent = node.value;
      target.appendChild(code);
    } else if (node.type === 'strong') {
      const strong = document.createElement('strong');
      appendInline(strong, node.children);
      target.appendChild(strong);
    } else if (node.type === 'em') {
      const em = document.createElement('em');
      appendInline(em, node.children);
      target.appendChild(em);
    } else if (node.type === 'link') {
      const anchor = document.createElement('a');
      anchor.href = node.href;
      if (/^https?:/i.test(node.href)) {
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
      }
      appendInline(anchor, node.children);
      target.appendChild(anchor);
    }
  }
}
function buildMarkdownNode(block: MarkdownBlock): HTMLElement {
  if (block.type === 'heading') {
    const level = Math.min(6, Math.max(1, block.depth));
    const heading = document.createElement(`h${level}`);
    heading.id = block.slug;
    appendInline(heading, block.children);
    return heading;
  }
  if (block.type === 'code') {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    if (block.lang) code.dataset.lang = block.lang;
    code.textContent = block.value;
    pre.appendChild(code);
    return pre;
  }
  if (block.type === 'list') {
    const list = document.createElement(block.ordered ? 'ol' : 'ul');
    for (const item of block.items) {
      const li = document.createElement('li');
      appendInline(li, item);
      list.appendChild(li);
    }
    return list;
  }
  if (block.type === 'blockquote') {
    const quote = document.createElement('blockquote');
    const paragraph = document.createElement('p');
    appendInline(paragraph, block.children);
    quote.appendChild(paragraph);
    return quote;
  }
  if (block.type === 'hr') {
    return document.createElement('hr');
  }
  const paragraph = document.createElement('p');
  appendInline(paragraph, block.children);
  return paragraph;
}

/** Reading composition: trusted article markup or explicit plain-text file input; annotations stay separate. */
export function mountReader(root: HTMLElement, suppliedFiles?: NativeFileServices): () => void {
  const lifetime = createLifetime();
  lifetime.defer(claimSurface(root));
  try {
    mountReaderSession(root, lifetime, suppliedFiles);
  } catch (error) {
    lifetime.dispose();
    throw error;
  }
  return lifetime.dispose;
}

function mountReaderSession(
  root: HTMLElement,
  lifetime: ReturnType<typeof createLifetime>,
  suppliedFiles?: NativeFileServices,
): void {
  const controller = new AbortController();
  lifetime.defer(() => controller.abort());
  const signal = controller.signal;
  const commandControls = root.querySelectorAll<HTMLButtonElement>('[data-reader-initializing]');
  // Readiness is a session fact, not a DOM marker that a remount could inherit.
  root.removeAttribute('data-reader-ready');
  lifetime.defer(() => {
    commandControls.forEach((button) => (button.disabled = true));
    root.removeAttribute('data-reader-ready');
  });
  const get = <T extends HTMLElement>(selector: string): T => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing Reader element: ${selector}`);
    return element;
  };
  const session = new ReaderSession({
    storage: createBrowserReaderStorage(),
    now: Date.now,
    schedule: (callback, delay) => {
      const timer = window.setTimeout(callback, delay);
      return () => clearTimeout(timer);
    },
  });
  // Page hide and session close share flush(); dispose itself does not write.
  lifetime.defer(() => {
    session.flush();
    session.dispose();
  });
  const viewport = get<HTMLElement>('#reader-viewport');
  const flow = get<HTMLElement>('#reader-flow');
  const prose = get<HTMLElement>('#reader-prose');
  const sidebar = get<HTMLElement>('#reader-sidebar');
  const feedback = get<HTMLElement>('#reader-feedback');
  const pageInput = get<HTMLInputElement>('#reader-page');
  const options = get<HTMLDialogElement>('#reader-options');
  const findDialog = get<HTMLDialogElement>('#reader-find');
  const noteDialog = get<HTMLDialogElement>('#reader-note');
  const estimate = get<HTMLElement>('#reader-estimate');
  const textInfo = get<HTMLElement>('#reader-info-text');
  const estimateInfo = get<HTMLElement>('#reader-info-estimate');
  const help = get<HTMLDialogElement>('#reader-help');
  const layoutSelect = get<HTMLSelectElement>('#reader-layout');
  const fontSelect = get<HTMLSelectElement>('#reader-font');
  const spacingSelect = get<HTMLSelectElement>('#reader-spacing');
  const zoomSelect = get<HTMLSelectElement>('#reader-zoom');
  const themeSelect = get<HTMLSelectElement>('#reader-theme');
  const renderingSelect = get<HTMLSelectElement>('#reader-rendering');
  const widthSelect = get<HTMLSelectElement>('#reader-width');
  const importFile = get<HTMLInputElement>('#reader-import-file');
  const properties = get<HTMLDialogElement>('#reader-properties');
  const dialogs: Record<ReaderDialogName, HTMLDialogElement> = {
    options,
    find: findDialog,
    properties,
    help,
    note: noteDialog,
  };
  const ownedDialogs = [options, findDialog, noteDialog, help, properties];
  lifetime.defer(() => ownedDialogs.forEach((dialog) => dialog.close()));
  // Keep Astro's authored nodes available for remount; local file rendering and
  // notebook/search rows belong to this session rather than to the page template.
  for (const element of [
    flow,
    prose,
    get('#reader-contents'),
    get('#reader-bookmarks'),
    get('#reader-notes'),
    get('#reader-find-results'),
    get('#reader-recent-items'),
  ]) {
    const children = [...element.childNodes];
    lifetime.defer(() => element.replaceChildren(...children));
  }
  // Acquire the owned message channel only after required markup has been checked.
  const files = suppliedFiles ?? UNAVAILABLE_NATIVE_FILES;
  let current: Publication | null = null;
  try {
    current = parseReaderPublication(JSON.parse(get('#reader-publication').textContent ?? 'null'));
  } catch {
    current = null;
  }
  let editingNote: string | undefined;
  let draft: ReadingSelection | undefined;
  lifetime.defer(() => {
    editingNote = undefined;
    draft = undefined;
  });
  let initialAnchor = '';
  try {
    initialAnchor = decodeURIComponent(location.hash.slice(1));
  } catch {
    initialAnchor = '';
  }
  const downloads = new Set<string>();
  const downloadTimers = new Set<number>();
  lifetime.defer(() => {
    for (const timer of downloadTimers) clearTimeout(timer);
    downloadTimers.clear();
    for (const url of downloads) URL.revokeObjectURL(url);
    downloads.clear();
  });
  const navigation = mountReaderNavigation(root, lifetime, {
    entries: navigationEntries,
    activate: activateReaderDestination,
  });
  const surface = mountReadingSurface(root, {
    state: () => session.snapshot(),
    changed: (change) => {
      if (change.type === 'position') {
        session.command({ type: 'position', ...change.position });
        if (change.navigation) {
          const url = new URL(location.href);
          url.hash = change.position.anchor ? encodeURIComponent(change.position.anchor) : '';
          history.replaceState(null, '', url.href);
        }
        updatePositionStatus();
        return;
      }
      updateSelectionStatus();
    },
  });
  lifetime.defer(() => {
    surface.flush();
    surface.dispose();
  });
  lifetime.listen(window, FUSION_EVENTS.flushReading, () => {
    if (!lifetime.disposed) persist();
  });
  lifetime.defer(
    subscribeSharedReaderState(() => {
      if (lifetime.disposed) return;
      surface.update();
      renderNotebook();
      renderLibraryState();
      updateStatus();
    }),
  );

  function setFeedback(message: string): void {
    if (lifetime.disposed) return;
    feedback.textContent = message;
    feedback.title = message;
  }
  function persist(explicit = false): boolean {
    surface.flush();
    const saved = session.flush().status === 'saved';
    if (!saved && explicit)
      setFeedback(
        session.snapshot().saveError ||
          'Notes kept in this session. Export notebook to keep a copy.',
      );
    return saved;
  }
  function applySessionCommand(command: ReaderCommand) {
    surface.flush();
    return session.command(command);
  }
  function commitNavigation(anchor = ''): void {
    surface.command({ type: 'position', anchor });
  }
  function updatePositionStatus(): void {
    if (lifetime.disposed) return;
    const state = session.snapshot();
    const { statistics, activeAnchor } = surface.snapshot();
    const hasBook = !!current;
    pageInput.disabled = !hasBook;
    pageInput.max = String(state.pages);
    pageInput.value = String(state.page + 1);
    get('#reader-page-total').textContent = `of ${state.pages}`;
    get('#reader-progress').textContent = hasBook
      ? `${Math.round((state.document?.progress ?? 0) * 100)}%`
      : '';
    const progressBar = get<HTMLProgressElement>('#reader-progress-bar');
    progressBar.hidden = !hasBook;
    progressBar.value = Math.round((state.document?.progress ?? 0) * 100);
    estimate.hidden = !hasBook;
    const remaining = remainingReadingSeconds(statistics, state.document?.progress ?? 0);
    const minutes = (seconds: number) =>
      seconds > 0 && seconds < 60 ? '<1 min' : `${Math.ceil(seconds / 60)} min`;
    estimate.textContent = hasBook ? `Est. ${minutes(remaining)} left` : '';
    estimate.title =
      'Estimated from body text and the current position. See Book Properties for assumptions.';
    const anchor = state.document?.anchor || activeAnchor;
    root.querySelectorAll<HTMLAnchorElement>('[data-reader-anchor]').forEach((link) => {
      if (anchor && link.dataset.readerAnchor === anchor)
        link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    root
      .querySelectorAll<HTMLButtonElement>('[data-reader-command="previous"]')
      .forEach((button) => (button.disabled = !hasBook || state.page === 0));
    root
      .querySelectorAll<HTMLButtonElement>('[data-reader-command="next"]')
      .forEach((button) => (button.disabled = !hasBook || state.page >= state.pages - 1));
  }
  function updateSelectionStatus(): void {
    if (lifetime.disposed) return;
    const state = session.snapshot();
    const selection = surface.snapshot().selection;
    root.querySelectorAll<HTMLButtonElement>('[data-needs-selection]').forEach((button) => {
      button.disabled = !current || !state.tracked || !selection?.quote;
    });
  }
  function updateStatus(): void {
    if (lifetime.disposed) return;
    const state = session.snapshot();
    const { statistics } = surface.snapshot();
    const hasBook = !!current;
    root
      .querySelectorAll('[data-reader-command="focus"]')
      .forEach((button) => button.setAttribute('aria-pressed', String(state.preferences.focus)));
    for (const panel of ['contents', 'notebook'] as const) {
      const expanded =
        !sidebar.hidden && !state.preferences.focus && !get(`#reader-${panel}-panel`).hidden;
      root.querySelectorAll(`[data-reader-command="${panel}"]`).forEach((button) => {
        button.setAttribute('aria-controls', 'reader-sidebar');
        button.setAttribute('aria-expanded', String(expanded));
        button.setAttribute('aria-pressed', String(expanded));
      });
    }
    textInfo.textContent = hasBook
      ? `${statistics.cjkCharacters.toLocaleString('en')} CJK characters · ${statistics.words.toLocaleString('en')} other words`
      : '—';
    const minutes = (seconds: number) =>
      seconds > 0 && seconds < 60 ? '<1 min' : `${Math.ceil(seconds / 60)} min`;
    estimateInfo.textContent = hasBook ? `Est. ${minutes(statistics.seconds)} total` : '—';
    root.querySelectorAll<HTMLButtonElement>('[data-needs-book]').forEach((button) => {
      button.disabled = !hasBook;
    });
    root
      .querySelectorAll<HTMLButtonElement>(
        '[data-reader-command="bookmark"],[data-reader-command="note"]',
      )
      .forEach((button) => {
        button.disabled = !hasBook || !state.tracked;
      });
    updatePositionStatus();
    updateSelectionStatus();
    navigation.refresh();
  }
  function selectSearch(index: number): void {
    if (!surface.command({ type: 'search-index', index })) return;
    reportSearch();
  }
  function reportSearch(): void {
    const search = surface.snapshot().search;
    const count = `Match ${search.selected + 1} of ${search.count}`;
    get('#reader-find-count').textContent = count;
    setFeedback(count);
  }
  function jumpToAnchor(anchor: string): boolean {
    return surface.command({ type: 'anchor', anchor });
  }
  function goToBookmark(id: string): boolean {
    const mark = session.snapshot().document?.bookmarks.find((item) => item.id === id);
    if (!mark) return false;
    if (!mark.anchor || !jumpToAnchor(mark.anchor)) {
      applySessionCommand({ type: 'position', progress: mark.progress, anchor: '' });
      commitNavigation();
    }
    return true;
  }
  function openExistingNote(id: string): boolean {
    const note = session.snapshot().document?.notes.find((item) => item.id === id);
    if (!note) return false;
    editingNote = id;
    draft = undefined;
    get<HTMLTextAreaElement>('#reader-note-quote').value = note.quote;
    get<HTMLTextAreaElement>('#reader-note-text').value = note.text;
    if (!surface.command({ type: 'note', note }) && (!note.anchor || !jumpToAnchor(note.anchor))) {
      applySessionCommand({ type: 'position', progress: note.progress, anchor: '' });
      commitNavigation();
    }
    noteDialog.showModal();
    get<HTMLTextAreaElement>('#reader-note-text').focus();
    return true;
  }
  function navigationEntries(): ReaderNavigationEntry[] {
    const state = session.snapshot();
    if (!current || state.documentId !== current.id) return [];
    return [
      ...surface
        .snapshot()
        .chapters.filter((heading) => heading.anchor)
        .map((heading): ReaderNavigationEntry => ({
          id: `chapter:${heading.anchor}`,
          label: heading.title,
          detail: heading.subsection ? 'Subsection' : 'Chapter',
          target: { kind: 'chapter', anchor: heading.anchor },
        })),
      ...(state.document?.bookmarks ?? []).map((mark): ReaderNavigationEntry => ({
        id: `bookmark:${mark.id}`,
        label: mark.label,
        detail: `${Math.round(mark.progress * 100)}% position`,
        target: { kind: 'bookmark', id: mark.id },
      })),
      ...(state.document?.notes ?? []).map((note): ReaderNavigationEntry => ({
        id: `note:${note.id}`,
        label: (note.text || note.quote).slice(0, 120),
        detail: note.quote
          ? note.quote.slice(0, 120)
          : `Note at ${Math.round(note.progress * 100)}%`,
        keywords: `${note.text} ${note.quote}`,
        target: { kind: 'note', id: note.id },
      })),
      ...NAVIGATION_COMMANDS.map((item): ReaderNavigationEntry => ({
        id: `command:${item.command}`,
        label:
          item.command === 'focus' && state.preferences.focus ? 'Leave focus reading' : item.label,
        detail: item.detail,
        target: { kind: 'command', command: item.command },
      })),
    ];
  }
  function activateReaderDestination(target: ReaderNavigationTarget): void {
    switch (target.kind) {
      case 'chapter':
        jumpToAnchor(target.anchor);
        break;
      case 'bookmark':
        goToBookmark(target.id);
        break;
      case 'note':
        openExistingNote(target.id);
        break;
      case 'command':
        void command(target.command);
        break;
    }
  }
  function showPanel(panel: 'contents' | 'notebook'): void {
    if (session.snapshot().preferences.focus) {
      applySessionCommand({ type: 'configure', preferences: { focus: false } });
      persist();
    }
    sidebar.hidden = false;
    get('#reader-contents-panel').hidden = panel !== 'contents';
    get('#reader-notebook-panel').hidden = panel !== 'notebook';
    root.querySelectorAll<HTMLButtonElement>('[data-reader-tab]').forEach((tab) => {
      const active = tab.dataset.readerTab === panel;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    if (panel === 'notebook') renderNotebook();
    updateStatus();
    surface.update();
  }
  function closePanel(): void {
    if (sidebar.contains(document.activeElement)) viewport.focus({ preventScroll: true });
    sidebar.hidden = true;
    updateStatus();
    surface.update();
  }
  function notebookButton(label: string, action: string, id: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.readerAction = action;
    button.dataset.readerId = id;
    return button;
  }
  function renderNotebook(): void {
    const state = session.snapshot();
    const bookmarkRoot = get('#reader-bookmarks');
    const noteRoot = get('#reader-notes');
    bookmarkRoot.replaceChildren();
    noteRoot.replaceChildren();
    const bookmarkTitle = document.createElement('h3');
    bookmarkTitle.textContent = 'Bookmarks';
    bookmarkRoot.append(bookmarkTitle);
    for (const item of state.document?.bookmarks ?? []) {
      const row = document.createElement('div');
      row.className = 'reader-notebook-item';
      row.append(
        notebookButton(
          `${item.label} (${Math.round(item.progress * 100)}%)`,
          'bookmark-go',
          item.id,
        ),
        notebookButton('×', 'bookmark-remove', item.id),
      );
      row.lastElementChild?.setAttribute('aria-label', `Remove bookmark ${item.label}`);
      bookmarkRoot.append(row);
    }
    if (!state.document?.bookmarks.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No bookmarks.';
      bookmarkRoot.append(empty);
    }
    const noteTitle = document.createElement('h3');
    noteTitle.textContent = 'Notes and highlights';
    noteRoot.append(noteTitle);
    for (const item of state.document?.notes ?? []) {
      const row = document.createElement('div');
      row.className = 'reader-notebook-item';
      const open = notebookButton(item.text || item.quote, 'note-edit', item.id);
      open.title = item.quote;
      const remove = notebookButton('×', 'note-remove', item.id);
      remove.setAttribute('aria-label', 'Remove annotation');
      row.append(open, remove);
      noteRoot.append(row);
    }
    if (!state.document?.notes.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No annotations.';
      noteRoot.append(empty);
    }
    if (session.snapshot().pendingSave) {
      const warning = document.createElement('p');
      warning.textContent = `${session.snapshot().saveError ? `${session.snapshot().saveError} ` : ''}Notes are kept in this session. Export notebook to keep a copy.`;
      if (session.snapshot().recoveryAvailable) {
        const recovery = document.createElement('button');
        recovery.type = 'button';
        recovery.textContent = 'Export recovery backup…';
        recovery.addEventListener('click', () => {
          const raw = session.recovery();
          if (raw !== undefined) download('MHK10 Reader Recovery.json', raw, 'application/json');
        });
        warning.append(document.createElement('br'), recovery);
      }
      noteRoot.prepend(warning);
    }
  }
  function download(name: string, body: string, type = 'text/plain;charset=utf-8'): boolean {
    let url: string | undefined;
    let anchor: HTMLAnchorElement | undefined;
    try {
      url = URL.createObjectURL(new Blob([body], { type }));
      downloads.add(url);
      anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      root.append(anchor);
      anchor.click();
      const ownedUrl = url;
      const timer = window.setTimeout(() => {
        URL.revokeObjectURL(ownedUrl);
        downloads.delete(ownedUrl);
        downloadTimers.delete(timer);
      }, 1000);
      downloadTimers.add(timer);
      return true;
    } catch {
      if (url) {
        URL.revokeObjectURL(url);
        downloads.delete(url);
      }
      setFeedback('The download could not be started. Your notebook is unchanged.');
      return false;
    } finally {
      anchor?.remove();
    }
  }
  function filename(title: string, suffix: string): string {
    return `${title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 80) || 'Reader'}${suffix}`;
  }
  function notebookText(all = false): string {
    const state = session.snapshot('notebook').notebook;
    const entries = all
      ? Object.entries(state.documents)
      : session.snapshot().documentId
        ? [[session.snapshot().documentId!, session.snapshot().document!] as const]
        : [];
    return entries
      .map(
        ([id, document]) =>
          `# ${id === session.snapshot().documentId ? (current?.title ?? id) : (document.title ?? id)}\n\n## Bookmarks\n${document.bookmarks.map((item) => `- ${item.label} (${Math.round(item.progress * 100)}%)`).join('\n')}\n\n## Notes\n${document.notes
            .map(
              (item) =>
                `${
                  item.quote
                    ? item.quote
                        .split('\n')
                        .map((line) => `> ${line}`)
                        .join('\n') + '\n\n'
                    : ''
                }${item.text}\n`,
            )
            .join('\n')}`,
      )
      .join('\n\n---\n\n');
  }
  function saveNote(): void {
    const textValue = get<HTMLTextAreaElement>('#reader-note-text').value;
    const ok = editingNote
      ? applySessionCommand({ type: 'edit-note', id: editingNote, text: textValue })
      : applySessionCommand({
          type: 'annotate',
          id: crypto.randomUUID(),
          quote: draft?.quote ?? '',
          text: textValue,
          anchor: draft?.anchor ?? surface.snapshot().activeAnchor,
          offset: draft?.offset,
        });
    if (ok.status !== 'applied') {
      setFeedback('The note could not be saved. Check its length or notebook capacity.');
      return;
    }
    persist(true);
    noteDialog.close();
    surface.command({ type: 'clear-selection' });
    editingNote = undefined;
    draft = undefined;
    updateStatus();
    surface.update();
    showPanel('notebook');
  }
  function commandView() {
    return {
      focus: session.snapshot().preferences.focus,
      sidebarHidden: Boolean(sidebar.hidden),
      panelHidden: {
        contents: Boolean(get<HTMLElement>('#reader-contents-panel').hidden),
        notebook: Boolean(get<HTMLElement>('#reader-notebook-panel').hidden),
      },
    };
  }
  async function copyReaderText(kind: 'link' | 'citation'): Promise<void> {
    const book = current;
    const canonical =
      document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? location.href;
    const value =
      kind === 'citation'
        ? book
          ? readerCitation(book, canonical, sharedProfile.profile.name)
          : ''
        : book?.id.startsWith('file:')
          ? location.href
          : canonical;
    if (kind === 'citation' && !book) return;
    const success = kind === 'citation' ? 'Citation copied.' : 'Link copied.';
    const fallback = kind === 'citation' ? 'Citation text' : 'Article link';
    try {
      await navigator.clipboard.writeText(value);
      if (!lifetime.disposed) setFeedback(success);
    } catch {
      if (!lifetime.disposed) {
        const address = get<HTMLInputElement>('#reader-copy-address');
        address.value = value;
        address.hidden = false;
        dialogs.properties.showModal();
        address.focus();
        address.select();
        setFeedback(fallback);
      }
    }
  }
  function exportReader(kind: 'book' | 'notebook' | 'backup'): void {
    surface.flush();
    if (kind === 'book') {
      if (current)
        download(filename(current.title, '.md'), `# ${current.title}\n\n${current.body}`);
      return;
    }
    if (kind === 'notebook') {
      if (download('Reader Notebook.md', notebookText(true))) setFeedback('Notebook exported.');
      return;
    }
    if (
      download(
        'Reader Notebook.json',
        JSON.stringify(
          {
            ...session.snapshot('notebook').notebook,
            ...(session.recovery() === undefined ? {} : { recoveryRaw: session.recovery() }),
          },
          null,
          2,
        ),
        'application/json',
      )
    )
      setFeedback('Notebook backup exported.');
  }
  async function saveNotesFile(): Promise<void> {
    if (!current) return;
    surface.flush();
    const result = await files.saveAs(filename(current.title, ' notes.md'), notebookText());
    if (lifetime.disposed) return;
    setFeedback(
      result.status === 'saved'
        ? result.persisted
          ? 'Notes saved.'
          : 'Notes saved in this session only.'
        : result.status === 'cancelled'
          ? 'Save cancelled.'
          : result.status === 'failed'
            ? result.error
            : 'Notes were not saved.',
    );
  }
  async function applyIntent(intent: ReaderIntent): Promise<void> {
    surface.flush();
    switch (intent.type) {
      case 'open-navigation':
        navigation.open();
        return;
      case 'open-panel':
        showPanel(intent.panel);
        return;
      case 'close-panel':
        closePanel();
        return;
      case 'open-dialog':
        dialogs[intent.dialog].showModal();
        if (intent.focus === 'query') get<HTMLInputElement>('#reader-query').focus();
        return;
      case 'close-dialog':
        dialogs[intent.dialog].close();
        return;
      case 'toggle-focus':
        viewport.focus({ preventScroll: true });
        applySessionCommand({
          type: 'configure',
          preferences: { focus: !session.snapshot().preferences.focus },
        });
        updateStatus();
        persist();
        surface.update();
        return;
      case 'reset-options':
        applySessionCommand({
          type: 'configure',
          preferences: DEFAULT_READER_PREFERENCES,
        });
        layoutSelect.value = 'scroll';
        fontSelect.value = '12';
        spacingSelect.value = 'normal';
        zoomSelect.value = '100';
        themeSelect.value = 'paper';
        renderingSelect.value = 'pixel';
        widthSelect.value = DEFAULT_READER_PREFERENCES.width;
        options.close();
        persist();
        surface.update();
        setFeedback('Reading view restored.');
        return;
      case 'navigate':
        applySessionCommand({ type: 'step', direction: intent.direction });
        commitNavigation();
        return;
      case 'bookmark': {
        const anchor = surface.snapshot().activeAnchor;
        const label =
          (anchor
            ? prose.querySelector(`#${CSS.escape(anchor)}`)?.textContent?.slice(0, 200)
            : undefined) || `Page ${session.snapshot().page + 1}`;
        if (
          session
            .snapshot()
            .document?.bookmarks.some(
              (item) =>
                item.anchor === anchor &&
                Math.abs(item.progress - (session.snapshot().document?.progress ?? 0)) < 0.001,
            )
        ) {
          setFeedback('Page already bookmarked.');
          showPanel('notebook');
          return;
        }
        if (
          applySessionCommand({ type: 'bookmark', id: crypto.randomUUID(), label, anchor })
            .status === 'applied'
        ) {
          persist(true);
          setFeedback(
            session.snapshot().pendingSave ? 'Bookmark kept in this session.' : 'Bookmark saved.',
          );
          showPanel('notebook');
        } else setFeedback('Notebook is full. Export or remove existing annotations.');
        return;
      }
      case 'highlight': {
        const selected = surface.snapshot().selection;
        if (
          selected &&
          applySessionCommand({ type: 'annotate', id: crypto.randomUUID(), ...selected, text: '' })
            .status === 'applied'
        ) {
          persist(true);
          surface.command({ type: 'clear-selection', native: true });
          surface.update();
          updateStatus();
          setFeedback(
            session.snapshot().pendingSave ? 'Highlight kept in this session.' : 'Highlight saved.',
          );
        }
        return;
      }
      case 'compose-note':
        editingNote = undefined;
        draft = surface.snapshot().selection;
        get<HTMLTextAreaElement>('#reader-note-quote').value = draft?.quote ?? '';
        get<HTMLTextAreaElement>('#reader-note-text').value = '';
        noteDialog.showModal();
        get<HTMLTextAreaElement>('#reader-note-text').focus();
        return;
      case 'save-note':
        saveNote();
        return;
      case 'copy':
        await copyReaderText(intent.kind);
        return;
      case 'print':
        window.print();
        return;
      case 'export':
        exportReader(intent.kind);
        return;
      case 'import-notebook':
        importFile.click();
        return;
      case 'save-notes':
        await saveNotesFile();
        return;
      case 'fullscreen':
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
          else await root.requestFullscreen();
        } catch {
          setFeedback('Full screen is unavailable.');
        }
        return;
    }
  }
  async function command(action: string): Promise<void> {
    root
      .querySelectorAll<HTMLDetailsElement>('[data-hybrid-menubar] details[open]')
      .forEach((menu) => (menu.open = false));
    const intent = readerIntent(action, commandView());
    if (intent) await applyIntent(intent);
  }
  root.addEventListener(
    'click',
    (event) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLButtonElement>('[data-reader-command]');
      if (button && !button.disabled) {
        void command(button.dataset.readerCommand ?? '');
        return;
      }
      const tab = event.target.closest<HTMLButtonElement>('[data-reader-tab]');
      if (tab) {
        showPanel(tab.dataset.readerTab === 'notebook' ? 'notebook' : 'contents');
        return;
      }
      const anchor = event.target.closest<HTMLAnchorElement>('[data-reader-anchor]');
      if (anchor) {
        event.preventDefault();
        jumpToAnchor(anchor.dataset.readerAnchor ?? '');
        return;
      }
      const found = event.target.closest<HTMLButtonElement>('[data-reader-search]');
      if (found) {
        const index = Number(found.dataset.readerSearch);
        if (Number.isInteger(index) && index >= 0 && index < surface.snapshot().search.count) {
          findDialog.close();
          selectSearch(index);
        }
        return;
      }
      const item = event.target.closest<HTMLButtonElement>('[data-reader-action]');
      if (!item) return;
      const id = item.dataset.readerId ?? '';
      const action = item.dataset.readerAction;
      if (action === 'bookmark-go') goToBookmark(id);
      if (action === 'bookmark-remove') applySessionCommand({ type: 'remove-bookmark', id });
      if (action === 'note-remove') applySessionCommand({ type: 'remove-note', id });
      if (action === 'note-edit') openExistingNote(id);
      persist(true);
      renderNotebook();
      surface.update();
    },
    { signal },
  );
  pageInput.addEventListener(
    'change',
    () => {
      applySessionCommand({ type: 'page', page: Number(pageInput.value) - 1 });
      commitNavigation();
    },
    { signal },
  );
  const preferences = session.snapshot().preferences;
  layoutSelect.value = preferences.mode;
  fontSelect.value = String(preferences.fontSize);
  spacingSelect.value = preferences.spacing;
  zoomSelect.value = String(preferences.zoom);
  themeSelect.value = preferences.theme;
  renderingSelect.value = preferences.textRendering;
  widthSelect.value = preferences.width;
  for (const select of [
    layoutSelect,
    fontSelect,
    spacingSelect,
    zoomSelect,
    themeSelect,
    renderingSelect,
    widthSelect,
  ])
    select.addEventListener(
      'change',
      () => {
        const mode = layoutSelect.value === 'pages' ? 'pages' : 'scroll';
        const size = Number(fontSelect.value);
        const spacing =
          spacingSelect.value === 'compact'
            ? 'compact'
            : spacingSelect.value === 'wide'
              ? 'wide'
              : 'normal';
        const theme: ReadingTheme =
          themeSelect.value === 'sepia'
            ? 'sepia'
            : themeSelect.value === 'night'
              ? 'night'
              : themeSelect.value === 'contrast'
                ? 'contrast'
                : 'paper';
        applySessionCommand({
          type: 'configure',
          preferences: {
            mode: mode as ReadingMode,
            fontSize: size === 36 ? 36 : size === 24 ? 24 : 12,
            spacing: spacing as ReadingSpacing,
            zoom: clampReaderZoom(Number(zoomSelect.value)),
            theme,
            textRendering: renderingSelect.value === 'smooth' ? 'smooth' : 'pixel',
            width:
              widthSelect.value === 'narrow'
                ? 'narrow'
                : widthSelect.value === 'comfortable'
                  ? 'comfortable'
                  : 'wide',
          },
        });
        const applied = session.snapshot().preferences;
        zoomSelect.value = String(applied.zoom);
        themeSelect.value = applied.theme;
        persist();
        surface.update();
      },
      { signal },
    );
  importFile.addEventListener(
    'change',
    () => {
      const file = importFile.files?.[0];
      importFile.value = '';
      if (!file) return;
      surface.flush();
      setFeedback('Reading notebook backup…');
      void session.import(file).then((result) => {
        if (lifetime.disposed || result.status === 'ignored') return;
        if (result.status === 'failed') {
          setFeedback(result.error);
          return;
        }
        renderNotebook();
        renderLibraryState();
        surface.update();
        updateStatus();
        setFeedback(
          `Imported ${result.bookmarks} bookmark${result.bookmarks === 1 ? '' : 's'} and ${result.notes} note${result.notes === 1 ? '' : 's'}; ${result.skipped} duplicate${result.skipped === 1 ? '' : 's'} skipped.${result.persisted ? '' : ' Kept in this session; export a backup.'}`,
        );
      });
    },
    { signal },
  );
  get<HTMLFormElement>('#reader-find-form').addEventListener(
    'submit',
    (event) => {
      event.preventDefault();
      const query = get<HTMLInputElement>('#reader-query').value.trim();
      const result = get('#reader-find-results');
      result.replaceChildren();
      const hits = surface.find(query, get<HTMLInputElement>('#reader-match-case').checked);
      for (const hit of hits) {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = hit.excerpt;
        button.dataset.readerSearch = String(hit.index);
        li.append(button);
        result.append(li);
      }
      get('#reader-find-count').textContent = query
        ? `${hits.length}${hits.length === 200 ? '+' : ''} matches`
        : 'Enter text to search.';
    },
    { signal },
  );
  root.addEventListener(
    'keydown',
    (event) => {
      if (event.defaultPrevented || event.isComposing) return;
      const typing =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable);
      if (root.querySelector('dialog[open]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && current) {
        event.preventDefault();
        void command('find');
        return;
      }
      if (typing) return;
      if (event.key === 'F1') {
        event.preventDefault();
        void command('help');
        return;
      }
      if (
        event.target instanceof Element &&
        (event.target.closest('[data-hybrid-menubar],[role="combobox"]') ||
          (event.target.closest('[data-hybrid-tabs]') &&
            ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)))
      )
        return;
      if (!current) return;
      if (
        event.target instanceof Element &&
        event.target.closest('[data-hybrid-toolbar]') &&
        ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
      )
        return;
      if (event.key === 'F9') {
        event.preventDefault();
        void command('focus');
        return;
      }
      if (event.key === 'Escape' && session.snapshot().preferences.focus) {
        event.preventDefault();
        void command('focus');
        return;
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        ['+', '=', '-', '0', 'd'].includes(event.key.toLowerCase())
      ) {
        event.preventDefault();
        if (event.key.toLowerCase() === 'd') void command('bookmark');
        else {
          const zoom =
            event.key === '0'
              ? 100
              : stepReaderZoom(session.snapshot().preferences.zoom, event.key === '-' ? -1 : 1);
          applySessionCommand({ type: 'configure', preferences: { zoom } });
          zoomSelect.value = String(zoom);
          persist();
          surface.update();
          setFeedback(`Zoom ${zoom}%`);
        }
      } else if (event.key === 'PageDown' || event.key === 'PageUp') {
        event.preventDefault();
        applySessionCommand({ type: 'step', direction: event.key === 'PageDown' ? 1 : -1 });
        commitNavigation();
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        applySessionCommand({
          type: 'page',
          page: event.key === 'Home' ? 0 : session.snapshot().pages - 1,
        });
        commitNavigation();
      } else if (event.key === 'F3' && surface.snapshot().search.count) {
        event.preventDefault();
        surface.command({ type: 'search-step', direction: event.shiftKey ? -1 : 1 });
        reportSearch();
      } else if (event.key === 'Escape' && !sidebar.hidden) {
        event.preventDefault();
        closePanel();
      }
    },
    { signal },
  );
  function activate(book: Publication): void {
    current = book;
    root.dataset.reading = 'true';
    get('#reader-library').hidden = true;
    get('#reader-workspace').hidden = false;
    get('#reader-book-name').textContent = book.title;
    get('#reader-info-title').textContent = book.title;
    const opened = session.open(book);
    if (session.snapshot().saveError) setFeedback(session.snapshot().saveError);
    if (opened.status === 'rejected')
      setFeedback(
        'Notebook is full. Reading position will not be saved. Export existing annotations.',
      );
    surface.open(initialAnchor);
    initialAnchor = '';
    updateStatus();
  }
  function library(): void {
    const shelf = root.querySelector<HTMLElement>('.reader-shelf');
    if (!shelf) return;
    const shelfBooks = [...shelf.querySelectorAll<HTMLElement>('[data-reader-book]')];
    const books = [...root.querySelectorAll<HTMLElement>('#reader-library [data-reader-book]')];
    const search = root.querySelector<HTMLInputElement>('#library-search');
    const view = root.querySelector<HTMLSelectElement>('#library-view');
    const sort = root.querySelector<HTMLSelectElement>('#library-sort');
    const announcements = root.querySelector<HTMLElement>('.reader-announcements');
    renderLibraryState();
    const filter = () => {
      let visible = 0;
      let visibleAnnouncements = 0;
      const query = search?.value.trim().toLocaleLowerCase() ?? '';
      for (const book of books) {
        book.hidden = !(book.dataset.search ?? '').includes(query);
        if (book.hidden) continue;
        visible++;
        if (book.closest('.reader-announcements')) visibleAnnouncements++;
      }
      if (announcements) announcements.hidden = visibleAnnouncements === 0;
      setFeedback(`${visible} titles`);
    };
    search?.addEventListener('input', filter, { signal });
    view?.addEventListener(
      'change',
      () => {
        shelf.dataset.libraryView = view.value === 'list' ? 'list' : 'covers';
      },
      { signal },
    );
    sort?.addEventListener(
      'change',
      () => {
        const snapshot = session.snapshot('notebook').notebook;
        const ordered = shelfBooks.toSorted((a, b) =>
          sort.value === 'title'
            ? (a.dataset.title ?? '').localeCompare(b.dataset.title ?? '')
            : sort.value === 'recent'
              ? (snapshot.documents[b.dataset.readerBook ?? '']?.lastOpened ?? 0) -
                (snapshot.documents[a.dataset.readerBook ?? '']?.lastOpened ?? 0)
              : (b.dataset.date ?? '').localeCompare(a.dataset.date ?? ''),
        );
        for (const book of ordered) shelf.append(book);
      },
      { signal },
    );
    filter();
  }
  function renderLibraryState(): void {
    const snapshot = session.snapshot('notebook').notebook;
    const recentItems = get('#reader-recent-items');
    recentItems.replaceChildren();
    const known = new Map(
      [
        ...root.querySelectorAll<HTMLAnchorElement>(
          '.reader-announcements a[href^="/blog/"],.reader-shelf a[href^="/blog/"],.source-documents a[href^="/blog/"]',
        ),
      ].map((link) => [link.getAttribute('href'), link] as const),
    );
    for (const item of session.snapshot('notebook').recent) {
      const href = item.id.startsWith('file:')
        ? `/blog/?file=${encodeURIComponent(item.id.slice(5))}`
        : `/blog/${encodeURIComponent(item.id)}/`;
      const publicationLink = known.get(href);
      if (!publicationLink && !item.id.startsWith('file:')) continue;
      const row = document.createElement('li');
      const link = document.createElement('a');
      link.href = href;
      link.textContent = `${publicationLink?.textContent?.trim() || item.title} · ${Math.round(item.progress * 100)}%`;
      row.append(link);
      recentItems.append(row);
    }
    get('#reader-recent').hidden = !recentItems.childElementCount;
    for (const book of root.querySelectorAll<HTMLElement>('[data-reader-book]')) {
      const state = snapshot.documents[book.dataset.readerBook ?? ''];
      const progress = book.querySelector<HTMLElement>('.reader-book-progress');
      if (progress) progress.textContent = state ? `${Math.round(state.progress * 100)}% read` : '';
    }
  }
  // Commands become available only once their listeners and session exist.
  // The initializing marker remains in the DOM so a remount can find the same
  // controls; readiness is published separately and never confused with
  // controls disabled later by context (no selection, first page, and so on).
  commandControls.forEach((button) => (button.disabled = false));
  root.setAttribute('data-reader-ready', '');
  updateStatus();
  const fileId = new URL(location.href).searchParams.get('file');
  if (fileId) {
    setFeedback('Opening file…');
    void Promise.resolve()
      .then(() => files.read(fileId))
      .then((result) => {
        if (lifetime.disposed) return;
        if (result.status !== 'read' || result.file.kind !== 'text') {
          setFeedback(
            result.status === 'failed' ? result.error : 'This file does not contain text.',
          );
          return;
        }
        flow.querySelector('.reader-book-header')?.remove();
        flow.querySelector('.archive-note')?.remove();
        const header = document.createElement('header');
        header.className = 'reader-book-header';
        const title = document.createElement('h1');
        title.textContent = result.file.title;
        header.append(title);
        flow.prepend(header);
        const contents = get('#reader-contents');
        if (isMarkdownName(result.file.title)) {
          const parsed = parseMarkdown(result.file.text);
          const fragment = document.createDocumentFragment();
          for (const block of parsed.blocks) fragment.appendChild(buildMarkdownNode(block));
          prose.replaceChildren(fragment);
          const toc = document.createDocumentFragment();
          for (const heading of parsed.headings) {
            if (heading.depth < 2 || heading.depth > 3) continue;
            const li = document.createElement('li');
            li.dataset.depth = String(heading.depth);
            const anchor = document.createElement('a');
            anchor.href = `#${heading.slug}`;
            anchor.dataset.readerAnchor = heading.slug;
            anchor.textContent = heading.text;
            li.appendChild(anchor);
            toc.appendChild(li);
          }
          contents.replaceChildren(toc);
        } else {
          const plain = document.createElement('pre');
          plain.className = 'reader-plain';
          plain.textContent = result.file.text;
          prose.replaceChildren(plain);
          contents.replaceChildren();
        }
        activate({
          id: `file:${result.file.id}`,
          title: result.file.title,
          description: '',
          body: result.file.text,
          published: '',
        });
        setFeedback('File opened.');
      })
      .catch(() => {
        if (!lifetime.disposed) setFeedback('The file could not be opened.');
      });
  } else if (current) activate(current);
  else {
    updateStatus();
    library();
  }
  window.addEventListener(
    'pagehide',
    (event) => {
      persist();
      if (!event.persisted) lifetime.dispose();
    },
    { signal },
  );
}
