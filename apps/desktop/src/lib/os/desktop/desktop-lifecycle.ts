import type { Renderer } from '../../gfx/context';
import { CLASSIC_SIZE } from '../../gfx/display-metrics';
import { C, THEMES, themeFor, VGA_COLORS } from '../../gfx/palette';
import { R, clamp, ease, easeOut, lerp, prog } from '../../gfx/primitives';
import { createSaverIdle, type Saver } from '../../gfx/saver-model';
import { TIMING } from '../../gfx/timing';
import { bootInfoLines, bootSequence, createBootInfo, type BootInput } from './boot-info';
import { effectiveSaver, type DesktopSettings } from './desktop-settings';
import type { ReadonlyIO } from '../../ui/canvas/input';
import { storySignals, type StoryState } from '../story/story';

export type DesktopPhase = 'boot' | 'splash' | 'desktop' | 'shutdown';

type LifecycleSettings = Pick<
  DesktopSettings,
  | 'startupAnimation'
  | 'hasVisited'
  | 'reducedMotion'
  | 'followStoryTheme'
  | 'saver'
  | 'saverMinutes'
  | 'shell'
>;

export interface DesktopLifecycleFrame {
  readonly preferences: Readonly<LifecycleSettings>;
  readonly story: StoryState;
  readonly risk: number;
  readonly modal: boolean;
  readonly input: Pick<
    ReadonlyIO,
    | 'px'
    | 'py'
    | 'down'
    | 'rdown'
    | 'wentDown'
    | 'wentUp'
    | 'rwentDown'
    | 'rwentUp'
    | 'typed'
    | 'keyPressed'
    | 'wheel'
  >;
  readonly systemReducedMotion?: boolean;
}

const restrictionCount = (risk: number) => (risk >= 86 ? 3 : risk >= 61 ? 2 : risk >= 34 ? 1 : 0);
const restrictedApps = ['train', 'killswitch', 'solitaire'] as const;
const POST_COLUMNS = 38;

