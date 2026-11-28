import { moveList } from '../../ui/canvas/list-navigation';
import { defineCanvasApp } from '../../os/host/app-session';
import { appMetadata } from '../../../data/app-catalog';

import type { AppServices } from '../../os/host/app-contracts';
import type { FolderId } from '../../os/files/filesystem';

interface State {
  sel: number;
  top: number;
  notice: string;
  disposed: boolean;
  lastClick?: { id: string; t: number };
}
type BinEntry =
  | { kind: 'file'; id: string; name: string; folder: FolderId }
  | { kind: 'folder'; id: FolderId; name: string };
function binEntries(env: AppServices): BinEntry[] {
  return [
    ...env.files.deletedFolders().map((folder) => ({
      kind: 'folder' as const,
      id: folder.id,
      name: folder.name,
    })),
    ...env.files
      .list('bin')
      .filter((file) => !file.deletedWith)
      .map((file) => ({
        kind: 'file' as const,
        id: file.id,
        name: file.name,
        folder: file.folder,
      })),
  ];
}
export const binApp = defineCanvasApp<State>({
  ...appMetadata('bin'),
  needsFrame: () => false,

  menus: (s, env) => ({
    File: [
      {
        command: 'empty',
        label: 'Empty Recycle Bin',
        disabled: !env.files.list('bin').length && !env.files.deletedFolders().length,
      },
      '-',
      { command: 'close', label: 'Close' },
    ],
    Edit: [{ command: 'restore', label: 'Restore', disabled: s.sel < 0 }],
    View: [{ command: 'refresh', label: 'Refresh' }],
  }),
  status: (s, env) => s.notice || env.files.notice || `${binEntries(env).length} deleted item(s)`,
  create: () => ({ sel: -1, top: 0, notice: '', disposed: false }),
  draw(s, v, env) {
    const fs = env.files,
      action = v.menuSel?.command,
      c = v.client;
    if (action === 'close') return env.close(v.win.id);
    let items = binEntries(env);
    s.sel = Math.min(s.sel, items.length - 1);
    if (
      action === 'refresh' ||
      (v.focused && v.win.menu.open < 0 && v.input.io.keyPressed.has('F5'))
    ) {
      s.notice = `${items.length} deleted item(s). Refreshed.`;
      s.lastClick = undefined;
      v.input.consumeKey('F5');
    }
    let restore = action === 'restore';
    if (v.widgets.button(c.x + 4, c.y + 3, 74, 21, 'Restore', { disabled: s.sel < 0 }))
      restore = true;
    if (
      v.widgets.button(c.x + 84, c.y + 3, 98, 21, 'Empty Bin', { disabled: !items.length }) ||
      action === 'empty'
    ) {
      const epoch = fs.epoch;
      const revision = fs.revision;
      env.msg({
        title: 'Confirm Permanent Delete',
        icon: 'warn',
        lines: [
          `Permanently delete ${items.length} item(s)?`,
          'Folders and their contents cannot be restored.',
        ],
        buttons: ['Delete', 'Cancel'],
        def: 1,
        onBtn: (i) => {
          if (i === 0 && !s.disposed && fs.epoch === epoch) {
            if (fs.revision !== revision) {
              s.notice = 'The Recycle Bin changed. Review its contents and choose Empty Bin again.';
              return;
            }
            fs.emptyBin();
            s.sel = -1;
            s.top = 0;
            s.notice = fs.notice;
          }
        },
      });
    }
    const rows = Math.max(1, Math.floor((c.h - 59) / 21));
    if (v.focused && v.win.menu.open < 0) {
      for (const key of ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End']) {
        if (!v.input.io.keyPressed.has(key)) continue;
        const moved = moveList({ count: items.length, rows, index: s.sel, top: s.top }, key);
        if (moved) {
          s.sel = moved.index;
          s.top = moved.top;
        }
      }
      if (v.input.io.keyPressed.has('Enter')) restore = true;
    }
    if (v.input.hit(c.x, c.y + 28, c.w, rows * 21).hover && v.input.io.wheel)
      s.top += Math.sign(v.input.io.wheel) * 3;
    s.top = Math.max(0, Math.min(Math.max(0, items.length - rows), s.top));
    v.widgets.field(c.x, c.y + 28, c.w, rows * 21 + 5);
    if (!items.length) v.draw.text('(empty)', c.x + 12, c.y + 42, { color: v.draw.TH.shadow });
    items.slice(s.top, s.top + rows).forEach((file, index) => {
      const i = s.top + index,
        x = c.x + 6,
        y = c.y + 31 + index * 21;
      if (v.input.hit(x, y, c.w - 12, 20).clicked) {
        if (v.input.io.dbl && s.lastClick?.id === file.id && env.now() - s.lastClick.t < 0.45)
          restore = true;
        s.lastClick = { id: file.id, t: env.now() };
        s.sel = i;
      }
      if (s.sel === i) v.draw.rect(x, y, c.w - 12, 20, v.draw.TH.sel);
      v.draw.spr(file.kind === 'folder' ? 'i_folder' : 'i_doc', x + 1, y + 2);
      v.draw.text(
        v.draw.fitText(
          file.kind === 'folder'
            ? `${file.name} [folder]`
            : `${file.name} [${fs.folderName(file.folder)}]`,
          c.w - 44,
        ),
        x + 23,
        y + 6,
        { color: s.sel === i ? v.draw.TH.selText : v.draw.TH.text },
      );
    });
    if (restore && items[s.sel]) {
      v.input.consumeKey('Enter');
      v.input.consumePointer('dbl');
      v.input.consumePointer('wentUp');
      s.lastClick = undefined;
      const selected = items[s.sel];
      const result =
        selected.kind === 'folder' ? fs.restoreFolder(selected.id) : fs.restore(selected.id);
      s.notice = result.ok
        ? selected.kind === 'folder'
          ? `Restored folder. ${fs.persisted ? '' : 'Session only.'}`
          : `Restored to ${
              'file' in result && result.file ? fs.folderName(result.file.folder) : 'My Documents'
            }. ${fs.persisted ? '' : 'Session only.'}`
        : result.error || '';
      items = binEntries(env);
      s.sel = Math.min(s.sel, items.length - 1);
    }
    if (v.widgets.button(c.x + 4, c.y + c.h - 24, 64, 20, 'Previous', { disabled: s.top === 0 }))
      s.top = Math.max(0, s.top - rows);
    if (
      v.widgets.button(c.x + c.w - 64, c.y + c.h - 24, 60, 20, 'Next', {
        disabled: s.top + rows >= items.length,
      })
    )
      s.top += rows;
  },
  dispose(s) {
    s.disposed = true;
  },
});
