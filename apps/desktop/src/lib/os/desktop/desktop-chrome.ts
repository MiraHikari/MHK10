import type { Renderer } from '../../gfx/context';
import { C } from '../../gfx/palette';
import { createTooltipDelay } from '../../gfx/timing';
import type { Bounds } from '../../ui/canvas/layout';
import type { WidgetScope } from '../../ui/canvas/widgets';
import { DesktopMenu } from './desktop-menu';
import type { InputController } from '../../ui/canvas/input';
import { StartNavigation, type StartEntry } from './start-menu';
import { taskbarLayout, revealTask, type TaskbarOptions } from './taskbar-model';
import type { FontName } from '../../gfx/text';

export interface ChromeCommand {
  readonly command: string;
  readonly launchBounds?: Readonly<Bounds>;
}

export interface TaskbarPaint {
  modal: boolean;
  systemInput: boolean;
  interacting: boolean;
  gated: string | null;
  tasks: readonly { id: string; title: string; icon?: string; minimized: boolean }[];
  quickApps: readonly { id: string; settingId: string; label: string; icon: string }[];
  contexts: readonly { id: string; title: string; icon: string }[];
  clock: string;
  clockHint: string;
  showLabels: boolean;
  layout: ReturnType<typeof taskbarLayout>;
  risk: { value: number; text: string; color: string } | null;
  canRestoreDesktop: boolean;
  volume: number;
  muted: boolean;
  time: number;
  focused(): string | null;
  truncate(label: string, font: FontName, width: number): string;
  closeSystemMenu(): void;
  playClick(): void;
  showDesktop(): void;
  restoreDesktop(): void;
  open(id: string, origin?: Bounds): void;
  activateTask(id: string, minimized: boolean): void;
  openSystemMenu(id: string, x: number, y: number): void;
  setVolume(value: number): void;
  toggleMuted(): void;
  openBarMenu(x: number, y: number): void;
}

const copyEntries = (entries: readonly StartEntry[]): StartEntry[] =>
  entries.map((entry) => ({
    ...entry,
    ...(entry.children ? { children: copyEntries(entry.children) } : {}),
  }));

