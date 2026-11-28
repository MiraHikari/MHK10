// notepad.ts: a persistent diary. Word wrap is a view choice; the buffer stays unwrapped.
import type { AppServices } from '../../os/host/app-contracts';
import { defineCanvasApp } from '../../os/host/app-session';
import { appMetadata } from '../../../data/app-catalog';
import { C } from '../../gfx/palette';

import { documentLines, caretLine, caretAt, visibleDocumentLine } from '../../ui/text/document';
import {
  type DiaryState,
  replaceDiary as replace,
  undoDiary,
  typeDiary,
  copyDiary,
  cutDiary,
  pasteDiary,
  deleteDiary,
  selectAllDiary,
  findDiary,
  insertDateTime,
  placeDiaryCaret,
} from './diary';
import { ORIGINAL_DIARY } from '../../os/files/filesystem';
import type { DocumentSession } from '../../os/files/documents';

const UNWRAPPED = 1_000_000_000;
const FIND_ID = 'notepad-find';

interface QueryField {
  text: string;
  caret: number;
  anchor?: number;
}

interface State extends DiaryState {
  document: DocumentSession;
  version: number;
  wrap: boolean;
  finding: boolean;
  query: QueryField;
  findText: string;
  alert: string;
  /** 状态栏行号缓存：status() 每帧被调用，不能每帧扫描整个缓冲区。 */
  lineCountCache?: { readonly buf: string; readonly caret: number; readonly count: number };
  epoch: number;
  pasteRequest: number;
  disposed: boolean;
  pendingPaste?: Promise<void>;
  pendingSave?: Promise<boolean>;
  pendingLoad?: Promise<void>;
  loadingName?: string;
  loadError?: string;
  left: number;
  revealCaret: boolean;
}

interface EditTarget {
  document: DocumentSession;
  epoch: number;
  filesEpoch: number;
  fileVersion: number | undefined;
}

function editTarget(s: State, env: AppServices): EditTarget {
  return {
    document: s.document,
    epoch: s.epoch,
    filesEpoch: env.files.epoch,
    fileVersion: env.files.getVersion(s.document.get().fileId),
  };
}

function sameEditTarget(s: State, target: EditTarget, env: AppServices): boolean {
  return (
    !s.disposed &&
    s.document === target.document &&
    s.epoch === target.epoch &&
    env.files.epoch === target.filesEpoch &&
    env.files.getVersion(target.document.get().fileId) === target.fileVersion
  );
}

function load(env: AppServices, id?: string): State {
  const document = env.documents.open(id),
    snapshot = document.get();
  return {
    document,
    version: snapshot.version,
    buf: snapshot.content,
    caret: snapshot.content.length,
    anchor: snapshot.content.length,
    top: 0,
    undo: [],
    dirty: snapshot.dirty,
    notice: snapshot.notice,
    wrap: true,
    finding: false,
    query: { text: '', caret: 0 },
    findText: '',
    alert: '',
    epoch: 0,
    pasteRequest: 0,
    disposed: false,
    pendingPaste: undefined,
    pendingSave: undefined,
    left: 0,
    revealCaret: true,
  };
}

/** Publication metadata is synchronous; wait for its immutable text before exposing an editor. */
function loadPublication(s: State, env: AppServices): void {
  const fileId = s.document.get().fileId;
  const file = env.files.get(fileId);
  if (!file?.readonly || (file.kind && file.kind !== 'text')) return;
  const document = s.document;
  const epoch = env.files.epoch;
  s.loadingName = file.name;
  s.loadError = undefined;
  const operation = env.files
    .readText(fileId)
    .then((result) => {
      if (s.disposed || s.document !== document || env.files.epoch !== epoch) return;
      if (!result.ok) {
        s.loadError = result.error;
        return;
      }
      document.dispose();
      s.document = env.documents.open(fileId);
      const snapshot = s.document.get();
      s.version = snapshot.version;
      s.buf = snapshot.content;
      s.caret = s.anchor = s.buf.length;
      s.top = s.left = 0;
      s.undo = [];
      s.dirty = snapshot.dirty;
      s.notice = snapshot.notice;
      s.revealCaret = true;
      s.epoch += 1;
    })
    .finally(() => {
      if (s.pendingLoad === operation) {
        s.pendingLoad = undefined;
        s.loadingName = undefined;
        env.invalidate();
      }
    });
  s.pendingLoad = operation;
}

