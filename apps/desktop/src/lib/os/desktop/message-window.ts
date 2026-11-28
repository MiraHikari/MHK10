import { R } from '../../gfx/primitives';
import type { Renderer } from '../../gfx/context';
import type { InputController } from '../../ui/canvas/input';
import type { WidgetScope } from '../../ui/canvas/widgets';
import { wrapCopy } from '../../ui/text/copy';
import type { MsgSpec } from '../host/app-contracts';
import type { WindowMessage, WindowSessions } from '../windows/window-sessions';
import type { WinState } from '../windows/wm';

export function messageWindowBounds(
  measure: (text: string, font?: 'bold') => number,
  spec: Pick<MsgSpec, 'title' | 'lines' | 'buttons' | 'icon' | 'check'>,
  screen: { w: number; h: number },
): { x: number; y: number; w: number; h: number } {
  const buttons = spec.buttons?.length ? spec.buttons : ['OK'];
  const textWidth = Math.max(
    ...spec.lines.map((line) => measure(line)),
    measure(spec.title, 'bold') + 40,
    buttons.length * 70 + 20,
    spec.check ? measure(spec.check.label) + 20 : 0,
    180,
  );
  const w = Math.min(screen.w - 8, R((spec.icon ? 58 : 14) + textWidth + 18));
  const columns = Math.max(1, Math.min(buttons.length, Math.floor((w - 12) / 70)));
  const lines = spec.lines.flatMap((line) =>
    wrapCopy(line, w - (spec.icon ? 58 : 14) - 28, measure),
  );
  const h = Math.min(
    screen.h - 30,
    34 +
      Math.max(spec.icon ? 32 : 0, lines.length * 13) +
      12 +
      Math.ceil(buttons.length / columns) * 29 +
      5 +
      (spec.check ? 22 : 0),
  );
  return {
    x: Math.max(4, R(screen.w / 2 - w / 2)),
    y: Math.max(4, R(screen.h / 2 - h / 2 - 8)),
    w,
    h,
  };
}

export interface MessageWindowDeps {
  sessions: WindowSessions;
  renderer: Renderer;
  widgets: WidgetScope;
  input: InputController;
  width(): number;
  height(): number;
  focused(id: string): boolean;
  systemInput(): boolean;
  interacting(): boolean;
  drawChrome(id: string): unknown;
  close(id: string): void;
  playClick(): void;
  activate(message: WindowMessage, index: number, checked: boolean | undefined): void;
}

