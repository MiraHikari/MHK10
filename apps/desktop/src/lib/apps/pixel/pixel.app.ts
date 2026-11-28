import { appMetadata } from '../../../data/app-catalog';
import { VGA_COLORS } from '../../gfx/palette';

import type { AppServices } from '../../os/host/app-contracts';
import { defineCanvasApp } from '../../os/host/app-session';
import type { SandboxFile } from '../../os/files/filesystem';

import {
  createPixelDocument,
  parsePixelBitmap,
  type PixelPoint,
  type PixelTool,
} from './pixel-model';

const COLORS = VGA_COLORS;
const TOOLS: readonly PixelTool[] = ['pencil', 'fill', 'line', 'eraser'];
interface PixelState {
  document: ReturnType<typeof createPixelDocument>;
  tool: PixelTool;
  color: number;
  name: string;
  anchor: PixelPoint | null;
  last: PixelPoint | null;
  opening: boolean;
  openPage: number;
  alive: boolean;
  notice: string;
  winId: string;
  discard: boolean;
}
async function saveImage(state: PixelState, env: AppServices): Promise<boolean> {
  try {
    return await state.document.save(async (content) => {
      const result = await env.saveText({ name: state.name, content });
      if (result.status === 'saved' && result.persisted && state.alive)
        state.name = result.file.name;
      return result;
    });
  } finally {
    // `saving` 清除后必须重绘一次，否则静态帧下 “Saving…” 会一直留着。
    env.invalidate();
  }
}
function discardOrSave(state: PixelState, env: AppServices, action: () => void): void {
  state.document.end();
  state.anchor = state.last = null;
  if (state.document.get().saving) return;
  if (!state.document.get().dirty) return action();
  env.msg({
    title: 'PIXEL.EXE',
    icon: 'question',
    lines: [`Save changes to ${state.name}?`],
    buttons: ['Save', 'Discard', 'Cancel'],
    def: 0,
    onBtn: (index) => {
      if (!state.alive) return;
      if (index === 1) action();
      if (index === 0)
        void saveImage(state, env).then((saved) => {
          if (saved && state.alive) action();
        });
    },
  });
}
function openFile(state: PixelState, env: AppServices, file: SandboxFile): void {
  discardOrSave(state, env, () => {
    const current = env.files.get(file.id);
    if (current && !current.deleted && state.document.load(current.content)) {
      state.name = current.name;
      state.opening = false;
      state.notice = '';
    }
  });
}

