import { claimSurface, createLifetime } from '../../ui/browser/lifetime';
import { resolveNoteOffset } from '@mhk/site-core/fusion/annotation-model';
import { READING_LIMITS } from '@mhk/site-core/fusion/reading-limits';
import type { ReaderNote } from '@mhk/site-core/fusion/reading-model';
import type { ReaderSessionSnapshot } from './reader-session';
import { measureReaderText } from './reader-statistics-model';

export interface ReadingSelection {
  readonly quote: string;
  readonly offset: number;
  readonly anchor: string;
}
export interface ReadingPosition {
  readonly progress: number;
  readonly anchor: string;
  readonly pages: number;
}
export type ReadingSurfaceChange =
  | { readonly type: 'position'; readonly position: ReadingPosition; readonly navigation: boolean }
  | { readonly type: 'selection' };
export type ReadingSurfaceCommand =
  | { type: 'position'; anchor?: string }
  | { type: 'anchor'; anchor: string }
  | { type: 'note'; note: Readonly<ReaderNote> }
  | { type: 'search-index'; index: number }
  | { type: 'search-step'; direction: -1 | 1 }
  | { type: 'clear-selection'; native?: boolean };
export interface ReadingSearchHit {
  readonly index: number;
  readonly excerpt: string;
}
interface TextPart {
  node: Text;
  start: number;
}

/**
 * Own text nodes, ranges, selection, highlights and all pagination measurements.
 * Only immutable positions cross this Interface. The caller owns persistence and
 * URL navigation; resize, image load and late font readiness share one reflow path.
 */
