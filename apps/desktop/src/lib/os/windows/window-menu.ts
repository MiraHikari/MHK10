import type { Renderer } from '../../gfx/context';
import type { WidgetScope } from '../../ui/canvas/widgets';
import type { InputController } from '../../ui/canvas/input';
import { navigateMenu } from '../../ui/canvas/menu-navigation';
import type { WinState } from './wm';
import type { WindowBounds } from './resize';

export type WindowCommand =
  | 'restore'
  | 'move'
  | 'size'
  | 'minimize'
  | 'maximize'
  | 'dock-left'
  | 'dock-right'
  | 'close';
interface Entry {
  label: string;
  command?: WindowCommand;
  key?: string;
  disabled?: boolean;
  default?: boolean;
}

/** The same availability rules govern pointer, keyboard, and taskbar system menus. */
export function windowMenuEntries(win: WinState): Entry[] {
  const controls = win.ctl ?? 'mx';
  const normal = !win.minimized && !win.maximized;
  return [
    { label: 'Restore', command: 'restore', key: 'r', disabled: normal && !win.docked },
    { label: 'Move', command: 'move', key: 'm', disabled: !normal },
    {
      label: 'Size',
      command: 'size',
      key: 's',
      disabled: !normal || win.modal || win.resizable === false || !controls.includes('m'),
    },
    {
      label: 'Minimize',
      command: 'minimize',
      key: 'n',
      disabled: win.minimized || win.modal || !controls.includes('m'),
    },
    {
      label: 'Maximize',
      command: 'maximize',
      key: 'x',
      disabled: win.maximized || win.modal || !controls.includes('m'),
    },
    {
      label: 'Dock Left',
      command: 'dock-left',
      key: 'l',
      disabled: win.minimized || win.modal || win.resizable === false || !controls.includes('m'),
    },
    {
      label: 'Dock Right',
      command: 'dock-right',
      key: 'h',
      disabled: win.minimized || win.modal || win.resizable === false || !controls.includes('m'),
    },
    { label: '-' },
    {
      label: 'Close    Ctrl+F4',
      command: 'close',
      key: 'c',
      default: true,
      disabled: win.noClose || !controls.includes('x'),
    },
  ];
}

/** System menus use the canvas widget palette, geometry, and text rasterizer. */
export class WindowMenu {
  constructor(
    private readonly renderer: Renderer,
    private readonly input: InputController,
    private readonly widgets: WidgetScope,
  ) {}
  private menuState: {
    id: string;
    x: number;
    y: number;
    selected: number;
    keyboard: boolean;
    px: number;
    py: number;
  } | null = null;

  get state() {
    return this.menuState ? Object.freeze({ ...this.menuState }) : null;
  }

  open(win: WinState, x = win.x + 3, y = win.y + 21): void {
    const entries = windowMenuEntries(win);
    this.menuState = {
      id: win.id,
      x,
      y,
      selected: entries.findIndex((entry) => entry.command && !entry.disabled),
      keyboard: true,
      px: this.input.io.px,
      py: this.input.io.py,
    };
  }

  close(): void {
    this.menuState = null;
  }

  bounds(win: WinState): WindowBounds | null {
    if (!this.menuState) return null;
    const entries = windowMenuEntries(win);
    const w = Math.min(
      this.renderer.W,
      Math.max(
        ...entries.map((entry) => this.renderer.tw(entry.label, entry.default ? 'bold' : 'ui')),
      ) + 44,
    );
    const h = 6 + entries.reduce((sum, entry) => sum + (entry.command ? 18 : 8), 0);
    return {
      x: Math.round(Math.max(0, Math.min(this.menuState.x, this.renderer.W - w))),
      y: Math.round(Math.max(0, Math.min(this.menuState.y, this.renderer.H - 22 - h))),
      w,
      h,
    };
  }

  key(win: WinState, key: string): WindowCommand | null {
    const state = this.menuState;
    if (!state) return null;
    state.keyboard = true;
    const result = navigateMenu(
      windowMenuEntries(win).map((entry) => ({
        separator: !entry.command,
        disabled: entry.disabled,
        command: entry.command,
        mnemonic: entry.key,
      })),
      state.selected,
      key,
    );
    if (result.type === 'close') {
      this.close();
      return null;
    }
    if (result.type === 'highlight') {
      state.selected = result.index;
      return null;
    }
    return result.type === 'choose' ? (result.command as WindowCommand) : null;
  }

  draw(win: WinState): WindowCommand | null {
    const state = this.menuState,
      bounds = this.bounds(win);
    if (!state || !bounds) return null;
    const { x, y, w, h } = bounds;
    const entries = windowMenuEntries(win);
    if (state.px !== this.input.io.px || state.py !== this.input.io.py) state.keyboard = false;
    state.px = this.input.io.px;
    state.py = this.input.io.py;
    this.widgets.bevel(x, y, w, h, 'window');
    let yy = y + 3,
      command: WindowCommand | null = null;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry.command) {
        this.renderer.rect(x + 4, yy + 3, w - 8, 1, this.renderer.TH.shadow);
        this.renderer.rect(x + 4, yy + 4, w - 8, 1, this.renderer.TH.hi);
        yy += 8;
        continue;
      }
      const row = this.input.hitOwned('systemmenu', x + 3, yy, w - 6, 18);
      if (!state.keyboard && row.hover && !entry.disabled) state.selected = i;
      const active = state.selected === i && !entry.disabled;
      if (active) this.renderer.rect(x + 3, yy, w - 6, 18, this.renderer.TH.sel);
      if (entry.disabled)
        this.renderer.text(entry.label, x + 23, yy + 6, { color: this.renderer.TH.hi });
      this.renderer.text(entry.label, x + 22, yy + 5, {
        font: entry.default ? 'bold' : 'ui',
        color: active
          ? this.renderer.TH.selText
          : entry.disabled
            ? this.renderer.TH.shadow
            : this.renderer.TH.text,
      });
      const position = entry.key ? entry.label.toLowerCase().indexOf(entry.key) : -1;
      if (position >= 0) {
        const font = entry.default ? 'bold' : 'ui';
        this.renderer.rect(
          x + 22 + this.renderer.tw(entry.label.slice(0, position), font),
          yy + 14,
          this.renderer.tw(entry.label[position], font),
          1,
          active
            ? this.renderer.TH.selText
            : entry.disabled
              ? this.renderer.TH.shadow
              : this.renderer.TH.text,
        );
      }
      if (row.clicked && !entry.disabled) command = entry.command;
      yy += 18;
    }
    if (
      (this.input.io.wentDown || this.input.io.rwentDown) &&
      !this.input.hitOwned('systemmenu', x, y, w, h).hover
    )
      this.close();
    return command;
  }
}