/** Modal message dialogs: placement, keyboard focus, checkbox and buttons. */
export function createMessageWindows(deps: MessageWindowDeps) {
  let count = 0;
  let disposed = false;
  const offsets = new Map<string, number>();
  const answered = new Set<string>();
  return {
    open(spec: MsgSpec): void {
      if (disposed) return;
      const id = 'msg' + ++count;
      const bounds = messageWindowBounds(deps.renderer.tw, spec, {
        w: deps.width(),
        h: deps.height(),
      });
      deps.sessions.open(
        {
          id,
          appId: '$msg',
          title: spec.title,
          x: bounds.x,
          y: bounds.y,
          w: bounds.w,
          h: bounds.h,
          ctl: 'x',
          noClose: spec.noClose,
          modal: true,
        },
        { message: spec },
      );
    },
    paint(win: WinState): void {
      if (disposed) return;
      const message = deps.sessions.message(win.id);
      const spec = message && { ...message, check: message.check && { ...message.check } };
      if (!spec) return;
      if (!deps.drawChrome(win.id)) return;
      const systemInput = deps.systemInput();
      const interacting = deps.interacting();
      if (interacting || systemInput) deps.input.setGate(null);
      if (spec.icon) deps.widgets.msgIcon(spec.icon, win.x + 14, win.y + 32);
      const bx = win.x + (spec.icon ? 58 : 14);
      const buttons = spec.buttons?.length ? spec.buttons : ['OK'];
      const columns = Math.max(1, Math.min(buttons.length, Math.floor((win.w - 12) / 70)));
      const buttonRows = Math.ceil(buttons.length / columns);
      const buttonTop = win.y + win.h - 3 - buttonRows * 29;
      const checkY = buttonTop - 24;
      const textBottom = (spec.check ? checkY : buttonTop) - 6;
      const lines = spec.lines.flatMap((line) =>
        wrapCopy(line, win.x + win.w - bx - 28, deps.renderer.tw),
      );
      const rows = Math.max(1, Math.floor((textBottom - win.y - 34) / 13));
      const maxTop = Math.max(0, lines.length - rows);
      let top = Math.min(maxTop, offsets.get(win.id) ?? 0);
      const focusCount = buttons.length + (spec.check ? 1 : 0);
      const focused = !systemInput && !interacting && deps.focused(win.id);
      const defaultFocus = Number.isInteger(spec.def) ? (spec.def ?? 0) : 0;
      spec.def = ((defaultFocus % focusCount) + focusCount) % focusCount;
      if (focused) {
        const direction =
          deps.input.io.keyPressed.has('ArrowLeft') ||
          (deps.input.io.keyPressed.has('Tab') && deps.input.io.keyDown.has('Shift'))
            ? -1
            : deps.input.io.keyPressed.has('ArrowRight') || deps.input.io.keyPressed.has('Tab')
              ? 1
              : 0;
        if (direction) {
          spec.def = ((spec.def ?? 0) + direction + focusCount) % focusCount;
          deps.sessions.updateMessage(win.id, { def: spec.def });
          deps.input.consumeKey('Tab');
          deps.input.consumeKey('ArrowLeft');
          deps.input.consumeKey('ArrowRight');
        }
        if (deps.input.consumeKey('PageDown')) top += rows;
        if (deps.input.consumeKey('PageUp')) top -= rows;
        if (deps.input.consumeKey('Home')) top = 0;
        if (deps.input.consumeKey('End')) top = maxTop;
      }
      if (
        deps.input.hit(bx, win.y + 30, win.x + win.w - bx - 8, textBottom - win.y - 30).hover &&
        deps.input.io.wheel
      ) {
        top += Math.sign(deps.input.io.wheel) * 3;
        deps.input.consumeWheel();
      }
      if (maxTop) {
        const x = win.x + win.w - 22;
        if (deps.widgets.button(x, win.y + 31, 16, 16, '^', { disabled: top <= 0 })) top--;
        if (deps.widgets.button(x, textBottom - 16, 16, 16, 'v', { disabled: top >= maxTop }))
          top++;
      }
      top = Math.max(0, Math.min(maxTop, top));
      offsets.set(win.id, top);
      lines
        .slice(top, top + rows)
        .forEach((line, index) =>
          deps.renderer.text(line, bx, win.y + 34 + index * 13, { color: deps.renderer.TH.text }),
        );
      if (spec.check) {
        const keyboard = focused && spec.def === buttons.length;
        if (keyboard)
          deps.widgets.bevel(
            bx - 2,
            checkY - 3,
            Math.min(win.x + win.w - bx - 12, deps.renderer.tw(spec.check.label) + 23),
            19,
            'sunken',
          );
        const toggled = deps.widgets.check(
          bx,
          checkY,
          deps.renderer.fitText(spec.check.label, win.x + win.w - bx - 30),
          spec.check.checked,
        );
        if (
          toggled ||
          (keyboard && (deps.input.io.keyPressed.has(' ') || deps.input.io.keyPressed.has('Enter')))
        ) {
          spec.check.checked = !spec.check.checked;
          deps.sessions.updateMessage(win.id, { checked: spec.check.checked });
          deps.input.consumeKey(' ');
          deps.input.consumeKey('Enter');
          deps.input.consumeText();
        }
      }
      if (focused && deps.input.io.keyPressed.has('Escape') && !spec.noClose) {
        deps.input.consumeKey('Escape');
        deps.input.consumeText();
        deps.close(win.id);
        return;
      }
      for (const [index, label] of buttons.entries()) {
        const row = Math.floor(index / columns);
        const rowCount = Math.min(columns, buttons.length - row * columns);
        const x = win.x + R((win.w - (rowCount * 70 - 8)) / 2) + (index % columns) * 70;
        if (
          deps.widgets.button(x, buttonTop + row * 29, 62, 21, label, {
            def: (spec.def ?? 0) === index,
          }) ||
          (focused && deps.input.io.keyPressed.has('Enter') && (spec.def ?? 0) === index)
        ) {
          deps.input.consumeKey('Enter');
          deps.input.consumeText();
          deps.playClick();
          answered.add(win.id);
          deps.close(win.id);
          deps.activate(spec, index, spec.check?.checked);
          return;
        }
      }
    },
    remove(id: string, message?: WindowMessage): void {
      offsets.delete(id);
      if (!answered.delete(id) && !disposed) message?.onDismiss?.();
    },
    dispose(): void {
      disposed = true;
      offsets.clear();
      answered.clear();
    },
  };
}

export type MessageWindows = ReturnType<typeof createMessageWindows>;
