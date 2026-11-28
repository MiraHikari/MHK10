import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { format } from 'vite-plus/fmt';
import { formatOptions } from '../../../scripts/format-policy.mjs';
import { PAL } from '../src/lib/gfx/palette.ts';
import {
  REACT95_REVISION,
  ICON_SOURCES,
  APP_SOURCES,
  LARGE_ONLY,
  SMALL_ONLY,
  sourceIconName,
  sourceIconSize,
  readIconArtwork,
} from './react95-icons.mjs';

const base = new URL('../public/icons/', import.meta.url);
const originals = new URL('react95/', base);
mkdirSync(originals, { recursive: true });
const upstream = `https://raw.githubusercontent.com/React95/React95/${REACT95_REVISION}/`;
const paths = [...new Set(Object.values(ICON_SOURCES))].flatMap((name) => [
  ...(SMALL_ONLY.has(name) ? [] : [sourceIconName(name, 32)]),
  ...(LARGE_ONLY.has(name) ? [] : [sourceIconName(name, 16)]),
]);
for (const [id, key] of Object.entries(APP_SOURCES)) {
  if (!Object.hasOwn(ICON_SOURCES, key))
    throw new Error(`Application ${id} requires a React95 library icon; unknown key ${key}.`);
}
const manifest = {};
for (const name of paths) {
  const target = new URL(name, originals);
  if (!existsSync(target)) {
    const response = await fetch(`${upstream}packages/icons/png/${name}`);
    if (!response.ok) throw new Error(`React95 ${name}: HTTP ${response.status}`);
    writeFileSync(target, Buffer.from(await response.arrayBuffer()));
  }
  manifest[name] = createHash('sha256').update(readFileSync(target)).digest('hex');
}
const license = new URL('LICENSE', originals);
if (!existsSync(license)) {
  const response = await fetch(`${upstream}LICENSE`);
  if (!response.ok) throw new Error('Could not obtain React95 license');
  writeFileSync(license, await response.text());
}
writeFileSync(
  new URL('source.json', originals),
  JSON.stringify(
    {
      repository: 'https://github.com/React95/React95',
      revision: REACT95_REVISION,
      package: '@react95/icons',
      license: 'See LICENSE: MIT for code; Windows images remain Microsoft property',
      files: manifest,
      applications: Object.fromEntries(
        Object.entries(APP_SOURCES).map(([id, key]) => {
          const source = ICON_SOURCES[key];
          return [
            id,
            {
              icon: source,
              small: sourceIconName(source, sourceIconSize(source, 16)),
              large: sourceIconName(source, sourceIconSize(source, 32)),
            },
          ];
        }),
      ),
    },
    null,
    2,
  ) + '\n',
);
const icons = Object.fromEntries(
  Object.entries(ICON_SOURCES).map(([name, source]) => [
    name,
    { small: readIconArtwork(source, 16), large: readIconArtwork(source, 32) },
  ]),
);
// Shared MHK10 magnifier geometry; the sign is the only difference between actions.
function zoomArt(enlarge, size) {
  const rows = [
    '...KKKKK........',
    '.KKWWWWWKK......',
    '.KWWWWWWWK......',
    'KWWWWWWWWWK.....',
    'KWWWWWWWWWK.....',
    'KWWWWWWWWWK.....',
    'KWWWWWWWWWK.....',
    'KWWWWWWWWWK.....',
    '.KWWWWWWWK......',
    '.KKWWWWWKKK.....',
    '...KKKKK.KgK....',
    '..........KgK...',
    '...........KgK..',
    '............KgK.',
    '.............KgK',
    '..............KK',
  ].map((row) => [...row]);
  for (let at = 3; at <= 7; at++) {
    rows[5][at] = 'K';
    if (enlarge) rows[at][5] = 'K';
  }
  return Array.from({ length: size }, (_, y) =>
    Array.from(
      { length: size },
      (_, x) => rows[Math.floor((y * 16) / size)][Math.floor((x * 16) / size)],
    ).join(''),
  ).join('\n');
}
for (const [name, enlarge] of [
  ['zoom-in', true],
  ['zoom-out', false],
]) {
  icons[name] = { small: zoomArt(enlarge, 16), large: zoomArt(enlarge, 32) };
}
icons.next = {
  small: icons.previous.small
    .split('\n')
    .map((row) => [...row].reverse().join(''))
    .join('\n'),
  large: icons.previous.large
    .split('\n')
    .map((row) => [...row].reverse().join(''))
    .join('\n'),
};
// MHK10 image-viewer rotation commands, one pixel master and its mirrored counterpart.
const rotation = [
  '.....KKKK.......',
  '...KKBBBBKK.....',
  '..KBBWWWWBBK....',
  '.KBW......WBK...',
  '.KBW.......BK...',
  'KBW.....KKKKKKK.',
  'KBW......KBBBBK.',
  'KBW.......KBBK..',
  'KBW........KK...',
  '.KBW............',
  '.KBWW.......WK..',
  '..KBBWWWWWBBK...',
  '...KKBBBBBKK....',
  '.....KKKKK......',
  '................',
  '................',
];
for (const [name, flipped] of [
  ['rotate-right', false],
  ['rotate-left', true],
]) {
  const master = rotation.map((row) => (flipped ? [...row].reverse().join('') : row));
  icons[name] = {
    small: master.join('\n'),
    large: Array.from({ length: 32 }, (_, y) =>
      Array.from({ length: 32 }, (_, x) => master[Math.floor(y / 2)][Math.floor(x / 2)]).join(''),
    ).join('\n'),
  };
}
/** Original 16-colour marks. These are not upstream logos. */
function localIcon(rows) {
  if (rows.length !== 16 || rows.some((row) => row.length !== 16))
    throw new Error(`Local icon must be 16×16, received ${rows.length} rows`);
  return {
    small: rows.join('\n'),
    large: Array.from({ length: 32 }, (_, y) =>
      Array.from({ length: 32 }, (_, x) => rows[Math.floor(y / 2)][Math.floor(x / 2)]).join(''),
    ).join('\n'),
  };
}
Object.assign(icons, {
  github: localIcon([
    '................',
    '...KK......KK...',
    '..KWWK....KWWK..',
    '..KWWWWWWWWWWK..',
    '...KWWKWWKWWK...',
    '...KWWWWWWWWK...',
    '....KWWWWWWK....',
    '.....KKKKKK.....',
    '....KWWWWWWK....',
    '...KWWWWWWWWK...',
    '...KWWK..KWWK...',
    '....KK....KK....',
    '................',
    '................',
    '................',
    '................',
  ]),
  bilibili: localIcon([
    '................',
    '.....K....K.....',
    '......K..K......',
    '....KKKKKKKK....',
    '...KWWWWWWWWK...',
    '..KWBBBBBBBBWK..',
    '..KWBBWWWWBBWK..',
    '..KWBBBBBBBBWK..',
    '...KWWWWWWWWK...',
    '....KKKKKKKK....',
    '......KKKK......',
    '.....KWWWWK.....',
    '....KKWWWWKK....',
    '................',
    '................',
    '................',
  ]),
  pin: localIcon([
    '................',
    '................',
    '.....KKKKK......',
    '....KNNNNNK.....',
    '...KNNBBBBNK....',
    '...KNBBRBBNK....',
    '...KNNBBBBNK....',
    '....KNNNNNK.....',
    '.....KNNNK......',
    '......KNK.......',
    '.......K........',
    '......KKK.......',
    '................',
    '................',
    '................',
    '................',
  ]),
  apeiron: localIcon([
    '................',
    '................',
    '.....KK..KK.....',
    '...KK......KK...',
    '..K..........K..',
    '..K..........K..',
    '.K............K.',
    '.K............K.',
    '.K............K.',
    '.K............K.',
    '..K..........K..',
    '..K..........K..',
    '...KK......KK...',
    '.....KKKKKK.....',
    '................',
    '................',
  ]),
  kairos: localIcon([
    '................',
    '..KKKKKKKKKKKK..',
    '..KWWWWWWWWWWK..',
    '...KWWWWWWWWK...',
    '....KWWWWWWK....',
    '.....KWWWWK.....',
    '......KWWK......',
    '.......KK.......',
    '.......KK.......',
    '......KWWK......',
    '.....KWWWWK.....',
    '....KWWWWWWK....',
    '...KWWWWWWWWK...',
    '..KWWWWWWWWWWK..',
    '..KKKKKKKKKKKK..',
    '................',
  ]),
  ecstasis: localIcon([
    '................',
    '................',
    '..KKKKKKKK......',
    '..KWWWWWWK..K...',
    '..KWWWWWWK.KWK..',
    '..KWWWWWWK.KWK..',
    '..KWWWWWWK..K...',
    '..KWWWWWWK......',
    '..KWWWWWWK......',
    '..KKKKKKKK......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]),
  // Shell dialogs get their own marks so Task Manager rows stay distinguishable.
  run: localIcon([
    '................',
    '..KKKKKKKKKKKK..',
    '..KWWWWWWWWWWK..',
    '..KWWWWWWWWWWK..',
    '..KWWWWWWWWWWK..',
    '..KWWKKKKKWWWK..',
    '..KWWKWWWKWKWK..',
    '..KWWKWWWKWKWK..',
    '..KWWKWWWKWKWK..',
    '..KWWKKKKKWWWK..',
    '..KWWWWWWWWWWK..',
    '..KWWWWWWWWWWK..',
    '..KKKKKKKKKKKK..',
    '................',
    '................',
    '................',
  ]),
  rename: localIcon([
    '................',
    '.........KK.....',
    '........KWWK....',
    '.......KWWWK....',
    '......KWWWK.....',
    '.....KWWWK......',
    '....KWWWK.......',
    '...KWWWK........',
    '..KWWWK.........',
    '..KWWK..........',
    '..KWK...........',
    '..KK............',
    '................',
    '..KKKKKKKKKKKK..',
    '................',
    '................',
  ]),
  msg: localIcon([
    '................',
    '..KKKKKKKKKKKK..',
    '.KWWWWWWWWWWWWK.',
    'KWWKWWWWWWWWWWWK',
    'KWWWKWWWWWWWWWWK',
    'KWWWWKWWWWWWWWWK',
    'KWWWKWWWWWWWWWWK',
    'KWWKWWWWWWWWWWWK',
    'KWWWWWWWWWWWWWWK',
    'KWWWWWWWWWWWWWWK',
    'KWWWWWWWWWWWWWK.',
    'KWWWWWWWWWWWWKK.',
    '.KKKKKKKKKKKKKK.',
    '.....KKKKKK.....',
    '................',
    '................',
  ]),
});
function svg(artwork) {
  const rows = artwork.split('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${rows.length}" height="${rows.length}" viewBox="0 0 ${rows.length} ${rows.length}" shape-rendering="crispEdges">${rows.flatMap((row, y) => [...row].map((letter, x) => (PAL[letter] ? `<path fill="${PAL[letter]}" d="M${x} ${y}h1v1h-1z"/>` : ''))).join('')}</svg>\n`;
}
for (const [name, icon] of Object.entries(icons)) {
  writeFileSync(new URL(`${name}.svg`, base), svg(icon.small));
  writeFileSync(new URL(`${name}-32.svg`, base), svg(icon.large));
}
for (const [id, name] of Object.entries(APP_SOURCES)) {
  const source = ICON_SOURCES[name];
  if (
    icons[name].small !== readIconArtwork(source, 16) ||
    icons[name].large !== readIconArtwork(source, 32)
  )
    throw new Error(`Application ${id} uses modified library artwork.`);
  const stem = id.replace(/^\$/, '');
  writeFileSync(new URL(`app-${stem}.svg`, base), svg(icons[name].small));
  writeFileSync(new URL(`app-${stem}-32.svg`, base), svg(icons[name].large));
}
const generated = `// Generated by scripts/sync-react95-icons.mjs from React95/icons (application icons) and local toolbar glyphs; see public/icons/react95/LICENSE. Revision ${REACT95_REVISION}.\nexport const REACT95_ICONS: Record<string, { small: string; large: string }> = ${JSON.stringify(icons, null, 2)};\nexport const APP_ICON_SOURCES = ${JSON.stringify(APP_SOURCES, null, 2)} as const;\n`;
const formatted = await format('src/lib/gfx/react95-icon-data.ts', generated, formatOptions);
if (formatted.errors.length) throw new Error('Could not format generated React95 sprite data');
writeFileSync(new URL('../src/lib/gfx/react95-icon-data.ts', import.meta.url), formatted.code);
console.log(
  `Generated ${Object.keys(APP_SOURCES).length} application and ${Object.keys(icons).length} system icons from React95.`,
);
