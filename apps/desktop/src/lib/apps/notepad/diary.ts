// diary.ts: editor mutations are independent of canvas rendering and browser storage.
const MAX_DIARY = 20000;

export interface DiaryState {
  buf: string;
  caret: number;
  anchor: number;
  top: number;
  notice: string;
  undo: { buf: string; caret: number; anchor: number }[];
  dirty: boolean;
}

export interface DiaryModifiers {
  shift?: boolean;
  control?: boolean;
}

export function replaceDiary(s: DiaryState, value: string): void {
  if (value === s.buf) return;
  s.undo.push({ buf: s.buf, caret: s.caret, anchor: s.anchor });
  if (s.undo.length > 60) s.undo.shift();
  s.buf = value;
  s.dirty = true;
  s.notice = '';
}

export function undoDiary(s: DiaryState): boolean {
  const old = s.undo.pop();
  if (old === undefined) return false;
  s.buf = old.buf;
  s.caret = clampOffset(old.buf, old.caret);
  s.anchor = clampOffset(old.buf, old.anchor);
  s.dirty = true;
  s.notice = '';
  return true;
}

export function copyDiary(s: DiaryState): string | null {
  const range = selectionRange(s);
  return range ? s.buf.slice(range.start, range.end) : null;
}

export function cutDiary(s: DiaryState): string | null {
  const text = copyDiary(s);
  if (text === null) return null;
  deleteSelection(s);
  return text;
}

export function pasteDiary(s: DiaryState, text: string): boolean {
  return insertText(s, text.replace(/\r\n?/g, '\n'));
}

export function insertDateTime(s: DiaryState, text: string): boolean {
  return insertText(s, text);
}

export function deleteDiary(s: DiaryState): boolean {
  if (selectionRange(s)) return deleteSelection(s);
  const caret = clampOffset(s.buf, s.caret);
  const next = stepForward(s.buf, caret);
  if (next === caret) return false;
  replaceDiary(s, s.buf.slice(0, caret) + s.buf.slice(next));
  s.caret = s.anchor = caret;
  return true;
}

export function selectAllDiary(s: DiaryState): boolean {
  if (s.anchor === 0 && s.caret === s.buf.length) return false;
  s.anchor = 0;
  s.caret = s.buf.length;
  return true;
}

/** Case-insensitive search starting after the caret, then wrapping to the start. */
export function findDiary(s: DiaryState, query: string): boolean {
  if (!query) return false;
  const from = clampOffset(s.buf, s.caret);
  let at = locate(s.buf, query, from);
  if (at < 0 && from > 0) at = locate(s.buf, query, 0);
  if (at < 0) return false;
  s.anchor = at;
  s.caret = Math.min(s.buf.length, at + query.length);
  return true;
}

export function placeDiaryCaret(s: DiaryState, caret: number, extend = false): boolean {
  const next = clampOffset(s.buf, caret);
  const anchor = extend ? clampOffset(s.buf, s.anchor) : next;
  if (next === s.caret && anchor === s.anchor) return false;
  s.caret = next;
  s.anchor = anchor;
  return true;
}

export function typeDiary(
  s: DiaryState,
  input: string,
  keys: ReadonlySet<string>,
  modifiers: DiaryModifiers = {},
): boolean {
  const shift = !!modifiers.shift;
  const control = !!modifiers.control;
  let value = s.buf;
  let caret = clampOffset(value, s.caret);
  let anchor = clampOffset(value, s.anchor);
  const takeSelection = () => {
    if (anchor === caret) return false;
    const start = Math.min(anchor, caret);
    const end = Math.max(anchor, caret);
    value = value.slice(0, start) + value.slice(end);
    caret = anchor = start;
    return true;
  };
  if (keys.has('SelectAll')) {
    anchor = 0;
    caret = value.length;
  }
  let typed = input.replace(/\r\n?/g, '\n');
  if (keys.has('Enter') && !typed.includes('\n')) typed += '\n';
  if (typed) {
    const room = Math.max(0, MAX_DIARY - value.length + Math.abs(anchor - caret));
    const add = typed.slice(0, clampOffset(typed, room));
    if (add) {
      takeSelection();
      value = value.slice(0, caret) + add + value.slice(caret);
      caret += add.length;
      anchor = caret;
    }
  }
  let removedSelection = false;
  if (keys.has('Backspace')) {
    if (takeSelection()) removedSelection = true;
    else if (caret > 0) {
      const at = stepBack(value, caret);
      value = value.slice(0, at) + value.slice(caret);
      caret = anchor = at;
    }
  }
  if (keys.has('Delete') && !removedSelection) {
    if (!takeSelection()) {
      const next = stepForward(value, caret);
      if (next !== caret) {
        value = value.slice(0, caret) + value.slice(next);
        anchor = caret;
      }
    }
  }
  const nudge = (direction: -1 | 1) => {
    caret = moveCaret(value, caret, anchor, direction, shift, control);
    if (!shift) anchor = caret;
  };
  if (keys.has('ArrowLeft')) nudge(-1);
  if (keys.has('ArrowRight')) nudge(1);
  if (value === s.buf && caret === s.caret && anchor === s.anchor) return false;
  if (value !== s.buf) replaceDiary(s, value);
  s.caret = caret;
  s.anchor = anchor;
  return true;
}

