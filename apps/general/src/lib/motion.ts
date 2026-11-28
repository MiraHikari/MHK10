export const motionEase = [0.22, 1, 0.36, 1] as const;

/**
 * 品牌缓动的 CSS 字符串形式。页面根节点（Layout.astro）把它发布为
 * `--ease-brand`，CSS 与 Tailwind 任意值（ease-[var(--ease-brand)]）统一
 * 引用，禁止在样式文件中再复制这条 cubic-bezier。
 */
export const motionEaseCss = `cubic-bezier(${motionEase.join(',')})`;

/**
 * BootLoader 装配曲线的 CSS 字符串形式（logo 线条拼装：快入缓出，略快于
 * 品牌曲线）。由 Layout.astro 发布为 `--ease-assemble`，样式文件不得复制。
 */
export const motionEaseAssembleCss = 'cubic-bezier(0.2, 1, 0.3, 1)';

export const motionDuration = {
  instant: 0,
  micro: 0.18,
  fast: 0.24,
  control: 0.32,
  sectionExit: 0.32,
  sectionEnter: 0.5,
  entry: 0.62,
  entryWorkDelay: 0.12,
  /** Author entry signature: one glyph focuses per stagger step. */
  heroGlyph: 0.5,
  heroGlyphStagger: 0.03,
  /** Author entry rails / intro / bottom orbit around the name. */
  heroRail: 0.45,
  heroRailDelay: 0.08,
  heroIntroDelay: 0.3,
  heroBottomDelay: 0.4,
  sectionContentDelay: 0.09,
  background: 0.58,
  sweep: 0.68,
  /** WebGL veil tint / paper-mix morph — deliberately slower than the colour swap. */
  veilMorph: 0.9,
  /** Ambient mesh-gradient blob repositioning. */
  meshShift: 0.8,
  /** Section accent CSS variable tween shared by rail and chrome. */
  accentShift: 0.7,
  /** Tag / filter list cross-fade via Swap. */
  filter: 0.22,
  /** Skill level meter fill — data viz, not entrance choreography. */
  meter: 0.8,
  /** Lightbox open / image morph. */
  lightbox: 0.34,
  /** First explicit desktop entry's decorative prism; never gates readiness. */
  presentation: 0.26,
  /** Transient handoff overlay; short so a warm handshake never flashes. */
  presentationHandoff: 0.22,
  /** Newest watermark glyph settling after a typewriter keystroke. */
  typeChar: 0.14,
} as const;

export const springStiff = { type: 'spring', stiffness: 300, damping: 25 } as const;
export const springSoft = { type: 'spring', stiffness: 220, damping: 24 } as const;
export const springHover = { type: 'spring', stiffness: 400, damping: 25 } as const;
/** Indicator trail — lags slightly behind the commit it follows. */
export const springTrail = { type: 'spring', stiffness: 300, damping: 35, mass: 2 } as const;
/** Parallax spring params (spread into useSpring, no `type` field). */
export const springParallax = { stiffness: 40, damping: 20, mass: 1.2 } as const;
export const springSnappy = { type: 'spring', stiffness: 380, damping: 30 } as const;

export type MotionLevel = 'full' | 'mobile' | 'reduced';

export function durationFor(level: MotionLevel, duration: number): number {
  return level === 'reduced' ? motionDuration.instant : duration;
}

/** Single source of truth for the runTransition choreography (ms). */
export const transitionScore = {
  exitHold: 0,
  exitPose: 320,
  bridgeHold: 50,
  enterHold: 0,
  enterSettle: 140,
  unlockDelay: 180,
  /** Accent recolour crests shortly after the bridge commits (~50% of bridgeHold). */
  accentCrest: 24,
} as const;

/**
 * Watermark typewriter score (ms). Full erase → gap → type sequence; durations
 * scale with glyph count so ENGINEERING and GALLERY share the same cadence.
 *
 * Cadence ownership: `src/lib/typewriter.ts` plays the setTimeout steps from
 * these fields; `typewriterPhaseDelays` projects the same score into
 * `runTransition` waits so the orchestrator never invents its own intervals.
 */
export const typewriterScore = {
  /** Backspace one glyph during exit. */
  eraseMs: 30,
  /** Print one glyph during enter. */
  typeMs: 42,
  /** Breath at the empty caret between erase and type. */
  gapMs: 70,
  /** Let the incoming section start focusing before the first keystroke. */
  typeDelayMs: 90,
  /** Hold the finished word before the caret retreats. */
  settleMs: 120,
  /**
   * Align orchestrator exit wait with WatermarkLayer's useEffect mount.
   * One frame (~16ms) is the happy path; GPU-heavy cross-boundary paints
   * commonly delay the effect 30–40ms, so budget ~3 frames.
   */
  mountSkewMs: 48,
} as const;

/** Wall-clock for erasing `text` one glyph at a time (first glyph drops immediately). */
export function typewriterEraseDuration(text: string): number {
  if (text.length <= 1) return 0;
  return (text.length - 1) * typewriterScore.eraseMs;
}

/** Wall-clock for the enter-phase type-in, including the pre-first-char delay. */
export function typewriterTypeDuration(text: string): number {
  if (text.length === 0) return 0;
  return typewriterScore.typeDelayMs + text.length * typewriterScore.typeMs;
}

/** All typewriter-related waits for one fullpage transition (ms). */
export function typewriterPhaseDelays(fromWatermark: string, toWatermark: string) {
  return {
    erase: typewriterEraseDuration(fromWatermark) + typewriterScore.mountSkewMs,
    gap: typewriterScore.gapMs,
    type: typewriterTypeDuration(toWatermark),
    settle: typewriterScore.settleMs,
  } as const;
}

/** A choreographed wait collapses to a frame-ish pause under reduced motion. */
export function pauseFor(reduced: boolean, ms: number): number {
  return reduced ? Math.min(ms, 20) : ms;
}
