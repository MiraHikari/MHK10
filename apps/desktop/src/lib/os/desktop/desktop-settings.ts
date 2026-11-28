import { SOUND_SCHEMES, CURSOR_SETS, type CursorSet, type SoundScheme } from '../../gfx/palette';
import type { PrintLayout } from '../../ui/text/print-layout';
import type { ResolutionMode } from '../../gfx/display-metrics';

import { SAVERS, type Saver } from '../../gfx/saver-model';
export { SAVERS, type Saver } from '../../gfx/saver-model';
export interface PixelWallpaper {
  width: number;
  height: number;
  pixels: number[];
}
export interface DesktopSettings {
  resolutionMode: ResolutionMode;
  volume: number;
  soundScheme: SoundScheme;
  reducedMotion: boolean;
  cursorSet: CursorSet;
  clockOffsetMinutes: number;
  saver: Saver;
  saverMinutes: number;
  marquee: string;
  shell: 'desktop' | 'progman';
  welcome: boolean;
  startupAnimation: 'first-visit' | 'always' | 'never';
  hasVisited: boolean;
  welcomeCompleted: boolean;
  windowAnimations: boolean;
  showAssistant: boolean;
  riskDisplay: 'auto' | 'always' | 'hidden';
  clock24Hour: boolean;
  showSeconds: boolean;
  quickLaunch: boolean;
  taskbarLabels: boolean;
  followStoryTheme: boolean;
  pixelImages: boolean;
  showDesktopIcons: boolean;
  autoArrangeIcons: boolean;
  quickLaunchItems: readonly string[];
  showFileExtensions: boolean;
  /** Newest Run text first. Empty when a stored desktop record omits it. */
  recentRunCommands: readonly string[];
  /** Newest program id first. Empty when a stored desktop record omits it. */
  recentProgramIds: readonly string[];
}
export interface DesktopCapabilities {
  getSettings(): Readonly<DesktopSettings>;
  updateSettings(patch: Partial<DesktopSettings>): void;
  setPixelWallpaper(bitmap: PixelWallpaper): void;
  printDocument(title: string, content: string, layout?: PrintLayout): void | Promise<void>;
  previewSaver(saver: Saver): void;
}
export const DEFAULT_SETTINGS: DesktopSettings = {
  resolutionMode: 'auto',
  volume: 0.65,
  soundScheme: 'standard',
  reducedMotion: false,
  cursorSet: 'arrow',
  clockOffsetMinutes: 0,
  saver: 'Starfield',
  saverMinutes: 5,
  marquee: 'MHK10 — MiraHikari',
  shell: 'desktop',
  welcome: true,
  startupAnimation: 'first-visit',
  hasVisited: false,
  welcomeCompleted: false,
  windowAnimations: true,
  showAssistant: true,
  riskDisplay: 'auto',
  clock24Hour: true,
  showSeconds: false,
  quickLaunch: true,
  taskbarLabels: true,
  followStoryTheme: true,
  pixelImages: false,
  showDesktopIcons: true,
  autoArrangeIcons: false,
  quickLaunchItems: ['home', 'computer'],
  showFileExtensions: true,
  recentRunCommands: [],
  recentProgramIds: [],
};
/** Quick Launch holds four programs. Menus, pinning and stored settings share this limit. */
export const QUICK_LAUNCH_CAPACITY = 4;
const MAX_RECENT_COMMANDS = 8;
const MAX_RECENT_PROGRAMS = 6;
const PROGRAM_ID = /^[a-z][a-z0-9-]{0,47}$/;
function sanitizeRecentCommands(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  const commands: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const command = item
      .replace(/[\u0000-\u001f]/g, ' ')
      .trim()
      .slice(0, 64);
    const key = command.toLowerCase();
    if (!command || seen.has(key)) continue;
    seen.add(key);
    commands.push(command);
    if (commands.length >= MAX_RECENT_COMMANDS) break;
  }
  return commands;
}
function sanitizeRecentPrograms(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !PROGRAM_ID.test(item) || seen.has(item)) continue;
    seen.add(item);
    ids.push(item);
    if (ids.length >= MAX_RECENT_PROGRAMS) break;
  }
  return ids;
}
function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}
export function parseDesktopSettings(value: unknown): DesktopSettings {
  const result = { ...DEFAULT_SETTINGS };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  const v = value as Record<string, unknown>;
  if (v.resolutionMode === 'auto' || v.resolutionMode === 'classic')
    result.resolutionMode = v.resolutionMode;
  if (typeof v.volume === 'number' && Number.isFinite(v.volume))
    result.volume = Math.max(0, Math.min(1, v.volume));
  if (typeof v.soundScheme === 'string' && SOUND_SCHEMES.some((scheme) => scheme === v.soundScheme))
    result.soundScheme = v.soundScheme as SoundScheme;
  if (typeof v.reducedMotion === 'boolean') result.reducedMotion = v.reducedMotion;
  if (typeof v.cursorSet === 'string' && CURSOR_SETS.some((cursor) => cursor === v.cursorSet))
    result.cursorSet = v.cursorSet as CursorSet;
  if (typeof v.clockOffsetMinutes === 'number' && Number.isFinite(v.clockOffsetMinutes))
    result.clockOffsetMinutes = Math.max(-1440, Math.min(1440, Math.round(v.clockOffsetMinutes)));
  if (typeof v.saver === 'string' && SAVERS.some((saver) => saver === v.saver))
    result.saver = v.saver as Saver;
  if (typeof v.saverMinutes === 'number' && Number.isFinite(v.saverMinutes))
    result.saverMinutes = Math.max(1, Math.min(60, Math.round(v.saverMinutes)));
  if (typeof v.marquee === 'string')
    result.marquee = v.marquee.replace(/[\r\n]/g, ' ').slice(0, 48);
  if (v.shell === 'progman') result.shell = v.shell;
  if (typeof v.welcome === 'boolean') result.welcome = v.welcome;
  for (const key of [
    'hasVisited',
    'welcomeCompleted',
    'windowAnimations',
    'showAssistant',
    'clock24Hour',
    'showSeconds',
    'quickLaunch',
    'taskbarLabels',
    'followStoryTheme',
    'pixelImages',
    'showDesktopIcons',
    'autoArrangeIcons',
    'showFileExtensions',
  ] as const) {
    if (typeof v[key] === 'boolean') result[key] = v[key];
  }
  if (v.welcome === false && !Object.hasOwn(v, 'welcomeCompleted')) result.welcomeCompleted = true;
  if (Array.isArray(v.quickLaunchItems))
    result.quickLaunchItems = [
      ...new Set(
        v.quickLaunchItems.filter(
          (item): item is string => typeof item === 'string' && /^[a-z][a-z0-9-]{0,47}$/.test(item),
        ),
      ),
    ].slice(0, QUICK_LAUNCH_CAPACITY);
  if (
    v.startupAnimation === 'first-visit' ||
    v.startupAnimation === 'always' ||
    v.startupAnimation === 'never'
  )
    result.startupAnimation = v.startupAnimation;
  if (v.riskDisplay === 'auto' || v.riskDisplay === 'always' || v.riskDisplay === 'hidden')
    result.riskDisplay = v.riskDisplay;
  if (Array.isArray(v.recentRunCommands))
    result.recentRunCommands = sanitizeRecentCommands(v.recentRunCommands);
  if (Array.isArray(v.recentProgramIds))
    result.recentProgramIds = sanitizeRecentPrograms(v.recentProgramIds);
  return result;
}
/** Pin a program when the bar has room. Command ids beginning with `$` are not programs. */
export function pinQuickLaunch(
  items: readonly string[],
  id: string,
): { readonly quickLaunch: true; readonly quickLaunchItems: readonly string[] } | undefined {
  if (!id || id.startsWith('$') || items.length >= QUICK_LAUNCH_CAPACITY) return undefined;
  return { quickLaunch: true, quickLaunchItems: [...new Set([...items, id])] };
}

