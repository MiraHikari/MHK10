import { changeSharedReading, readingDocument } from '@mhk/site-core/fusion/browser-reading';
import { applyReadingCommand, validateReaderNote } from '@mhk/site-core/fusion/reading-command';
import { READING_LIMITS } from '@mhk/site-core/fusion/reading-limits';
import {
  ReaderModel,
  type ReaderNote,
  type ReaderNoteBlock,
} from '@mhk/site-core/fusion/reading-model';

export type ArticleNoteResult =
  | { status: 'saved' }
  | { status: 'rejected'; reason: 'invalid' | 'capacity' | 'duplicate' }
  | { status: 'failed' };

export function notesForArticle(slug: string): readonly ReaderNote[] {
  return readingDocument(slug)?.notes ?? [];
}
function validSlug(slug: string): boolean {
  return (
    !!slug &&
    slug.length <= READING_LIMITS.documentId &&
    !['__proto__', 'constructor', 'prototype'].includes(slug)
  );
}
function rejected(reason: 'invalid' | 'duplicate' | 'capacity'): ArticleNoteResult {
  return { status: 'rejected', reason };
}
/** The shared command has no ArticleNoteResult branch for an unopened document. */
function rejection(
  reason: 'invalid' | 'duplicate' | 'capacity' | 'no-document',
): ArticleNoteResult {
  return rejected(reason === 'no-document' ? 'capacity' : reason);
}

/** Update one notebook record. Unrenderable notes and reading position are never reconstructed. */
export function addArticleNote(
  slug: string,
  input: { id: string; quote: string; block: ReaderNoteBlock },
): ArticleNoteResult {
  // Reject malformed records before reading storage, so a damaged notebook cannot
  // turn a validation error into a failed write.
  const candidate = validateReaderNote({
    id: input.id,
    quote: input.quote,
    text: '',
    progress: 0,
    anchor: '',
    block: input.block,
  });
  if (!validSlug(slug) || !candidate) return rejected('invalid');
  let result: ArticleNoteResult = { status: 'saved' };
  const saved = changeSharedReading((state) => {
    const model = new ReaderModel(state);
    if (!model.open(slug, Date.now())) {
      result = rejected('capacity');
      return;
    }
    const next = model.serialize();
    const applied = applyReadingCommand(next, slug, {
      type: 'add-note',
      id: input.id,
      quote: input.quote,
      text: '',
      anchor: next.documents[slug].anchor,
      block: input.block,
    });
    if (applied.status === 'rejected') {
      result = rejection(applied.reason);
      return;
    }
    state.documents = applied.state.documents;
  });
  return saved ? result : { status: 'failed' };
}

export function removeArticleNote(slug: string, id: string): ArticleNoteResult {
  if (!validSlug(slug)) return rejected('invalid');
  return changeSharedReading((state) => {
    const applied = applyReadingCommand(state, slug, { type: 'remove-note', id });
    if (applied.status === 'applied') state.documents = applied.state.documents;
  })
    ? { status: 'saved' }
    : { status: 'failed' };
}
