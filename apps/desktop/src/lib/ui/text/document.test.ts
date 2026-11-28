import { describe, it, expect } from 'vite-plus/test';
import { documentLines, caretAt, caretLine, visibleDocumentLine } from './document';
const measure = (value: string) => [...value].length;
describe('wrapped document navigation', () => {
  it('limits long-line painting to the visible glyphs and retains source offsets', () => {
    const line = { text: 'x'.repeat(20000), start: 10, end: 20010 };
    expect(visibleDocumentLine(line, 15000, 40, measure)).toEqual({
      text: 'x'.repeat(40),
      start: 15010,
      end: 15050,
      x: 15000,
    });
    expect(
      visibleDocumentLine({ text: 'a😀bc', start: 0, end: 5 }, 2, 1, (value) => value.length),
    ).toEqual({
      text: '😀',
      start: 1,
      end: 3,
      x: 1,
    });
  });
  it('preserves whitespace and offsets across soft wraps and blank lines', () => {
    expect(documentLines('ab cd\n\nx', 3, measure)).toEqual([
      { text: 'ab ', start: 0, end: 3 },
      { text: 'cd', start: 3, end: 5 },
      { text: '', start: 6, end: 6 },
      { text: 'x', start: 7, end: 8 },
    ]);
  });
  it('places boundary carets on the next soft line but before a hard newline', () => {
    const lines = documentLines('abcd\nx', 2, measure);
    expect(caretLine(lines, 2)).toBe(1);
    expect(caretLine(lines, 4)).toBe(1);
    expect(caretLine(lines, 5)).toBe(2);
  });
  it('keeps a trailing blank line and an empty document editable', () => {
    expect(documentLines('', 2, measure)).toEqual([{ text: '', start: 0, end: 0 }]);
    expect(documentLines('a\n', 2, measure).at(-1)).toEqual({ text: '', start: 2, end: 2 });
  });
  it('does not split Unicode characters or stall when a glyph is wider than the page', () => {
    const lines = documentLines('😀x', 0, measure);
    expect(lines).toEqual([
      { text: '😀', start: 0, end: 2 },
      { text: 'x', start: 2, end: 3 },
    ]);
    expect(caretAt(lines[0], 1, measure)).toBe(2);
    expect(caretAt(lines[0], -10, measure)).toBe(0);
  });
  it('reuses the line array until the width or measure function changes', () => {
    const source = 'ab cd\n\nx';
    const first = documentLines(source, 3, measure);
    expect(documentLines(source, 3, measure)).toBe(first);
    const wider = documentLines(source, 100, measure);
    expect(wider).not.toBe(first);
    expect(wider[0]).toEqual({ text: 'ab cd', start: 0, end: 5 });
    expect(documentLines(source, 100, measure)).toBe(wider);
    const other = (value: string) => [...value].length;
    const recomputed = documentLines(source, 3, other);
    expect(recomputed).not.toBe(first);
    expect(recomputed).toEqual(first);
    expect(documentLines(source, 3, other)).toBe(recomputed);
  });
});