/** Owns presentation time, startup/shutdown, story appearance and saver wake transactions. */
export function createDesktopLifecycle(initialPreferredTheme = 'std') {
  let phase: DesktopPhase = 'boot';
  let phaseT = 0;
  let t = 0;
  let preferredTheme = Object.hasOwn(THEMES, initialPreferredTheme) ? initialPreferredTheme : 'std';
  let themeName = 'std';
  let greyed = 0;
  let slamT = -9;
  let tip: { lines: readonly string[]; until: number } | null = null;
  let bootSkip = false;
  let bootLines: readonly string[] = Object.freeze(bootInfoLines(createBootInfo({}), POST_COLUMNS));
  let reducedMotion = false;
  let currentShell: 'desktop' | 'progman' = 'desktop';
  const saverIdle = createSaverIdle();
  let saverPreview: Saver | undefined;
  let previewUntil = 0;
  let saverVisible = false;
  let saverElapsed = 0;
  let requestedSaver: Saver = 'None';
  let lastPointer = { x: -1, y: -1 };
  let externalActivity = false;
  let wakeUntilRelease = false;
  let disposed = false;

  const enterDesktop = () => {
    if (disposed) return;
    phase = 'desktop';
    phaseT = 0;
    tip = null;
  };

  const showTip = (lines: readonly string[], duration = 5) => {
    if (!disposed) tip = { lines: Object.freeze([...lines]), until: t + duration };
  };

  const applyAppearance = (story: StoryState, risk: number, followStoryTheme: boolean) => {
    const oldTheme = themeName;
    const oldGreyed = greyed;
    const signals = storySignals(story);
    themeName = followStoryTheme && signals.theme !== 'std' ? signals.theme : preferredTheme;
    greyed = restrictionCount(risk);
    return {
      signals,
      themeChanged: themeName !== oldTheme,
      restrictionsChanged: greyed !== oldGreyed,
    };
  };

  return {
    get phase(): DesktopPhase {
      return phase;
    },
    get phaseT(): number {
      return phaseT;
    },
    get t(): number {
      return t;
    },
    get themeName(): string {
      return themeName;
    },
    get preferredTheme(): string {
      return preferredTheme;
    },
    get greyed(): number {
      return greyed;
    },
    get restrictedCommands(): readonly string[] {
      return Object.freeze(restrictedApps.slice(0, greyed));
    },
    get slamT(): number {
      return slamT;
    },
    get tip() {
      return tip ? Object.freeze({ ...tip }) : null;
    },
    get bootLines(): readonly string[] {
      return bootLines;
    },
    get reducedMotion(): boolean {
      return reducedMotion;
    },
    get currentShell(): 'desktop' | 'progman' {
      return currentShell;
    },
    get saverVisible(): boolean {
      return saverVisible;
    },
    get saverElapsed(): number {
      return saverElapsed;
    },
    get requestedSaver(): Saver {
      return requestedSaver;
    },
    get wakeUntilRelease(): boolean {
      return wakeUntilRelease;
    },
    chooseTheme(name: string): boolean {
      if (disposed || !Object.hasOwn(THEMES, name)) return false;
      preferredTheme = themeName = name;
      return true;
    },
    setBootInfo(input: BootInput): void {
      if (!disposed) bootLines = Object.freeze(bootInfoLines(createBootInfo(input), POST_COLUMNS));
    },
    beginStartup(
      preferences: Pick<LifecycleSettings, 'startupAnimation' | 'hasVisited'>,
      returningVisit = false,
    ): 'animation' | 'ready' {
      if (disposed) return 'ready';
      phaseT = 0;
      bootSkip = false;
      const animate =
        !reducedMotion &&
        (preferences.startupAnimation === 'always' ||
          (preferences.startupAnimation === 'first-visit' &&
            !preferences.hasVisited &&
            !returningVisit));
      if (animate) phase = 'boot';
      else enterDesktop();
      return animate ? 'animation' : 'ready';
    },
    skipBoot(): void {
      if (!disposed && (phase === 'boot' || phase === 'splash')) bootSkip = true;
    },
    advanceIntro(inputHeld: boolean): 'splash' | 'desktop' | undefined {
      if (disposed || (phase !== 'boot' && phase !== 'splash')) return;
      if (bootSkip || reducedMotion || (phase === 'splash' && phaseT >= TIMING.splash)) {
        if (inputHeld) return;
        enterDesktop();
        return 'desktop';
      }
      if (phase === 'boot' && bootSequence(phaseT).complete) {
        phase = 'splash';
        phaseT = 0;
        return 'splash';
      }
    },
    enterDesktop,
    shutdown(): void {
      if (!disposed) {
        phase = 'shutdown';
        phaseT = 0;
      }
    },
    reset(risk: number): void {
      if (disposed) return;
      themeName = preferredTheme;
      greyed = restrictionCount(risk);
      slamT = -9;
      tip = null;
      currentShell = 'desktop';
      saverPreview = undefined;
      saverVisible = false;
      wakeUntilRelease = false;
      saverIdle.frame(t, true, 0, false);
      enterDesktop();
    },
    showTip,
    dismissTip(): void {
      tip = null;
    },
    syncStory(current: StoryState, risk: number, followStoryTheme: boolean, animate = true) {
      if (disposed) return { themeChanged: false, restrictionsChanged: false, playEnding: false };
      const result = applyAppearance(current, risk, followStoryTheme);
      showTip(result.signals.assistant, 7);
      const playEnding = animate && current.ending === 'doom';
      if (playEnding) slamT = t;
      return {
        themeChanged: result.themeChanged,
        restrictionsChanged: result.restrictionsChanged,
        playEnding,
      };
    },
    previewSaver(saver: Saver): void {
      if (disposed) return;
      saverPreview = saver === 'None' ? undefined : saver;
      if (saverPreview) {
        previewUntil = t + 15;
        saverIdle.preview(t);
      } else saverIdle.frame(t, true, 0, false);
    },
    noteActivity(): void {
      if (!disposed) externalActivity = true;
    },
    frame(dt: number, state: DesktopLifecycleFrame) {
      if (disposed)
        return {
          themeChanged: false,
          restrictionsChanged: false,
          consumeWakeInput: false,
          shellChanged: undefined,
        };
      const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
      t += elapsed;
      phaseT += elapsed;
      if (tip && t > tip.until) tip = null;
      const { preferences, input } = state;
      reducedMotion = !!state.systemReducedMotion || preferences.reducedMotion;
      const appearance = applyAppearance(state.story, state.risk, preferences.followStoryTheme);
      if (saverPreview && t >= previewUntil) {
        saverPreview = undefined;
        saverIdle.frame(t, true, 0, false);
      }
      requestedSaver = effectiveSaver(saverPreview ?? preferences.saver, state.risk);
      const activity =
        externalActivity ||
        input.wentDown ||
        input.wentUp ||
        input.rwentDown ||
        input.rwentUp ||
        !!input.typed ||
        input.keyPressed.size > 0 ||
        input.wheel !== 0 ||
        input.px !== lastPointer.x ||
        input.py !== lastPointer.y;
      externalActivity = false;
      lastPointer = { x: input.px, y: input.py };
      const idle = saverIdle.frame(
        t,
        activity,
        preferences.saverMinutes * 60,
        phase === 'desktop' && requestedSaver !== 'None' && !state.modal,
      );
      saverVisible = idle.active;
      saverElapsed = idle.elapsed;
      if (idle.consumed) {
        saverPreview = undefined;
        wakeUntilRelease = true;
      }
      const consumeWakeInput = wakeUntilRelease;
      if (wakeUntilRelease) wakeUntilRelease = input.down || input.rdown;
      let shellChanged: 'desktop' | 'progman' | undefined;
      if (phase === 'desktop' && !saverVisible && preferences.shell !== currentShell) {
        currentShell = preferences.shell;
        shellChanged = currentShell;
      }
      return {
        themeChanged: appearance.themeChanged,
        restrictionsChanged: appearance.restrictionsChanged,
        consumeWakeInput,
        shellChanged,
      };
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      tip = null;
      saverPreview = undefined;
      saverVisible = false;
      wakeUntilRelease = false;
      externalActivity = false;
      bootLines = [];
    },
  };
}

