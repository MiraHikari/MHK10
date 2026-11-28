// palette.ts: the 16 VGA colours, the sprite letter palette, and the MHK10 colour schemes.
// The theme table is the seam where colour schemes vary; everything else reads TH.

export interface Palette {
  desk: string;
  face: string;
  hi: string;
  lite: string;
  shadow: string;
  dark: string;
  title: string;
  titleText: string;
  titleOff: string;
  text: string;
  sel: string;
  selText: string;
  field: string;
  deskText: string;
}

export const SOUND_SCHEMES = Object.freeze([
  'standard',
  'night',
  'void',
  'hotdog',
  'teal',
  'phosphor',
  'ribbon',
] as const);
export const CURSOR_SETS = Object.freeze(['arrow', 'inverted', 'phosphor'] as const);
export const THEME_NAMES = Object.freeze([
  'std',
  'night',
  'void',
  'hotdog',
  'teal',
  'phosphor',
  'ribbon',
] as const);
export type SoundScheme = (typeof SOUND_SCHEMES)[number];
export type CursorSet = (typeof CURSOR_SETS)[number];
export type ThemeName = (typeof THEME_NAMES)[number];
export const CURSOR_SET_LABELS: Readonly<Record<CursorSet, string>> = Object.freeze({
  arrow: 'MHK10 Standard',
  inverted: 'Inverted',
  phosphor: 'Phosphor',
});
export interface Theme extends Palette {
  name: string;
  palette: Palette;
  wallpaper: 0 | 1 | 2;
  soundScheme: SoundScheme;
  cursorSet: CursorSet;
  startupSplash: 0 | 1 | 2 | 3;
}

export const C = Object.freeze({
  black: '#000000',
  maroon: '#800000',
  green: '#008000',
  olive: '#808000',
  navy: '#000080',
  purple: '#800080',
  teal: '#008080',
  silver: '#c0c0c0',
  gray: '#808080',
  red: '#ff0000',
  lime: '#00ff00',
  yellow: '#ffff00',
  blue: '#0000ff',
  fuchsia: '#ff00ff',
  aqua: '#00ffff',
  white: '#ffffff',
  light: '#c0c0c0',
  tip: '#ffff00',
} as const);
export const VGA_COLORS = Object.freeze([
  C.black,
  C.maroon,
  C.green,
  C.olive,
  C.navy,
  C.purple,
  C.teal,
  C.silver,
  C.gray,
  C.red,
  C.lime,
  C.yellow,
  C.blue,
  C.fuchsia,
  C.aqua,
  C.white,
] as const);

// sprite letters ('.' and anything else = transparent)
export const PAL: Record<string, string> = {
  K: C.black,
  m: C.maroon,
  e: C.green,
  o: C.olive,
  N: C.navy,
  p: C.purple,
  T: C.teal,
  G: C.silver,
  g: C.gray,
  R: C.red,
  L: C.lime,
  Y: C.yellow,
  B: C.blue,
  F: C.fuchsia,
  C: C.aqua,
  W: C.white,
  l: C.light,
};

const STANDARD: Palette = {
  desk: C.teal,
  face: C.silver,
  hi: C.white,
  lite: C.light,
  shadow: C.gray,
  dark: C.black,
  title: C.navy,
  titleText: C.white,
  titleOff: C.gray,
  text: C.black,
  sel: C.navy,
  selText: C.white,
  field: C.white,
  deskText: C.white,
};
function bundle(
  name: string,
  changes: Partial<Palette>,
  wallpaper: 0 | 1 | 2,
  soundScheme: SoundScheme,
  cursorSet: CursorSet = 'arrow',
  startupSplash: 0 | 1 | 2 | 3 = 0,
): Theme {
  const palette = Object.freeze({ ...STANDARD, ...changes });
  return Object.freeze({
    ...palette,
    name,
    palette,
    wallpaper,
    soundScheme,
    cursorSet,
    startupSplash,
  });
}
export const THEMES: Readonly<Record<ThemeName, Theme>> = Object.freeze({
  std: bundle('MHK10 Standard', {}, 0, 'standard'),
  night: bundle(
    'Singularity Night',
    { desk: C.navy, title: C.purple, sel: C.purple },
    2,
    'night',
    'inverted',
    2,
  ),
  void: bundle(
    'The Void',
    { desk: C.black, title: C.maroon, sel: C.maroon },
    0,
    'void',
    'inverted',
    3,
  ),
  hotdog: bundle(
    'Hot Dog Stand',
    {
      desk: C.red,
      face: C.yellow,
      lite: C.yellow,
      shadow: C.olive,
      title: C.black,
      titleText: C.yellow,
      titleOff: C.olive,
      sel: C.black,
      selText: C.yellow,
    },
    0,
    'hotdog',
    'arrow',
    3,
  ),
  teal: bundle('Teal Dream', { desk: C.teal, title: C.teal, sel: C.teal }, 1, 'teal', 'arrow', 1),
  phosphor: bundle(
    'Phosphor',
    {
      desk: C.black,
      face: C.black,
      hi: C.lime,
      lite: C.gray,
      shadow: C.gray,
      dark: C.black,
      title: C.lime,
      titleText: C.black,
      titleOff: C.gray,
      text: C.lime,
      sel: C.lime,
      selText: C.black,
      field: C.black,
      deskText: C.lime,
    },
    0,
    'phosphor',
    'phosphor',
    1,
  ),
  ribbon: bundle(
    'Blue Ribbon',
    { desk: C.blue, title: C.navy, sel: C.blue },
    1,
    'ribbon',
    'arrow',
    1,
  ),
});

/** Build-safe CSS: both the fallback and embedded pages receive the canvas tokens. */
export function themeProperties(theme: Theme): Record<string, string> {
  return {
    desk: theme.desk,
    face: theme.face,
    ink: theme.text,
    muted: theme.shadow,
    accent: theme.sel,
    'accent-text': theme.selText,
    paper: theme.field,
    line: theme.shadow,
    title: theme.title,
    'title-text': theme.titleText,
    hi: theme.hi,
    shadow: theme.dark,
  };
}
export function themeCss(): string {
  return Object.entries(THEMES)
    .map(([id, theme]) => {
      const vars = themeProperties(theme);
      return `${id === 'std' ? ':root,' : ''}:root[data-theme='${id}']{${Object.entries(vars)
        .map(([key, value]) => `--${key}:${value}`)
        .join(';')}}`;
    })
    .join('\n');
}

export function createThemeController(initial = 'std') {
  let current: Readonly<Theme> = themeFor(initial);
  return {
    get current(): Readonly<Theme> {
      return current;
    },
    setTheme(name: string): Readonly<Theme> {
      current = themeFor(name);
      return current;
    },
  };
}
export function themeFor(name: string): Readonly<Theme> {
  return Object.hasOwn(THEMES, name) ? THEMES[name as ThemeName] : THEMES.std;
}
export type ThemeController = ReturnType<typeof createThemeController>;
