/** Build-safe metadata. Only composition roots import application implementations. */
import { CANVAS_APPS } from './app-catalog.generated.ts';

export type HostKind = 'hybrid' | 'canvas';
type Group = 'Programs' | 'Documents' | 'Settings';
export type StartMenuFolder = 'accessories' | 'multimedia' | 'games' | 'system-tools';
export type FileCategory =
  | 'text'
  | 'image'
  | 'drawing'
  | 'recording'
  | 'audio'
  | 'shortcut'
  | 'application'
  | 'binary';
export interface CatalogFileGroup {
  extensions: readonly string[];
  description: string;
  category: FileCategory;
}
export interface CatalogApp {
  id: string;
  name: string;
  icon?: string;
  kind: 'canvas' | 'html' | 'link' | 'dialog';
  route?: string;
  title: string;
  w: number;
  h: number;
  x?: number;
  y?: number;
  ctl?: 'mx' | 'x' | '';
  modal?: boolean;
  noClose?: boolean;
  menu?: Group;
  desktop?: readonly HostKind[];
  shortcut?: boolean;
  register?: 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
  applet?: boolean;
  files?: readonly CatalogFileGroup[];
  handlerLabel?: string;
  startMenuFolder?: StartMenuFolder;
  runAliases?: readonly string[];
  assistantVerbs?: readonly string[];
}
const START_MENU_FOLDERS = [
  { folder: 'accessories', label: 'Accessories' },
  { folder: 'multimedia', label: 'Multimedia' },
  { folder: 'games', label: 'Games' },
  { folder: 'system-tools', label: 'System Tools' },
] as const satisfies readonly { folder: StartMenuFolder; label: string }[];
/** Canvas registrations are authored beside their implementations and snapshotted here. */
export const NON_CANVAS_APPS = [
  {
    id: 'acdsee',
    name: 'ACDSee',
    icon: 'film',
    kind: 'html',
    route: '/acdsee/',
    title: 'ACDSee',
    w: 560,
    h: 310,
    x: 72,
    y: 16,
    register: 'L2',
    menu: 'Programs',
    files: [
      {
        extensions: ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.avif', '.svg', '.ico'],
        description: 'Image',
        category: 'image',
      },
    ],
    handlerLabel: 'ACDSee',
  },
  {
    id: 'home',
    icon: 'home',
    name: 'MHK10',
    kind: 'html',
    route: '/',
    title: 'MHK10 — Home',
    w: 540,
    h: 310,
    x: 92,
    y: 16,
    menu: 'Documents',
    desktop: ['hybrid'],
    shortcut: true,
  },
  {
    id: 'profile',
    icon: 'user',
    name: 'MiraHikari',
    kind: 'html',
    route: '/about/',
    title: 'MiraHikari — Properties',
    w: 560,
    h: 310,
    x: 72,
    y: 16,
    menu: 'Documents',
    desktop: ['hybrid'],
    shortcut: true,
  },
  {
    id: 'network',
    icon: 'web',
    name: 'Long-Distance Directory',
    kind: 'html',
    route: '/network/',
    title: 'Long-Distance Directory',
    w: 460,
    h: 314,
    x: 100,
    y: 12,
  },
  {
    id: 'gallery',
    icon: 'gallery',
    name: 'Pictures',
    kind: 'html',
    route: '/gallery/',
    title: 'Pictures - Explorer',
    w: 520,
    h: 300,
    x: 108,
    y: 16,
    menu: 'Documents',
    desktop: ['hybrid'],
    shortcut: true,
    runAliases: ['pictures'],
    assistantVerbs: ['pictures', 'gallery'],
  },
  {
    id: 'blog',
    icon: 'details',
    name: 'Documents',
    kind: 'html',
    route: '/blog/',
    title: 'Documents - Reader',
    w: 520,
    h: 300,
    x: 108,
    y: 16,
    menu: 'Documents',
    desktop: ['hybrid'],
    shortcut: true,
    runAliases: ['documents'],
    assistantVerbs: ['blog'],
    files: [
      { extensions: ['.md', '.markdown'], description: 'Markdown document', category: 'text' },
      { extensions: ['.htm', '.html'], description: 'HTML document', category: 'text' },
    ],
    handlerLabel: 'Reader',
  },
  {
    id: 'skills',
    icon: 'chip',
    name: 'Device Manager',
    kind: 'html',
    route: '/skills/',
    title: 'Device Manager',
    w: 500,
    h: 300,
    x: 128,
    y: 16,
    menu: 'Documents',
    shortcut: true,
    assistantVerbs: ['projects', 'skills'],
  },
  {
    id: 'lab',
    icon: 'exe',
    name: 'MHK10 · Canvas',
    kind: 'link',
    route: '/lab/',
    title: 'MHK10 · Canvas',
    w: 640,
    h: 360,
    menu: 'Documents',
  },
  {
    id: '$saveas',
    icon: 'doc',
    name: 'Save As',
    kind: 'dialog',
    title: 'Save As',
    w: 402,
    h: 286,
    x: 119,
    y: 28,
    ctl: 'x',
    modal: true,
  },
] as const satisfies readonly CatalogApp[];
export type CatalogAppId =
  | (typeof CANVAS_APPS)[number]['id']
  | (typeof NON_CANVAS_APPS)[number]['id'];