function sync(s: State): void {
  if (s.version === s.document.get().version) s.document.edit(s.buf);
  const snapshot = s.document.refresh();
  if (s.version !== snapshot.version) {
    s.buf = snapshot.content;
    s.caret = s.buf.length;
    s.anchor = s.caret;
    s.top = 0;
    s.left = 0;
    s.revealCaret = true;
    s.undo = [];
    s.version = snapshot.version;
    s.epoch += 1;
  }
  s.dirty = snapshot.dirty;
  s.notice = snapshot.notice;
}

function save(s: State): boolean {
  sync(s);
  const result = s.document.save();
  sync(s);
  return result.status === 'saved' && result.persisted;
}

function checkpoint(s: State): boolean {
  if (s.pendingPaste || s.pendingSave) return false;
  sync(s);
  return !s.dirty || save(s);
}

/**
 * 光标所在行号（1 起）。`status()` 每个宿主帧都会被调用；直接
 * `buf.slice(0, caret).split('\n')` 会为 100KB 日记每帧分配子串和数组。
 * 缓存以缓冲区引用 + 光标位置为键，并只数换行符。
 */
function caretLineCount(s: State): number {
  const cached = s.lineCountCache;
  if (cached && cached.buf === s.buf && cached.caret === s.caret) return cached.count;
  let count = 1;
  const end = Math.min(s.caret, s.buf.length);
  for (let i = 0; i < end; i++) if (s.buf.charCodeAt(i) === 10) count++;
  s.lineCountCache = { buf: s.buf, caret: s.caret, count };
  return count;
}

function requestSave(s: State, env: AppServices, mode: 'save' | 'save-as'): void {
  const document = s.document;
  const filesEpoch = env.files.epoch;
  const perform = (): boolean | Promise<boolean> => {
    if (s.disposed || s.document !== document || env.files.epoch !== filesEpoch) return false;
    if (mode === 'save') return save(s);
    return document
      .saveAs((request) => env.saveText(request))
      .then((result) => {
        if (!s.disposed && s.document === document) sync(s);
        return result.status === 'saved' && result.persisted;
      });
  };
  const previous = s.pendingSave;
  // Start immediate Save As synchronously so the host enrolls its picker before close.
  if (!previous && !s.pendingPaste) {
    void perform();
    return;
  }
  const afterInput = async () => {
    if (previous) await previous;
    while (s.pendingPaste && !s.disposed) await s.pendingPaste;
    return perform();
  };
  // Delayed clipboard input must finish before either save captures the document.
  const operation = afterInput().finally(() => {
    if (s.pendingSave === operation) s.pendingSave = undefined;
  });
  s.pendingSave = operation;
}

function reopen(s: State, env: AppServices, id: string): void {
  const wrap = s.wrap;
  const findText = s.findText;
  const epoch = s.epoch + 1;
  const pasteRequest = s.pasteRequest + 1;
  s.document.dispose();
  Object.assign(s, load(env, id), { wrap, findText, epoch, pasteRequest });
  s.pendingLoad = undefined;
  s.loadingName = undefined;
  s.loadError = undefined;
  loadPublication(s, env);
}

function noteBuffer(s: State, before: string): void {
  if (s.buf === before) return;
  s.epoch += 1;
  s.alert = '';
}

function touch(s: State): void {
  s.epoch += 1;
  s.alert = '';
}