export function mountReadingSurface(
  root: HTMLElement,
  actions: {
    state(): Pick<ReaderSessionSnapshot, 'documentId' | 'document' | 'preferences'>;
    changed(change: ReadingSurfaceChange): void;
  },
) {
  const lifetime = createLifetime();
  const document = root.ownerDocument;
  const get = (selector: string) => {
    const element = root.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing Reader surface element: ${selector}`);
    return element;
  };
  const viewport = get('#reader-viewport');
  const flow = get('#reader-flow');
  const prose = get('#reader-prose');
  lifetime.defer(claimSurface(prose));
  const attributes = ['data-layout', 'data-reading-theme', 'data-text-rendering', 'data-focus'].map(
    (name) => [name, root.getAttribute(name)] as const,
  );
  const properties = [
    '--reader-font',
    '--reader-zoom',
    '--reader-line',
    '--reader-side-padding',
    '--reader-column',
    '--reader-page-height',
  ].map(
    (name) =>
      [name, root.style.getPropertyValue(name), root.style.getPropertyPriority(name)] as const,
  );
  lifetime.defer(() => {
    for (const [name, value] of attributes) {
      if (value === null) root.removeAttribute(name);
      else root.setAttribute(name, value);
    }
    for (const [name, value, priority] of properties) {
      if (value) root.style.setProperty(name, value, priority);
      else root.style.removeProperty(name);
    }
  });
  let layoutFrame: number | undefined;
  let positionFrame: number | undefined;
  let layoutReady = false;
  let measuredWidth = 0;
  let measuredHeight = 0;
  let measuredExtent = 0;
  let initialAnchor = '';
  let pages = 1;
  let text = '';
  let parts: TextPart[] = [];
  let passage: Range | undefined;
  let statistics = measureReaderText('');
  let headings: HTMLElement[] = [];
  let chapters: readonly {
    readonly anchor: string;
    readonly title: string;
    readonly subsection: boolean;
  }[] = Object.freeze([]);
  let headingPositions: { anchor: string; top: number; left: number; right: number }[] = [];
  let lastPosition: ReadingPosition | undefined;
  let selected: ReadingSelection | undefined;
  let searchRanges: Range[] = [];
  let selectedSearch = -1;
  let annotationRanges: Range[] = [];
  let annotationHighlight: Highlight | undefined;
  let searchHighlight: Highlight | undefined;

  function clearHighlight(name: string, highlight: Highlight | undefined, ranges: Range[]): void {
    if (!highlight) return;
    ranges.forEach((range) => highlight.delete(range));
    if (!highlight.size && CSS.highlights?.get(name) === highlight) CSS.highlights.delete(name);
  }
  lifetime.defer(() => {
    if (layoutFrame !== undefined) cancelAnimationFrame(layoutFrame);
    if (positionFrame !== undefined) cancelAnimationFrame(positionFrame);
    clearHighlight('reader-annotations', annotationHighlight, annotationRanges);
    clearHighlight('reader-search', searchHighlight, searchRanges);
    parts = [];
    text = '';
    passage = undefined;
    selected = undefined;
    annotationRanges = [];
    searchRanges = [];
    annotationHighlight = undefined;
    searchHighlight = undefined;
    headings = [];
    chapters = Object.freeze([]);
    headingPositions = [];
  });

  function activeAnchor(): string {
    const mode = root.dataset.layout === 'pages' ? 'pages' : 'scroll';
    const scrollEnd = viewport.scrollHeight - viewport.clientHeight;
    if (mode === 'scroll' && scrollEnd > 0 && viewport.scrollTop >= scrollEnd - 1)
      return headingPositions.at(-1)?.anchor ?? '';
    let anchor = '';
    for (const heading of headingPositions) {
      if (
        mode === 'pages'
          ? heading.left < viewport.scrollLeft + viewport.clientWidth &&
            heading.right >= viewport.scrollLeft
          : heading.top <= viewport.scrollTop + 36
      )
        anchor = heading.anchor;
    }
    return anchor;
  }
  function position(progress: number, anchor = '', navigation = false): void {
    if (lifetime.disposed) return;
    const next = Object.freeze({ progress: Math.max(0, Math.min(1, progress)), anchor, pages });
    if (
      !navigation &&
      lastPosition?.progress === next.progress &&
      lastPosition.anchor === next.anchor &&
      lastPosition.pages === next.pages
    )
      return;
    lastPosition = next;
    actions.changed(
      Object.freeze({
        type: 'position',
        position: next,
        navigation,
      }),
    );
  }
  function pagePosition(page: number): number {
    return pages <= 1 ? 0 : Math.max(0, Math.min(pages - 1, Math.round(page))) / (pages - 1);
  }
  function visibleRects(range: Range): DOMRect[] {
    const frame = viewport.getBoundingClientRect();
    return [...range.getClientRects()].filter(
      (rect) =>
        rect.left < frame.right &&
        rect.right > frame.left &&
        rect.top < frame.bottom &&
        rect.bottom > frame.top,
    );
  }
  function rememberPassage(): void {
    if (actions.state().preferences.mode !== 'pages') {
      passage = undefined;
      return;
    }
    if (passage && visibleRects(passage).length) return;
    passage = undefined;
    const frame = viewport.getBoundingClientRect();
    for (const part of parts) {
      const range = document.createRange();
      range.selectNodeContents(part.node);
      const rect = visibleRects(range)[0];
      if (!rect) continue;
      const x = Math.max(frame.left, rect.left) + 1;
      const y = Math.max(frame.top, rect.top) + Math.min(1, rect.height / 2);
      const caret = document.caretPositionFromPoint?.(x, y);
      const fallback = caret ? undefined : document.caretRangeFromPoint?.(x, y);
      const node = caret?.offsetNode ?? fallback?.startContainer;
      const offset = caret?.offset ?? fallback?.startOffset;
      if (node !== part.node || offset === undefined || !part.node.length) continue;
      const start = Math.min(offset, part.node.length - 1);
      range.setStart(part.node, start);
      range.setEnd(part.node, start + 1);
      passage = range;
      return;
    }
  }
  function rememberPosition(): void {
    if (lifetime.disposed || !layoutReady || !actions.state().documentId) return;
    // Hidden iframe documents can report zero geometry during reload or unload.
    // That is not an accepted reading position.
    if (viewport.clientWidth === 0 || viewport.clientHeight === 0) {
      measuredExtent = 0;
      return;
    }
    const mode = root.dataset.layout === 'pages' ? 'pages' : 'scroll';
    const extent = mode === 'pages' ? flow.scrollWidth : viewport.scrollHeight;
    if (
      viewport.clientWidth !== measuredWidth ||
      viewport.clientHeight !== measuredHeight ||
      extent !== measuredExtent
    ) {
      update();
      return;
    }
    if (mode === 'pages')
      position(pagePosition(viewport.scrollLeft / Math.max(1, viewport.clientWidth)));
    else
      position(
        viewport.scrollTop / Math.max(1, viewport.scrollHeight - viewport.clientHeight),
        activeAnchor(),
      );
    rememberPassage();
  }
  function flush(): void {
    if (positionFrame !== undefined) cancelAnimationFrame(positionFrame);
    positionFrame = undefined;
    rememberPosition();
  }
  function schedulePosition(): void {
    if (lifetime.disposed || !layoutReady || positionFrame !== undefined) return;
    positionFrame = requestAnimationFrame(() => {
      positionFrame = undefined;
      rememberPosition();
    });
  }
  function restorePosition(): void {
    const state = actions.state();
    const progress = state.document?.progress ?? 0;
    if (state.preferences.mode === 'pages')
      viewport.scrollTo({
        left: Math.round(progress * (pages - 1)) * viewport.clientWidth,
        top: 0,
        behavior: 'instant',
      });
    else
      viewport.scrollTo({
        left: 0,
        top: progress * Math.max(0, viewport.scrollHeight - viewport.clientHeight),
        behavior: 'instant',
      });
  }
  function commitNavigation(progress: number, anchor = '', target?: Range): void {
    initialAnchor = '';
    passage = target?.cloneRange();
    position(progress, anchor, true);
    restorePosition();
    rememberPassage();
  }
  function reflow(): void {
    if (lifetime.disposed || !actions.state().documentId) return;
    // Wait for ResizeObserver to supply usable geometry before restoring a
    // position or consuming the initial destination anchor.
    if (viewport.clientWidth === 0 || viewport.clientHeight === 0) {
      measuredExtent = 0;
      return;
    }
    const state = actions.state();
    const anchor = state.document?.anchor
      ? prose.querySelector<HTMLElement>(`#${CSS.escape(state.document.anchor)}`)
      : null;
    const preserveAnchor =
      measuredExtent > 0 &&
      anchor &&
      state.document &&
      state.document.progress > 0 &&
      state.document.progress < 1 &&
      root.dataset.layout === state.preferences.mode;
    const before = preserveAnchor ? anchor.getBoundingClientRect() : null;
    // Percentage alone moves to unrelated text when fixed-size images or blocks
    // take a different proportion of the new pages. Keep the visible text Range.
    const preservePassage =
      measuredExtent > 0 &&
      passage &&
      state.document &&
      state.document.progress > 0 &&
      state.document.progress < 1 &&
      root.dataset.layout === 'pages' &&
      state.preferences.mode === 'pages' &&
      !initialAnchor;
    const bounds = viewport.getBoundingClientRect();
    root.dataset.layout = state.preferences.mode;
    root.dataset.readingTheme = state.preferences.theme;
    root.dataset.textRendering = state.preferences.textRendering;
    root.dataset.focus = String(state.preferences.focus);
    root.style.setProperty('--reader-font', `${state.preferences.fontSize}px`);
    root.style.setProperty('--reader-zoom', String(state.preferences.zoom / 100));
    root.style.setProperty(
      '--reader-line',
      `${state.preferences.fontSize * (state.preferences.spacing === 'compact' ? 4 / 3 : state.preferences.spacing === 'wide' ? 2 : 1.5)}px`,
    );
    const width =
      state.preferences.width === 'narrow'
        ? 360
        : state.preferences.width === 'comfortable'
          ? 480
          : viewport.clientWidth;
    const padding =
      2 *
      Math.floor(Math.max(viewport.clientWidth <= 400 ? 32 : 48, viewport.clientWidth - width) / 2);
    root.style.setProperty('--reader-side-padding', `${Math.floor(padding / 2)}px`);
    root.style.setProperty('--reader-column', `${Math.max(80, viewport.clientWidth - padding)}px`);
    root.style.setProperty('--reader-page-height', `${Math.max(1, viewport.clientHeight)}px`);
    pages = Math.max(
      1,
      state.preferences.mode === 'pages'
        ? Math.ceil(flow.scrollWidth / Math.max(1, viewport.clientWidth))
        : Math.ceil(viewport.scrollHeight / Math.max(1, viewport.clientHeight)),
    );
    position(state.document?.progress ?? 0, state.document?.anchor ?? '');
    restorePosition();
    if (preservePassage) {
      position(progressAt(passage!), state.document?.anchor ?? '');
      restorePosition();
    } else if (anchor && before && !initialAnchor) {
      const after = anchor.getBoundingClientRect();
      const nextBounds = viewport.getBoundingClientRect();
      if (state.preferences.mode === 'scroll') {
        viewport.scrollTop += after.top - nextBounds.top - (before.top - bounds.top);
        position(
          viewport.scrollTop / Math.max(1, viewport.scrollHeight - viewport.clientHeight),
          anchor.id,
        );
      } else {
        position(
          pagePosition(
            (viewport.scrollLeft + after.left - nextBounds.left - (before.left - bounds.left)) /
              Math.max(1, viewport.clientWidth),
          ),
        );
        restorePosition();
      }
    }
    if (initialAnchor) {
      const anchor = initialAnchor;
      initialAnchor = '';
      jumpToAnchor(anchor);
    }
    rememberPassage();
    updateHighlights();
    measuredWidth = viewport.clientWidth;
    measuredHeight = viewport.clientHeight;
    measuredExtent = state.preferences.mode === 'pages' ? flow.scrollWidth : viewport.scrollHeight;
    const headingBounds = viewport.getBoundingClientRect();
    headingPositions = headings.map((heading) => {
      const box = heading.getBoundingClientRect();
      return {
        anchor: heading.id,
        top: box.top - headingBounds.top + viewport.scrollTop,
        left: box.left - headingBounds.left + viewport.scrollLeft,
        right: box.right - headingBounds.left + viewport.scrollLeft,
      };
    });
    layoutReady = true;
  }
  function update(): void {
    if (lifetime.disposed) return;
    if (positionFrame !== undefined) flush();
    // Resize and remount can queue clamped scroll events before reflow. They are
    // layout effects, so do not overwrite the saved position with those values.
    layoutReady = false;
    updateHighlights();
    if (layoutFrame !== undefined) cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = undefined;
      reflow();
    });
  }
  function rangeAt(start: number, length: number): Range | null {
    const first = parts.find((part) => part.start + part.node.length > start);
    const last = parts.find((part) => part.start + part.node.length >= start + length);
    if (!first || !last || length <= 0) return null;
    const range = document.createRange();
    range.setStart(first.node, start - first.start);
    range.setEnd(last.node, start + length - last.start);
    return range;
  }
  function noteRange(note: Readonly<ReaderNote>): Range | null {
    const offset = resolveNoteOffset(note, text);
    return offset >= 0 && text.slice(offset, offset + note.quote.length) === note.quote
      ? rangeAt(offset, note.quote.length)
      : null;
  }
  function updateHighlights(): void {
    if (typeof Highlight === 'undefined' || !CSS.highlights) return;
    clearHighlight('reader-annotations', annotationHighlight, annotationRanges);
    clearHighlight('reader-search', searchHighlight, searchRanges);
    annotationRanges = (actions.state().document?.notes ?? []).flatMap((note) => {
      const range = noteRange(note);
      return range ? [range] : [];
    });
    // A CSS registry is document-wide. Release only this surface's ranges, so an
    // adjacent Reader remains highlighted when this one updates or is disposed.
    annotationHighlight = CSS.highlights.get('reader-annotations') ?? new Highlight();
    searchHighlight = CSS.highlights.get('reader-search') ?? new Highlight();
    annotationRanges.forEach((range) => annotationHighlight?.add(range));
    searchRanges.forEach((range) => searchHighlight?.add(range));
    CSS.highlights.set('reader-annotations', annotationHighlight);
    CSS.highlights.set('reader-search', searchHighlight);
  }
  function captureSelection(): ReadingSelection | undefined {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!prose.contains(range.startContainer) || !prose.contains(range.endContainer)) return;
    const quote = range.toString().trim();
    if (!quote || quote.length > READING_LIMITS.quote) return;
    const prefix = document.createRange();
    prefix.selectNodeContents(prose);
    prefix.setEnd(range.startContainer, range.startOffset);
    const raw = range.toString();
    return Object.freeze({
      quote,
      offset: prefix.toString().length + raw.length - raw.trimStart().length,
      anchor: activeAnchor(),
    });
  }
  function progressAt(range: Range): number {
    const box = range.getBoundingClientRect();
    const frame = viewport.getBoundingClientRect();
    return actions.state().preferences.mode === 'pages'
      ? pagePosition(
          Math.floor(
            (box.left - frame.left + viewport.scrollLeft) / Math.max(1, viewport.clientWidth),
          ),
        )
      : (box.top - frame.top + viewport.scrollTop) /
          Math.max(1, viewport.scrollHeight - viewport.clientHeight);
  }
  function jumpToRange(range: Range, anchor = ''): void {
    commitNavigation(progressAt(range), anchor, range);
  }
  function jumpToAnchor(id: string): boolean {
    if (!id) return false;
    const target = prose.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (!target) return false;
    const range = document.createRange();
    range.selectNode(target);
    jumpToRange(range, id);
    return true;
  }
  function selectSearch(index: number): boolean {
    if (!searchRanges.length || !Number.isInteger(index)) return false;
    selectedSearch = ((index % searchRanges.length) + searchRanges.length) % searchRanges.length;
    jumpToRange(searchRanges[selectedSearch]);
    return true;
  }
  function command(command: ReadingSurfaceCommand): boolean {
    if (lifetime.disposed) return false;
    // Location commands use the last accepted scroll before navigating. The
    // position command restores state already supplied by the caller instead.
    if (command.type !== 'position') flush();
    else if (positionFrame !== undefined) {
      cancelAnimationFrame(positionFrame);
      positionFrame = undefined;
    }
    switch (command.type) {
      case 'position':
        commitNavigation(actions.state().document?.progress ?? 0, command.anchor);
        return true;
      case 'anchor':
        return jumpToAnchor(command.anchor);
      case 'note': {
        const range = noteRange(command.note);
        if (!range) return false;
        jumpToRange(range);
        return true;
      }
      case 'search-index':
        return selectSearch(command.index);
      case 'search-step':
        return selectSearch(
          selectedSearch < 0
            ? command.direction < 0
              ? searchRanges.length - 1
              : 0
            : selectedSearch + command.direction,
        );
      case 'clear-selection':
        selected = undefined;
        if (command.native) {
          const selection = document.getSelection();
          const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
          if (range && prose.contains(range.startContainer) && prose.contains(range.endContainer))
            selection?.removeAllRanges();
        }
        actions.changed({ type: 'selection' });
        return true;
    }
  }
  function find(query: string, matchCase = false): readonly ReadingSearchHit[] {
    if (lifetime.disposed) return [];
    clearHighlight('reader-search', searchHighlight, searchRanges);
    searchRanges = [];
    selectedSearch = -1;
    const hits: ReadingSearchHit[] = [];
    if (query) {
      const expression = new RegExp(
        query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        matchCase ? 'gu' : 'giu',
      );
      let match: RegExpExecArray | null;
      while ((match = expression.exec(text)) && searchRanges.length < 200) {
        const range = rangeAt(match.index, match[0].length);
        if (!range) continue;
        hits.push(
          Object.freeze({
            index: searchRanges.length,
            excerpt: text.slice(
              Math.max(0, match.index - 24),
              Math.min(text.length, match.index + query.length + 55),
            ),
          }),
        );
        searchRanges.push(range);
      }
    }
    updateHighlights();
    return Object.freeze(hits);
  }
  function open(anchor = ''): void {
    if (lifetime.disposed) return;
    if (positionFrame !== undefined) cancelAnimationFrame(positionFrame);
    positionFrame = undefined;
    layoutReady = false;
    initialAnchor = anchor;
    lastPosition = undefined;
    text = '';
    parts = [];
    passage = undefined;
    selected = undefined;
    clearHighlight('reader-search', searchHighlight, searchRanges);
    searchRanges = [];
    selectedSearch = -1;
    headings = [...prose.querySelectorAll<HTMLElement>('h2[id],h3[id]')];
    chapters = Object.freeze(
      headings.map((heading) =>
        Object.freeze({
          anchor: heading.id,
          title: heading.textContent?.trim() || 'Untitled chapter',
          subsection: heading.tagName === 'H3',
        }),
      ),
    );
    headingPositions = [];
    const walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const content = node as Text;
      parts.push({ node: content, start: text.length });
      text += content.data;
    }
    // Keep block boundaries for statistics without changing text search offsets.
    statistics = measureReaderText(prose.innerText);
    update();
  }

  try {
    lifetime.listen(document, 'selectionchange', () => {
      if (lifetime.disposed) return;
      const next = captureSelection();
      if (next) selected = next;
      else if (
        !(document.activeElement instanceof Element) ||
        !root.contains(document.activeElement) ||
        !document.activeElement.closest('.reader-tools,[data-hybrid-menubar]')
      )
        selected = undefined;
      actions.changed({ type: 'selection' });
    });
    lifetime.listen(viewport, 'scroll', schedulePosition, { passive: true });
    lifetime.listen(prose, 'load', update, { capture: true });
    const observer = new ResizeObserver(update);
    lifetime.defer(() => observer.disconnect());
    observer.observe(viewport);
    observer.observe(flow);
    void document.fonts.ready.then(update, () => {});
  } catch (error) {
    lifetime.dispose();
    throw error;
  }

  return {
    open,
    update,
    flush,
    command,
    find,
    snapshot: () =>
      Object.freeze({
        selection: selected,
        statistics: Object.freeze({ ...statistics }),
        activeAnchor: lifetime.disposed ? '' : activeAnchor(),
        search: Object.freeze({ count: searchRanges.length, selected: selectedSearch }),
        chapters,
      }),
    dispose: lifetime.dispose,
  };
}
