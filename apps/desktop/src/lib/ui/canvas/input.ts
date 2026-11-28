import type { ResizeCursor } from '../../os/windows/resize';

export type CursorKind = 'arrow' | 'wait' | 'working' | 'ibeam' | ResizeCursor;

export interface HitResult {
  hover: boolean; // pointer inside the rect AND input allowed for the current window
  held: boolean; // hover + button down (draw pressed)
  clicked: boolean; // released over it this frame
  rclicked: boolean; // right-button released over it this frame
}

export interface CompletedClick {
  x: number;
  y: number;
  startX: number;
  startY: number;
  dragged: boolean;
  double: boolean; // paired with an actual preceding non-drag release
}

export interface IO {
  cancelled: boolean; // input ownership was lost (blur, pointer cancellation)
  // pointer, in 640x360 canvas coordinates
  px: number;
  py: number;
  down: boolean;
  wentDown: boolean;
  wentUp: boolean;
  rdown: boolean;
  rwentDown: boolean;
  rwentUp: boolean;
  wheel: number;
  // keyboard: printable characters typed this frame + keys pressed this frame
  typed: string;
  keyboardEvents: readonly { key?: string; typed?: string; modifiers?: InputModifiers }[];
  keyPressed: Set<string>;
  keyDown: Set<string>;
  // what the pointer is over (for the cursor shape): apps set this while drawing
  cursor: CursorKind;
  // double-click detection
  _lastClick: { t: number; x: number; y: number };
  dbl: boolean; // this frame's wentDown was a double-click
  completedClicks: CompletedClick[]; // preserve complete click pairs within one animation frame
}

export interface InputModifiers {
  readonly control: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
}
export interface RawInput {
  cancel?: boolean;
  cancelPointer?: boolean;
  px?: number;
  py?: number;
  down?: boolean;
  rdown?: boolean;
  typed?: string;
  key?: string;
  modifiers?: InputModifiers;
  wheel?: number;
}
export interface ReadonlyIO extends Omit<
  Readonly<IO>,
  'keyDown' | 'keyPressed' | 'keyboardEvents' | 'completedClicks' | '_lastClick'
> {
  readonly keyDown: ReadonlySet<string>;
  readonly keyPressed: ReadonlySet<string>;
  readonly keyboardEvents: readonly Readonly<{
    key?: string;
    typed?: string;
    modifiers?: InputModifiers;
  }>[];
  readonly completedClicks: readonly Readonly<CompletedClick>[];
  readonly _lastClick: Readonly<IO['_lastClick']>;
}
export interface InputScope {
  readonly io: ReadonlyIO;
  hit(x: number, y: number, w: number, h: number): HitResult;
  hitOwned(owner: string, x: number, y: number, w: number, h: number): HitResult;
  consumeKey(key: string): boolean;
  consumeText(): string;
  consumeWheel(): number;
  consumePointer(...events: ('wentDown' | 'wentUp' | 'rwentDown' | 'rwentUp' | 'dbl')[]): void;
  setPointerEnabled(enabled: boolean): void;
  pointerPress(): Readonly<{ x: number; y: number }> | null;
  capture(): void;
  release(): void;
  requestCursor(kind: CursorKind): void;
}

/** Forward reads without exposing Set mutation methods or the callback's backing Set. */
function readonlyKeys(current: () => ReadonlySet<string>): ReadonlySet<string> {
  const view: ReadonlySet<string> = {
    get size() {
      return current().size;
    },
    has: (key) => current().has(key),
    values: () => current().values(),
    keys: () => current().keys(),
    entries: () => current().entries(),
    [Symbol.iterator]: () => current()[Symbol.iterator](),
    forEach(callback, thisArg?: unknown) {
      for (const value of current()) callback.call(thisArg, value, value, view);
    },
    union: (other) => current().union(other),
    intersection: (other) => current().intersection(other),
    difference: (other) => current().difference(other),
    symmetricDifference: (other) => current().symmetricDifference(other),
    isSubsetOf: (other) => current().isSubsetOf(other),
    isSupersetOf: (other) => current().isSupersetOf(other),
    isDisjointFrom: (other) => current().isDisjointFrom(other),
  };
  return Object.freeze(view);
}

