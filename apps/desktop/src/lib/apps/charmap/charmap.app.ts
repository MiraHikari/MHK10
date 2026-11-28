import { appMetadata } from '../../../data/app-catalog';
import { defineCanvasApp } from '../../os/host/app-session';
import { BITMAP_FONTS } from '../../gfx/bitmap-font';
import { type FontName } from '../../gfx/text';

const fonts: readonly { id: FontName; name: string }[] = [
  { id: 'ui', name: 'MS Sans Serif' },
  { id: 'bold', name: 'MS Sans Serif Bold' },
  { id: 'dos', name: 'Press Start 2P' },
];
interface State {
  font: number;
  page: number;
  selected: number;
  sample: string;
}
export const charmapApp = defineCanvasApp<State>({
  ...appMetadata('charmap'),
  needsFrame: () => false,
  create: () => ({ font: 0, page: 0, selected: 65, sample: '' }),
  menus: () => ({
    File: [
      { command: 'save', label: 'Save characters...' },
      '-',
      { command: 'close', label: 'Close' },
    ],
    Help: [{ command: 'fonts', label: 'Font attribution' }],
  }),
  status: (s) =>
    `U+${s.selected.toString(16).toUpperCase().padStart(4, '0')} | ${s.font < 2 ? '11px, 1-bit glyph data' : '8px, thresholded glyphs'}`,
  draw(s, v, env) {
    if (v.menuSel?.command === 'close') return env.close(v.win.id);
    if (v.menuSel?.command === 'fonts')
      env.msg({
        title: 'Installed Fonts',
        icon: 'info',
        lines: [
          'MS Sans Serif and Bold by lou (FontStruct).',
          '11px bitmap adaptation: CC BY-SA 3.0.',
          'Sources: fontstruct.com/fontstructions/show/1384746',
          'Bold source: fontstruct.com/fontstructions/show/1384862',
          'Press Start 2P by CodeMan38: SIL Open Font License.',
          'The original notices accompany these fonts.',
        ],
      });
    if (v.menuSel?.command === 'save')
      void env.saveText({ name: 'Characters.txt', content: s.sample, folder: 'root' });
    const c = v.client,
      font = fonts[s.font].id;
    fonts.forEach((item, i) => {
      if (v.widgets.radio(c.x + 10 + i * 151, c.y + 10, item.name, s.font === i)) {
        s.font = i;
        s.page = 0;
      }
    });
    const codes =
      font === 'dos'
        ? Array.from({ length: 95 }, (_, i) => i + 32)
        : Object.keys(BITMAP_FONTS[font === 'ui' ? 'ui' : 'bold']).map(Number);
    const perPage = 80,
      pageCodes = codes.slice(s.page * perPage, (s.page + 1) * perPage);
    pageCodes.forEach((code, i) => {
      const x = c.x + 10 + (i % 16) * 27,
        y = c.y + 32 + Math.floor(i / 16) * 25;
      v.widgets.field(x, y, 27, 25);
      if (s.selected === code) v.draw.rect(x + 2, y + 2, 23, 21, v.draw.TH.sel);
      v.draw.text(String.fromCodePoint(code), x + 13, y + 8, {
        font,
        align: 'center',
        color: s.selected === code ? v.draw.TH.selText : v.draw.TH.text,
      });
      if (v.input.hit(x, y, 27, 25).clicked) s.selected = code;
    });
    if (v.widgets.button(c.x + 10, c.y + 165, 66, 23, 'Previous', { disabled: s.page === 0 }))
      s.page--;
    if (
      v.widgets.button(c.x + 82, c.y + 165, 66, 23, 'Next', {
        disabled: (s.page + 1) * perPage >= codes.length,
      })
    )
      s.page++;
    v.draw.text(String.fromCodePoint(s.selected), c.x + 192, c.y + 166, { font, scale: 3 });
    if (
      v.widgets.button(c.x + c.w - 91, c.y + 165, 80, 23, 'Select', {
        disabled: s.sample.length >= 40,
      })
    )
      s.sample += String.fromCodePoint(s.selected);
    v.widgets.field(c.x + 10, c.y + 198, c.w - 92, 23);
    v.draw.text(s.sample, c.x + 16, c.y + 205, { font });
    if (v.widgets.button(c.x + c.w - 76, c.y + 198, 66, 23, 'Clear')) s.sample = '';
  },
});
