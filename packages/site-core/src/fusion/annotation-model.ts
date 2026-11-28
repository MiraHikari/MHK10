import { parseReaderNoteBlock } from './reading-command';
import type { ReaderNote, ReaderNoteBlock } from './reading-model';

/** A block anchor must still identify the quote; stale anchors fall back to ordered text search. */
export function locateNote(
  note: Readonly<ReaderNote>,
  blocks: readonly string[],
): ReaderNoteBlock | null {
  if (!note.quote) return null;
  const anchor = parseReaderNoteBlock(note.block);
  if (anchor && blocks[anchor.block]?.slice(anchor.start, anchor.end) === note.quote) return anchor;
  for (const [block, text] of blocks.entries()) {
    const start = text.indexOf(note.quote);
    if (start >= 0) return { block, start, end: start + note.quote.length };
  }
  return null;
}

/** Resolve the complete document's UTF-16 offset, including notes created without offsets. */
export function resolveNoteOffset(note: Readonly<ReaderNote>, text: string): number {
  if (!note.quote) return -1;
  if (
    note.offset !== undefined &&
    Number.isSafeInteger(note.offset) &&
    note.offset >= 0 &&
    text.slice(note.offset, note.offset + note.quote.length) === note.quote
  )
    return note.offset;
  return text.indexOf(note.quote);
}

export function removeAnnotation(notes: readonly ReaderNote[], id: string): ReaderNote[] {
  return notes.filter((note) => note.id !== id);
}

/** Selector equality covers notebook fields only, so progress saves leave highlight DOM alone. */
export function sameAnnotations(
  left: readonly ReaderNote[] | undefined,
  right: readonly ReaderNote[] | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  return left.every((note, index) => {
    const other = right[index];
    return (
      note.id === other.id &&
      note.quote === other.quote &&
      note.text === other.text &&
      note.progress === other.progress &&
      note.anchor === other.anchor &&
      note.offset === other.offset &&
      note.block?.block === other.block?.block &&
      note.block?.start === other.block?.start &&
      note.block?.end === other.block?.end
    );
  });
}
