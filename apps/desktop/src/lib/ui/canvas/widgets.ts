import { createCanvasTextFields } from './canvas-text-fields';
import { createCanvasMenus } from './canvas-menus';
export type { TextFieldState } from './canvas-text-fields';
export type { MenuBarState } from './canvas-menus';
import { applyCursorScheme } from '../../gfx/cursor-scheme';
import { C, type CursorSet } from '../../gfx/palette';
import { clamp, R } from '../../gfx/primitives';
import type { FontName } from '../../gfx/text';
import type { Renderer } from '../../gfx/context';
import type { InputScope, CursorKind } from './input';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---------- controls ----------
export interface ButtonOpts {
  def?: boolean;
  disabled?: boolean;
  font?: FontName;
  pressed?: boolean;
  owner?: string;
}

export interface CheckOpts {
  disabled?: boolean;
  font?: FontName;
}

export interface ProgressOpts {
  color?: string;
  bw?: number;
  smooth?: boolean;
  bg?: string;
}

export function createWidgetScope(
  draw: Renderer,
  input: Pick<
    InputScope,
    'io' | 'hit' | 'hitOwned' | 'requestCursor' | 'consumeKey' | 'consumeText'
  >,
  now: () => number = () => 0,
) {
  const { rect, frame, disc, poly, text, tw, capH, fitText, sprDesktop } = draw;
  const { hit, hitOwned, io } = input;
  let disposed = false;

  // ---------- bevels ----------
  // kind: 'window' | 'button' | 'sunken' (fields) | 'pressed' | 'thin' (status bars) | 'thinUp'
  function bevel(
    x: number,
    y: number,
    w: number,
    h: number,
    kind: 'window' | 'button' | 'sunken' | 'pressed' | 'thin' | 'thinUp' = 'button',
    fill: string | null = draw.TH.face,
  ): void {
    x = R(x);
    y = R(y);
    w = R(w);
    h = R(h);
    if (fill) rect(x, y, w, h, fill);
    if (kind === 'thin' || kind === 'thinUp') {
      const [a, b] = kind === 'thin' ? [draw.TH.shadow, draw.TH.hi] : [draw.TH.hi, draw.TH.shadow];
      rect(x, y, w - 1, 1, a);
      rect(x, y, 1, h - 1, a);
      rect(x, y + h - 1, w, 1, b);
      rect(x + w - 1, y, 1, h, b);
      return;
    }
    const table = {
      window: [draw.TH.lite, draw.TH.dark, draw.TH.hi, draw.TH.shadow],
      button: [draw.TH.hi, draw.TH.dark, draw.TH.lite, draw.TH.shadow],
      sunken: [draw.TH.shadow, draw.TH.hi, draw.TH.dark, draw.TH.lite],
      pressed: [draw.TH.dark, draw.TH.hi, draw.TH.shadow, draw.TH.lite],
    } as const;
    const [o1, o2, i1, i2] = table[kind as keyof typeof table];
    rect(x, y, w - 1, 1, o1);
    rect(x, y, 1, h - 1, o1);
    rect(x, y + h - 1, w, 1, o2);
    rect(x + w - 1, y, 1, h, o2);
    rect(x + 1, y + 1, w - 3, 1, i1);
    rect(x + 1, y + 1, 1, h - 3, i1);
    rect(x + 1, y + h - 2, w - 2, 1, i2);
    rect(x + w - 2, y + 1, 1, h - 2, i2);
  }
  const field = (x: number, y: number, w: number, h: number, fill: string = draw.TH.field) =>
    bevel(x, y, w, h, 'sunken', fill);
  /** button(x, y, w, h, label, opts) -> clicked. Draws the pressed state while held. */
  function button(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    o: ButtonOpts = {},
  ): boolean {
    x = R(x);
    y = R(y);
    w = R(w);
    h = R(h);
    const r = o.owner ? hitOwned(o.owner, x, y, w, h) : hit(x, y, w, h);
    const pressed = !o.disabled && (o.pressed || r.held);
    if (o.def) {
      frame(x, y, w, h, draw.TH.dark);
      x++;
      y++;
      w -= 2;
      h -= 2;
    }
    bevel(x, y, w, h, pressed ? 'pressed' : 'button');
    const d = pressed ? 1 : 0,
      font = o.font || 'ui',
      tx = x + w / 2 + d,
      ty = y + R((h - capH(font)) / 2) + d;
    label = fitText(label, w - 8, font);
    if (o.disabled) {
      text(label, tx + 1, ty + 1, { align: 'center', color: draw.TH.hi, font });
      text(label, tx, ty, { align: 'center', color: draw.TH.shadow, font });
    } else text(label, tx, ty, { align: 'center', color: draw.TH.text, font });
    return !!r.clicked && !o.disabled;
  }
  /** check(x, y, label, on) -> clicked (the caller toggles the state). */
  function check(x: number, y: number, label: string, on: boolean, o: CheckOpts = {}): boolean {
    const r = hit(x, y, Math.max(13, label ? 18 + tw(label, o.font) : 13), 14);
    field(x, y, 13, 13, o.disabled ? draw.TH.face : draw.TH.field);
    if (on) {
      const c = o.disabled ? draw.TH.shadow : draw.TH.text;
      for (let i = 0; i < 7; i++) rect(x + 3 + i, y + (i < 3 ? 5 + i : 9 - i), 1, 3, c);
    }
    if (label)
      text(label, x + 18, y + R((13 - capH(o.font)) / 2), {
        color: o.disabled ? draw.TH.shadow : draw.TH.text,
        font: o.font,
      });
    return !!r.clicked && !o.disabled;
  }

  /** radio(x, y, label, on) -> clicked. */
  function radio(x: number, y: number, label: string, on: boolean, o: CheckOpts = {}): boolean {
    const r = hit(x, y, Math.max(12, label ? 18 + tw(label, o.font) : 12), 13);
    disc(x + 6, y + 6, 6, draw.TH.shadow);
    disc(x + 6, y + 6, 5, C.black);
    disc(x + 6, y + 6, 4, o.disabled ? draw.TH.face : draw.TH.field);
    if (on) disc(x + 6, y + 6, 2, draw.TH.text);
    if (label)
      text(label, x + 18, y + R((13 - capH(o.font)) / 2), {
        color: o.disabled ? draw.TH.shadow : draw.TH.text,
        font: o.font,
      });
    return !!r.clicked && !o.disabled;
  }
  /** progress(x, y, w, h, k 0..1): the chunky-block progress bar. Pure draw. */
  function progress(
    x: number,
    y: number,
    w: number,
    h: number,
    k: number,
    o: ProgressOpts = {},
  ): void {
    bevel(x, y, w, h, 'thin', o.bg || draw.TH.face);
    const bw = o.bw || Math.max(3, R((h - 4) * 0.7)),
      iw = w - 4,
      col = o.color || draw.TH.sel;
    if (o.smooth) return void rect(x + 2, y + 2, R(iw * clamp(k)), h - 4, col);
    const n = Math.floor((iw + 2) / (bw + 2)),
      f = Math.round(clamp(k) * n);
    for (let i = 0; i < f; i++)
      rect(x + 2 + i * (bw + 2), y + 2, Math.min(bw, iw - i * (bw + 2)), h - 4, col);
  }

  /** hslider(id, x, y, w, k) -> new k. Draggable trackbar thumb. */
  const _drag = new Map<string, number>(); // id -> 0/1 dragging
  function hslider(id: string, x: number, y: number, w: number, k: number): number {
    if (disposed) return clamp(k);
    bevel(x, y + 8, w, 4, 'sunken', draw.TH.face);
    for (let i = 0; i <= 10; i++) rect(x + 5 + R((i * (w - 11)) / 10), y + 22, 1, 3, draw.TH.text);
    const tx0 = x + R(clamp(k) * (w - 11));
    let dragging = _drag.get(id) === 1;
    const r = hit(x - 4, y, w + 8, 24);
    if (r.held && io.py >= y && io.py < y + 20) dragging = true;
    if (!io.down) dragging = false;
    _drag.set(id, dragging ? 1 : 0);
    const tx = dragging ? x + clamp((io.px - x) / (w - 11)) * (w - 11) : tx0;
    if (dragging) input.requestCursor('arrow');
    bevel(tx, y, 11, 20, 'button');
    return dragging ? clamp((io.px - x) / (w - 11)) : clamp(k);
  }
  const textFields = createCanvasTextFields(draw, input, now, field);
  const { textField, textFieldFocused, focusTextField, blurTextField } = textFields;
  const menus = createCanvasMenus(draw, input, bevel);
  const { menu, menubar } = menus;

  function tooltip(
    x: number,
    y: number,
    str: string,
    o: { scale?: number; font?: FontName } = {},
  ): void {
    const s = o.scale || 1,
      font = o.font || 'ui',
      w = tw(str, font, s) + 8 * s,
      h = capH(font, s) + 8 * s;
    rect(x, y, w, h, C.black);
    rect(x + 1, y + 1, w - 2, h - 2, C.tip);
    text(str, x + 4 * s, y + 4 * s, { font, scale: s });
  }

  /** The assistant's speech balloon with a tail pointing at (tailX, tailY). Returns the text rect. */
  function bubble(
    x: number,
    y: number,
    w: number,
    h: number,
    tx: number | null,
    ty: number | null,
  ): Rect {
    x = R(x);
    y = R(y);
    const tail = (c: string, d: number) => {
      if (tx == null || ty == null) return;
      if (tx > x + w || tx < x) {
        const ex = tx > x ? x + w - 2 : x + 2,
          cy = clamp(ty, y + 12, y + h - 12);
        poly(
          [
            [ex, cy - 7 + d],
            [ex, cy + 7 - d],
            [tx + (tx > x ? -2 * d : 2 * d), ty],
          ],
          c,
        );
      } else {
        const ey = ty > y ? y + h - 2 : y + 2,
          cx = clamp(tx, x + 14, x + w - 14);
        poly(
          [
            [cx - 7 + d, ey],
            [cx + 7 - d, ey],
            [tx, ty + (ty > y ? -2 * d : 2 * d)],
          ],
          c,
        );
      }
    };
    tail(C.black, 0);
    rect(x + 3, y, w - 6, h, C.black);
    rect(x, y + 3, w, h - 6, C.black);
    rect(x + 1, y + 1, w - 2, h - 2, C.black);
    rect(x + 3, y + 1, w - 6, h - 2, C.tip);
    rect(x + 1, y + 3, w - 2, h - 6, C.tip);
    rect(x + 2, y + 2, w - 4, h - 4, C.tip);
    tail(C.tip, 2);
    return { x: x + 8, y: y + 8, w: w - 16, h: h - 16 };
  }

  // ---------- message box icons ----------
  function msgIcon(kind: 'error' | 'warn' | 'info' | 'question', x: number, y: number): void {
    x = R(x);
    y = R(y);
    if (kind === 'error') {
      disc(x + 17, y + 17, 14, draw.TH.shadow);
      disc(x + 16, y + 16, 14, C.black);
      disc(x + 16, y + 16, 13, C.red);
      for (let i = 0; i < 13; i++) {
        rect(x + 9 + i, y + 10 + i, 3, 2, C.white);
        rect(x + 21 - i, y + 10 + i, 3, 2, C.white);
      }
    } else if (kind === 'warn') {
      poly(
        [
          [x + 16, y + 1],
          [x + 32, y + 30],
          [x, y + 30],
        ],
        C.black,
      );
      poly(
        [
          [x + 16, y + 5],
          [x + 28, y + 28],
          [x + 4, y + 28],
        ],
        C.yellow,
      );
      rect(x + 15, y + 11, 3, 10, C.black);
      rect(x + 15, y + 23, 3, 3, C.black);
    } else {
      poly(
        [
          [x + 8, y + 24],
          [x + 20, y + 24],
          [x + 8, y + 32],
        ],
        C.black,
      );
      disc(x + 16, y + 14, 14, C.black);
      disc(x + 16, y + 14, 13, C.white);
      text(kind === 'info' ? 'i' : '?', x + 17, y + 6, {
        font: 'bold',
        scale: 2,
        color: C.blue,
        align: 'center',
      });
    }
  }

  // ---------- icons and pointer ----------
  /** dicon(name, label, x, y, {sel}): a desktop icon in a 48px-wide cell. Returns clicked/dblclicked. */
  function dicon(
    name: string,
    label: string,
    x: number,
    y: number,
    o: { sel?: boolean; owner?: string } = {},
  ): { clicked: boolean; dbl: boolean; rclicked: boolean } {
    sprDesktop(name, x + 8, y, o.sel ? draw.TH.sel : undefined);
    const words = label.split(' ');
    let first = '';
    while (words.length && tw([first, words[0]].filter(Boolean).join(' ')) <= 84)
      first = [first, words.shift()].filter(Boolean).join(' ');
    const lines = first
      ? [first, ...(words.length ? [fitText(words.join(' '), 84)] : [])]
      : [fitText(label, 84)];
    const w = Math.max(...lines.map((line) => tw(line)));
    lines.forEach((line, index) => {
      const lineWidth = tw(line);
      if (o.sel)
        rect(
          Math.round(x + 24 - lineWidth / 2 - 2),
          y + 34 + index * 11,
          lineWidth + 4,
          11,
          draw.TH.sel,
        );
      text(line, x + 24, y + 36 + index * 11, {
        align: 'center',
        color: o.sel ? draw.TH.selText : draw.TH.deskText,
      });
    });
    const hitWidth = Math.max(48, w + 4),
      hitX = x + 24 - hitWidth / 2;
    const r = o.owner ? hitOwned(o.owner, hitX, y, hitWidth, 58) : hit(hitX, y, hitWidth, 58);
    return { clicked: !!r.clicked, dbl: !!(r.clicked && io.dbl), rclicked: !!r.rclicked };
  }

  function paintCursor(
    target: Pick<Renderer, 'rect' | 'poly' | 'spr'>,
    x: number,
    y: number,
    kind: CursorKind,
    seconds: number,
    reducedMotion: boolean,
  ): void {
    const { rect, poly, spr } = target;
    if (kind.startsWith('size-')) {
      const points: [number, number][] = [
        [0, -8],
        [-4, -4],
        [-2, -4],
        [-2, 4],
        [-4, 4],
        [0, 8],
        [4, 4],
        [2, 4],
        [2, -4],
        [4, -4],
      ];
      const angle =
        kind === 'size-ew'
          ? Math.PI / 2
          : kind === 'size-nwse'
            ? -Math.PI / 4
            : kind === 'size-nesw'
              ? Math.PI / 4
              : 0;
      const shape = (scale: number): [number, number][] =>
        points.map(([px, py]) => [
          R(x + (px * Math.cos(angle) - py * Math.sin(angle)) * scale),
          R(y + (px * Math.sin(angle) + py * Math.cos(angle)) * scale),
        ]);
      poly(shape(1), C.black);
      poly(shape(0.65), C.white);
    } else if (kind === 'wait' || kind === 'working') {
      if (kind === 'working') spr('arrow', x, y);
      const left = x + (kind === 'working' ? 10 : -5),
        top = y - 7;
      const frame = reducedMotion ? 0 : Math.floor(seconds / 0.18) % 4;
      rect(left, top, 11, 2, C.black);
      rect(left, top + 14, 11, 2, C.black);
      for (let row = 0; row < 12; row++) {
        const inset = Math.min(row, 11 - row, 4);
        rect(left + inset, top + 2 + row, 11 - inset * 2, 1, C.black);
        rect(left + inset + 1, top + 2 + row, Math.max(1, 9 - inset * 2), 1, C.white);
        if ((row < 5 && row >= frame) || (row > 7 && row > 12 - frame))
          rect(left + inset + 2, top + 2 + row, Math.max(1, 7 - inset * 2), 1, C.navy);
      }
    } else if (kind === 'ibeam') spr('ibeam', x - 3, y - 8);
    else spr('arrow', x, y);
  }

  function cursor(
    x: number,
    y: number,
    kind: CursorKind = 'arrow',
    seconds = 0,
    reducedMotion = false,
    scheme: CursorSet = 'arrow',
  ): void {
    if (scheme === 'arrow') {
      paintCursor(draw, x, y, kind, seconds, reducedMotion);
      return;
    }
    const size = 36;
    const origin = 12;
    const sheet = draw.offscreen(size, size, (child) => {
      paintCursor(child, origin, origin, kind, seconds, reducedMotion);
      const context = child.getCtx();
      const image = context.getImageData(0, 0, size, size);
      applyCursorScheme(image.data, scheme);
      context.putImageData(image, 0, 0);
    });
    draw.getCtx().drawImage(sheet, R(x) - origin, R(y) - origin);
  }

  // ---------- caption buttons (used by the window manager) ----------
  function capBtn(
    x: number,
    y: number,
    kind: 'min' | 'max' | 'restore' | 'x',
    off = false,
    pressed = false,
  ): void {
    bevel(x, y, 16, 14, pressed ? 'pressed' : 'button');
    const d = pressed ? 1 : 0,
      c = off ? draw.TH.shadow : draw.TH.text;
    if (kind === 'min') rect(x + 4 + d, y + 9 + d, 6, 2, c);
    else if (kind === 'max') {
      frame(x + 3 + d, y + 2 + d, 9, 9, c);
      rect(x + 3 + d, y + 2 + d, 9, 2, c);
    } else if (kind === 'restore') {
      frame(x + 5 + d, y + 2 + d, 7, 7, c);
      rect(x + 5 + d, y + 2 + d, 7, 2, c);
      rect(x + 3 + d, y + 4 + d, 7, 7, draw.TH.face);
      frame(x + 3 + d, y + 4 + d, 7, 7, c);
      rect(x + 3 + d, y + 4 + d, 7, 2, c);
    } else
      for (let i = 0; i < 7; i++) {
        rect(x + 4 + i + d, y + 3 + i + d, 2, 1, c);
        rect(x + 10 - i + d, y + 3 + i + d, 2, 1, c);
      }
  }
  return {
    bevel,
    field,
    button,
    check,
    radio,
    progress,
    hslider,
    textField,
    textFieldFocused,
    focusTextField,
    blurTextField,
    menu,
    menubar,
    tooltip,
    bubble,
    msgIcon,
    dicon,
    cursor,
    capBtn,
    dispose() {
      if (disposed) return;
      disposed = true;
      _drag.clear();
      textFields.dispose();
      menus.dispose();
    },
  };
}
export type WidgetScope = ReturnType<typeof createWidgetScope>;