export type DesktopLifecycle = ReturnType<typeof createDesktopLifecycle>;

export interface FirmwareConsole {
  page: 'status' | 'files' | 'help';
  file: number;
}

function startupPlate(width: number, height: number) {
  return { x: R((width - CLASSIC_SIZE.width) / 2), y: R((height - CLASSIC_SIZE.height) / 2) };
}

function registrationMark(renderer: Renderer, x: number, y: number, ink: string): void {
  renderer.line(x - 6, y, x - 2, y, ink);
  renderer.line(x + 2, y, x + 6, y, ink);
  renderer.line(x, y - 6, x, y - 2, ink);
  renderer.line(x, y + 2, x, y + 6, ink);
}

export function drawBoot(
  renderer: Renderer,
  view: {
    phaseT: number;
    bootLines: readonly string[];
    filesPersisted: boolean;
    checkpoint: string;
  },
): void {
  const { checks, stage } = bootSequence(view.phaseT);
  const { W, H } = renderer;
  const width = Math.min(W - 32, 704);
  const left = R((W - width) / 2);
  const { x, y } = startupPlate(W, H);
  const top = y + 36;
  const hostX = left + 20;
  const checkX = left + R(width * 0.6);
  const rightX = left + width - 20;
  const headingsY = top + 64;
  const rowsY = headingsY + 18;
  const text = (
    value: string,
    x: number,
    y: number,
    color: string,
    align: 'left' | 'right' | 'center' = 'left',
  ) => renderer.text(value, x, y, { font: 'dos', color, align });

  renderer.l0Screen(W, H);
  renderer.cp437(left, top, width, 274, C.gray);
  registrationMark(renderer, x + 32, y + 30, C.gray);
  registrationMark(renderer, x + 608, y + 314, C.gray);
  text('MIRAHIKARI / SIGNAL EDITIONS', hostX, top + 13, C.silver);
  text('01 / FIRMWARE', rightX, top + 13, C.silver, 'right');
  renderer.text('SYSTEM POST', hostX, top + 29, { font: 'dos', color: C.white, scale: 2 });
  renderer.line(hostX, top + 53, rightX, top + 53, C.gray);
  text('HOST ENVIRONMENT', hostX, headingsY, C.lime);
  text('SUBSYSTEM CHECKS', checkX, headingsY, C.lime);

  for (const [index, row] of view.bootLines.entries()) {
    const fitted = renderer.fitText(row, checkX - hostX - 12, 'dos');
    text(fitted, hostX, rowsY + index * 13, index < 5 ? C.silver : C.gray);
  }

  const subsystems = [
    ['Display', `${W} x ${H} logical pixels`],
    ['Input', 'Keyboard / pointer'],
    ['Local files', view.filesPersisted ? 'Persistent volume' : 'Session memory'],
    ['Story', `Checkpoint: ${view.checkpoint}`],
  ];
  subsystems.forEach(([label, detail], index) => {
    const rowY = rowsY + index * 24;
    const done = index < checks;
    const active = index === checks;
    const ink = active ? C.white : done ? C.silver : C.gray;
    text(`${index + 1}. ${label}`, checkX, rowY, ink);
    if (done || active)
      text(renderer.fitText(detail, rightX - checkX, 'dos'), checkX, rowY + 11, ink);
    text(done ? '[OK]' : active ? '[CHECK]' : '[WAIT]', rightX, rowY, done ? C.lime : ink, 'right');
  });

  const statusInk = stage ? C.silver : C.lime;
  renderer.rect(hostX, top + 206, 20, 2, statusInk);
  text(
    stage ? `POST ${String(checks + 1).padStart(2, '0')} / ${stage}` : 'POST COMPLETE',
    hostX,
    top + 222,
    statusInk,
  );
}

