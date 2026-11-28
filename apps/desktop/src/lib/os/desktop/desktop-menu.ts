import { StartNavigation, type StartEntry } from './start-menu';
import { popupLayout } from '../../ui/canvas/layout';
import type { Renderer } from '../../gfx/context';
import type { InputController } from '../../ui/canvas/input';
import type { WidgetScope } from '../../ui/canvas/widgets';

/** Desktop/taskbar popups share the Start menu's keyboard traversal rules. */
export class DesktopMenu {
  constructor(
    private readonly renderer: Renderer,
    private readonly input: InputController,
    private readonly widgets: WidgetScope,
  ) {}
  private nav = new StartNavigation([]);
  private keyboard = true;
  private pointer = { x: 0, y: 0 };
  private origin = { x: 0, y: 0 };
  bounds: { x: number; y: number; w: number; h: number } | null = null;
  open(x: number, y: number, entries: StartEntry[]): void {
    this.nav = new StartNavigation(entries);
    this.nav.key('Home');
    this.keyboard = true;
    this.pointer = { x: this.input.io.px, y: this.input.io.py };
    this.origin = { x, y };
    const w = Math.min(
      this.renderer.W,
      Math.max(...entries.map((e) => this.renderer.tw(e.label))) + 44,
    );
    const h = 6 + entries.reduce((sum, e) => sum + (e.label === '-' ? 8 : 18), 0);
    this.bounds = {
      x: Math.round(Math.max(0, Math.min(x, this.renderer.W - w))),
      y: Math.round(Math.max(0, Math.min(y, this.renderer.H - 22 - h))),
      w,
      h,
    };
  }
  close(): void {
    this.bounds = null;
  }
  key(key: string): string | undefined {
    if (!this.bounds) return;
    this.keyboard = true;
    this.pointer = { x: this.input.io.px, y: this.input.io.py };
    const command = this.nav.key(key);
    if (command) this.close();
    return command;
  }
  draw(): string | undefined {
    const bounds = this.bounds;
    if (!bounds) return;
    if (this.input.io.cancelled) {
      this.close();
      return;
    }
    if (this.pointer.x !== this.input.io.px || this.pointer.y !== this.input.io.py)
      this.keyboard = false;
    this.pointer = { x: this.input.io.px, y: this.input.io.py };
    let x = this.origin.x,
      y = this.origin.y;
    const panels: { x: number; y: number; w: number; h: number }[] = [];
    for (const [depth, entries] of this.nav.levels().entries()) {
      const labels = entries.map(
        (e) => `${e.disabled ? '~' : ''}${e.label}${e.children ? '>' : ''}`,
      );
      const layout = popupLayout(x, y, labels, this.renderer.tw, {
        w: this.renderer.W,
        h: this.renderer.H - 22,
      });
      panels.push(layout);
      const result = this.widgets.menu(
        layout.x,
        layout.y,
        labels,
        this.nav.selections[depth],
        'desktopmenu',
        {
          keyboard: this.keyboard,
          presentation: entries,
        },
      );
      if (!this.keyboard && result.hovered >= 0) {
        if (this.nav.selections[depth] !== result.hovered) this.nav.select(depth, result.hovered);
        if (entries[result.hovered]?.children)
          this.nav.hover(depth, result.hovered, performance.now() / 1000);
      }
      if (result.clicked >= 0) {
        this.nav.select(depth, result.clicked);
        const command = this.nav.activate(depth);
        if (command) this.close();
        return command;
      }
      x = layout.x + layout.w - 2;
      y = layout.rows[this.nav.selections[depth]]?.y ?? layout.y;
    }
    const left = Math.min(...panels.map((panel) => panel.x)),
      top = Math.min(...panels.map((panel) => panel.y));
    this.bounds = {
      x: left,
      y: top,
      w: Math.max(...panels.map((panel) => panel.x + panel.w)) - left,
      h: Math.max(...panels.map((panel) => panel.y + panel.h)) - top,
    };
    if (
      (this.input.io.wentDown || this.input.io.rwentDown) &&
      !panels.some(
        (panel) => this.input.hitOwned('desktopmenu', panel.x, panel.y, panel.w, panel.h).hover,
      )
    )
      this.close();
  }
}
