import type { AppFrame } from '../host/app-contracts';
import type { App, AppServices, SaveDialogRequest } from '../host/app-contracts';
import { appMetadata } from '../../../data/app-catalog';
import type { FileSystem, FolderId, SandboxFile } from './filesystem';
import { popupLayout } from '../../ui/canvas/layout';
import { moveList } from '../../ui/canvas/list-navigation';
import type { SaveTextRequest, SaveTextResult } from './save-request';
import { defaultSaveFolder, writableSaveFolders } from './save-target-model';

import { type TextFieldState } from '../../ui/canvas/widgets';

import { truncateLabel } from '../windows/wm';

export type SaveRequest = SaveDialogRequest;
interface State {
  request: SaveTextRequest;
  name: TextFieldState;
  folder: FolderId;
  top: number;
  sel: number;
  notice: string;
  focus: 'folder' | 'list' | 'name';
  dropdown: boolean;
  dropdownIndex: number;
  dropdownKeyboard: boolean;
  px: number;
  py: number;
  dismissPointer: boolean;
  initialized?: boolean;
  lastClick?: { key: string; t: number };
  retry?: { id: string; version: number | undefined; name: string; folder: FolderId };
}
export function openSaveDialog(
  frame: AppFrame,
  request: SaveRequest,
  env: AppServices,
  save = env.saveText,
): void {
  frame.input.consumePointer('wentDown');
  frame.input.consumePointer('wentUp');
  frame.input.consumePointer('dbl');
  frame.input.consumeKey('Enter');
  void save(request).then((result) => {
    if (result.status === 'saved') request.onSave(result.file, result.persisted);
    else if (result.status === 'failed')
      env.msg({ title: 'Save As', icon: 'warn', lines: [result.error] });
  });
}
function enterFolder(s: State, folder: FolderId): void {
  s.folder = folder;
  s.top = 0;
  s.sel = -1;
  s.notice = '';
  s.lastClick = undefined;
}