export const pixelApp = defineCanvasApp<PixelState>({
  ...appMetadata('pixel'),
  // 纯状态绘制（无光标闪烁 / 时间动画）；异步保存结束会 invalidate。
  needsFrame: () => false,
  create: (env) => {
    const state: PixelState = {
      document: createPixelDocument(),
      tool: 'pencil',
      color: 0,
      name: 'Untitled.pixel',
      anchor: null,
      last: null,
      opening: false,
      openPage: 0,
      alive: true,
      notice: '',
      winId: '',
      discard: false,
    };
    if (env.initialFileId) {
      const file = env.files.get(env.initialFileId);
      if (file && !file.deleted && state.document.load(file.content)) state.name = file.name;
      else state.notice = 'This file is not a valid PIXEL image.';
    }
    return state;
  },
  menus: (state, env) => ({
    File: [
      { command: 'new', label: 'New' },
      { command: 'open', label: 'Open...' },
      { command: 'save', label: 'Save As...', disabled: state.document.get().saving },
      { command: 'export', label: 'Export image' },
      '-',
      {
        command: 'wallpaper',
        label: 'Set as wallpaper',
        disabled: !env.desktop?.setPixelWallpaper,
      },
      '-',
      { command: 'exit', label: 'Exit' },
    ],
    Edit: [
      { command: 'undo', label: 'Undo', disabled: !state.document.get().canUndo },
      {
        command: 'improve',
        label: 'AGI.EXE: Improve',
        disabled: !env.story.get().actions.includes('install'),
      },
    ],
    Help: [{ command: 'help', label: 'Paint tools' }],
  }),
  status: (state) =>
    state.notice ||
    state.document.get().notice ||
    `${state.document.get().dirty ? 'Modified | ' : ''}${state.document.get().width} x ${state.document.get().height} | 16 colours`,
  checkpoint(state) {
    const document = state.document.get();
    return !document.dirty && !document.saving;
  },
  onClose(state, env) {
    state.document.end();
    if (!state.document.get().dirty || state.discard) return true;
    env.msg({
      title: 'PIXEL.EXE',
      icon: 'question',
      lines: [`Save changes to ${state.name}?`],
      buttons: ['Save', 'Discard', 'Cancel'],
      def: 0,
      onBtn: (index) => {
        if (!state.alive) return;
        if (index === 1) {
          state.discard = true;
          env.close(state.winId);
        }
        if (index === 0)
          void saveImage(state, env).then((saved) => {
            if (saved && state.alive) env.close(state.winId);
          });
      },
    });
    return false;
  },
  dispose(state) {
    state.alive = false;
    state.document.dispose();
  },
  draw(state, view, env) {
    const c = view.client;
    state.winId = view.win.id;
    const action = view.menuSel?.command;
    const active = view.focused && view.win.menu.open < 0;
    const initial = state.document.get();
    const scale = Math.max(
      1,
      Math.min(2, Math.floor((c.w - 78) / initial.width), Math.floor((c.h - 34) / initial.height)),
    );
    const board = { x: c.x + 68, y: c.y + 6, w: initial.width * scale, h: initial.height * scale };
    const point = (x: number, y: number): PixelPoint => ({
      x: Math.max(0, Math.min(initial.width - 1, Math.floor((x - board.x) / scale))),
      y: Math.max(0, Math.min(initial.height - 1, Math.floor((y - board.y) / scale))),
    });
    const inside = (x: number, y: number) =>
      x >= board.x && x < board.x + board.w && y >= board.y && y < board.y + board.h;
    view.draw.rect(c.x, c.y, c.w, c.h, view.draw.TH.face);
    TOOLS.forEach((tool, index) => {
      if (
        view.widgets.button(
          c.x + 5,
          c.y + 6 + index * 25,
          56,
          23,
          tool[0].toUpperCase() + tool.slice(1),
          {
            pressed: state.tool === tool,
            disabled: state.opening,
          },
        )
      )
        state.tool = tool;
    });
    if (
      view.widgets.button(c.x + 5, c.y + 116, 56, 23, 'Undo', {
        disabled: !initial.canUndo || state.opening,
      })
    )
      state.document.undo();
    if (
      view.widgets.button(c.x + 5, c.y + 143, 56, 23, 'Save', {
        disabled: initial.saving || state.opening,
      })
    )
      void saveImage(state, env);
    if (
      view.widgets.button(c.x + 5, c.y + 173, 56, 23, 'Improve', {
        disabled: !env.story.get().actions.includes('install') || state.opening,
      })
    )
      state.document.improve();
    const paintHit = view.input.hit(board.x, board.y, board.w, board.h);
    if (!state.opening && active) {
      const press =
        view.input.pointerPress() ??
        (view.input.io.completedClicks[0]
          ? {
              x: view.input.io.completedClicks[0].startX,
              y: view.input.io.completedClicks[0].startY,
            }
          : null);
      if (view.input.io.wentDown && paintHit.hover && press && inside(press.x, press.y)) {
        state.notice = '';
        state.anchor = state.last = point(press.x, press.y);
        state.document.begin();
        if (state.tool !== 'line')
          state.document.draw(state.tool, state.anchor, state.anchor, state.color);
      }
      if (state.anchor && state.last) {
        const current = point(view.input.io.px, view.input.io.py);
        if (
          state.tool !== 'fill' &&
          state.tool !== 'line' &&
          (view.input.io.down || view.input.io.wentUp)
        )
          state.document.draw(state.tool, state.last, current, state.color);
        if (state.tool === 'line' && view.input.io.wentUp)
          state.document.draw('line', state.anchor, current, state.color);
        state.last = current;
      }
    }
    if (state.anchor && (view.input.io.wentUp || view.input.io.cancelled || !active)) {
      state.document.end();
      state.anchor = state.last = null;
    }
    if (action === 'undo' || (active && view.input.io.keyPressed.has('Undo')))
      state.document.undo();
    if (action === 'new')
      discardOrSave(state, env, () => {
        state.document.clear();
        state.name = 'Untitled.pixel';
        state.notice = '';
      });
    if (action === 'open') {
      state.opening = true;
      state.openPage = 0;
    }
    if (action === 'save' || (active && view.input.io.keyPressed.has('Save')))
      void saveImage(state, env);
    if (action === 'export') env.downloadText(state.name, state.document.serialize());
    if (action === 'wallpaper') {
      const image = state.document.get();
      env.desktop?.setPixelWallpaper({
        width: image.width,
        height: image.height,
        pixels: image.pixels,
      });
      state.notice = 'Desktop wallpaper updated.';
    }
    if (action === 'improve' && env.story.get().actions.includes('install'))
      state.document.improve();
    if (action === 'exit') env.close(view.win.id);
    if (action === 'help')
      env.msg({
        title: 'PIXEL.EXE Help',
        icon: 'info',
        lines: [
          'Pencil and Eraser draw while you hold the mouse.',
          'Fill colours a connected area. Line joins two points.',
          'Select a colour below the image. Ctrl+Z undoes.',
          'Save As stores an image in My Documents.',
          'AGI.EXE adds a shadow. Undo restores your drawing.',
        ],
      });
    const image = state.document.get();
    view.widgets.bevel(board.x - 2, board.y - 2, board.w + 4, board.h + 4, 'sunken');
    for (let y = 0; y < image.height; y++) {
      let x = 0;
      while (x < image.width) {
        const color = image.pixels[y * image.width + x];
        const start = x++;
        while (x < image.width && image.pixels[y * image.width + x] === color) x++;
        view.draw.rect(
          board.x + start * scale,
          board.y + y * scale,
          (x - start) * scale,
          scale,
          COLORS[color],
        );
      }
    }
    if (state.tool === 'line' && state.anchor && state.last)
      view.draw.line(
        board.x + state.anchor.x * scale,
        board.y + state.anchor.y * scale,
        board.x + state.last.x * scale,
        board.y + state.last.y * scale,
        COLORS[state.color],
        scale,
      );
    const paletteY = c.y + c.h - 23;
    COLORS.forEach((color, index) => {
      const x = board.x + index * 23;
      view.widgets.bevel(x, paletteY, 21, 20, state.color === index ? 'pressed' : 'button');
      view.draw.rect(x + 3, paletteY + 3, 15, 14, color);
      if (view.input.hit(x, paletteY, 21, 20).clicked && !state.opening) state.color = index;
    });
    if (state.opening) {
      const files = env.files
        .folders()
        .flatMap((folder) => env.files.list('documents', folder.id))
        .filter((file) => parsePixelBitmap(file.content));
      const pageSize = 5;
      state.openPage = Math.max(
        0,
        Math.min(state.openPage, Math.ceil(files.length / pageSize) - 1),
      );
      view.widgets.bevel(c.x + 80, c.y + 22, c.w - 102, 184, 'window');
      view.draw.text('Open image', c.x + 92, c.y + 34, { font: 'bold' });
      if (!files.length) view.draw.text('No saved images.', c.x + 92, c.y + 61);
      files
        .slice(state.openPage * pageSize, (state.openPage + 1) * pageSize)
        .forEach((file, index) => {
          if (view.widgets.button(c.x + 92, c.y + 53 + index * 23, c.w - 126, 21, file.name))
            openFile(state, env, file);
        });
      if (view.widgets.button(c.x + 92, c.y + 175, 38, 22, '<', { disabled: state.openPage === 0 }))
        state.openPage--;
      if (
        view.widgets.button(c.x + 134, c.y + 175, 38, 22, '>', {
          disabled: (state.openPage + 1) * pageSize >= files.length,
        })
      )
        state.openPage++;
      if (
        view.widgets.button(c.x + c.w - 94, c.y + 175, 60, 22, 'Cancel') ||
        (active && view.input.io.keyPressed.has('Escape'))
      )
        state.opening = false;
    }
    env.setTitle(view.win.id, `${state.name}${image.dirty ? ' *' : ''} - PIXEL.EXE`);
  },
});