export function unpinQuickLaunch(items: readonly string[], id: string): readonly string[] {
  return items.filter((item) => item !== id);
}

/** Remember a Run entry. The shell persists `recentRunCommands` through updateSettings. */
export function rememberRunCommand(
  settings: Readonly<DesktopSettings>,
  text: string,
): DesktopSettings {
  const recentRunCommands = sanitizeRecentCommands([text, ...settings.recentRunCommands]);
  if (sameList(recentRunCommands, settings.recentRunCommands)) return settings;
  return { ...settings, recentRunCommands };
}
/** Remember a launched program id. The shell persists `recentProgramIds` through updateSettings. */
export function rememberRecentProgram(
  settings: Readonly<DesktopSettings>,
  id: string,
): DesktopSettings {
  const recentProgramIds = sanitizeRecentPrograms([id, ...settings.recentProgramIds]);
  if (sameList(recentProgramIds, settings.recentProgramIds)) return settings;
  return { ...settings, recentProgramIds };
}

/** Apply only edited fields, retaining preferences changed by another open applet. */
export function desktopSettingsPatch(
  before: Readonly<DesktopSettings>,
  after: Readonly<DesktopSettings>,
): Partial<DesktopSettings> {
  const patch: Partial<DesktopSettings> = {};
  const changed = <K extends keyof DesktopSettings>(key: K) => {
    if (before[key] !== after[key]) patch[key] = after[key];
  };
  (Object.keys(DEFAULT_SETTINGS) as (keyof DesktopSettings)[]).forEach(changed);
  return patch;
}
export function parsePixelWallpaper(value: unknown): PixelWallpaper | undefined {
  if (!value || typeof value !== 'object') return;
  const v = value as Record<string, unknown>;
  if (
    typeof v.width !== 'number' ||
    typeof v.height !== 'number' ||
    !Number.isInteger(v.width) ||
    !Number.isInteger(v.height) ||
    v.width < 1 ||
    v.height < 1 ||
    v.width > 320 ||
    v.height > 200 ||
    !Array.isArray(v.pixels) ||
    v.pixels.length !== v.width * v.height ||
    !v.pixels.every(
      (p: unknown) => typeof p === 'number' && Number.isInteger(p) && p >= 0 && p < 16,
    )
  )
    return;
  return { width: v.width, height: v.height, pixels: [...v.pixels] };
}
export function effectiveSaver(saver: Saver, risk: number): Saver {
  return risk >= 86 ? 'P(DOOM).SCR' : saver;
}