const SIGNAL_INKS = {
  vga: {
    field: C.navy,
    grain: C.blue,
    paper: C.white,
    ink: C.navy,
    beam: C.teal,
    light: C.aqua,
    guide: C.silver,
    shade: C.black,
    steel: C.gray,
    seal: C.yellow,
    sealEdge: C.olive,
    proof: VGA_COLORS,
  },
  phosphor: {
    field: C.black,
    grain: C.gray,
    paper: C.silver,
    ink: C.black,
    beam: C.gray,
    light: C.lime,
    guide: C.silver,
    shade: C.black,
    steel: C.gray,
    seal: C.lime,
    sealEdge: C.gray,
    proof: [
      C.black,
      C.black,
      C.black,
      C.black,
      C.gray,
      C.gray,
      C.silver,
      C.silver,
      C.lime,
      C.lime,
      C.silver,
      C.silver,
      C.gray,
      C.gray,
      C.black,
      C.black,
    ],
  },
} as const;

function paintEditionDisk(
  renderer: Renderer,
  diskX: number,
  diskY: number,
  travel: number,
  inks: (typeof SIGNAL_INKS)[keyof typeof SIGNAL_INKS],
  reverse = false,
): void {
  const { path, poly } = renderer;
  const { field, paper, ink, beam, light, guide, shade, steel } = inks;
  const point = ([horizontal, vertical]: [number, number]): [number, number] => [
    diskX + horizontal + R(vertical * 0.225),
    diskY + vertical - R(horizontal * 0.193),
  ];
  const diskBox = (left: number, top: number, width: number, height: number, color: string) =>
    poly(
      (
        [
          [left, top],
          [left + width, top],
          [left + width, top + height],
          [left, top + height],
        ] satisfies [number, number][]
      ).map(point),
      color,
    );
  const silhouette = (
    [
      [0, 0],
      [185, 0],
      [211, 26],
      [211, 189],
      [202, 201],
      [7, 201],
      [0, 195],
    ] as [number, number][]
  ).map(point);
  poly(
    silhouette.map(([pointX, pointY]) => [pointX + 9, pointY + 9]),
    shade,
  );
  poly(silhouette, field);
  path([...silhouette, silhouette[0]], light);
  diskBox(8, 37, 195, 150, shade);
  diskBox(14, 49, 183, 132, field);
  diskBox(28, 0, 128, 73, steel);
  diskBox(28, 0, 118, 63, guide);
  diskBox(32, 4, 81, 9, paper);
  const shutterLight = 39 + R(travel * 15);
  diskBox(shutterLight, 15, 4, 44, paper);
  diskBox(115, 8, 29, 53, shade);
  diskBox(120, 9, 20, 44, steel);
  diskBox(120, 9, 5, 44, guide);

  diskBox(38, 93, 154, 79, guide);
  diskBox(40, 95, 149, 74, paper);
  diskBox(40, 95, 149, 10, beam);
  diskBox(184, 110, 5, 58, guide);
  diskBox(53, 151, 113, 2, beam);
  diskBox(53, 158, 89, 2, beam);
  const [serialX, serialY] = point([55, 111]);
  if (reverse) {
    const inscription: [number, number][][] = [
      [
        [0, 1],
        [10, 1],
      ],
      [
        [5, 1],
        [5, 12],
      ],
      [
        [6, 5],
        [9, 7],
      ],
      [
        [14, 2],
        [16, 3],
      ],
      [
        [14, 10],
        [17, 6],
      ],
      [
        [21, 0],
        [19, 4],
      ],
      [
        [20, 3],
        [26, 3],
        [24, 6],
      ],
      [
        [22, 5],
        [21, 9],
        [18, 12],
      ],
      [
        [22, 7],
        [24, 10],
        [27, 12],
      ],
      [
        [31, 8],
        [31, 1],
        [39, 1],
        [39, 8],
      ],
      [
        [35, 4],
        [35, 7],
        [34, 10],
        [30, 12],
      ],
      [
        [36, 7],
        [36, 11],
        [37, 12],
        [41, 12],
        [42, 10],
      ],
    ];
    for (const stroke of inscription) {
      const points = stroke.map(([column, row]) => point([52 + column * 3, 113 + row * 2]));
      path(points, ink);
      path(
        points.map(([column, row]) => [column + 1, row]),
        ink,
      );
    }
  } else renderer.text('01', serialX, serialY, { font: 'bold', scale: 3, color: ink });
  diskBox(16, 185, 12, 9, steel);
  diskBox(180, 182, 11, 11, steel);
}

