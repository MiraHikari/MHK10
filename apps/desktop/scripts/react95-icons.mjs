// Preserve React95 upstream license and pin source files for reproducible generation.
import { APP_CATALOG } from '../src/data/app-catalog.ts';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { PAL } from '../src/lib/gfx/palette.ts';
export const REACT95_REVISION = '1b94d9f59b5bb556b42bd9c3019051ef93bbaf24';
export const ICON_SOURCES = {
  computer: 'Computer',
  bin: 'RecycleEmpty',
  exe: 'Shell323',
  folder: 'Folder',
  doc: 'Notepad2',
  kill: 'User4',
  chat: 'Textchat',
  chart: 'Sysmon1000',
  mine: 'Winmine1',
  display: 'Computer3',
  help: 'Winhlp324000',
  find: 'ComputerFind',
  start: 'User1',
  user: 'User',
  doom: 'User2',
  gallery: 'Inetcpl1319',
  filter: 'FolderSettings',
  tiles: 'Shell3216',
  details: 'Wordpad',
  film: 'MediaVideo',
  previous: 'Back',
  next: 'Back',
  'rotate-right': 'Back',
  'rotate-left': 'Back',
  terminal: 'MsDos',
  chip: 'Regedit',
  code: 'FolderExe',
  network: 'Msnp32WrkgrpIcon',
  database: 'Msnp32ServerIcon',
  tools: 'FolderSettings',
  cube: 'Regedit100',
  mail: 'Wmsui321000',
  palette: 'Mspaint',
  name: 'FolderRename',
  star: 'Star',
  home: 'Inetcpl1301',
  web: 'Url102',
  controls: 'Controls3000',
  sounds: 'Mmsys101',
  mouse: 'Main100',
  clock: 'Timedate',
  hardware: 'Main500',
  components: 'Appwiz1500',
  accessibility: 'Access110',
  modem: 'Dpmodemx701',
  player: 'Mplayer10',
  defrag: 'Defrag',
  solitaire: 'Sol1',
  microphone: 'Mmsys116',
  printer: 'Printer',
  dialup: 'Dialmon200',
  charmap: 'Charmap1',
  progman: 'Progman1',
  recovery: 'Scandskw1',
  calculator: 'Calculator',
  clockface: 'Time',
  taskmanager: 'Taskman100',
};
export const APP_SOURCES = {
  ...Object.fromEntries(APP_CATALOG.map((app) => [app.id, app.icon ?? 'exe'])),
  about: 'user',
};
export const LARGE_ONLY = new Set([
  'Sysmon1000',
  'User4',
  'User2',
  'Main100',
  'Dialmon200',
  'Progman1',
  'Inetcpl1319',
  'Taskman100',
]);

export const SMALL_ONLY = new Set(['Back', 'Time']);
export const BIT_DEPTH = { MsDos: 32 };

export const sourceIconName = (name, size) => `${name}_${size}x${size}_${BIT_DEPTH[name] ?? 4}.png`;
export const sourceIconSize = (name, size) =>
  SMALL_ONLY.has(name) || (size === 16 && !LARGE_ONLY.has(name)) ? 16 : 32;
const palette = Object.entries(PAL)
  .filter(([letter]) => letter !== 'l')
  .map(([letter, hex]) => ({
    letter,
    rgb: [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)),
  }));

/** The only application-art conversion: native React95 PNG pixels to VGA. */
export function readIconArtwork(name, size) {
  const file = sourceIconName(name, sourceIconSize(name, size));
  const png = PNG.sync.read(
    readFileSync(new URL(`../public/icons/react95/${file}`, import.meta.url)),
  );
  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => {
      const at =
        (Math.floor((y * png.height) / size) * png.width + Math.floor((x * png.width) / size)) * 4;
      if (png.data[at + 3] < 128) return '.';
      return palette.reduce(
        (best, color) => {
          const distance = color.rgb.reduce(
            (sum, value, channel) => sum + (value - png.data[at + channel]) ** 2,
            0,
          );
          return distance < best.distance ? { distance, letter: color.letter } : best;
        },
        { distance: Infinity, letter: '.' },
      ).letter;
    }).join(''),
  ).join('\n');
}