export function createSaveDialogApp(
  request: SaveTextRequest,
  complete: (result: SaveTextResult) => void,
  fs: FileSystem,
): App<State> {
  let completed = false;
  let saveGeneration = 0;
  const epoch = fs.epoch;
  const finish = (result: SaveTextResult) => {
    if (!completed) {
      completed = true;
      saveGeneration++;
      complete(result);
    }
  };
  return {
    ...appMetadata('$saveas'),
    create: () => {
      return {
        request,
        name: { text: request.name, caret: request.name.length, anchor: 0 },
        folder: defaultSaveFolder(fs.folders(), request.folder),
        top: 0,
        sel: -1,
        focus: 'name',
        dropdown: false,
        dropdownIndex: 0,
        dropdownKeyboard: false,
        px: 0,
        py: 0,
        dismissPointer: false,
        notice: '',
      };
    },
    status: (s) => s.notice || 'Ready',
    onClose: () => {
      finish({ status: 'cancelled' });
    },
    dispose: () => {
      finish({ status: 'cancelled' });
    },
    draw(s, v, env) {
      if (completed) return;
      if (!s.initialized) {
        s.initialized = true;
        s.px = v.input.io.px;
        s.py = v.input.io.py;
        v.widgets.focusTextField('save-filename');
      }
      const c = v.client;
      const blocked = !v.focused || s.dropdown || s.dismissPointer;
      if (!v.focused) {
        s.dropdown = false;
        s.lastClick = undefined;
      }
      if (blocked) v.input.setPointerEnabled(false);
      const openDropdown = () => {
        s.dropdown = true;
        s.focus = 'folder';
        s.dropdownIndex = Math.max(
          0,
          writableSaveFolders(fs.folders()).findIndex((folder) => folder.id === s.folder),
        );
        s.dropdownKeyboard = true;
        s.px = v.input.io.px;
        s.py = v.input.io.py;
        s.lastClick = undefined;
        v.widgets.blurTextField();
        v.input.setPointerEnabled(false);
      };
      if (!blocked && v.input.io.keyPressed.has('Tab')) {
        s.focus = s.focus === 'name' ? 'folder' : s.focus === 'folder' ? 'list' : 'name';
        if (s.focus === 'name') v.widgets.focusTextField('save-filename');
        else v.widgets.blurTextField();
        v.input.consumeKey('Tab');
      }
      if (
        !blocked &&
        s.focus === 'folder' &&
        (v.input.io.keyPressed.has('Enter') ||
          v.input.io.keyPressed.has('ArrowDown') ||
          v.input.io.keyPressed.has('ArrowUp'))
      ) {
        openDropdown();
        v.input.consumeKey('Enter');
      }
      v.draw.text('Save in:', c.x + 10, c.y + 13);
      const folderName = fs.folderName(s.folder);
      if (v.widgets.button(c.x + 60, c.y + 5, c.w - 103, 23, folderName + '  v') && !blocked)
        openDropdown();
      if (
        v.widgets.button(c.x + c.w - 35, c.y + 5, 25, 23, '^', { disabled: s.folder === 'root' }) &&
        !blocked &&
        !s.dropdown
      ) {
        enterFolder(s, fs.getFolder(s.folder)?.parent ?? 'root');
        s.focus = 'list';
        v.widgets.blurTextField();
      }
      v.widgets.field(c.x + 10, c.y + 35, c.w - 20, 114);
      const files = fs.list('documents', s.folder);
      const locations = writableSaveFolders(fs.folders(s.folder));
      const rows = [
        ...locations.map((folder) => ({
          name: folder.name,
          folder: folder.id,
          file: undefined as SandboxFile | undefined,
        })),
        ...files.map((file) => ({
          name: file.name,
          folder: undefined as FolderId | undefined,
          file,
        })),
      ];
      s.sel = Math.min(s.sel, rows.length - 1);
      const listKeys = !blocked && !s.dropdown && s.focus === 'list';
      if (listKeys) {
        for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
          if (!v.input.io.keyPressed.has(key)) continue;
          const moved = moveList({ count: rows.length, rows: 5, index: s.sel, top: s.top }, key);
          if (moved) {
            s.sel = moved.index;
            s.top = moved.top;
          }
        }
        if (rows[s.sel]?.file) s.name = { text: rows[s.sel].name, caret: rows[s.sel].name.length };
      }
      if (v.input.hit(c.x + 10, c.y + 35, c.w - 20, 114).hover && v.input.io.wheel)
        s.top += Math.sign(v.input.io.wheel) * 3;
      s.top = Math.max(0, Math.min(Math.max(0, rows.length - 5), s.top));
      let enteredFolder = false;
      const navigate = (folder: FolderId) => {
        enterFolder(s, folder);
        s.focus = 'list';
        v.widgets.blurTextField();
        v.input.consumePointer('wentUp');
        v.input.consumePointer('dbl');
        v.input.consumeKey('Enter');
        enteredFolder = true;
      };
      if (listKeys && v.input.io.keyPressed.has('Enter')) {
        const row = rows[s.sel];
        v.input.consumeKey('Enter');
        if (row?.folder) navigate(row.folder);
        else if (row?.file) {
          s.focus = 'name';
          v.widgets.focusTextField('save-filename');
        }
      }
      rows.slice(s.top, s.top + 5).forEach((row, index) => {
        const y = c.y + 40 + index * 20;
        const selected = s.sel === s.top + index;
        if (selected) v.draw.rect(c.x + 13, y, c.w - 44, 19, v.draw.TH.sel);
        v.draw.spr(row.folder ? 'i_folder' : 'i_doc', c.x + 16, y + 1);
        v.draw.text(truncateLabel(v.draw.tw, row.name, 'ui', c.w - 81), c.x + 39, y + 5, {
          color: selected ? v.draw.TH.selText : v.draw.TH.text,
        });
        if (!enteredFolder && v.input.hit(c.x + 13, y, c.w - 44, 19).clicked) {
          const key = `${s.folder}:${row.folder ?? row.file!.id}`;
          const double =
            v.input.io.dbl && s.lastClick?.key === key && env.now() - s.lastClick.t < 0.45;
          s.lastClick = { key, t: env.now() };
          s.sel = s.top + index;
          s.focus = 'list';
          v.widgets.blurTextField();
          if (row.folder && double) navigate(row.folder);
          else if (row.file) s.name = { text: row.name, caret: row.name.length };
          v.input.consumePointer('wentUp');
        }
      });
      if (v.widgets.button(c.x + c.w - 29, c.y + 38, 16, 18, '^', { disabled: !s.top })) s.top--;
      if (
        v.widgets.button(c.x + c.w - 29, c.y + 128, 16, 18, 'v', {
          disabled: s.top >= rows.length - 5,
        })
      )
        s.top++;
      v.draw.text('File name:', c.x + 10, c.y + 164);
      if (v.input.hit(c.x + 73, c.y + 156, c.w - 162, 23).clicked) s.focus = 'name';
      s.name = v.widgets.textField('save-filename', c.x + 73, c.y + 156, c.w - 162, 23, s.name, {
        max: 64,
        focused: v.focused && !blocked && !s.dropdown && s.focus === 'name',
      });
      v.draw.text('Save as type:', c.x + 10, c.y + 192);
      v.widgets.field(c.x + 73, c.y + 184, c.w - 162, 23);
      v.draw.text('Text document (*.txt, *.log)', c.x + 80, c.y + 192);
      const save = v.widgets.button(c.x + c.w - 81, c.y + 156, 71, 23, 'Save', { def: true });
      const cancel = v.widgets.button(c.x + c.w - 81, c.y + 184, 71, 23, 'Cancel');
      v.input.setPointerEnabled(true);
      if (s.dropdown && v.focused) {
        const folders = writableSaveFolders(fs.folders()),
          labels = folders.map((folder) => fs.folderPath(folder.id));
        const {
          x,
          y,
          w: width,
          h: height,
        } = popupLayout(c.x + 60, c.y + 28, labels, v.draw.tw, { w: v.draw.W, h: v.draw.H });
        if (s.px !== v.input.io.px || s.py !== v.input.io.py) s.dropdownKeyboard = false;
        s.px = v.input.io.px;
        s.py = v.input.io.py;
        for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
          if (!v.input.io.keyPressed.has(key)) continue;
          s.dropdownKeyboard = true;
          const moved = moveList(
            {
              count: labels.length,
              rows: Math.max(1, labels.length),
              index: s.dropdownIndex,
              top: 0,
            },
            key,
          );
          if (moved) s.dropdownIndex = labels.length ? moved.index : 0;
          v.input.consumeKey(key);
        }
        const choice = v.widgets.menu(x, y, labels, s.dropdownIndex, undefined, {
          keyboard: s.dropdownKeyboard,
        });
        if (!s.dropdownKeyboard && choice.hovered >= 0) s.dropdownIndex = choice.hovered;
        const pick = v.input.io.keyPressed.has('Enter') ? s.dropdownIndex : choice.clicked;
        if (pick >= 0) {
          enterFolder(s, folders[pick].id);
          s.dropdown = false;
          v.input.consumeKey('Enter');
          v.input.consumePointer('wentUp');
          v.input.consumePointer('dbl');
        } else if (v.input.io.keyPressed.has('Escape')) {
          s.dropdown = false;
          v.input.consumeKey('Escape');
        } else if (
          v.input.io.wentDown &&
          !(
            v.input.io.px >= x &&
            v.input.io.px < x + width &&
            v.input.io.py >= y &&
            v.input.io.py < y + height
          )
        ) {
          s.dropdown = false;
          s.dismissPointer = v.input.io.down;
          v.input.consumePointer('wentUp');
        }
        return;
      }
      if (s.dismissPointer) {
        if (v.input.io.wentUp) {
          s.dismissPointer = false;
          v.input.consumePointer('wentUp');
        }
        return;
      }
      if (blocked || enteredFolder || !v.focused) return;
      if (cancel || v.input.io.keyPressed.has('Escape')) {
        v.input.consumeKey('Escape');
        v.input.consumePointer('wentUp');
        env.close(v.win.id);
        return;
      }
      if (!(save || (s.focus === 'name' && v.input.io.keyPressed.has('Enter')))) return;
      v.input.consumeKey('Enter');
      const generation = ++saveGeneration;
      const filename = s.name.text.trim();
      const folder = s.folder;
      const existing = fs.findByName(filename, folder);
      const commit = (overwriteId?: string, expectedVersion?: number) => {
        if (completed || generation !== saveGeneration) return;
        if (s.folder !== folder || s.name.text.trim() !== filename) {
          s.notice = 'The save destination changed. Choose Save again to review.';
          return;
        }
        if (fs.epoch !== epoch) {
          s.notice = 'My Documents was reset. Cancel and open Save As again.';
          return;
        }
        const result = fs.saveTextAs(filename, s.request.content, folder, {
          overwriteId,
          expectedVersion,
        });
        if (!result.ok || !result.file) {
          s.retry = undefined;
          s.notice = result.error || 'Could not save this file.';
          return;
        }
        if (!result.persisted) {
          s.retry = {
            id: result.file.id,
            version: fs.getVersion(result.file.id),
            name: filename,
            folder,
          };
          s.notice = fs.notice;
          return;
        }
        finish({ status: 'saved', file: result.file, persisted: true });
        env.close(v.win.id);
        env.play('ding');
      };
      if (
        s.retry &&
        existing?.id === s.retry.id &&
        filename === s.retry.name &&
        s.folder === s.retry.folder
      ) {
        commit(s.retry.id, s.retry.version);
        return;
      }
      const expectedVersion = existing && fs.getVersion(existing.id);
      if (existing)
        env.msg({
          title: 'Confirm Save As',
          icon: 'question',
          lines: [
            truncateLabel(v.draw.tw, filename, 'ui', 320),
            'This file already exists in ' + folderName + '.',
            'Replace its contents?',
          ],
          buttons: ['Replace', 'Cancel'],
          def: 1,
          onBtn: (i) => {
            if (i !== 0 || completed || generation !== saveGeneration) return;
            if (fs.getVersion(existing.id) !== expectedVersion) {
              s.notice = 'The file changed. Choose Save again to review.';
              return;
            }
            commit(existing.id, expectedVersion);
          },
        });
      else commit();
    },
  };
}