/** Owns desktop menu interaction, task overflow, transient occlusion and hover lifetime. */
export function createDesktopChrome(
  renderer: Renderer,
  input: InputController,
  widgets: WidgetScope,
  entries: readonly StartEntry[],
) {
  let originalEntries = copyEntries(entries);
  const startNav = new StartNavigation(copyEntries(entries));
  let readEntries: () => readonly StartEntry[] = () => originalEntries;
  let restrictedCommands: readonly string[] = [];
  const desktopMenu = new DesktopMenu(renderer, input, widgets);
  const tooltipDelay = createTooltipDelay();
  let startOpen = false;
  let startKeyboard = false;
  let startPointerX = -1;
  let startPointerY = -1;
  let startLaunchBounds: Bounds | undefined;
  let startBounds: Bounds[] = [];
  let transientBounds: Bounds[] = [];
  let volumeOpen = false;
  let taskOffset = 0;
  let taskFocus: string | null = null;
  let taskCapacity = 1;
  let maxTaskOffset = 0;
  let disposed = false;

  const closeStart = () => {
    startOpen = false;
    startBounds = [];
    startLaunchBounds = undefined;
    startNav.clearHover();
  };

  const activate = (command: string | undefined, origin?: Bounds): ChromeCommand | undefined => {
    if (!command) return;
    const result = Object.freeze({
      command,
      ...(origin ? { launchBounds: Object.freeze({ ...origin }) } : {}),
    });
    closeStart();
    return result;
  };

  function drawStartMenu(time: number, blocked = false): ChromeCommand | undefined {
    if (disposed || !startOpen) return;
    if (blocked) {
      closeStart();
      return;
    }
    if (input.io.px !== startPointerX || input.io.py !== startPointerY) startKeyboard = false;
    startPointerX = input.io.px;
    startPointerY = input.io.py;
    for (const key of [...input.io.keyPressed].filter(
      (key) =>
        key.length === 1 ||
        [
          'ArrowDown',
          'ArrowUp',
          'ArrowRight',
          'ArrowLeft',
          'Home',
          'End',
          'Enter',
          'Escape',
          'Alt',
        ].includes(key),
    )) {
      if (input.consumeKey(key)) {
        input.consumeText();
        startKeyboard = true;
        startNav.clearHover();
        const selected = activate(startNav.key(key), startLaunchBounds);
        if (selected) return selected;
      }
    }
    const levels = startNav.levels();
    let parentRowY = 0;
    let hovered = false;
    startBounds = [];
    for (let depth = 0; depth < levels.length; depth++) {
      const menuEntries = levels[depth];
      const height =
        6 + menuEntries.reduce((sum, entry) => sum + (entry.label === '-' ? 8 : 18), 0);
      const width = Math.max(...menuEntries.map((entry) => renderer.tw(entry.label))) + 44;
      const rail = depth === 0 ? 18 : 0;
      const parent = startBounds[depth - 1];
      const x =
        depth === 0 ? 2 + rail : Math.max(0, Math.min(parent.x + parent.w - 2, renderer.W - width));
      const y = Math.max(
        0,
        Math.min(depth === 0 ? renderer.H - 22 - height : parentRowY - 3, renderer.H - 22 - height),
      );
      const bounds = { x: x - rail, y, w: width + rail, h: height };
      startBounds.push(bounds);
      if (rail) {
        widgets.bevel(bounds.x, y, bounds.w, height, 'window');
        renderer.rect(bounds.x + 3, y + 3, 17, height - 6, renderer.TH.shadow);
        const context = renderer.getCtx();
        context.save();
        try {
          context.translate(bounds.x + 6, y + height - 9);
          context.rotate(-Math.PI / 2);
          renderer.text('MHK10', 0, 0, { font: 'bold', color: C.silver });
        } finally {
          context.restore();
        }
      }
      widgets.bevel(x, y, width, height, 'window');
      let rowY = y + 3;
      const rows = menuEntries.map((entry) => {
        const top = rowY;
        rowY += entry.label === '-' ? 8 : 18;
        return {
          top,
          hit: entry.label === '-' ? null : input.hitOwned('startmenu', x + 3, top, width - 6, 18),
        };
      });
      const result = {
        hovered: startKeyboard ? -1 : rows.findIndex((row) => row.hit?.hover),
        clicked: rows.findIndex((row) => row.hit?.clicked),
      };
      const selected = result.hovered >= 0 ? result.hovered : startNav.selections[depth];
      menuEntries.forEach((entry, index) => {
        const top = rows[index].top;
        if (entry.label === '-') {
          renderer.rect(x + 4, top + 3, width - 8, 1, renderer.TH.shadow);
          renderer.rect(x + 4, top + 4, width - 8, 1, renderer.TH.hi);
          return;
        }
        const active = index === selected && !entry.disabled;
        if (active) renderer.rect(x + 3, top, width - 6, 18, renderer.TH.sel);
        if (entry.icon) renderer.spr(entry.icon, x + 4, top + 1);
        const color = active
          ? renderer.TH.selText
          : entry.disabled
            ? renderer.TH.shadow
            : renderer.TH.text;
        const font = entry.default ? 'bold' : 'ui';
        renderer.text(entry.label, x + 22, top + 5, { color, font });
        const mnemonic = entry.mnemonic ?? entry.label.trim().charAt(0);
        const position = entry.label.toLowerCase().indexOf(mnemonic.toLowerCase());
        if (mnemonic && position >= 0)
          renderer.rect(
            x + 22 + renderer.tw(entry.label.slice(0, position), font),
            top + 14,
            renderer.tw(entry.label[position], font),
            1,
            color,
          );
        if (entry.children)
          for (let j = 0; j < 4; j++)
            renderer.rect(x + width - 12 + j, top + 5 + j, 1, 7 - 2 * j, color);
        if (index === startNav.selections[depth]) {
          parentRowY = top;
          startLaunchBounds = { x: x + 3, y: top, w: width - 6, h: 18 };
        }
      });
      if (result.hovered >= 0) {
        hovered = true;
        startNav.hover(depth, result.hovered, time);
      }
      if (result.clicked >= 0) {
        startNav.select(depth, result.clicked);
        return activate(startNav.activate(depth), {
          x: x + 3,
          y: rows[result.clicked].top,
          w: width - 6,
          h: 18,
        });
      }
    }
    if (!hovered) startNav.clearHover();
    const inside = startBounds.some(
      (bounds) =>
        input.io.px >= bounds.x &&
        input.io.px < bounds.x + bounds.w &&
        input.io.py >= bounds.y &&
        input.io.py < bounds.y + bounds.h,
    );
    if (
      input.io.wentDown &&
      !inside &&
      !(input.io.px >= 2 && input.io.px < 52 && input.io.py >= renderer.H - 22)
    )
      closeStart();
  }

  const applyRestrictions = () => {
    const disabled = new Set(restrictedCommands);
    const update = (current: StartEntry[], original: readonly StartEntry[]) => {
      current.forEach((entry, index) => {
        entry.disabled = original[index]?.disabled || disabled.has(entry.command ?? '');
        if (entry.children) update(entry.children, original[index]?.children ?? []);
      });
    };
    update(startNav.entries, originalEntries);
  };
  const reloadStartEntries = () => {
    const next = copyEntries(readEntries());
    originalEntries = copyEntries(next);
    startNav.entries.splice(0, startNav.entries.length, ...copyEntries(next));
    applyRestrictions();
  };
  const toggleStart = () => {
    if (disposed) return;
    const wasOpen = startOpen;
    closeStart();
    desktopMenu.close();
    if (!wasOpen) reloadStartEntries();
    startNav.reset();
    startOpen = !wasOpen;
  };
  const closeContext = () => {
    desktopMenu.close();
  };
  const openContext = (x: number, y: number, menuEntries: readonly StartEntry[]) => {
    if (disposed) return;
    closeStart();
    desktopMenu.open(x, y, copyEntries(menuEntries));
  };
  const toggleVolume = () => {
    if (!disposed) volumeOpen = !volumeOpen;
  };
  const closeVolume = () => {
    volumeOpen = false;
  };
  const addTransient = (bounds: Readonly<Bounds>) => {
    if (!disposed) transientBounds.push({ ...bounds });
  };
  const scrollTasks = (delta: number, page = false) => {
    if (!disposed)
      taskOffset = Math.max(
        0,
        Math.min(maxTaskOffset, taskOffset + Math.trunc(delta) * (page ? taskCapacity : 1)),
      );
  };
  const paintTooltip = (
    hover: { id: string; label: string; x: number } | undefined,
    time: number,
    taskbarY: number,
  ) => {
    if (disposed || volumeOpen || !tooltipDelay.visible(hover?.id ?? null, time) || !hover) return;
    const label = renderer.fitText(hover.label, renderer.W - 16);
    const width = renderer.tw(label) + 8;
    const x = Math.max(2, Math.min(hover.x, renderer.W - width - 2));
    widgets.tooltip(x, taskbarY - 21, label);
    transientBounds.push({ x, y: taskbarY - 21, w: width, h: renderer.capH('ui') + 8 });
  };

  function paintTaskbar(host: TaskbarPaint): { animated: boolean } {
    const { layout } = host;
    const y = renderer.H - 22;
    const live =
      !host.modal && !desktopMenu.bounds && !host.systemInput && !host.interacting && !host.gated;
    input.setGate(live ? 'taskbar' : null);
    renderer.rect(0, y, renderer.W, 22, renderer.TH.face);
    renderer.rect(0, y, renderer.W, 1, renderer.TH.hi);
    renderer.rect(0, y + 1, renderer.W, 1, renderer.TH.lite);
    let hover: { id: string; label: string; x: number } | undefined;
    let contextHandled = false;
    const target = (bounds: Bounds) => input.hit(bounds.x, bounds.y, bounds.w, bounds.h);
    const hint = (id: string, label: string, bounds: Bounds) => {
      if (target(bounds).hover) hover = { id, label, x: bounds.x };
    };
    const st = target(layout.start),
      pressed = st.held || startOpen;
    widgets.button(layout.start.x, layout.start.y, layout.start.w, layout.start.h, '', {
      pressed,
    });
    const inset = pressed ? 1 : 0;
    renderer.spr('i_start', 5 + inset, y + 5 + inset);
    renderer.text('Start', 23 + inset, y + 8 + inset, { font: 'bold' });
    if (st.clicked) {
      toggleStart();
      closeContext();
      host.closeSystemMenu();
      host.playClick();
    }
    if (layout.quick.length) {
      renderer.line(55, y + 4, 55, y + 18, renderer.TH.shadow);
      renderer.line(56, y + 4, 56, y + 18, renderer.TH.hi);
      const shortcuts = [
        ...host.quickApps,
        {
          id: '$desktop-toggle',
          settingId: '',
          label: host.canRestoreDesktop ? 'Restore Windows' : 'Show Desktop',
          icon: 'i_display',
        },
      ];
      layout.quick.forEach((bounds, index) => {
        const entry = shortcuts[index],
          hit = target(bounds);
        if (hit.hover || hit.held)
          widgets.bevel(bounds.x, bounds.y, bounds.w, bounds.h, hit.held ? 'pressed' : 'button');
        renderer.spr(
          entry.icon,
          bounds.x + 2 + (hit.held ? 1 : 0),
          bounds.y + 1 + (hit.held ? 1 : 0),
        );
        hint(entry.id, entry.label, bounds);
        if (hit.clicked) {
          if (entry.id === '$desktop-toggle') {
            if (host.canRestoreDesktop) host.restoreDesktop();
            else host.showDesktop();
          } else host.open(entry.id, bounds);
        }
        if (hit.rclicked && entry.settingId) {
          closeStart();
          host.closeSystemMenu();
          openContext(bounds.x, y, [
            { label: 'Open', command: entry.id },
            { label: 'Remove from Quick Launch', command: `$unpin:${entry.settingId}` },
          ]);
          contextHandled = true;
        }
      });
      const separator = layout.quick.at(-1)!.x + 23;
      renderer.line(separator, y + 4, separator, y + 18, renderer.TH.shadow);
      renderer.line(separator + 1, y + 4, separator + 1, y + 18, renderer.TH.hi);
    }
    if (layout.previous && layout.next) {
      for (const [bounds, direction, label] of [
        [layout.previous, -1, 'Previous windows'],
        [layout.next, 1, 'More windows'],
      ] as const) {
        const disabled = direction < 0 ? taskOffset === 0 : taskOffset >= layout.maxOffset;
        if (
          widgets.button(bounds.x, bounds.y, bounds.w, bounds.h, direction < 0 ? '<' : '>', {
            disabled,
          })
        )
          scrollTasks(direction, true);
        hint(`overflow-${direction}`, label, bounds);
      }
      if (target(layout.strip).hover && input.io.wheel) {
        scrollTasks(Math.sign(input.io.wheel));
        input.consumeWheel();
      }
    }
    for (const { index, bounds } of layout.tasks) {
      const win = host.tasks[index],
        active = host.focused() === win.id && !win.minimized;
      const hit = target(bounds),
        offset = active ? 1 : 0;
      widgets.bevel(bounds.x, bounds.y, bounds.w, bounds.h, active ? 'pressed' : 'button');
      if (active)
        renderer.dither(
          bounds.x + 2,
          bounds.y + 2,
          bounds.w - 4,
          bounds.h - 4,
          renderer.TH.face,
          renderer.TH.hi,
        );
      if (win.icon)
        renderer.spr(
          win.icon,
          bounds.x + (host.showLabels ? 4 : 5) + offset,
          bounds.y + 1 + offset,
        );
      if (host.showLabels)
        renderer.text(
          host.truncate(win.title, active ? 'bold' : 'ui', bounds.w - 25),
          bounds.x + 22 + offset,
          bounds.y + 5 + offset,
          { font: active ? 'bold' : 'ui' },
        );
      if (win.minimized)
        renderer.line(
          bounds.x + 5,
          bounds.y + bounds.h - 4,
          bounds.x + 14,
          bounds.y + bounds.h - 4,
          renderer.TH.shadow,
        );
      hint(`task-${win.id}`, win.title, bounds);
      if (hit.clicked) host.activateTask(win.id, win.minimized);
      if (hit.rclicked) {
        closeStart();
        closeContext();
        host.openSystemMenu(win.id, bounds.x, y - 134);
        contextHandled = true;
      }
    }
    widgets.bevel(layout.tray.x, y + 3, layout.tray.w, 18, 'thin');
    if (layout.risk && host.risk) {
      const bounds = layout.risk;
      widgets.progress(bounds.x + 2, bounds.y + 3, bounds.w - 4, 12, host.risk.value / 100, {
        bw: 3,
        color: host.risk.color,
        bg: renderer.TH.face,
      });
      renderer.rect(bounds.x + 19, bounds.y + 3, 40, 12, renderer.TH.face);
      renderer.text(host.risk.text, bounds.x + bounds.w - 6, bounds.y + 5, { align: 'right' });
      hint('risk', `P(doom): ${host.risk.text}`, bounds);
      if (target(bounds).clicked) host.open('pdoom', bounds);
    }
    host.contexts.forEach((entry, index) => {
      const bounds = layout.contexts[index];
      renderer.spr(entry.icon, bounds.x + 1, bounds.y + 1);
      hint(entry.id, entry.title, bounds);
      if (target(bounds).clicked) host.open(entry.id, bounds);
    });
    const speaker = target(layout.volume);
    renderer.spr('app_sounds', layout.volume.x + 2, layout.volume.y + 1);
    if (host.muted) {
      renderer.line(layout.volume.x + 11, y + 7, layout.volume.x + 17, y + 15, C.maroon);
      renderer.line(layout.volume.x + 17, y + 7, layout.volume.x + 11, y + 15, C.maroon);
    }
    hint(
      'volume',
      host.muted ? 'Volume: muted' : `Volume: ${Math.round(host.volume * 100)}%`,
      layout.volume,
    );
    if (speaker.clicked) toggleVolume();
    if (speaker.rclicked) {
      host.open('sounds', layout.volume);
      contextHandled = true;
    }
    const clockHit = target(layout.clock);
    renderer.text(host.clock, layout.clock.x + layout.clock.w - 5, y + 8, { align: 'right' });
    hint('clock', host.clockHint, layout.clock);
    if (clockHit.clicked && input.io.dbl) host.open('date-time', layout.clock);
    if (clockHit.rclicked) {
      closeStart();
      host.closeSystemMenu();
      openContext(layout.clock.x, y, [
        { label: 'Adjust Date/Time', command: 'date-time' },
        { label: 'Taskbar Properties', command: 'taskbar-settings' },
      ]);
      contextHandled = true;
    }
    if (live && !contextHandled && input.hit(0, y, renderer.W, 22).rclicked)
      host.openBarMenu(input.io.px, y);
    const tooltipWaiting = !!hover && !volumeOpen && !tooltipDelay.visible(hover.id, host.time);
    paintTooltip(hover, host.time, y);
    if (volumeOpen) {
      const bounds = {
        x: Math.max(2, Math.min(layout.volume.x - 85, renderer.W - 140)),
        y: y - 104,
        w: 136,
        h: 100,
      };
      addTransient(bounds);
      input.setGate('volume');
      widgets.bevel(bounds.x, bounds.y, bounds.w, bounds.h, 'window');
      renderer.text('Volume', bounds.x + 10, bounds.y + 9, { font: 'bold' });
      renderer.text(`${Math.round(host.volume * 100)}%`, bounds.x + 125, bounds.y + 9, {
        align: 'right',
      });
      const volume = widgets.hslider('tray-volume', bounds.x + 12, bounds.y + 29, 112, host.volume);
      if (volume !== host.volume) host.setVolume(volume);
      if (widgets.check(bounds.x + 12, bounds.y + 61, 'Mute', host.muted)) host.toggleMuted();
      if (widgets.button(bounds.x + 12, bounds.y + 78, 112, 17, 'Sound Properties')) {
        closeVolume();
        host.open('sounds', bounds);
      }
      if (
        input.io.keyPressed.has('Escape') ||
        (input.io.wentDown && !target(bounds).hover && !speaker.hover)
      ) {
        closeVolume();
        input.consumeKey('Escape');
      }
    }
    return { animated: tooltipWaiting };
  }

  return {
    get startOpen(): boolean {
      return startOpen;
    },
    get volumeOpen(): boolean {
      return volumeOpen;
    },
    get taskOffset(): number {
      return taskOffset;
    },
    get contextBounds(): Readonly<Bounds> | null {
      return desktopMenu.bounds ? Object.freeze({ ...desktopMenu.bounds }) : null;
    },
    get blockers(): readonly Readonly<Bounds>[] {
      return Object.freeze(
        [
          ...transientBounds,
          ...(startOpen ? startBounds : []),
          ...(desktopMenu.bounds ? [desktopMenu.bounds] : []),
        ].map((bounds) => Object.freeze({ ...bounds })),
      );
    },
    beginFrame(): void {
      startBounds = [];
      transientBounds = [];
    },
    addTransient(bounds: Readonly<Bounds>): void {
      if (!disposed) transientBounds.push({ ...bounds });
    },
    toggleStart,
    setStartSource(read: () => readonly StartEntry[]): void {
      readEntries = read;
    },
    closeStart,
    drawStartMenu,
    restrictCommands(commands: readonly string[]): void {
      restrictedCommands = commands;
      applyRestrictions();
    },
    openContext,
    closeContext,
    contextKey(key: string): string | undefined {
      return disposed ? undefined : desktopMenu.key(key);
    },
    drawContext(): string | undefined {
      return disposed ? undefined : desktopMenu.draw();
    },
    toggleVolume,
    closeVolume,
    layoutTasks(
      tasks: readonly { id: string }[],
      focused: string | null,
      options: Omit<TaskbarOptions, 'offset'>,
      width: number,
      y: number,
    ) {
      let layout = taskbarLayout(tasks.length, { ...options, offset: taskOffset }, width, y);
      if (taskFocus !== focused) {
        taskFocus = focused;
        taskOffset = revealTask(
          tasks.findIndex((task) => task.id === focused),
          layout.offset,
          layout.capacity,
        );
        layout = taskbarLayout(tasks.length, { ...options, offset: taskOffset }, width, y);
      }
      taskOffset = layout.offset;
      taskCapacity = layout.capacity;
      maxTaskOffset = layout.maxOffset;
      return layout;
    },
    scrollTasks,
    drawTooltip: paintTooltip,
    drawTaskbar: paintTaskbar,
    reflow(): void {
      closeStart();
      desktopMenu.close();
      taskFocus = null;
      transientBounds = [];
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      closeStart();
      desktopMenu.close();
      volumeOpen = false;
      taskOffset = 0;
      taskFocus = null;
      transientBounds = [];
      tooltipDelay.visible(null, 0);
    },
  };
}

export type DesktopChrome = ReturnType<typeof createDesktopChrome>;
