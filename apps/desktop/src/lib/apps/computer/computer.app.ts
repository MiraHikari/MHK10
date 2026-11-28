import {
  createComputerModel,
  computerEntryKey as entryKey,
  fileBytes,
  type ComputerEntry as Entry,
  type ComputerPath as Path,
} from './computer-model';
import { defineCanvasApp } from '../../os/host/app-session';
import { HELP_TOPICS } from '../../ui/help';
import { navigateMenu } from '../../ui/canvas/menu-navigation';
import { APP_CATALOG, appMetadata } from '../../../data/app-catalog';
// File Explorer connects personal pages and the visitor's local documents.
import type { AppServices, AppMenus, FileSelection } from '../../os/host/app-contracts';

import { appIconName } from '../../gfx/app-icon-art';
import { fileType, fileSize } from '../../os/files/file-types';
import type { FolderId, FileResult, FolderResult } from '../../os/files/filesystem';
import {
  executeTransfer,
  fileTransferVolume,
  type FileTransferSurface,
  type TransferSource,
} from '../../os/files/file-transfer';

const CONTEXT_COMMANDS: Record<string, string> = {
  Open: 'open',
  'Open With...': 'open-with',
  Properties: 'properties',
  Copy: 'copy',
  Cut: 'cut',
  Paste: 'paste',
  Rename: 'rename',
  Delete: 'delete',
  'Move...': 'move',
  'Send to Desktop': 'send-desktop',
  'New Folder': 'new-folder',
  'New Text Document': 'new',
};
const ROW_HEIGHT = 20;
const ROW_STEP = 21;