export function createInputController() {
  let disposed = false;
  let capturedOwner: string | null = null;
  let pointerCapture: (() => void) | null = null;

  const io: IO = {
    cancelled: false,
    px: 0,
    py: 0,
    down: false,
    wentDown: false,
    wentUp: false,
    rdown: false,
    rwentDown: false,
    rwentUp: false,
    wheel: 0,
    typed: '',
    keyboardEvents: [],
    keyPressed: new Set(),
    keyDown: new Set(),
    cursor: 'arrow',
    _lastClick: { t: -9, x: 0, y: 0 },
    dbl: false,
    completedClicks: [],
  };

  const emptyRecords: readonly never[] = Object.freeze([]);
  const emptyKeys = new Set<string>();
  let keyboardSource: IO['keyboardEvents'] | undefined;
  let keyboardSnapshot: ReadonlyIO['keyboardEvents'] = emptyRecords;
  let clickSource: IO['completedClicks'] | undefined;
  let clickSnapshot: ReadonlyIO['completedClicks'] = emptyRecords;
  const keyboardEvents = () => {
    if (keyboardSource !== io.keyboardEvents) {
      keyboardSource = io.keyboardEvents;
      keyboardSnapshot = Object.freeze(
        io.keyboardEvents.map((event) =>
          Object.freeze({
            ...event,
            ...(event.modifiers ? { modifiers: Object.freeze({ ...event.modifiers }) } : {}),
          }),
        ),
      );
    }
    return keyboardSnapshot;
  };
  const completedClicks = () => {
    if (clickSource !== io.completedClicks) {
      clickSource = io.completedClicks;
      clickSnapshot = Object.freeze(io.completedClicks.map((click) => Object.freeze({ ...click })));
    }
    return clickSnapshot;
  };

  let pending: RawInput[] = [];
  let clockNow = 0;
  let doublePress = false;
  let press: { x: number; y: number } | null = null;
  let pressMoved = false;
  let lastRelease: { t: number; x: number; y: number } | null = null;
  let rightPress: { x: number; y: number } | null = null;
  const gate = { id: null as string | null }; // the window allowed to receive events this frame

  function queueInput(r: RawInput): void {
    if (disposed) return;
    pending.push(r);
  }

  function resetPointer(): void {
    releasePointerCapture();
    capturedOwner = null;
    io.cancelled = true;
    io.down = io.rdown = io.wentDown = io.wentUp = io.rwentDown = io.rwentUp = io.dbl = false;
    io.wheel = 0;
    press = rightPress = null;
    doublePress = false;
    pressMoved = false;
    lastRelease = null;
    io.completedClicks = [];
    io._lastClick = { t: -9, x: 0, y: 0 };
  }

  /** A display reflow invalidates pointer coordinates, never already accepted text or keys. */
  function cancelPointerInput(): void {
    resetPointer();
    io.px = io.py = -1;
    pending = pending.flatMap((event) =>
      event.typed || event.key
        ? [{ typed: event.typed, key: event.key, modifiers: event.modifiers }]
        : [],
    );
    pending.unshift({ cancelPointer: true, px: -1, py: -1 });
  }

  /** Original left-button press, retained when moves and release share the render frame. */
  function pointerPress(): Readonly<{ x: number; y: number }> | null {
    return press ? { ...press } : null;
  }

  function beginFrame(now: number): void {
    if (disposed) return;
    clockNow = now;
    io.cancelled = false;
    io.wentDown = io.wentUp = io.rwentDown = io.rwentUp = io.dbl = false;
    io.completedClicks = [];
    io.wheel = 0;
    io.typed = '';
    const keyboardEvents: { key?: string; typed?: string; modifiers?: InputModifiers }[] = [];
    io.keyboardEvents = keyboardEvents;
    io.keyPressed.clear();
    gate.id = null;
    io.cursor = 'arrow';
    for (const r of pending) {
      if (r.cancel || r.cancelPointer) {
        resetPointer();
      }
      if (r.cancel) {
        io.typed = '';
        keyboardEvents.length = 0;
        io.keyPressed.clear();
        io.keyDown.clear();
      }
      if (r.px !== undefined) io.px = r.px;
      if (r.py !== undefined) io.py = r.py;
      if (io.down && press && Math.max(Math.abs(io.px - press.x), Math.abs(io.py - press.y)) >= 3)
        pressMoved = true;
      if (r.down !== undefined) {
        if (r.down && !io.down) {
          io.wentDown = true;
          press = { x: io.px, y: io.py };
          pressMoved = false;
          const last = io._lastClick;
          io.dbl =
            now - last.t < 0.45 && Math.abs(io.px - last.x) < 6 && Math.abs(io.py - last.y) < 6;
          doublePress = io.dbl;
          io._lastClick = { t: now, x: io.px, y: io.py };
        }
        if (!r.down && io.down) {
          io.wentUp = true;
          io.dbl = doublePress;
          if (press) {
            const paired =
              !pressMoved &&
              !!lastRelease &&
              now - lastRelease.t < 0.45 &&
              Math.abs(io.px - lastRelease.x) < 6 &&
              Math.abs(io.py - lastRelease.y) < 6;
            io.completedClicks.push({
              x: io.px,
              y: io.py,
              startX: press.x,
              startY: press.y,
              dragged: pressMoved,
              double: paired,
            });
            lastRelease = pressMoved ? null : { t: now, x: io.px, y: io.py };
          }
        }
        io.down = r.down;
      }
      if (r.rdown !== undefined) {
        if (r.rdown && !io.rdown) {
          io.rwentDown = true;
          rightPress = { x: io.px, y: io.py };
        }
        if (!r.rdown && io.rdown) io.rwentUp = true;
        io.rdown = r.rdown;
      }
      if (r.wheel) io.wheel += r.wheel;
      if (r.typed) io.typed += r.typed;
      if (r.typed || r.key)
        keyboardEvents.push({
          typed: r.typed,
          key: r.key,
          ...(r.modifiers ? { modifiers: { ...r.modifiers } } : {}),
        });
      if (r.key) {
        io.keyPressed.add(r.key);
        io.keyDown.add(r.key);
      }
    }
    pending = [];
    // A capture-release callback can inspect the queue while it is being built.
    keyboardSource = clickSource = undefined;
  }

  function endFrame(): void {
    // keyUp events are watched directly by the host; keyDown set is pruned there
  }

  /** The shell sets which window (or 'desktop' / 'startmenu') owns events this frame. */
  function setGate(id: string | null): void {
    gate.id = id;
  }
  function gateId(): string | null {
    return gate.id;
  }

  /** Central hit test: a rect is hot only when the pointer is inside it and the gate allows it.
   *  Returns a fresh object so callers may hold it across other widget calls. */
  function hit(x: number, y: number, w: number, h: number): HitResult {
    const inside = io.px >= x && io.px < x + w && io.py >= y && io.py < y + h;
    const hot = gate.id !== null && inside;
    return {
      hover: hot,
      held: hot && io.down,
      clicked:
        hot &&
        io.wentUp &&
        !!press &&
        press.x >= x &&
        press.x < x + w &&
        press.y >= y &&
        press.y < y + h,
      rclicked:
        hot &&
        io.rwentUp &&
        !!rightPress &&
        rightPress.x >= x &&
        rightPress.x < x + w &&
        rightPress.y >= y &&
        rightPress.y < y + h,
    };
  }

  /** Like hit(), but for the gate owner specifically (e.g. desktop-level regions). */
  function hitOwned(owner: string, x: number, y: number, w: number, h: number): HitResult {
    const save = gate.id;
    gate.id = owner;
    const r = hit(x, y, w, h);
    gate.id = save;
    return r;
  }

  const now = () => clockNow;
  function consumeKey(key: string): boolean {
    const consumed = io.keyPressed.delete(key);
    io.keyboardEvents = io.keyboardEvents.filter((event) => event.key !== key);
    return consumed;
  }
  function consumeText(): string {
    const value = io.typed;
    io.typed = '';
    io.keyboardEvents = io.keyboardEvents.filter((event) => !event.typed);
    return value;
  }
  function consumeWheel(): number {
    const value = io.wheel;
    io.wheel = 0;
    return value;
  }
  function consumePointer(
    ...events: ('wentDown' | 'wentUp' | 'rwentDown' | 'rwentUp' | 'dbl')[]
  ): void {
    if (events.length) {
      for (const event of events) io[event] = false;
    } else {
      io.wentDown = io.wentUp = io.rwentDown = io.rwentUp = io.dbl = false;
      io.completedClicks = [];
    }
  }
  function requestCursor(kind: CursorKind): void {
    if (!disposed) io.cursor = kind;
  }
  function ownPointerCapture(release: () => void): () => void {
    releasePointerCapture();
    let active = true;
    const cleanup = () => {
      if (!active) return;
      active = false;
      if (pointerCapture === cleanup) pointerCapture = null;
      release();
    };
    if (disposed) cleanup();
    else pointerCapture = cleanup;
    return cleanup;
  }
  function releasePointerCapture(): void {
    const release = pointerCapture;
    pointerCapture = null;
    release?.();
  }
  function scoped(
    owner: string,
    enabled: boolean | (() => boolean) = true,
    keyboard?: boolean | (() => boolean),
  ): InputScope {
    let pointerEnabled = true;
    const keysAllowed = () =>
      keyboard === undefined
        ? allowed()
        : !disposed && (typeof keyboard === 'function' ? keyboard() : keyboard);
    const allowed = () =>
      pointerEnabled &&
      !disposed &&
      (typeof enabled === 'function' ? enabled() : enabled) &&
      (capturedOwner !== null ? capturedOwner === owner : gate.id === owner);
    const pressed = readonlyKeys(() => (keysAllowed() ? io.keyPressed : emptyKeys));
    const held = readonlyKeys(() => {
      if (!keysAllowed()) return emptyKeys;
      const modifiers = io.keyboardEvents.findLast((event) => event.modifiers)?.modifiers;
      if (!modifiers) return io.keyDown;
      const keys = new Set(io.keyDown);
      for (const [key, enabled] of [
        ['Control', modifiers.control],
        ['Shift', modifiers.shift],
        ['Alt', modifiers.alt],
      ] as const) {
        if (enabled) keys.add(key);
        else keys.delete(key);
      }
      return keys;
    });
    const view: ReadonlyIO = Object.freeze({
      get px() {
        return io.px;
      },
      get py() {
        return io.py;
      },
      get cursor() {
        return io.cursor;
      },
      get cancelled() {
        return io.cancelled;
      },
      get down() {
        return allowed() && io.down;
      },
      get wentDown() {
        return allowed() && io.wentDown;
      },
      get wentUp() {
        return allowed() && io.wentUp;
      },
      get rdown() {
        return allowed() && io.rdown;
      },
      get rwentDown() {
        return allowed() && io.rwentDown;
      },
      get rwentUp() {
        return allowed() && io.rwentUp;
      },
      get wheel() {
        return allowed() ? io.wheel : 0;
      },
      get typed() {
        return keysAllowed() ? io.typed : '';
      },
      get keyPressed() {
        return pressed;
      },
      get keyDown() {
        return held;
      },
      get keyboardEvents() {
        return keysAllowed() ? keyboardEvents() : emptyRecords;
      },
      get _lastClick() {
        return Object.freeze({ ...io._lastClick });
      },
      get dbl() {
        return allowed() && io.dbl;
      },
      get completedClicks() {
        return allowed() ? completedClicks() : emptyRecords;
      },
    });
    const scopedHit = (x: number, y: number, w: number, h: number): HitResult => {
      if (!allowed()) return { hover: false, held: false, clicked: false, rclicked: false };
      return hitOwned(owner, x, y, w, h);
    };
    return {
      io: view,
      hit: scopedHit,
      hitOwned: (_owner, x, y, w, h) => scopedHit(x, y, w, h),
      consumeKey: (key) => keysAllowed() && consumeKey(key),
      consumeText: () => (keysAllowed() ? consumeText() : ''),
      consumeWheel: () => (allowed() ? consumeWheel() : 0),
      consumePointer: (...events) => {
        if (allowed()) consumePointer(...events);
      },
      setPointerEnabled: (value) => {
        pointerEnabled = value;
      },
      pointerPress: () => {
        const origin = allowed() ? pointerPress() : null;
        return origin && Object.freeze(origin);
      },
      requestCursor: (kind) => {
        if (allowed()) requestCursor(kind);
      },
      capture: () => {
        if (allowed()) capturedOwner = owner;
      },
      release: () => {
        if (capturedOwner === owner) capturedOwner = null;
      },
    };
  }
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    pending = [];
    resetPointer();
    io.typed = '';
    io.keyboardEvents = [];
    io.keyDown.clear();
    io.keyPressed.clear();
    keyboardSource = clickSource = undefined;
    keyboardSnapshot = clickSnapshot = emptyRecords;
    gate.id = null;
  }
  return {
    io,
    queueInput,
    cancelPointerInput,
    pointerPress,
    beginFrame,
    endFrame,
    setGate,
    gateId,
    hit,
    hitOwned,
    now,
    scoped,
    consumeKey,
    consumeText,
    consumeWheel,
    consumePointer,
    requestCursor,
    ownPointerCapture,
    releasePointerCapture,
    dispose,
  };
}
export type InputController = ReturnType<typeof createInputController>;
