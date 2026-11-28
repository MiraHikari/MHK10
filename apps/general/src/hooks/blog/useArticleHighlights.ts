import { useCallback, useEffect, useRef } from 'react';
import {
  applyHighlightMarkers,
  captureHighlightMarker,
  MAX_HIGHLIGHT_LENGTH,
  removeHighlightMarks,
  type HighlightMarker,
} from '@/lib/blog/highlight';
import { addArticleNote, notesForArticle, removeArticleNote } from '@/lib/blog/annotation-store';
import { subscribeSharedReadingSelector } from '@mhk/site-core/fusion/browser-reading';
import { locateNote, sameAnnotations } from '@mhk/site-core/fusion/annotation-model';
import type { ReaderNote } from '@mhk/site-core/fusion/reading-model';

function markersForNotes(notes: readonly ReaderNote[], container: HTMLElement): HighlightMarker[] {
  const blocks = Array.from(container.children, (block) => block.textContent ?? '');
  return notes.flatMap((note) => {
    if (!note.quote || note.quote.length > MAX_HIGHLIGHT_LENGTH) return [];
    const location = locateNote(note, blocks);
    return location
      ? [
          {
            p: location.block,
            start: location.start,
            end: location.end,
            text: note.quote,
            noteId: note.id,
          },
        ]
      : [];
  });
}

export function useArticleHighlights(
  slug: string | undefined,
  bodyReady: boolean,
): { addFromSelection: () => void } {
  const containerRef = useRef<{ slug: string; element: HTMLElement } | null>(null);
  const markersRef = useRef<readonly HighlightMarker[]>([]);

  useEffect(() => {
    if (!slug || !bodyReady) return;
    const prose = document.querySelector<HTMLElement>('.prose-mh');
    if (!prose) return;
    // Astro wraps server-rendered React children in a display:contents slot. Use the
    // authored block parent on both SSR and fetched fragments, so anchors stay portable.
    const container = prose.querySelector<HTMLElement>(':scope > astro-slot') ?? prose;
    containerRef.current = { slug, element: container };
    const restore = (notes: readonly ReaderNote[] | undefined) => {
      markersRef.current = markersForNotes(notes ?? [], container);
      applyHighlightMarkers(container, markersRef.current);
    };
    try {
      restore(notesForArticle(slug));
    } catch {
      // A damaged notebook stays intact; render no highlights instead of stale records.
      restore([]);
    }
    const unsubscribe = subscribeSharedReadingSelector(
      (state) => (Object.hasOwn(state.documents, slug) ? state.documents[slug].notes : undefined),
      restore,
      sameAnnotations,
    );
    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const mark = target?.closest<HTMLElement>('mark.reading-highlight[data-note-id]');
      if (!mark || !container.contains(mark) || !mark.dataset.noteId) return;
      event.preventDefault();
      removeArticleNote(slug, mark.dataset.noteId);
    };
    container.addEventListener('click', handleClick);
    return () => {
      container.removeEventListener('click', handleClick);
      unsubscribe();
      removeHighlightMarks(container);
      if (containerRef.current?.element === container) containerRef.current = null;
      markersRef.current = [];
    };
  }, [slug, bodyReady]);

  const addFromSelection = useCallback(() => {
    if (!slug || containerRef.current?.slug !== slug) return;
    const selection = window.getSelection();
    if (!selection) return;
    const marker = captureHighlightMarker(containerRef.current.element, selection);
    selection.removeAllRanges();
    if (
      !marker ||
      markersRef.current.some(
        (item) => item.p === marker.p && marker.start < item.end && marker.end > item.start,
      )
    )
      return;
    addArticleNote(slug, {
      id: crypto.randomUUID(),
      quote: marker.text,
      block: { block: marker.p, start: marker.start, end: marker.end },
    });
  }, [slug]);

  return { addFromSelection };
}