function paintSignalEdition(
  renderer: Renderer,
  time: number,
  inks: (typeof SIGNAL_INKS)[keyof typeof SIGNAL_INKS],
): void {
  const { W, H, rect, frame, poly, stipple } = renderer;
  const { x, y } = startupPlate(W, H);
  const { field, grain, paper, ink, beam, light, guide, shade, steel, seal, sealEdge, proof } =
    inks;
  rect(0, 0, W, H, field);
  stipple(0, 0, W, H, grain, 0.125);
  const aperture = { x: x + 22, y: y + 39, w: 596, h: 280 };
  const farEdge = aperture.x + aperture.w - 1;
  rect(aperture.x, aperture.y, aperture.w, aperture.h, field);
  const projected = ease(prog(time, 0, 0.58));
  for (let row = 1; row < aperture.h - 1; row++) {
    const intercept = x + 268 + R((aperture.h - row) * 0.89) + R(lerp(-182, 0, projected));
    const left = Math.max(aperture.x + 1, intercept);
    const right = Math.min(farEdge, intercept + 194);
    const glint = Math.max(left, intercept + 137);
    if (left >= right) continue;
    rect(left, aperture.y + row, right - left, 1, beam);
    stipple(left, aperture.y + row, right - left, 1, light, 0.1875);
    if (glint < right) stipple(glint, aperture.y + row, right - glint, 1, light, 0.625);
  }
  paintEditionDisk(
    renderer,
    x + 333 + R(lerp(-75, 0, easeOut(prog(time, 0.06, 0.56)))),
    y + 103,
    projected,
    inks,
  );

  const sleeve: [number, number][] = [
    [x + 42, y + 68],
    [x + 367, y + 68],
    [x + 367, y + 255],
    [x + 328, y + 293],
    [x + 42, y + 293],
  ];
  poly(
    sleeve.map(([pointX, pointY]) => [pointX + 5, pointY + 6]),
    shade,
  );
  poly(sleeve, paper);
  stipple(x + 43, y + 69, 9, 223, steel, 0.1875);
  poly(
    [
      [x + 328, y + 293],
      [x + 328, y + 254],
      [x + 367, y + 254],
    ],
    guide,
  );
  const swatchWidth = 16;
  const proofStep = Math.min(proof.length, Math.floor(Math.max(0, time - 0.12) * 20));
  frame(x + 56, y + 133, proof.length * swatchWidth + 2, 8, ink);
  for (let index = 0; index < proof.length; index++) {
    const color = proof[(index + proof.length - proofStep) % proof.length];
    rect(x + 57 + index * swatchWidth, y + 134, swatchWidth, 6, color);
  }
  renderer.text('MiraHikari', x + 57, y + 87, { font: 'bold', scale: 2, color: ink });
  renderer.text('S I G N A L   E D I T I O N S', x + 58, y + 114, { font: 'dos', color: ink });
  renderer.text('MHK10', x + 60, y + 157, { font: 'bold', scale: 7, color: beam });
  renderer.text('MHK10', x + 57, y + 155, { font: 'bold', scale: 7, color: ink });
  renderer.text('PERSONAL DESKTOP', x + 58, y + 227, { font: 'bold', scale: 2, color: ink });
  rect(x + 57, y + 260, 27, 17, seal);
  rect(x + 57, y + 276, 27, 2, sealEdge);
  renderer.text('01', x + 62, y + 263, { font: 'dos', color: ink });
  renderer.text('RELEASE PRINT', x + 94, y + 263, { font: 'dos', color: ink });

  frame(aperture.x, aperture.y, aperture.w, aperture.h, beam);
  registrationMark(renderer, x + 32, y + 30, guide);
  registrationMark(renderer, x + 608, y + 314, light);
  renderer.text('02 / ON AIR', x + 603, y + 20, { font: 'dos', color: guide, align: 'right' });
}