function localDateStamp(when: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}`;
}

export const notepadApp = defineCanvasApp<State>({
  ...appMetadata('notepad'),
  menus: (s) => ({
    File: [
      { command: 'new', label: 'New' },
      { command: 'open-documents', label: 'Open My Documents' },
      {
        command: 'save',
        label: 'Save',
        shortcut: 'Ctrl+S',
        disabled: !!s.pendingLoad || !!s.loadError,
      },
      {
        command: 'save-as',
        label: 'Save As...',
        shortcut: 'Ctrl+Shift+S',
        disabled: !!s.pendingLoad || !!s.loadError,
      },
      {
        command: 'export-text',
        label: 'Export this document',
        disabled: !!s.pendingLoad || !!s.loadError,
      },
      { command: 'export-documents', label: 'Export My Documents' },
      { command: 'restore', label: 'Restore original' },
      '-',
      { command: 'exit', label: 'Exit' },
    ],
    Edit: [
      { command: 'undo', label: 'Undo', shortcut: 'Ctrl+Z', disabled: !s.undo.length },
      '-',
      {
        command: 'cut',
        label: 'Cut',
        shortcut: 'Ctrl+X',
        disabled: s.anchor === s.caret,
      },
      {
        command: 'copy',
        label: 'Copy',
        shortcut: 'Ctrl+C',
        disabled: s.anchor === s.caret,
      },
      { command: 'paste', label: 'Paste', shortcut: 'Ctrl+V' },
      { command: 'delete', label: 'Delete', shortcut: 'Del' },
      '-',
      { command: 'find', label: 'Find', shortcut: 'Ctrl+F' },
      { command: 'find-next', label: 'Find Next', shortcut: 'F3' },
      '-',
      { command: 'select-all', label: 'Select All', shortcut: 'Ctrl+A' },
      { command: 'insert-datetime', label: 'Time/Date', shortcut: 'F5' },
    ],
    Format: [{ command: 'word-wrap', label: 'Word Wrap', checked: s.wrap }],
    Help: [{ command: 'help', label: 'Editor tips' }],
  }),
  status: (s) => {
    if (s.pendingLoad) return `Loading ${s.loadingName}...`;
    if (s.loadError) return s.loadError;
    if (s.notice) return s.notice;
    const line = caretLineCount(s);
    const place = `${s.dirty ? 'Modified | ' : ''}Ln ${line} | ${s.buf.length} characters`;
    return s.alert ? `${s.alert} | ${place}` : place;
  },
  create: (env) => {
    const state = load(env, env.initialFileId ?? env.documents.consumeOpen());
    loadPublication(state, env);
    return state;
  },
  dispose: (s) => {
    s.disposed = true;
    s.epoch += 1;
    s.pasteRequest += 1;
    s.document.dispose();
  },
  checkpoint,
  onClose: (s, env) => {
    const finish = () => {
      if (s.disposed || checkpoint(s)) return;
      env.msg({
        title: 'Unsaved Document',
        icon: 'warn',
        lines: [
          s.notice,
          'Use Save As... or File > Export this document.',
          'Your edits remain open so you can retry.',
        ],
      });
      return false;
    };
    if (!s.pendingPaste && !s.pendingSave) return finish();
    return (async () => {
      let saved = true;
      while ((s.pendingPaste || s.pendingSave) && !s.disposed) {
        if (s.pendingSave) saved = (await s.pendingSave) && saved;
        else await s.pendingPaste;
      }
      if (!saved && !s.disposed) return false;
      return finish();
    })();
  },
  draw(s, v, env) {
    const fs = env.files,
      pending = env.initialFileId ? undefined : env.documents.consumeOpen();
    sync(s);
    if (pending && pending !== s.document.get().fileId) {
      if (!s.dirty || save(s)) reopen(s, env, pending);
      else
        env.msg({
          title: 'Notepad',
          icon: 'warn',
          lines: [s.notice, 'Use Save As... before opening another file.'],
        });
    }
    const file = s.document.get();
    env.setTitle(v.win.id, `${file.name}${s.dirty ? ' *' : ''} - Notepad`);
    let action = v.menuSel?.command;
    if (v.focused && v.win.menu.open < 0 && !action) {
      if (v.input.consumeKey('Find')) action = 'find';
      else if (v.input.consumeKey('SaveAs')) action = 'save-as';
    }
    if (s.pendingLoad || s.loadError) {
      if (action === 'exit') env.close(v.win.id);
      if (action === 'open-documents') env.open('computer');
      v.draw.text(
        s.pendingLoad ? `Loading ${s.loadingName}...` : (s.loadError ?? ''),
        v.client.x + 12,
        v.client.y + 18,
      );
      if (s.loadError && v.widgets.button(v.client.x + 12, v.client.y + 42, 70, 23, 'Retry'))
        loadPublication(s, env);
      return;
    }
    if (action === 'open-documents') env.open('computer');
    if (action === 'export-documents') {
      save(s);
      void (
        env.exportSandbox?.() ??
        Promise.resolve({ ok: false as const, error: 'Backup is unavailable in this host.' })
      ).then((result) => {
        if (!s.disposed && !result.ok)
          env.msg({ title: 'Backup', icon: 'warn', lines: [result.error] });
      });
    }
    if (action === 'help')
      env.msg({
        title: 'Notepad Help',
        icon: 'info',
        lines: [
          'Click to place the caret. Shift-click and Shift+arrows extend the selection.',
          'Ctrl+Left / Ctrl+Right move by word. Home and End move to the line edges.',
          'Ctrl+X/C/V cut, copy and paste. Ctrl+A selects all. Delete removes the selection.',
          'F3 finds the next match. F5 inserts the date. Format > Word Wrap toggles wrapping.',
          'Ctrl+S saves. Ctrl+Z undoes. Export this document downloads the current edits.',
        ],
      });
    if (action === 'new') {
      if (!s.dirty || save(s)) {
        const result = fs.newText(file?.folder ?? 'root');
        if (result.file) reopen(s, env, result.file.id);
        else
          env.msg({
            title: 'New Document',
            icon: 'warn',
            lines: [result.error || 'Cannot create document.'],
          });
      }
    }
    if (action === 'restore') {
      const target = editTarget(s, env);
      env.msg({
        title: 'Notepad',
        icon: 'question',
        lines: [
          'Replace this document with the original diary?',
          'You can undo this while the editor stays open.',
        ],
        buttons: ['Replace', 'Cancel'],
        def: 1,
        onBtn: (i) => {
          if (i === 0 && sameEditTarget(s, target, env)) {
            replace(s, ORIGINAL_DIARY);
            s.caret = s.buf.length;
            s.anchor = s.caret;
            s.top = 0;
            s.left = 0;
            s.revealCaret = true;
            s.epoch += 1;
            sync(s);
          }
        },
      });
    }
    if (action === 'word-wrap') s.wrap = !s.wrap;
    if (action === 'find') {
      s.finding = true;
      v.widgets.focusTextField(FIND_ID);
    }
    const rememberedQuery = s.finding ? s.query.text : s.findText;
    if ((action === 'find-next' || v.input.io.keyPressed.has('F3')) && !rememberedQuery)
      s.finding = true;
    const shift = v.input.io.keyDown.has('Shift');
    const control = v.input.io.keyDown.has('Control');
    const keys = v.input.io.keyPressed;
    const c = v.client;
    const findBar = s.finding ? 22 : 0;
    const r = { x: c.x + 5, y: c.y + 5, w: c.w - 28, h: c.h - 10 - findBar };
    const rows = Math.max(1, Math.floor(r.h / 13));
    const layoutWidth = () => (s.wrap ? r.w - 3 : UNWRAPPED);
    let lines = documentLines(s.buf, layoutWidth(), v.draw.tw);
    let moved = s.revealCaret || action === 'word-wrap';
    s.revealCaret = false;
    const area = v.input.hit(r.x, r.y, r.w, rows * 13);
    if (area.hover) {
      v.input.requestCursor('ibeam');
      if (v.input.io.wheel) {
        if (shift && !s.wrap) s.left = Math.max(0, s.left + Math.sign(v.input.io.wheel) * 36);
        else s.top += Math.sign(v.input.io.wheel) * 3;
      }
    }
    if (area.clicked) {
      const row = Math.min(
        lines.length - 1,
        Math.max(0, s.top + Math.floor((v.input.io.py - r.y) / 13)),
      );
      moved =
        placeDiaryCaret(s, caretAt(lines[row], v.input.io.px - r.x + s.left, v.draw.tw), shift) ||
        moved;
      v.widgets.blurTextField();
    }
    const findWasActive = s.finding && v.widgets.textFieldFocused() === FIND_ID;
    if (action === 'undo' && undoDiary(s)) {
      touch(s);
      moved = true;
    }
    const editing =
      v.focused &&
      (!v.menuSel ||
        [
          'save',
          'save-as',
          'exit',
          'export-text',
          'cut',
          'copy',
          'paste',
          'delete',
          'select-all',
          'find',
          'find-next',
          'insert-datetime',
          'word-wrap',
        ].includes(action ?? '')) &&
      v.win.menu.open < 0;
    if (editing && !findWasActive) {
      if (keys.has('Undo')) {
        if (undoDiary(s)) {
          touch(s);
          moved = true;
        }
      } else {
        const before = s.buf;
        moved = typeDiary(s, v.input.io.typed, keys, { shift, control }) || moved;
        noteBuffer(s, before);
        v.input.consumeText();
        lines = documentLines(s.buf, layoutWidth(), v.draw.tw);
        const row = caretLine(lines, s.caret),
          ln = lines[row];
        if (keys.has('Home')) moved = placeDiaryCaret(s, control ? 0 : ln.start, shift) || moved;
        if (keys.has('End'))
          moved = placeDiaryCaret(s, control ? s.buf.length : ln.end, shift) || moved;
        const dy = keys.has('ArrowUp') ? -1 : keys.has('ArrowDown') ? 1 : 0;
        if (dy)
          moved =
            placeDiaryCaret(
              s,
              caretAt(
                lines[Math.max(0, Math.min(lines.length - 1, row + dy))],
                v.draw.tw(s.buf.slice(ln.start, s.caret)),
                v.draw.tw,
              ),
              shift,
            ) || moved;
        if (keys.has('PageUp')) s.top -= rows;
        if (keys.has('PageDown')) s.top += rows;
      }
    }
    const cutting = action === 'cut' || (editing && !findWasActive && keys.has('Cut'));
    const copying =
      !cutting && (action === 'copy' || (editing && !findWasActive && keys.has('Copy')));
    if (cutting || copying) {
      v.input.consumeKey('Cut');
      v.input.consumeKey('Copy');
      const before = s.buf;
      const text = cutting ? cutDiary(s) : copyDiary(s);
      if (s.buf !== before) {
        noteBuffer(s, before);
        moved = true;
      }
      if (text !== null)
      // Clipboard feedback must still belong to the document that initiated the copy.
      {
        const target = editTarget(s, env);
        void env.clipboard.write(text).then((ok) => {
          if (sameEditTarget(s, target, env) && !ok) s.alert = 'Clipboard unavailable.';
        });
      }
    }
    if (action === 'paste' || (editing && !findWasActive && keys.has('Paste'))) {
      v.input.consumeKey('Paste');
      const request = ++s.pasteRequest;
      const target = editTarget(s, env);
      const caret = s.caret;
      const anchor = s.anchor;
      const pending = env.clipboard
        .read()
        .then((text) => {
          if (s.disposed || request !== s.pasteRequest) return;
          if (!sameEditTarget(s, target, env) || s.caret !== caret || s.anchor !== anchor) {
            s.alert = 'Paste skipped: document or selection changed.';
            return;
          }
          if (text === null) {
            s.alert = 'Clipboard unavailable.';
            return;
          }
          if (!pasteDiary(s, text)) return;
          s.epoch += 1;
          s.alert = '';
          s.revealCaret = true;
          sync(s);
        })
        .finally(() => {
          if (s.pendingPaste === pending) s.pendingPaste = undefined;
        });
      s.pendingPaste = pending;
    }
    if (action === 'delete') {
      const before = s.buf;
      if (deleteDiary(s)) moved = true;
      noteBuffer(s, before);
    }
    if (action === 'select-all' && selectAllDiary(s)) moved = true;
    if (action === 'find') {
      const selected = copyDiary(s);
      s.query =
        selected !== null && !selected.includes('\n')
          ? { text: selected, caret: selected.length, anchor: 0 }
          : { text: s.query.text, caret: s.query.text.length, anchor: 0 };
      s.finding = true;
      v.widgets.focusTextField(FIND_ID);
    }
    let paintedFind = false;
    const paintFind = () => {
      if (!s.finding || paintedFind) return;
      paintedFind = true;
      const y = c.y + c.h - 22;
      v.draw.text('Find', c.x + 4, y + 4, { color: C.black });
      const edited = v.widgets.textField(FIND_ID, c.x + 32, y, c.w - 56, 20, s.query);
      s.query = { text: edited.text, caret: edited.caret, anchor: edited.anchor };
      if (edited.active && keys.has('Enter')) {
        v.input.consumeKey('Enter');
        s.findText = s.query.text;
        if (s.findText && findDiary(s, s.findText)) {
          s.alert = '';
          moved = true;
        } else if (s.findText) s.alert = 'Text not found.';
        v.widgets.blurTextField();
      }
      if (keys.has('Escape') && v.win.menu.open < 0) {
        v.input.consumeKey('Escape');
        s.finding = false;
        v.widgets.blurTextField();
      }
    };
    paintFind();
    if ((v.focused && v.win.menu.open < 0 && keys.has('F3')) || action === 'find-next') {
      v.input.consumeKey('F3');
      const query = s.finding ? s.query.text : s.findText;
      if (!query) {
        s.finding = true;
        v.widgets.focusTextField(FIND_ID);
        paintFind();
      } else {
        s.findText = query;
        if (findDiary(s, query)) {
          s.alert = '';
          moved = true;
        } else s.alert = 'Text not found.';
      }
    }
    if (action === 'insert-datetime' || (editing && !findWasActive && keys.has('F5'))) {
      v.input.consumeKey('F5');
      const before = s.buf;
      if (insertDateTime(s, localDateStamp(new Date()))) moved = true;
      noteBuffer(s, before);
    }
    for (const key of ['SelectAll', 'Cut', 'Copy', 'Paste', 'F3', 'F5']) v.input.consumeKey(key);
    // Browser input is batched per animation frame: the final text and Ctrl+S
    // may arrive together. Apply that text once before committing the file.
    sync(s);
    if (action === 'save' || (editing && keys.has('Save'))) requestSave(s, env, 'save');
    if (action === 'save-as') {
      v.input.consumeText();
      v.input.consumeKey('Enter');
      requestSave(s, env, 'save-as');
    }
    if (action === 'export-text') env.downloadText(s.document.get().name, s.buf);
    if (action === 'exit') env.close(v.win.id);
    lines = documentLines(s.buf, layoutWidth(), v.draw.tw);
    const row = caretLine(lines, s.caret);
    if (moved) {
      if (row < s.top) s.top = row;
      if (row >= s.top + rows) s.top = row - rows + 1;
      const caretX = v.draw.tw(s.buf.slice(lines[row].start, s.caret));
      if (caretX < s.left) s.left = caretX;
      if (caretX >= s.left + r.w - 3) s.left = Math.max(0, caretX - r.w + 4);
    }
    if (s.wrap) s.left = 0;
    if (v.widgets.button(c.x + c.w - 19, c.y + 2, 17, 17, '^')) s.top--;
    if (v.widgets.button(c.x + c.w - 19, c.y + c.h - 19, 17, 17, 'v')) s.top++;
    s.top = Math.max(0, Math.min(Math.max(0, lines.length - rows), s.top));
    v.widgets.field(c.x, c.y, c.w - 21, c.h - (s.finding ? 22 : 0));
    const selStart = Math.min(s.anchor, s.caret);
    const selEnd = Math.max(s.anchor, s.caret);
    const context = v.draw.getCtx();
    context.save();
    context.beginPath();
    context.rect(r.x, r.y, r.w, rows * 13);
    context.clip();
    try {
      lines.slice(s.top, s.top + rows).forEach((source, i) => {
        const line = visibleDocumentLine(source, s.left, r.w, v.draw.tw);
        const lineX = r.x + line.x - s.left;
        v.draw.text(line.text, lineX, r.y + i * 13, { color: C.black });
        const from = Math.max(line.start, selStart);
        const to = Math.min(line.end, selEnd);
        if (from >= to) return;
        const selected = s.buf.slice(from, to);
        const x = lineX + v.draw.tw(s.buf.slice(line.start, from));
        const width = v.draw.tw(selected);
        if (width <= 0) return;
        v.draw.rect(x, r.y + i * 13, width, 11, v.draw.TH.sel);
        v.draw.text(selected, x, r.y + i * 13, { color: v.draw.TH.selText });
      });
      if (
        selStart === selEnd &&
        v.focused &&
        row >= s.top &&
        row < s.top + rows &&
        (env.reducedMotion || Math.floor(env.now() * 2.8) % 2 === 0)
      )
        v.draw.rect(
          r.x + v.draw.tw(s.buf.slice(lines[row].start, s.caret)) - s.left,
          r.y + (row - s.top) * 13,
          1,
          11,
          C.black,
        );
    } finally {
      context.restore();
    }
  },
});