function selectionRange(s: DiaryState): { start: number; end: number } | null {
  const start = Math.min(s.anchor, s.caret);
  const end = Math.max(s.anchor, s.caret);
  const clampedStart = clampOffset(s.buf, start);
  const clampedEnd = clampOffset(s.buf, end);
  if (clampedStart === clampedEnd) return null;
  return { start: clampedStart, end: clampedEnd };
}

function deleteSelection(s: DiaryState): boolean {
  const range = selectionRange(s);
  if (!range) return false;
  replaceDiary(s, s.buf.slice(0, range.start) + s.buf.slice(range.end));
  s.caret = s.anchor = range.start;
  return true;
}

function insertText(s: DiaryState, text: string): boolean {
  if (!text) return false;
  const range = selectionRange(s);
  const start = range ? range.start : clampOffset(s.buf, s.caret);
  const end = range ? range.end : start;
  const room = Math.max(0, MAX_DIARY - (s.buf.length - (end - start)));
  const add = text.slice(0, clampOffset(text, room));
  if (!add) return false;
  const value = s.buf.slice(0, start) + add + s.buf.slice(end);
  if (value === s.buf) return false;
  replaceDiary(s, value);
  s.caret = s.anchor = start + add.length;
  return true;
}

function moveCaret(
  value: string,
  caret: number,
  anchor: number,
  direction: -1 | 1,
  shift: boolean,
  control: boolean,
): number {
  if (!shift && !control && anchor !== caret)
    return direction < 0 ? Math.min(anchor, caret) : Math.max(anchor, caret);
  if (control) return direction < 0 ? previousWord(value, caret) : nextWord(value, caret);
  return direction < 0 ? stepBack(value, caret) : stepForward(value, caret);
}

function locate(source: string, query: string, from: number): number {
  const needle = query.toLowerCase();
  const folded = source.toLowerCase();
  if (folded.length === source.length && needle.length === query.length)
    return folded.indexOf(needle, from);
  let index = Math.max(0, Math.min(from, source.length));
  while (index < source.length) {
    if (source.slice(index, index + query.length).toLowerCase() === needle) return index;
    index = stepForward(source, index);
  }
  return -1;
}

function previousWord(value: string, index: number): number {
  let cursor = index;
  if (cursor > 0 && gapBefore(value, cursor)) {
    while (cursor > 0 && gapBefore(value, cursor)) cursor = stepBack(value, cursor);
  }
  while (cursor > 0 && !gapBefore(value, cursor)) cursor = stepBack(value, cursor);
  return cursor;
}

function nextWord(value: string, index: number): number {
  let cursor = index;
  if (cursor < value.length && !gapAt(value, cursor)) {
    while (cursor < value.length && !gapAt(value, cursor)) cursor = stepForward(value, cursor);
  }
  while (cursor < value.length && gapAt(value, cursor)) cursor = stepForward(value, cursor);
  return cursor;
}

function gapBefore(value: string, index: number): boolean {
  const at = stepBack(value, index);
  return at < index && isGap(value.slice(at, index));
}

function gapAt(value: string, index: number): boolean {
  const next = stepForward(value, index);
  return next > index && isGap(value.slice(index, next));
}

function isGap(char: string): boolean {
  return /\s/u.test(char);
}

function clampOffset(value: string, index: number): number {
  if (!Number.isFinite(index)) return 0;
  let at = Math.max(0, Math.min(Math.trunc(index), value.length));
  if (
    at > 0 &&
    at < value.length &&
    value.charCodeAt(at) >= 0xdc00 &&
    value.charCodeAt(at) <= 0xdfff &&
    value.charCodeAt(at - 1) >= 0xd800 &&
    value.charCodeAt(at - 1) <= 0xdbff
  )
    at -= 1;
  return at;
}

function stepBack(value: string, index: number): number {
  if (index <= 0) return 0;
  const code = value.charCodeAt(index - 1);
  if (code >= 0xdc00 && code <= 0xdfff && index >= 2) {
    const lead = value.charCodeAt(index - 2);
    if (lead >= 0xd800 && lead <= 0xdbff) return index - 2;
  }
  return index - 1;
}

function stepForward(value: string, index: number): number {
  if (index >= value.length) return value.length;
  const code = value.codePointAt(index);
  return index + (code !== undefined && code > 0xffff ? 2 : 1);
}