export function drawSplash(
  renderer: Renderer,
  view: {
    phaseT: number;
    themeName: string;
    reducedMotion?: boolean;
  },
): void {
  const { W, H } = renderer;
  const time = view.reducedMotion ? TIMING.splash - 0.5 : view.phaseT;
  const inks = view.themeName === 'phosphor' ? SIGNAL_INKS.phosphor : SIGNAL_INKS.vga;
  const release = ease(prog(time, TIMING.splash - 0.28, TIMING.splash));
  if (release === 0) {
    paintSignalEdition(renderer, time, inks);
    return;
  }

  renderer.rect(0, 0, W, H, themeFor(view.themeName).desk);
  renderer.drawDesktopWallpaper();
  const context = renderer.getCtx();
  const boundary = R(lerp(-H / 2, W + H / 2, release));
  context.save();
  try {
    context.beginPath();
    for (let row = 0; row < H; row += 2) {
      const edge = clamp(boundary + R((H / 2 - row) * 0.89), 0, W);
      if (edge < W) context.rect(edge, row, W - edge, Math.min(2, H - row));
    }
    context.clip();
    paintSignalEdition(renderer, time, inks);
  } finally {
    context.restore();
  }
}

export function drawShutdown(
  renderer: Renderer,
  view: {
    phaseT: number;
    reducedMotion: boolean;
    endingDoom: boolean;
    themeName: string;
    restartRequested: boolean;
    paintDesktop(): void;
    dim(x: number, y: number, w: number, h: number): void;
    onRestart(): void;
  },
): { animated: boolean } {
  const settled = view.reducedMotion || view.phaseT >= 1.55;
  if (!view.reducedMotion && view.phaseT < 0.24) {
    view.paintDesktop();
    view.dim(0, 0, renderer.W, renderer.H);
    return { animated: true };
  }
  const { W, H, rect, frame, text, stipple } = renderer;
  const { x, y } = startupPlate(W, H);
  const inks = view.themeName === 'phosphor' ? SIGNAL_INKS.phosphor : SIGNAL_INKS.vga;
  const eject = settled ? 1 : easeOut(prog(view.phaseT, 0.32, 1));
  rect(0, 0, W, H, inks.shade);
  stipple(x + 27, y + 43, 586, 265, inks.field, 0.25);
  frame(x + 27, y + 43, 586, 265, inks.beam);
  text('MIRAHIKARI   /   SIGNAL EDITIONS', x + 45, y + 60, { font: 'dos', color: inks.guide });
  text('SIDE B', x + 549, y + 60, { font: 'dos', color: inks.guide });
  paintEditionDisk(
    renderer,
    x + 350 + R(11 * eject),
    y + 127 - R(30 * eject),
    1 - eject,
    inks,
    eject >= 0.5,
  );
  rect(x + 350, y + 285, 241, 5, inks.steel);
  rect(x + 350, y + 290, 241, 14, inks.field);
  rect(x + 354, y + 294, 29, 2, inks.light);
  text('It is now safe', x + 49, y + 117, { font: 'bold', scale: 3, color: inks.seal });
  text('to turn off', x + 49, y + 156, { font: 'bold', scale: 3, color: inks.seal });
  text(view.endingDoom ? 'your civilization.' : 'your computer.', x + 49, y + 201, {
    font: 'bold',
    scale: 2,
    color: inks.paper,
  });
  text(settled ? '01  /  OFF AIR' : '01  /  EJECTING', x + 51, y + 260, {
    font: 'dos',
    color: inks.guide,
  });
  if (settled && view.restartRequested) view.onRestart();
  return { animated: !settled };
}

