import { reflowIconPositions, type IconBounds } from './desktop-icon-layout';

export interface DesktopPoint {
  x: number;
  y: number;
}
export interface DesktopClick extends DesktopPoint {
  startX: number;
  startY: number;
  dragged: boolean;
  double: boolean;
}
export interface DesktopItem extends DesktopPoint {
  id: string;
  w: number;
  h: number;
}
export interface SelectionRect extends DesktopPoint {
  w: number;
  h: number;
}
type Gesture = {
  kind: 'box' | 'icons';
  start: DesktopPoint;
  current: DesktopPoint;
  id: string | null;
  additive: boolean;
  moved: boolean;
  selected: Set<string>;
  focused: string | null;
  positions: Map<string, DesktopPoint>;
};

const contains = (r: SelectionRect, p: DesktopPoint) =>
  p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
const intersects = (a: SelectionRect, b: SelectionRect) =>
  a.w > 0 && a.h > 0 && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Owns selection and gesture transactions; drawing and DOM events stay in the shell. */
export class DesktopSelection {
  readonly items: DesktopItem[];
  readonly selected = new Set<string>();
  focused: string | null = null;
  private gesture: Gesture | null = null;
  private lastClick: string | null = null;

  constructor(
    items: DesktopItem[],
    private width: number,
    private height: number,
  ) {
    this.items = items.map((item) => ({ ...item, x: Math.round(item.x), y: Math.round(item.y) }));
  }

  resize(width: number, height: number, reserved: readonly IconBounds[] = []): void {
    this.reconcile(this.items, { width, height, reserved });
  }

  /** Replaces the icon set while retaining placement and selection for surviving IDs. */
  reconcile(
    items: readonly DesktopItem[],
    options: {
      width?: number;
      height?: number;
      reserved?: readonly IconBounds[];
      preservePositions?: boolean;
    } = {},
  ): void {
    this.cancel();
    const previous = new Map<string, DesktopPoint>(
      options.preservePositions === false
        ? []
        : this.items.map((item) => [item.id, { x: item.x, y: item.y }]),
    );
    const selected = new Set(this.selected);
    const focused = this.focused;
    const width = options.width ?? this.width;
    const height = options.height ?? this.height;
    const positions = reflowIconPositions(items, width, height, options.reserved, previous);
    this.width = width;
    this.height = height;
    this.items.splice(0, this.items.length, ...positions);

    this.selected.clear();
    for (const id of selected) if (this.items.some((item) => item.id === id)) this.selected.add(id);
    this.focused =
      focused && this.items.some((item) => item.id === focused)
        ? focused
        : (this.items.find((item) => this.selected.has(item.id))?.id ?? null);
    this.lastClick = null;
  }

  get active(): boolean {
    return this.gesture !== null;
  }
  get dragging(): boolean {
    return this.gesture?.kind === 'icons' && this.gesture.moved;
  }
  get marquee(): SelectionRect | null {
    const gesture = this.gesture;
    if (!gesture || gesture.kind !== 'box' || !gesture.moved) return null;
    return {
      x: Math.min(gesture.start.x, gesture.current.x),
      y: Math.min(gesture.start.y, gesture.current.y),
      w: Math.abs(gesture.current.x - gesture.start.x),
      h: Math.abs(gesture.current.y - gesture.start.y),
    };
  }

  itemAt(point: DesktopPoint): DesktopItem | undefined {
    return this.items.findLast((item) => contains(item, point));
  }
  private point(point: DesktopPoint): DesktopPoint {
    return {
      x: Math.max(0, Math.min(this.width, Math.round(point.x))),
      y: Math.max(0, Math.min(this.height, Math.round(point.y))),
    };
  }
  private replace(ids: Iterable<string>): void {
    this.selected.clear();
    for (const id of ids) this.selected.add(id);
  }

  begin(point: DesktopPoint, additive = false): void {
    if (this.gesture) this.cancel();
    const start = this.point(point),
      item = this.itemAt(start);
    this.gesture = {
      kind: item ? 'icons' : 'box',
      id: item?.id ?? null,
      start,
      current: start,
      additive,
      moved: false,
      selected: new Set(this.selected),
      focused: this.focused,
      positions: new Map(this.items.map((icon) => [icon.id, { x: icon.x, y: icon.y }])),
    };
    if (item) {
      this.focused = item.id;
      if (!this.selected.has(item.id)) {
        if (!additive) this.selected.clear();
        this.selected.add(item.id);
      }
    } else {
      if (!additive) this.selected.clear();
      this.focused = null;
    }
  }