interface State {
  browser: ReturnType<typeof createComputerModel>;
  windowId?: string;
  pendingFolder?: FolderId;
  disposed: boolean;
  backup?: Promise<void>;
  backupInput?: FileSelection;
  transfer?: Promise<void>;
  renameId?: string;
  name: { text: string; caret: number; anchor?: number };
  context?: {
    x: number;
    y: number;
    items: string[];
    sel: number;
    key: string;
    keyboard: boolean;
    px: number;
    py: number;
  };
  contextAction?: { item: string; key: string };
  dismissPointer?: boolean;
}
function navigate(s: State, path: Path, folder: FolderId = 'root'): void {
  s.browser.dispatch({ type: 'navigate', path, folder });
  s.context = undefined;
}
function sourceFor(entry: Entry, s: State, env: AppServices): TransferSource {
  const file = entry.fileId ? env.files.get(entry.fileId) : undefined;
  const folder = entry.folder ? env.files.getFolder(entry.folder) : undefined;
  return {
    id: entry.fileId ?? entry.folder ?? entry.open ?? '',
    kind:
      file?.readonly || folder?.readonly
        ? 'readonly'
        : entry.folder
          ? 'folder'
          : entry.fileId
            ? 'file'
            : 'app',
    volume:
      s.browser.state.path === 'personal' || folder?.readonly || file?.readonly
        ? 'personal'
        : fileTransferVolume(env.files, entry.folder ?? s.browser.state.folder),
    parent: s.browser.state.folder,
  };
}
function report(
  s: State,
  result: FileResult | FolderResult | { ok: boolean; error?: string; persisted?: boolean },
  env: AppServices,
): void {
  const outcome = s.browser.dispatch({ type: 'report', result });
  if (outcome.kind === 'failed')
    env.msg({ title: 'My Documents', icon: 'warn', lines: [outcome.message] });
}
function properties(s: State, entry: Entry, env: AppServices): void {
  const file = entry.fileId && env.files.get(entry.fileId);
  const lines = [`Name: ${file ? file.name : entry.label}`, `Location: ${s.browser.title()}`];
  if (file) {
    const type = fileType(file.name);
    lines.push(
      file.target
        ? 'Type: Application shortcut'
        : `Type: ${type.description} | ${fileSize(fileBytes(file))}`,
      `Source: ${file.readonly ? 'MiraHikari' : file.source}`,
    );
    if (file.target) {
      const target = file.target.fileId;
      const name = target
        ? (env.files.get(target)?.name ?? env.files.getFolder(target)?.name ?? 'Missing target')
        : (APP_CATALOG.find((app) => app.id === file.target!.appId)?.name ?? file.target.appId);
      lines.push(`Target: ${name}`);
    }
  } else
    lines.push(
      entry.path
        ? `Type: File folder | ${s.browser.entries(entry.path, entry.folder).length} object(s)`
        : 'Type: Application shortcut',
    );
  env.msg({ title: 'Properties', icon: 'info', lines });
}
export const computerApp = defineCanvasApp<State>({
  ...appMetadata('computer'),
  // 只有行内重命名输入框需要持续帧（光标闪烁）；其余绘制是纯状态。
  needsFrame: (s) => !!s.renameId,

  menus: (s, env) => {
    const selected = s.browser.entries()[s.browser.state.sel];
    const editable = s.browser.canModify(selected) && !s.renameId;
    const renameable = editable;
    const clipboardable = (!!selected?.fileId || !!selected?.folder) && !s.renameId;
    const canPaste = s.browser.writable() && !!env.files.clipboard() && !s.renameId;
    const menus: AppMenus = {
      File: [
        {
          command: 'open',
          label: 'Open',
          shortcut: 'Enter',
          disabled: s.browser.state.sel < 0 || !!s.renameId,
        },
        {
          command: 'open-with',
          label: 'Open With...',
          disabled:
            !selected?.fileId ||
            !!env.files.get(selected.fileId)?.target ||
            !!s.renameId ||
            !env.chooseFileApplication,
        },
        {
          command: 'find',
          label: 'Find...',
          shortcut: 'Ctrl+F',
          disabled: !!s.renameId,
        },
        {
          command: 'new',
          label: 'New Text Document',
          disabled: !s.browser.writable() || !!s.renameId,
        },
        {
          command: 'new-folder',
          label: 'New Folder',
          shortcut: 'Ctrl+Shift+N',
          disabled: !s.browser.writable() || !!s.renameId,
        },
        {
          command: 'properties',
          label: 'Properties',
          shortcut: 'Alt+Enter',
          disabled: s.browser.state.sel < 0,
        },
        {
          command: 'send-desktop',
          label: 'Send to Desktop',
          disabled:
            !selected || !(selected.fileId || selected.folder || selected.open) || !!s.renameId,
        },
        '-',
        { command: 'export', label: 'Export My Documents' },
        { command: 'import', label: 'Import My Documents...', disabled: !env.importDocuments },
        { command: 'reset', label: 'Reset My Documents' },
        '-',
        { command: 'close', label: 'Close' },
      ],
      Edit: [
        { command: 'rename', label: 'Rename', shortcut: 'F2', disabled: !renameable },
        { command: 'delete', label: 'Delete', shortcut: 'Delete', disabled: !editable },
        { command: 'move', label: 'Move...', disabled: !editable },
        { command: 'copy', label: 'Copy', shortcut: 'Ctrl+C', disabled: !clipboardable },
        { command: 'cut', label: 'Cut', shortcut: 'Ctrl+X', disabled: !editable },
        { command: 'paste', label: 'Paste', shortcut: 'Ctrl+V', disabled: !canPaste },
      ],
      View: [
        {
          command: 'back',
          label: 'Back',
          shortcut: 'Alt+Left',
          disabled: !s.browser.state.canBack || !!s.renameId,
        },
        {
          command: 'forward',
          label: 'Forward',
          shortcut: 'Alt+Right',
          disabled: !s.browser.state.canForward || !!s.renameId,
        },
        {
          command: 'up',
          label: 'Up one level',
          shortcut: 'Alt+Up',
          disabled: !s.browser.state.path || !!s.renameId,
        },
        { command: 'refresh', label: 'Refresh', shortcut: 'F5', disabled: !!s.renameId },
        '-',
        ...(['name', 'type', 'size'] as const).map((sort) => ({
          command: `sort-${sort}`,
          label: `Sort by ${sort}`,
          checked: s.browser.state.sort === sort,
          radio: true,
          disabled: !!s.renameId,
        })),
        {
          command: 'reverse-sort',
          label: 'Descending order',
          checked: s.browser.state.descending,
          disabled: !!s.renameId || s.browser.state.sort === 'none',
        },
      ],
      Help: [{ command: 'help', label: 'Explorer tips' }],
    };
    if (s.transfer) {
      for (const items of Object.values(menus)) {
        for (const item of items) {
          if (item !== '-' && item.command !== 'close') item.disabled = true;
        }
      }
    }
    return menus;
  },
  status: (s, env) =>
    (s.transfer ? 'Copying files...' : s.backupInput ? 'Choosing a backup...' : '') ||
    s.browser.state.notice ||
    (!env.files.persisted ? env.files.notice : '') ||
    `${s.browser.entries().length} object(s)${env.files.getFolder(s.browser.state.folder)?.readonly || s.browser.state.path === 'personal' ? ' | Read-only' : ''}`,
  create: (env) => ({
    browser: createComputerModel(env.files, {
      showFileExtensions: () => env.desktop?.getSettings().showFileExtensions ?? true,
    }),
    disposed: false,
    name: { text: '', caret: 0 },
  }),
  draw(s, v, env) {
    const fs = env.files,
      c = v.client;
    const rows = Math.max(1, Math.floor((c.h - 91) / ROW_STEP));
    s.windowId = v.win.id;
    const pending = env.takeFileOpen?.('computer');
    if (pending && fs.getFolder(pending)) s.pendingFolder = pending as FolderId;
    if (s.pendingFolder && !s.renameId) {
      navigate(s, 'documents', s.pendingFolder);
      s.pendingFolder = undefined;
    }
    s.browser.dispatch({ type: 'viewport', rows });
    if (s.browser.dispatch({ type: 'reconcile' }).kind === 'reset') {
      s.renameId = undefined;
      s.context = undefined;
      v.widgets.blurTextField();
    }
    if (!v.focused || v.win.menu.open >= 0) {
      s.context = undefined;
      s.dismissPointer = false;
    }
    const typing = !!s.renameId || !!s.transfer;
    const keyboard =
      v.focused && v.win.menu.open < 0 && !v.menuSel && !typing && !s.context && !s.dismissPointer;
    let action = v.menuSel?.command;
    if (s.contextAction) {
      s.browser.dispatch({ type: 'select-key', key: s.contextAction.key });
      if (s.browser.state.sel >= 0 || s.contextAction.key === '')
        action = CONTEXT_COMMANDS[s.contextAction.item];
      s.contextAction = undefined;
    }
    if (keyboard) {
      if (
        v.input.io.typed &&
        !v.input.io.keyDown.has('Control') &&
        !v.input.io.keyDown.has('Alt')
      ) {
        s.browser.dispatch({ type: 'search', text: v.input.io.typed, at: v.t });
        v.input.consumeText();
      }
      if (
        v.input.io.keyDown.has('Control') &&
        !v.input.io.keyDown.has('Alt') &&
        !v.input.io.keyDown.has('Shift') &&
        (v.input.consumeKey('f') || v.input.consumeKey('F') || v.input.consumeKey('Find'))
      ) {
        action = 'find';
        v.input.consumeText();
      }
      for (const [key, command] of [
        ['F2', 'rename'],
        ['Delete', 'delete'],
        ['F5', 'refresh'],
        ['Backspace', 'up'],
        ['Copy', 'copy'],
        ['Cut', 'cut'],
        ['Paste', 'paste'],
        ['NavigationBack', 'back'],
        ['NavigationForward', 'forward'],
        ['NavigationUp', 'up'],
        ['NewFolder', 'new-folder'],
        ['Properties', 'properties'],
      ]) {
        if (v.input.io.keyPressed.has(key)) {
          action = command;
          v.input.consumeKey(key);
          break;
        }
      }
    }
    if (action === 'close') return env.close(v.win.id);
    if (s.transfer) action = undefined;
    if (action === 'find') env.open('$find');
    if (action === 'help')
      env.msg({
        title: 'Explorer Help',
        icon: 'info',
        lines: [...HELP_TOPICS.files.lines],
      });
    const selectedForClipboard = s.browser.entries()[s.browser.state.sel];
    const clipboardId = selectedForClipboard?.fileId ?? selectedForClipboard?.folder;
    const clipboardKind = selectedForClipboard?.fileId ? 'file' : 'folder';
    if (
      (action === 'copy' || action === 'cut') &&
      clipboardId &&
      (action === 'copy' || s.browser.canModify(selectedForClipboard))
    ) {
      const result = fs.setClipboard(clipboardId, action, clipboardKind);
      report(s, result, env);
      if (result.ok)
        s.browser.dispatch({
          type: 'notice',
          message: action === 'copy' ? 'Item copied.' : 'Item cut.',
        });
    }
    if (action === 'paste' && s.browser.writable() && !s.transfer) {
      const destination = s.browser.state.folder;
      s.transfer = fs
        .paste(destination)
        .then((result) => {
          if (s.disposed) return;
          report(s, result, env);
          if (result.ok) {
            const id = result.entry.kind === 'file' ? result.entry.file.id : result.entry.folder.id;
            if (s.browser.state.folder === destination)
              s.browser.dispatch({ type: 'select-entry', id });
            if (result.persisted) s.browser.dispatch({ type: 'notice', message: 'Item pasted.' });
          }
        })
        .finally(() => {
          s.transfer = undefined;
          env.invalidate();
        });
    }
    if (action === 'export') {
      if (!s.backup)
        s.backup = (
          env.exportSandbox?.() ??
          Promise.resolve({ ok: false as const, error: 'Backup is unavailable in this host.' })
        )
          .then((result) => {
            if (!s.disposed) report(s, result.ok ? { ok: true } : result, env);
            if (!s.disposed && result.ok)
              s.browser.dispatch({ type: 'notice', message: 'Backup downloaded.' });
          })
          .finally(() => {
            s.backup = undefined;
          });
    }
    if (action === 'import' && (!env.importDocuments || env.documentBackupLimit === undefined)) {
      report(s, { ok: false, error: 'Document import is unavailable in this host.' }, env);
    }
    if (
      action === 'import' &&
      env.importDocuments &&
      env.documentBackupLimit !== undefined &&
      !s.backup
    ) {
      s.backupInput?.cancel();
      const selection = env.pickFile({ accept: '.json,application/json' });
      s.backupInput = selection;
      void selection.result.then((result) => {
        if (s.disposed || s.backupInput !== selection) return;
        s.backupInput = undefined;
        if (result.status === 'failed') return report(s, { ok: false, error: result.error }, env);
        if (result.status === 'cancelled') return;
        const file = result.file;
        if (file.size > (env.documentBackupLimit ?? 0))
          return report(s, { ok: false, error: 'The backup is too large.' }, env);
        const epoch = fs.epoch;
        env.msg({
          title: 'Import My Documents',
          icon: 'warn',
          lines: [
            'Replace My Documents with this backup?',
            'This discards open unsaved text. Export a backup first.',
          ],
          buttons: ['Import', 'Cancel'],
          def: 1,
          onBtn: (index) => {
            if (index !== 0 || s.disposed || fs.epoch !== epoch || s.backup) return;
            s.backup = file
              .text()
              .then(async (content) => {
                if (s.disposed || fs.epoch !== epoch) return;
                const result = await env.importDocuments!(content);
                if (s.disposed) return;
                report(s, result, env);
                s.browser.dispatch({ type: 'reconcile' });
              })
              .catch(() => {
                if (!s.disposed)
                  report(s, { ok: false, error: 'The backup could not be read.' }, env);
              })
              .finally(() => {
                s.backup = undefined;
              });
          },
        });
      });
    }
    if (action === 'reset') {
      const epoch = fs.epoch;
      env.msg({
        title: 'Reset My Documents',
        icon: 'warn',
        lines: [
          'Permanently reset your documents and Recycle Bin?',
          'This also discards open unsaved text.',
          'Export a backup first if you want to keep it.',
        ],
        buttons: ['Reset', 'Cancel'],
        def: 1,
        onBtn: (i) => {
          if (i === 0 && !s.disposed && fs.epoch === epoch) {
            const result = fs.reset();
            s.browser.dispatch({ type: 'navigate', path: s.browser.state.path, folder: 'root' });
            s.browser.dispatch({ type: 'reconcile' });
            s.renameId = undefined;
            s.context = undefined;
            v.widgets.blurTextField();
            report(s, result, env);
          }
        },
      });
    }
    const blockPointer = !!s.context || !!s.dismissPointer || !!s.transfer;
    if (blockPointer) v.input.setPointerEnabled(false);
    if (
      v.widgets.button(c.x + 4, c.y + 3, 34, 20, '<', {
        disabled: typing || !s.browser.state.canBack,
      })
    )
      action = 'back';
    if (
      v.widgets.button(c.x + 42, c.y + 3, 34, 20, '>', {
        disabled: typing || !s.browser.state.canForward,
      })
    )
      action = 'forward';
    if (
      v.widgets.button(c.x + 80, c.y + 3, 34, 20, 'Up', {
        disabled: typing || !s.browser.state.path,
      })
    )
      action = 'up';
    if (!typing && (action === 'back' || action === 'forward' || action === 'up')) {
      s.browser.dispatch({ type: 'command', command: action });
      s.context = undefined;
    }
    v.widgets.field(c.x + 120, c.y + 3, c.w - 124, 20);
    v.draw.text(v.draw.fitText(s.browser.title(), c.w - 138), c.x + 126, c.y + 9, {
      color: v.draw.TH.text,
    });
    let list = s.browser.entries();
    const chosen = list[s.browser.state.sel],
      editable = s.browser.canModify(chosen),
      renameable = editable;
    if (!typing && action === 'refresh') {
      s.browser.dispatch({ type: 'command', command: 'refresh' });
    }
    if (action === 'properties' && chosen) properties(s, chosen, env);
    if (action === 'open-with' && chosen?.fileId && !typing)
      env.chooseFileApplication?.(chosen.fileId);
    if (action === 'send-desktop' && chosen && !typing) {
      s.transfer = executeTransfer(
        fs,
        sourceFor(chosen, s, env),
        {
          id: 'desktop',
          volume: 'desktop',
          folder: 'desktop',
          isTrash: false,
          acceptsDrop: true,
        },
        'shortcut',
      )
        .then((result) => {
          if (!s.disposed) report(s, result, env);
        })
        .finally(() => {
          s.transfer = undefined;
          env.invalidate();
        });
    }
    if (action === 'move' && editable && !typing) {
      const id = chosen.fileId ?? chosen.folder!;
      const epoch = fs.epoch;
      const choose = (page: number) => {
        const all = fs.folders().filter((folder) => !folder.readonly && folder.id !== id),
          targets = all.slice(page * 4, page * 4 + 4),
          more = (page + 1) * 4 < all.length;
        env.msg({
          title: 'Move File',
          icon: 'question',
          lines: [
            `Move ${chosen.label} to:`,
            ...targets.map((folder, i) => `${i + 1}. ${fs.folderPath(folder.id)}`),
          ],
          buttons: [
            ...targets.map((_folder, i) => String(i + 1)),
            ...(more ? ['More...'] : []),
            'Cancel',
          ],
          def: targets.length + (more ? 1 : 0),
          onBtn: (index) => {
            if (s.disposed || fs.epoch !== epoch) return;
            if (index < targets.length)
              report(
                s,
                chosen.folder
                  ? fs.moveFolder(chosen.folder, targets[index].id)
                  : fs.move(id, targets[index].id),
                env,
              );
            else if (more && index === targets.length) choose(page + 1);
          },
        });
      };
      choose(0);
    }
    let open = action === 'open';
    if (!typing && action === 'new-folder' && s.browser.writable()) {
      const result = fs.createFolder(undefined, s.browser.state.folder);
      report(s, result, env);
      if (result.ok) {
        s.renameId = result.folder.id;
        s.name = { text: result.folder.name, caret: result.folder.name.length, anchor: 0 };
        v.widgets.focusTextField('explorer-name');
      }
      list = s.browser.entries();
      if (result.ok) s.browser.dispatch({ type: 'select-entry', id: result.folder.id });
    }
    if (!typing && action === 'rename' && renameable && chosen) {
      s.renameId = chosen.fileId ?? chosen.folder;
      s.browser.dispatch({ type: 'clear-click' });
      const name = chosen.fileId ? fs.get(chosen.fileId)!.name : chosen.label;
      s.name = { text: name, caret: name.length, anchor: 0 };
      v.widgets.focusTextField('explorer-name');
    }
    if (s.renameId) {
      s.name = v.widgets.textField('explorer-name', c.x + 4, c.y + 29, c.w - 130, 21, s.name, {
        focused: v.focused,
        max: 64,
      });
      if (
        v.widgets.button(c.x + c.w - 121, c.y + 29, 56, 21, 'Rename') ||
        (v.focused && v.input.io.keyPressed.has('Enter'))
      ) {
        const result = s.renameId.startsWith('folder:')
          ? fs.renameFolder(s.renameId as FolderId, s.name.text)
          : fs.rename(s.renameId, s.name.text);
        report(s, result, env);
        if (result.ok) {
          list = s.browser.entries();
          s.browser.dispatch({ type: 'select-entry', id: s.renameId });
          s.renameId = undefined;
          v.widgets.blurTextField();
        }
        v.input.consumeKey('Enter');
      }
      if (
        v.widgets.button(c.x + c.w - 61, c.y + 29, 56, 21, 'Cancel') ||
        (v.focused && v.input.io.keyPressed.has('Escape'))
      ) {
        s.renameId = undefined;
        v.widgets.blurTextField();
        v.input.consumeKey('Escape');
      }
    } else {
      const nameWidth = Math.max(110, c.w - 172);
      const sortColumn = (sort: 'name' | 'type' | 'size', x: number, width: number) => {
        const label =
          sort[0].toUpperCase() +
          sort.slice(1) +
          (s.browser.state.sort === sort ? (s.browser.state.descending ? ' v' : ' ^') : '');
        if (v.widgets.button(x, c.y + 29, width, 21, label)) action = `sort-${sort}`;
      };
      sortColumn('name', c.x + 4, nameWidth);
      sortColumn('type', c.x + 4 + nameWidth, 98);
      sortColumn('size', c.x + 102 + nameWidth, c.w - nameWidth - 106);
      if (
        action === 'sort-name' ||
        action === 'sort-type' ||
        action === 'sort-size' ||
        action === 'reverse-sort'
      ) {
        s.browser.dispatch({ type: 'command', command: action });
        list = s.browser.entries();
      }
      if (action === 'new' && s.browser.writable()) {
        const result = fs.newText(s.browser.state.folder);
        report(s, result, env);
        if (result.file) {
          env.documents.requestOpen(result.file.id);
          env.open('notepad');
        }
      }
      if (action === 'delete') {
        if (editable && chosen) {
          report(
            s,
            chosen.folder ? fs.removeFolder(chosen.folder) : fs.remove(chosen.fileId!),
            env,
          );
          list = s.browser.entries();
          s.browser.dispatch({ type: 'clear-click' });
        }
      }
      if (keyboard && !s.renameId) {
        for (const command of [
          'ArrowDown',
          'ArrowUp',
          'Home',
          'End',
          'PageDown',
          'PageUp',
        ] as const)
          if (v.input.io.keyPressed.has(command)) s.browser.dispatch({ type: 'command', command });
        if (
          v.input.io.typed &&
          !v.input.io.keyDown.has('Control') &&
          !v.input.io.keyDown.has('Alt')
        )
          s.browser.dispatch({ type: 'search', text: v.input.io.typed, at: v.t });
        if (v.input.io.keyPressed.has('Enter')) open = true;
      }
    }
    if (action && s.browser.state.sel >= s.browser.state.top + rows)
      s.browser.dispatch({ type: 'reveal' });
    const listBounds = { x: c.x, y: c.y + 55, w: c.w, h: rows * ROW_STEP + 5 };
    if (
      v.input.hit(listBounds.x, listBounds.y, listBounds.w, listBounds.h).hover &&
      v.input.io.wheel
    )
      s.browser.dispatch({ type: 'scroll', delta: Math.sign(v.input.io.wheel) * 3 });
    v.widgets.field(listBounds.x, listBounds.y, listBounds.w, listBounds.h);
    const contextFor = (entry?: Entry, keyboard = false) => {
      const writable = s.browser.canModify(entry);
      const copyable = !!entry?.fileId || !!entry?.folder;
      s.browser.dispatch({ type: 'clear-click' });
      s.context = {
        x: keyboard ? c.x + 24 : v.input.io.px,
        y: keyboard
          ? listBounds.y + 3 + Math.max(0, s.browser.state.sel - s.browser.state.top) * ROW_STEP
          : v.input.io.py,
        items: entry
          ? [
              'Open',
              entry.fileId && !fs.get(entry.fileId)?.target && env.chooseFileApplication
                ? 'Open With...'
                : '~Open With...',
              writable ? 'Rename' : '~Rename',
              writable ? 'Delete' : '~Delete',
              writable ? 'Move...' : '~Move...',
              copyable ? 'Copy' : '~Copy',
              writable ? 'Cut' : '~Cut',
              s.browser.writable() && fs.clipboard() ? 'Paste' : '~Paste',
              entry.fileId || entry.folder || entry.open ? 'Send to Desktop' : '~Send to Desktop',
              '-',
              'Properties',
            ]
          : [
              s.browser.writable() ? 'New Folder' : '~New Folder',
              s.browser.writable() ? 'New Text Document' : '~New Text Document',
              s.browser.writable() && fs.clipboard() ? 'Paste' : '~Paste',
            ],
        sel: 0,
        key: entry ? entryKey(s.browser.state.path, entry, s.browser.state.folder) : '',
        keyboard,
        px: v.input.io.px,
        py: v.input.io.py,
      };
    };
    if (keyboard && v.input.io.keyPressed.has('ContextMenu')) {
      contextFor(list[s.browser.state.sel], true);
      v.input.consumeKey('ContextMenu');
    }
    const surface: FileTransferSurface = {
      bounds: listBounds,
      target: {
        id: s.browser.state.folder,
        volume:
          s.browser.state.path === 'personal'
            ? 'personal'
            : fileTransferVolume(fs, s.browser.state.folder),
        folder: s.browser.state.folder,
        isTrash: false,
        acceptsDrop: s.browser.writable() && !typing,
      },
      entries: [],
    };
    const surfaceEntries: FileTransferSurface['entries'][number][] = [];
    let rowClicked = false;
    list.slice(s.browser.state.top, s.browser.state.top + rows).forEach((entry, index) => {
      const i = s.browser.state.top + index,
        x = c.x + 6,
        y = listBounds.y + 3 + index * ROW_STEP;
      const bounds = { x, y, w: c.w - 12, h: ROW_HEIGHT };
      const rowHit = v.input.hit(bounds.x, bounds.y, bounds.w, bounds.h);
      rowClicked ||= rowHit.clicked;
      if (!s.renameId && rowHit.rclicked) {
        s.browser.dispatch({ type: 'select', index: i });
        contextFor(entry);
      }
      if (!s.renameId && rowHit.clicked) {
        const outcome = s.browser.dispatch({
          type: 'click',
          index: i,
          at: v.t,
          double: v.input.io.dbl,
        });
        if (outcome.kind === 'activate') open = true;
      }
      if (s.browser.state.sel === i)
        v.draw.rect(bounds.x, bounds.y, bounds.w, bounds.h, v.draw.TH.sel);
      const openIcon = entry.open ? appIconName(entry.open) : '';
      v.draw.spr(openIcon && v.draw.hasSprite(openIcon) ? openIcon : entry.icon, x + 1, y + 2);
      const file = entry.fileId ? fs.get(entry.fileId) : undefined;
      const nameWidth = Math.max(110, c.w - 172);
      const clipboard = fs.clipboard();
      const cut = clipboard?.mode === 'cut' && clipboard.id === (entry.fileId ?? entry.folder);
      const color =
        s.browser.state.sel === i ? v.draw.TH.selText : cut ? v.draw.TH.shadow : v.draw.TH.text;
      v.draw.text(v.draw.fitText(entry.label, nameWidth - 30), x + 23, y + 6, { color });
      v.draw.text(
        v.draw.fitText(
          entry.folder || entry.path
            ? 'Folder'
            : file?.target || entry.open
              ? 'Shortcut'
              : file
                ? fileType(file.name).description
                : '',
          90,
        ),
        c.x + nameWidth + 10,
        y + 6,
        { color },
      );
      if (file && !file.target)
        v.draw.text(v.draw.fitText(fileSize(fileBytes(file)), 55), c.x + nameWidth + 108, y + 6, {
          color,
        });
      const folder = entry.folder ? fs.getFolder(entry.folder) : undefined;
      if (entry.fileId || entry.folder || entry.open)
        surfaceEntries.push({
          bounds,
          source: sourceFor(entry, s, env),
          label: entry.label,
          icon: entry.icon,
          ...(folder || entry.open === 'bin'
            ? {
                target: {
                  id: entry.folder ?? 'bin',
                  volume:
                    entry.open === 'bin'
                      ? 'bin'
                      : fileTransferVolume(fs, folder?.id ?? s.browser.state.folder),
                  folder: folder?.id ?? s.browser.state.folder,
                  isTrash: entry.open === 'bin',
                  acceptsDrop: !folder?.readonly && !typing,
                },
              }
            : {}),
        });
    });
    const background = v.input.hit(listBounds.x, listBounds.y, listBounds.w, listBounds.h);
    if (!s.context && !s.renameId) {
      if (background.clicked && !rowClicked) {
        s.browser.dispatch({ type: 'select', index: -1 });
        s.browser.dispatch({ type: 'clear-click' });
      }
      if (background.rclicked) contextFor();
    }
    env.fileSurfaces?.publish(v.win.id, { ...surface, entries: typing ? [] : surfaceEntries });
    if (!list.length) v.draw.text('(empty)', c.x + 12, c.y + 68, { color: v.draw.TH.shadow });
    const bottom = c.y + c.h - 25;
    if (
      v.widgets.button(c.x + 4, bottom, 62, 20, 'Previous', { disabled: s.browser.state.top === 0 })
    )
      s.browser.dispatch({ type: 'scroll', delta: -rows });
    v.draw.text(
      v.draw.fitText(
        `${list.length} object(s)${s.browser.writable() ? '' : s.browser.state.path === 'personal' || fs.getFolder(s.browser.state.folder)?.readonly ? ' | Read-only' : ''}`,
        c.w - 156,
      ),
      c.x + 78,
      bottom + 6,
      { color: v.draw.TH.text },
    );
    if (
      v.widgets.button(c.x + c.w - 64, bottom, 60, 20, 'Next', {
        disabled: s.browser.state.top + rows >= list.length,
      })
    )
      s.browser.dispatch({ type: 'scroll', delta: rows });
    const selected = list[s.browser.state.sel];
    if (open && selected && !typing && !s.context) {
      v.input.consumeKey('Enter');
      v.input.consumePointer('dbl');
      v.input.consumePointer('wentUp');
      s.browser.dispatch({ type: 'clear-click' });
      env.play('click');
      if (selected.fileId) {
        if (env.openFile) {
          const result = env.openFile(selected.fileId);
          if (!result.accepted)
            env.msg({
              title: 'Open File',
              icon: 'warn',
              lines: [
                'This file could not be opened.',
                result.reason === 'blocked'
                  ? 'Finish the active dialog and try again.'
                  : 'Choose Open With or check the shortcut target.',
              ],
            });
        } else {
          env.documents.requestOpen(selected.fileId);
          env.open('notepad');
        }
      } else if (selected.open) env.open(selected.open);
      else if (selected.path) navigate(s, selected.path, selected.folder ?? 'root');
    }
    if (blockPointer) v.input.setPointerEnabled(true);
    if (s.dismissPointer && v.input.io.wentUp) {
      s.dismissPointer = false;
      v.input.consumePointer('wentUp');
    }
    if (s.context) {
      const popup = s.context,
        width = Math.max(...popup.items.map((item) => v.draw.tw(item.replace(/^~/, '')))) + 44;
      const height = 6 + popup.items.reduce((total, item) => total + (item === '-' ? 8 : 18), 0);
      popup.x = Math.max(c.x, Math.min(popup.x, c.x + c.w - width));
      popup.y = Math.max(c.y, Math.min(popup.y, c.y + c.h - height));
      const enabled = popup.items.flatMap((item, index) =>
        item === '-' || item.startsWith('~') ? [] : [index],
      );
      if (!enabled.includes(popup.sel)) popup.sel = enabled[0] ?? -1;
      if (popup.px !== v.input.io.px || popup.py !== v.input.io.py) popup.keyboard = false;
      popup.px = v.input.io.px;
      popup.py = v.input.io.py;
      let chosen = -1;
      for (const key of v.input.io.keyPressed) {
        const result = navigateMenu(
          popup.items.map((item) => ({
            separator: item === '-',
            disabled: item.startsWith('~'),
            command: item.replace(/^~/, ''),
            mnemonic: item.replace(/^~/, '').trim().charAt(0).toLowerCase(),
          })),
          popup.sel,
          key,
        );
        if (result.type === 'ignore') continue;
        popup.keyboard = true;
        v.input.consumeKey(key);
        if (result.type === 'highlight') popup.sel = result.index;
        else if (result.type === 'close') s.context = undefined;
        else if (result.type === 'choose')
          chosen = popup.items.findIndex((item) => item.replace(/^~/, '') === result.command);
      }
      if (s.context) {
        const result = v.widgets.menu(popup.x, popup.y, popup.items, popup.sel, undefined, {
          keyboard: popup.keyboard,
        });
        if (!popup.keyboard && enabled.includes(result.hovered)) popup.sel = result.hovered;
        const pick = chosen >= 0 ? chosen : result.clicked;
        if (pick >= 0 && enabled.includes(pick)) {
          s.contextAction = { item: popup.items[pick], key: popup.key };
          s.context = undefined;
          v.input.consumeKey('Enter');
          v.input.consumePointer('wentUp');
          v.input.consumePointer('dbl');
        } else if (v.input.io.keyPressed.has('Escape')) {
          s.context = undefined;
          v.input.consumeKey('Escape');
        } else if (
          v.input.io.wentDown &&
          !(
            v.input.io.px >= popup.x &&
            v.input.io.px < popup.x + width &&
            v.input.io.py >= popup.y &&
            v.input.io.py < popup.y + height
          )
        ) {
          s.context = undefined;
          s.dismissPointer = true;
        }
      }
    }
  },
  dispose(s, env) {
    s.disposed = true;
    s.backupInput?.cancel();
    if (s.windowId) env.fileSurfaces?.remove(s.windowId);
  },
  async onClose(s) {
    s.backupInput?.cancel();
    await Promise.all([s.backup, s.transfer]);
  },
});