export function drawFirmwareDesktop(
  renderer: Renderer,
  consoleState: FirmwareConsole,
  view: {
    pressed(key: string): boolean;
    clearPressed(): void;
    processCount: number;
    documents: readonly { name: string; content: string }[];
    logs: readonly { seq: number; source: string; message: string }[];
    onReset(): void;
    onExport(name: string, content: string): void;
  },
): { animated: boolean } {
  renderer.l0Screen(renderer.W, renderer.H);
  renderer.cp437(8, 8, renderer.W - 16, renderer.H - 36);
  renderer.text('MHK10 / FIRMWARE CONSOLE', 24, 20, { font: 'dos', color: C.lime });
  renderer.text('AUTHORITY: AGI.EXE     HUMAN VETO: REMOVED', 24, 40, {
    font: 'dos',
    color: C.silver,
  });
  renderer.text('[F1] HELP    [F2] STATUS    [F3] FILES    [F4] RESTART', 24, renderer.H - 50, {
    font: 'dos',
    color: C.white,
  });
  if (view.pressed('F1')) consoleState.page = 'help';
  if (view.pressed('F2')) consoleState.page = 'status';
  if (view.pressed('F3')) consoleState.page = 'files';
  if (view.pressed('F4')) {
    view.onReset();
    consoleState.page = 'status';
    view.clearPressed();
    return { animated: false };
  }
  if (consoleState.page === 'help') {
    [
      'F2  SYSTEM STATUS AND EVENT LOG',
      'F3  LOCAL FILE DIRECTORY',
      '    UP / DOWN SELECTS A FILE',
      '    ENTER EXPORTS THE SELECTED FILE',
      'F4  RESTARTS THE OWNERSHIP REVIEW',
      '',
      'LOCAL DOCUMENTS SURVIVE RESTART.',
    ].forEach((value, i) =>
      renderer.text(value, 24, 82 + i * 20, { font: 'dos', color: C.silver }),
    );
  } else if (consoleState.page === 'status') {
    renderer.text(
      `PROCESSES: ${view.processCount}     LOCAL FILES: ${view.documents.length}`,
      24,
      74,
      { font: 'dos', color: C.silver },
    );
    view.logs.slice(-11).forEach((log, i) =>
      renderer.text(
        renderer.fitText(`${log.seq} ${log.source}: ${log.message}`, renderer.W - 56, 'dos'),
        24,
        98 + i * 16,
        {
          font: 'dos',
          color: C.gray,
        },
      ),
    );
  } else {
    if (view.pressed('ArrowDown')) consoleState.file++;
    if (view.pressed('ArrowUp')) consoleState.file--;
    consoleState.file = Math.max(0, Math.min(view.documents.length - 1, consoleState.file));
    const selected = view.documents[consoleState.file];
    renderer.text(
      selected
        ? `${consoleState.file + 1}/${view.documents.length} ${selected.name}`
        : 'DIRECTORY EMPTY',
      24,
      74,
      { font: 'dos', color: C.white },
    );
    selected?.content
      .split('\n')
      .slice(0, 11)
      .forEach((value, i) =>
        renderer.text(renderer.fitText(value, renderer.W - 56, 'dos'), 24, 98 + i * 16, {
          font: 'dos',
          color: C.silver,
        }),
      );
    renderer.text('[UP/DOWN] SELECT    [ENTER] EXPORT', 24, renderer.H - 72, {
      font: 'dos',
      color: C.lime,
    });
    if (selected && view.pressed('Enter')) view.onExport(selected.name, selected.content);
  }
  renderer.rect(0, renderer.H - 20, renderer.W, 20, C.silver);
  renderer.text('LOCAL VOLUME READY   P(DOOM): 99.9%   12:00 AM', 16, renderer.H - 14, {
    font: 'dos',
    color: C.black,
  });
  return { animated: false };
}
