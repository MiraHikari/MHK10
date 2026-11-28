import { describe, it, expect } from 'vite-plus/test';
import {
  typeDiary,
  undoDiary,
  copyDiary,
  cutDiary,
  pasteDiary,
  deleteDiary,
  selectAllDiary,
  findDiary,
  insertDateTime,
  type DiaryState,
} from './diary';
const state = (buf = 'ab', caret = 1, anchor = caret): DiaryState => ({
  buf,
  caret,
  anchor,
  top: 0,
  undo: [],
  notice: '',
  dirty: false,
});
describe('diary editing and persistence', () => {
  it('keeps Unicode code points whole at the document capacity for typing and paste', () => {
    for (const input of [typeDiary, (s: DiaryState, text: string) => pasteDiary(s, text)]) {
      const s = state('a'.repeat(19999), 19999);
      input(s, '😀', new Set());
      expect(s.buf).toBe('a'.repeat(19999));
      expect(s.dirty).toBe(false);
      input(s, 'x😀', new Set());
      expect(s.buf).toBe('a'.repeat(19999) + 'x');
      expect(s.caret).toBe(20000);
    }
  });
  it('preserves the selection when no complete pasted glyph fits or the clipboard is empty', () => {
    const s = state('a'.repeat(20000), 20000, 19999);
    expect(pasteDiary(s, '😀')).toBe(false);
    expect(pasteDiary(s, '')).toBe(false);
    expect(s.buf).toBe('a'.repeat(20000));
    expect(s).toMatchObject({ caret: 20000, anchor: 19999, dirty: false });
  });
  it('inserts Enter at the caret and keeps subsequent typing on the new line', () => {
    const s = state();
    typeDiary(s, '', new Set(['Enter']));
    typeDiary(s, 'hello', new Set());
    expect(s.buf).toBe('a\nhellob');
    expect(s.caret).toBe(7);
    expect(s.dirty).toBe(true);
  });
  it('normalizes pasted line endings without adding a second Enter', () => {
    const s = state('', 0);
    typeDiary(s, 'a\r\nb', new Set(['Enter']));
    expect(s.buf).toBe('a\nb');
  });
  it('undoes a newline and Unicode deletion without corrupting the buffer', () => {
    const s = state('a😀b', 3);
    typeDiary(s, '', new Set(['Backspace']));
    expect(s.buf).toBe('ab');
    expect(undoDiary(s)).toBe(true);
    expect(s.buf).toBe('a😀b');
    expect(s.caret).toBe(3);
    s.caret = 1;
    s.anchor = 1;
    typeDiary(s, '', new Set(['Enter']));
    undoDiary(s);
    expect(s.buf).toBe('a😀b');
  });
});

describe('diary selection, words and find', () => {
  it('copies and cuts only a real selection, and paste replaces that selection', () => {
    const idle = state('hello');
    expect(copyDiary(idle)).toBeNull();
    expect(cutDiary(idle)).toBeNull();
    expect(idle.buf).toBe('hello');
    const selected = state('hello', 5, 1);
    expect(copyDiary(selected)).toBe('ello');
    expect(selected.buf).toBe('hello');
    expect(cutDiary(selected)).toBe('ello');
    expect(selected).toMatchObject({ buf: 'h', caret: 1, anchor: 1, dirty: true });
    expect(pasteDiary(selected, 'i\r\n')).toBe(true);
    expect(selected.buf).toBe('hi\n');
    expect(selected.caret).toBe(3);
  });
  it('deletes the selection or the next character and selects the whole buffer', () => {
    const selected = state('abcd', 3, 1);
    expect(deleteDiary(selected)).toBe(true);
    expect(selected.buf).toBe('ad');
    expect(deleteDiary(selected)).toBe(true);
    expect(selected.buf).toBe('a');
    expect(deleteDiary(selected)).toBe(false);
    const all = state('abcd', 2);
    expect(selectAllDiary(all)).toBe(true);
    expect(all).toMatchObject({ anchor: 0, caret: 4, dirty: false });
    expect(selectAllDiary(all)).toBe(false);
    typeDiary(all, 'Z', new Set(['SelectAll']));
    expect(all.buf).toBe('Z');
  });
  it('moves by characters or words and lets Shift extend from the anchor', () => {
    const s = state('hello world', 11);
    typeDiary(s, '', new Set(['ArrowLeft']), { control: true });
    expect(s).toMatchObject({ caret: 6, anchor: 6 });
    typeDiary(s, '', new Set(['ArrowLeft']), { control: true, shift: true });
    expect(s).toMatchObject({ caret: 0, anchor: 6 });
    typeDiary(s, '', new Set(['ArrowRight']));
    expect(s).toMatchObject({ caret: 6, anchor: 6 });
    const word = state('a😀 b', 0);
    typeDiary(word, '', new Set(['ArrowRight']), { control: true });
    expect(word.caret).toBe(4);
    const collapsed = state('hello', 5, 0);
    typeDiary(collapsed, '', new Set(['ArrowLeft']));
    expect(collapsed).toMatchObject({ caret: 0, anchor: 0 });
  });
  it('finds the next case-insensitive match after the caret and then wraps', () => {
    const s = state('Alpha beta ALPHA', 16);
    expect(findDiary(s, '')).toBe(false);
    expect(findDiary(s, 'missing')).toBe(false);
    expect(s.caret).toBe(16);
    expect(findDiary(s, 'alpha')).toBe(true);
    expect(s).toMatchObject({ anchor: 0, caret: 5, dirty: false });
    expect(findDiary(s, 'alpha')).toBe(true);
    expect(s).toMatchObject({ anchor: 11, caret: 16 });
    expect(findDiary(s, 'alpha')).toBe(true);
    expect(s.anchor).toBe(0);
    expect(undoDiary(s)).toBe(false);
  });
  it('inserts the caller-supplied date at the caret without reading a clock', () => {
    const s = state('ab', 1);
    expect(insertDateTime(s, '2026-01-02 03:04')).toBe(true);
    expect(s.buf).toBe('a2026-01-02 03:04b');
    expect(s.caret).toBe(17);
    expect(undoDiary(s)).toBe(true);
    expect(s).toMatchObject({ buf: 'ab', caret: 1, anchor: 1 });
  });
});