/** Menu flow, cascades and registry output follow this curated sequence. */
const CATALOG_ORDER = [
  'home',
  'acdsee',
  'control-panel',
  'sounds',
  'mouse',
  'date-time',
  'system',
  'components',
  'accessibility',
  'modems',
  'media-player',
  'defrag',
  'pixel',
  'solitaire',
  'sound-recorder',
  'print-preview',
  'dialup',
  'network',
  'charmap',
  'welcome',
  'progman',
  'taskbar-settings',
  'profile',
  'gallery',
  'blog',
  'skills',
  'computer',
  'bin',
  'train',
  'pdoom',
  'mines',
  'chat',
  'calculator',
  'clock',
  'task-manager',
  'notepad',
  'display',
  'killswitch',
  'system-about',
  'training',
  'postcard',
  'recovery',
  'connection',
  'diagnostics',
  'lab',
  '$saveas',
] as const satisfies readonly CatalogAppId[];
const ENTRIES: readonly CatalogApp[] = [...CANVAS_APPS, ...NON_CANVAS_APPS];
const BY_ID = new Map(ENTRIES.map((app) => [app.id, app]));
export const APP_CATALOG: readonly CatalogApp[] = CATALOG_ORDER.map((id) => {
  const app = BY_ID.get(id);
  if (!app) throw new Error(`Catalog order references an unknown application: ${id}`);
  return app;
});
const catalogIconStem = (id: string) => id.replace(/^\$/, '');
export const catalogIcon = (id: string) => `app_${catalogIconStem(id)}`;
/** Mirrors the file names written by scripts/sync-react95-icons.mjs. */
export const appIconFile = (id: string) => `app-${catalogIconStem(id)}`;
export function appMetadata(id: CatalogAppId) {
  const app: CatalogApp = APP_CATALOG.find((entry) => entry.id === id)!;
  const { title, w, h, x, y, ctl, modal, noClose, register } = app;
  return { id, title, icon: catalogIcon(id), w, h, x, y, ctl, modal, noClose, register };
}
export function resolveAppId(id: string, host: HostKind): string {
  if (id === 'network-home') return 'home';
  return id === 'about' ? (host === 'hybrid' ? 'profile' : 'system-about') : id;
}
export function appRoute(id: string): string | undefined {
  return BY_ID.get(id)?.route;
}
export const canvasAppRoutes = APP_CATALOG.filter((app) => app.kind === 'canvas').map((app) => ({
  id: app.id,
  slug: app.route!.split('/').filter(Boolean).at(-1)!,
  name: app.name,
  href: app.route!,
}));
export function desktopShortcuts(host: HostKind) {
  return APP_CATALOG.filter((app) => app.desktop?.includes(host)).map((app) => ({
    id: app.id,
    label: app.name,
    icon: catalogIcon(app.id),
  }));
}
export function startMenuApps(host: HostKind) {
  const folderOf = new Map(APP_CATALOG.map((app) => [app.id, app.startMenuFolder]));
  return (['Programs', 'Documents', 'Settings'] as const).flatMap((group) => {
    const children = APP_CATALOG.filter(
      (app) =>
        app.menu === group &&
        (host === 'hybrid' || app.kind === 'canvas') &&
        !(group === 'Settings' && app.applet),
    ).map((app) => ({ label: app.name, icon: catalogIcon(app.id), command: app.id }));
    const collections =
      group === 'Programs'
        ? [
            ...START_MENU_FOLDERS.map((entry) => ({
              label: entry.label,
              icon: 'i_folder',
              children: children.filter((app) => folderOf.get(app.command) === entry.folder),
            })),
            ...children.filter((app) => !folderOf.get(app.command)),
          ]
        : children;
    return collections.length
      ? [
          {
            label: group,
            icon: group === 'Settings' ? 'i_display' : 'i_folder',
            children: collections,
          },
        ]
      : [];
  });
}
