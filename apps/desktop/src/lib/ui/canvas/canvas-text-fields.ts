import type { Renderer } from '../../gfx/context';
import { R } from '../../gfx/primitives';
import type { FontName } from '../../gfx/text';
import type { InputScope } from './input';

export interface TextFieldState {
  text: string;
  caret: number;
  anchor?: number;
}

/** Owns focus, Unicode editing, selection, horizontal scrolling and text-field drawing. */
export function createCanvasTextFields(
  draw: Pick<Renderer, 'TH' | 'rect' | 'text' | 'tw' | 'capH' | 'getCtx'>,
  input: Pick<InputScope, 'io' | 'hit' | 'requestCursor'>,
  now: () => number,
  paintField: (x: number, y: number, w: number, h: number) => void,
) {
  const { rect, text, tw, capH, getCtx } = draw;
  const { hit, io } = input;
  let focus: string | null = null;
  const scroll = new Map<string, number>();
  let disposed = false;

  function textField(
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    s: TextFieldState,
    o: { max?: number; font?: FontName; focused?: boolean; password?: boolean } = {},
  ): TextFieldState & { active: boolean } {
    if (disposed) return { ...s, active: false };
    const r = hit(x, y, w, h);
    if (r.hover) input.requestCursor('ibeam');
    if (focus === id && io.wentDown && !r.hover) focus = null;
    if (r.clicked) focus = id;
    const active = focus === id && (o.focused ?? true);
    paintField(x, y, w, h);
    const font = o.font || 'ui';
    let t = s.text;
    const displayText = (start: number, end = t.length) => {
      const value = t.slice(start, end);
      return o.password ? '*'.repeat(Array.from(value).length) : value;
    };
    // Public offsets are UTF-16 indexes, but neither caret nor selection may split
    // a surrogate pair when a caller supplies an old or clipped position.
    const boundary = (index: number) => {
      let at = Math.max(0, Math.min(Math.trunc(index), t.length));
      if (
        at > 0 &&
        at < t.length &&
        t.charCodeAt(at) >= 0xdc00 &&
        t.charCodeAt(at) <= 0xdfff &&
        t.charCodeAt(at - 1) >= 0xd800 &&
        t.charCodeAt(at - 1) <= 0xdbff
      )
        at--;
      return at;
    };
    const previous = (index: number) => boundary(index - 1);
    const next = (index: number) =>
      Math.min(t.length, index + (t.codePointAt(index)! > 0xffff ? 2 : 1));
    let caret = boundary(s.caret),
      anchor = boundary(s.anchor ?? caret);
    const shift = io.keyDown.has('Shift');
    // Scroll to the caret, preserving the viewport while editing in the middle.
    const pad = 5,
      avail = Math.max(1, w - pad * 2 - 1);
    let vx = boundary(Math.min(scroll.get(id) || 0, caret));
    while (vx < caret && tw(displayText(vx, caret), font) > avail) vx = next(vx);
    while (vx > 0 && tw(displayText(previous(vx)), font) <= avail) vx = previous(vx);
    if (r.clicked && (o.focused ?? true)) {
      const clickX = io.px - x - pad;
      caret = vx;
      while (caret < t.length) {
        const n = next(caret);
        if (clickX < (tw(displayText(vx, caret), font) + tw(displayText(vx, n), font)) / 2) break;
        caret = n;
      }
      if (!shift) anchor = caret;
    }
    if (active) {
      const removeSelection = () => {
        if (anchor === caret) return false;
        const start = Math.min(anchor, caret),
          end = Math.max(anchor, caret);
        t = t.slice(0, start) + t.slice(end);
        caret = anchor = start;
        return true;
      };
      if (io.keyPressed.has('SelectAll')) {
        anchor = 0;
        caret = t.length;
      }
      const typed = Array.from(io.typed).filter((ch) => ch >= ' ' && ch !== '\r' && ch !== '\n');
      if (typed.length) {
        removeSelection();
        const room = o.max ? Math.max(0, o.max - Array.from(t).length) : typed.length;
        const insertion = typed.slice(0, room).join('');
        t = t.slice(0, caret) + insertion + t.slice(caret);
        caret += insertion.length;
        anchor = caret;
      }
      if (io.keyPressed.has('Backspace') && !removeSelection() && caret > 0) {
        const at = previous(caret);
        t = t.slice(0, at) + t.slice(caret);
        caret = anchor = at;
      }
      if (io.keyPressed.has('Delete') && !removeSelection() && caret < t.length) {
        t = t.slice(0, caret) + t.slice(next(caret));
        anchor = caret;
      }
      if (io.keyPressed.has('ArrowLeft')) {
        caret = !shift && anchor !== caret ? Math.min(anchor, caret) : previous(caret);
        if (!shift) anchor = caret;
      }
      if (io.keyPressed.has('ArrowRight')) {
        caret = !shift && anchor !== caret ? Math.max(anchor, caret) : next(caret);
        if (!shift) anchor = caret;
      }
      if (io.keyPressed.has('Home')) {
        caret = 0;
        if (!shift) anchor = caret;
      }
      if (io.keyPressed.has('End')) {
        caret = t.length;
        if (!shift) anchor = caret;
      }
    }
    vx = boundary(Math.min(vx, caret));
    while (vx < caret && tw(displayText(vx, caret), font) > avail) vx = next(vx);
    while (vx > 0 && tw(displayText(previous(vx)), font) <= avail) vx = previous(vx);
    scroll.set(id, vx);
    const ctx = getCtx();
    ctx.save();
    try {
      ctx.beginPath();
      ctx.rect(x + pad, y + 2, avail + 1, h - 4);
      ctx.clip();
      const ty = y + R((h - capH(font)) / 2);
      text(displayText(vx), x + pad, ty, { color: draw.TH.text, font });
      const selectionStart = Math.max(vx, Math.min(anchor, caret)),
        selectionEnd = Math.max(anchor, caret);
      if (active && selectionStart < selectionEnd) {
        const sx = x + pad + tw(displayText(vx, selectionStart), font),
          selected = displayText(selectionStart, selectionEnd);
        rect(sx, y + 3, tw(selected, font), h - 6, draw.TH.sel);
        text(selected, sx, ty, { color: draw.TH.selText, font });
      }
      if (active && anchor === caret && Math.floor(now() / 0.35) % 2 === 0)
        rect(x + pad + tw(displayText(vx, caret), font), y + 4, 1, h - 8, draw.TH.text);
    } finally {
      ctx.restore();
    }
    return { text: t, caret, anchor, active };
  }

  return {
    textField,
    textFieldFocused: () => focus,
    focusTextField(id: string): void {
      if (!disposed) focus = id;
    },
    blurTextField(): void {
      focus = null;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      focus = null;
      scroll.clear();
    },
  };
}
