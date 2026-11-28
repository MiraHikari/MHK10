import type { Renderer } from '../../gfx/context';
import type { InputScope } from './input';
import { popupLayout } from './layout';
import { navigateMenu, type MenuItem } from './menu-navigation';
import {
  menuLabels,
  type AppMenus,
  type AppMenuSelection,
  type MenuEntry,
  type MenuPresentation,
} from './menu-types';

export interface MenuBarState {
  open: number;
  focused?: number;
  row?: number;
  keyboard?: boolean;
  px?: number;
  py?: number;
}

/** Owns popup geometry, row input, menu-bar navigation and command selection. */
export function createCanvasMenus(
  draw: Pick<Renderer, 'TH' | 'W' | 'H' | 'rect' | 'text' | 'tw' | 'fitText'>,
  input: Pick<InputScope, 'io' | 'hit' | 'hitOwned' | 'consumeKey' | 'consumeText'>,
  paintBevel: (x: number, y: number, w: number, h: number, kind: 'window') => void,
) {
  const { rect, text, tw, fitText } = draw;
  const { hit, hitOwned, io, consumeKey, consumeText } = input;
  let disposed = false;

  /** '-' is a separator, '~Label' is disabled and 'Label>' has a submenu arrow. */
  function menu(
    x: number,
    y: number,
    items: string[],
    sel = -1,
    owner?: string,
    options: { keyboard?: boolean; presentation?: readonly MenuPresentation[] } = {},
  ): { clicked: number; hovered: number } {
    if (disposed) return { clicked: -1, hovered: -1 };
    const clean = items.map((i) => i.replace(/^~|>$/g, ''));
    const layout = popupLayout(x, y, items, tw, { w: draw.W, h: draw.H });
    const { w, h } = layout;
    x = layout.x;
    y = layout.y;
    paintBevel(x, y, w, h, 'window');
    let yy = y + 3;
    const rows = items.map((it) => {
      const top = yy;
      yy += it === '-' ? 8 : 18;
      return {
        top,
        hit:
          it === '-'
            ? null
            : owner
              ? hitOwned(owner, x + 3, top, w - 6, 18)
              : hit(x + 3, top, w - 6, 18),
      };
    });
    const hovered = rows.findIndex((row) => row.hit?.hover);
    const clicked = rows.findIndex(
      (row, index) => row.hit?.clicked && !items[index].startsWith('~'),
    );
    const selI = !options.keyboard && hovered >= 0 ? hovered : sel;
    items.forEach((it, i) => {
      yy = rows[i].top;
      if (it === '-') {
        rect(x + 4, yy + 3, w - 8, 1, draw.TH.shadow);
        rect(x + 4, yy + 4, w - 8, 1, draw.TH.hi);
        return;
      }
      const dis = it[0] === '~',
        sub = it.endsWith('>'),
        parts = clean[i].split('\t'),
        label = fitText(parts[0], w - 44 - (parts[1] ? tw(parts[1]) + 20 : 0));
      if (i === selI && !dis) rect(x + 3, yy, w - 6, 18, draw.TH.sel);
      const col = i === selI && !dis ? draw.TH.selText : dis ? draw.TH.shadow : draw.TH.text;
      const presentation = options.presentation?.[i];
      const font = presentation?.default ? 'bold' : 'ui';
      if (dis && i !== selI) text(label, x + 23, yy + 6, { color: draw.TH.hi });
      text(label, x + 22, yy + 5, { color: col, font });
      if (presentation) {
        const mnemonic = presentation.mnemonic ?? label.trim().charAt(0);
        const position = label.toLowerCase().indexOf(mnemonic.toLowerCase());
        if (position >= 0 && mnemonic)
          rect(
            x + 22 + tw(label.slice(0, position), font),
            yy + 14,
            tw(label[position], font),
            1,
            col,
          );
      }
      if (presentation?.checked) {
        if (presentation.radio) {
          rect(x + 8, yy + 7, 4, 4, col);
          rect(x + 9, yy + 6, 2, 6, col);
        } else {
          for (let j = 0; j < 3; j++) rect(x + 6 + j, yy + 8 + j, 2, 1, col);
          for (let j = 0; j < 5; j++) rect(x + 9 + j, yy + 10 - j, 2, 1, col);
        }
      }
      if (parts[1]) text(parts[1], x + w - 12, yy + 5, { color: col, align: 'right' });
      if (sub) {
        const cc = i === selI && !dis ? draw.TH.selText : col;
        for (let j = 0; j < 4; j++) rect(x + w - 12 + j, yy + 5 + j, 1, 7 - 2 * j, cc);
      }
    });
    return { clicked, hovered };
  }

  function menuItems(entries: readonly MenuEntry[]): MenuItem[] {
    return entries.map((entry) =>
      entry === '-'
        ? { separator: true }
        : {
            disabled: entry.disabled,
            command: entry.command,
            mnemonic: entry.mnemonic ?? entry.label.trim().charAt(0).toLowerCase(),
          },
    );
  }

  function keyboardSelection(defs: AppMenus, st: MenuBarState): AppMenuSelection | null {
    const names = Object.keys(defs);
    if (!names.length) return null;
    if (st.px !== io.px || st.py !== io.py) st.keyboard = false;
    st.px = io.px;
    st.py = io.py;
    for (const key of io.keyPressed) {
      if (key === 'F10') {
        const entering = st.open < 0 && st.focused === undefined;
        st.open = -1;
        st.focused = entering ? 0 : undefined;
        st.row = -1;
        st.keyboard = true;
        consumeKey(key);
        continue;
      }
      if (st.open < 0 && st.focused === undefined) continue;
      consumeText();
      if (key === 'Escape' || key === 'Alt') {
        consumeKey(key);
        st.open = -1;
        st.focused = undefined;
        return null;
      }
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        st.keyboard = true;
        const selected = st.open >= 0 ? st.open : (st.focused ?? 0);
        st.focused = (selected + (key === 'ArrowRight' ? 1 : -1) + names.length) % names.length;
        if (st.open >= 0) st.open = st.focused;
        st.row = -1;
        consumeKey(key);
        continue;
      }
      if (st.open < 0) {
        if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter') {
          st.open = st.focused ?? 0;
          const result = navigateMenu(
            menuItems(defs[names[st.open]]),
            -1,
            key === 'ArrowUp' ? 'End' : 'Home',
          );
          st.row = result.type === 'highlight' ? result.index : -1;
          consumeKey(key);
        } else if (key.length === 1) {
          const result = navigateMenu(
            names.map((name, index) => ({
              command: String(index),
              mnemonic: name.charAt(0).toLowerCase(),
            })),
            st.focused ?? -1,
            key,
          );
          if (result.type === 'choose') {
            st.open = st.focused = Number(result.command);
            st.row = -1;
          } else if (result.type === 'highlight') {
            st.focused = result.index;
          }
          consumeKey(key);
        }
        continue;
      }
      const menuName = names[st.open];
      const entries = defs[menuName];
      const result = navigateMenu(menuItems(entries), st.row ?? -1, key);
      if (result.type === 'ignore') {
        if (key.length === 1) consumeKey(key);
        continue;
      }
      st.keyboard = true;
      consumeKey(key);
      if (result.type === 'highlight') st.row = result.index;
      else if (result.type === 'choose') {
        const entry = entries.find((item) => item !== '-' && item.command === result.command);
        st.open = -1;
        st.focused = undefined;
        if (entry && entry !== '-')
          return { menu: menuName, item: entry.label, command: entry.command };
      }
    }
    return null;
  }

  function menubar(
    x: number,
    y: number,
    defs: AppMenus,
    st: MenuBarState,
    keyboardEnabled = true,
  ): AppMenuSelection | null {
    if (disposed) return null;
    if (io.cancelled) {
      st.open = -1;
      st.focused = undefined;
      return null;
    }
    if (
      st.open < 0 &&
      st.focused !== undefined &&
      io.wentDown &&
      !hit(
        x + 3,
        y,
        Object.keys(defs).reduce((width, name) => width + tw(name) + 18, 0),
        16,
      ).hover
    )
      st.focused = undefined;
    const chosen = keyboardEnabled ? keyboardSelection(defs, st) : null;
    let mx = x + 6;
    for (const name in defs) {
      const i = Object.keys(defs).indexOf(name);
      const w = tw(name) + 12,
        r = hit(mx - 3, y, w, 16);
      if (st.open === i || (st.open < 0 && st.focused === i)) {
        rect(mx - 3, y, w, 16, draw.TH.sel);
        text(name, mx, y + 5, { color: draw.TH.selText });
      } else if (r.hover) {
        rect(mx - 3, y, w, 16, draw.TH.hi === draw.TH.face ? draw.TH.lite : draw.TH.face);
        text(name, mx, y + 5, { color: draw.TH.text });
      } else text(name, mx, y + 5, { color: draw.TH.text });
      rect(
        mx,
        y + 14,
        tw(name.charAt(0)),
        1,
        st.open === i || (st.open < 0 && st.focused === i) ? draw.TH.selText : draw.TH.text,
      );
      if (r.clicked) {
        st.open = i;
        st.focused = i;
        st.row = -1;
        st.keyboard = false;
      } else if (!st.keyboard && r.hover && st.open >= 0) {
        if (st.open !== i) st.row = -1;
        st.open = st.focused = i;
      }
      if (st.open === i) {
        const res = menu(mx - 3, y + 17, menuLabels(defs[name]), st.row ?? -1, undefined, {
          keyboard: st.keyboard === true,
          presentation: defs[name].map((entry) => (entry === '-' ? {} : entry)),
        });
        if (!st.keyboard && res.hovered >= 0) st.row = res.hovered;
        if (res.clicked >= 0 && defs[name][res.clicked] !== '-') {
          const selected = defs[name][res.clicked];
          if (selected === '-') continue;
          const item = selected.label;
          st.open = -1;
          st.focused = undefined;
          return { menu: name, item, command: selected.command };
        }
        if (io.wentDown && !r.hover && !hitAnyPopup(mx - 3, y + 17, menuLabels(defs[name]))) {
          st.open = -1;
          st.focused = undefined;
        }
      }
      mx += w + 6;
    }
    if (chosen) return chosen;
    if (io.keyPressed.has('Escape')) {
      st.open = -1;
      st.focused = undefined;
    }
    return null;
  }

  function hitAnyPopup(x: number, y: number, items: string[]): boolean {
    const box = popupLayout(x, y, items, tw, { w: draw.W, h: draw.H });
    return hit(box.x, box.y, box.w, box.h).hover;
  }

  return {
    menu,
    menubar,
    dispose(): void {
      disposed = true;
    },
  };
}