  update(point: DesktopPoint): void {
    const gesture = this.gesture;
    if (!gesture) return;
    gesture.current = this.point(point);
    let dx = gesture.current.x - gesture.start.x,
      dy = gesture.current.y - gesture.start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) >= 3) gesture.moved = true;
    if (!gesture.moved) return;
    this.lastClick = null;
    if (gesture.kind === 'box') {
      const box = this.marquee!;
      this.replace(gesture.additive ? gesture.selected : []);
      for (const item of this.items) if (intersects(box, item)) this.selected.add(item.id);
      this.focused = this.items.find((item) => this.selected.has(item.id))?.id ?? null;
      return;
    }
    const icons = this.items.filter((item) => this.selected.has(item.id));
    if (!icons.length) return;
    const left = Math.min(...icons.map((item) => gesture.positions.get(item.id)!.x));
    const top = Math.min(...icons.map((item) => gesture.positions.get(item.id)!.y));
    const right = Math.max(...icons.map((item) => gesture.positions.get(item.id)!.x + item.w));
    const bottom = Math.max(...icons.map((item) => gesture.positions.get(item.id)!.y + item.h));
    dx = Math.max(-left, Math.min(this.width - right, dx));
    dy = Math.max(-top, Math.min(this.height - bottom, dy));
    for (const item of icons) {
      const origin = gesture.positions.get(item.id)!;
      item.x = origin.x + dx;
      item.y = origin.y + dy;
    }
  }

  finish(
    point: DesktopPoint,
    doubleClick = false,
    completedClicks?: readonly DesktopClick[],
  ): { activate?: string; dragged: boolean } {
    this.update(point);
    const gesture = this.gesture;
    if (!gesture) return { dragged: false };
    if (completedClicks?.some((click) => click.dragged)) gesture.moved = true;
    let activate: string | undefined;
    if (!gesture.moved && gesture.id) {
      if (gesture.additive) {
        if (gesture.selected.has(gesture.id)) this.selected.delete(gesture.id);
        this.lastClick = null;
      } else {
        this.replace([gesture.id]);
        const onIcon = (click: DesktopClick | undefined) =>
          !!click &&
          !click.dragged &&
          this.itemAt(click)?.id === gesture.id &&
          this.itemAt({ x: click.startX, y: click.startY })?.id === gesture.id;
        const latest = completedClicks?.at(-1),
          previous = completedClicks?.at(-2);
        const actualClick = completedClicks === undefined || onIcon(latest);
        // Batched pointer events may contain both releases before the shell draws once.
        const paired =
          completedClicks === undefined
            ? doubleClick && this.lastClick === gesture.id
            : !!latest?.double &&
              onIcon(latest) &&
              (onIcon(previous) || (completedClicks.length === 1 && this.lastClick === gesture.id));
        if (paired) activate = gesture.id;
        this.lastClick = !activate && actualClick ? gesture.id : null;
      }
    } else this.lastClick = null;
    this.gesture = null;
    return { activate, dragged: gesture.moved };
  }

  cancel(): void {
    const gesture = this.gesture;
    if (!gesture) return;
    for (const item of this.items) Object.assign(item, gesture.positions.get(item.id));
    this.replace(gesture.selected);
    this.focused = gesture.focused;
    this.gesture = null;
    this.lastClick = null;
  }

  clear(): void {
    this.cancel();
    this.selected.clear();
    this.focused = null;
    this.lastClick = null;
  }
  selectAll(): void {
    this.replace(this.items.map((item) => item.id));
    this.focused ??= this.items[0]?.id ?? null;
    this.lastClick = null;
  }
  select(id: string, additive = false): void {
    if (!this.items.some((item) => item.id === id)) return;
    if (!additive) this.selected.clear();
    this.selected.add(id);
    this.focused = id;
    this.lastClick = null;
  }
  toggleFocused(): void {
    if (!this.focused) this.focused = this.items[0]?.id ?? null;
    if (!this.focused) return;
    if (this.selected.has(this.focused)) this.selected.delete(this.focused);
    else this.selected.add(this.focused);
    this.lastClick = null;
  }
  context(point: DesktopPoint): string | undefined {
    const item = this.itemAt(point);
    if (item) {
      if (!this.selected.has(item.id)) this.replace([item.id]);
      this.focused = item.id;
    }
    this.lastClick = null;
    return item?.id;
  }

  navigate(key: string, additive = false, focusOnly = false): void {
    const current = this.items.find((item) => item.id === this.focused);
    let next = current;
    if (!current || key === 'Home') next = this.items[0];
    else if (key === 'End') next = this.items.at(-1);
    else {
      const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
      const sign = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
      next =
        this.items
          .filter((item) => item !== current)
          .map((item) => {
            const dx = item.x - current.x,
              dy = item.y - current.y;
            const forward = (horizontal ? dx : dy) * sign,
              cross = Math.abs(horizontal ? dy : dx);
            return { item, forward, score: forward + cross * 3 };
          })
          .filter((candidate) => candidate.forward > 0)
          .sort((a, b) => a.score - b.score)[0]?.item ?? current;
    }
    if (!next) return;
    if (focusOnly) {
      this.focused = next.id;
      this.lastClick = null;
    } else this.select(next.id, additive);
  }
}
