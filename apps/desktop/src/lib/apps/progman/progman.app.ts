import { APP_CATALOG, appMetadata, catalogIcon, type CatalogApp } from '../../../data/app-catalog';
import { defineCanvasApp } from '../../os/host/app-session';

import { stepIndex } from '../../ui/canvas/list-navigation';
import { wrapCopy } from '../../ui/text/copy';

const main = new Set([
  'computer',
  'control-panel',
  'recovery',
  'diagnostics',
  'charmap',
  'display',
]);
const games = new Set(['mines', 'solitaire']);
const excluded = new Set(['progman', 'system-about', 'welcome']);
const catalog = APP_CATALOG as readonly CatalogApp[];
const groups = [
  { title: 'Main', apps: catalog.filter((app) => main.has(app.id)) },
  {
    title: 'Accessories',
    apps: catalog.filter(
      (app) =>
        app.kind === 'canvas' &&
        app.menu === 'Programs' &&
        !main.has(app.id) &&
        !games.has(app.id) &&
        !excluded.has(app.id),
    ),
  },
  { title: 'Games', apps: catalog.filter((app) => games.has(app.id)) },
  {
    title: 'Personal',
    apps: catalog.filter((app) => app.kind === 'html'),
  },
];
interface State {
  group: number;
  selected: number[];
  page: number[];
  last: string;
  at: number;
  notice: string;
}
export const progmanApp = defineCanvasApp<State>({
  ...appMetadata('progman'),
  needsFrame: () => false,
  create: () => ({
    group: 0,
    selected: [0, 0, 0, 0],
    page: [0, 0, 0, 0],
    last: '',
    at: 0,
    notice: '',
  }),
  menus: () => ({
    File: [
      { command: 'open', label: 'Open', shortcut: 'Enter' },
      '-',
      { command: 'desktop', label: 'Return to Desktop' },
    ],
    Window: groups.map((group, i) => ({ command: `group-${i}`, label: group.title })),
    Help: [{ command: 'welcome', label: 'Welcome Tour' }],
  }),
  status: (s) => s.notice || `${groups[s.group].title} | ${groups[s.group].apps.length} program(s)`,
  checkpoint: () => true,
  onClose: (_state, env) => {
    env.desktop?.updateSettings({ shell: 'desktop' });
  },
  draw(s, v, env) {
    let open = v.menuSel?.command === 'open';
    if (v.menuSel?.command === 'desktop') {
      env.desktop?.updateSettings({ shell: 'desktop' });
      return env.close(v.win.id);
    }
    if (v.menuSel?.command === 'welcome') env.open('welcome');
    groups.forEach((_group, i) => {
      if (v.menuSel?.command === `group-${i}`) s.group = i;
    });
    if (v.focused && v.win.menu.open < 0) {
      if (v.input.io.keyPressed.has('ArrowDown')) {
        s.group = (s.group + 2) % 4;
        v.input.consumeKey('ArrowDown');
      }
      if (v.input.io.keyPressed.has('ArrowUp')) {
        s.group = (s.group + 2) % 4;
        v.input.consumeKey('ArrowUp');
      }
      for (const [key, delta] of [
        ['ArrowLeft', -1],
        ['ArrowRight', 1],
      ] as const) {
        if (!v.input.io.keyPressed.has(key)) continue;
        s.selected[s.group] = stepIndex(groups[s.group].apps.length, s.selected[s.group], delta);
        s.page[s.group] = Math.floor(s.selected[s.group] / 3);
        v.input.consumeKey(key);
      }
      if (v.input.io.keyPressed.has('Enter')) {
        open = true;
        v.input.consumeKey('Enter');
      }
    }
    const c = v.client,
      width = Math.floor((c.w - 18) / 2),
      height = Math.floor((c.h - 18) / 2);
    groups.forEach((group, gi) => {
      const x = c.x + 6 + (gi % 2) * (width + 6),
        y = c.y + 6 + Math.floor(gi / 2) * (height + 6);
      v.widgets.bevel(x, y, width, height);
      v.draw.rect(
        x + 3,
        y + 3,
        width - 6,
        17,
        gi === s.group ? v.draw.TH.title : v.draw.TH.titleOff,
      );
      v.draw.text(group.title, x + 8, y + 7, { font: 'bold', color: v.draw.TH.titleText });
      if (v.input.hit(x + 3, y + 3, width - 45, 17).clicked) s.group = gi;
      const pages = Math.max(1, Math.ceil(group.apps.length / 3));
      if (v.widgets.button(x + width - 39, y + 4, 16, 15, '<', { disabled: s.page[gi] === 0 })) {
        s.page[gi]--;
        s.selected[gi] = s.page[gi] * 3;
        s.group = gi;
      }
      if (
        v.widgets.button(x + width - 21, y + 4, 16, 15, '>', { disabled: s.page[gi] + 1 >= pages })
      ) {
        s.page[gi]++;
        s.selected[gi] = s.page[gi] * 3;
        s.group = gi;
      }
      const cellW = Math.floor((width - 12) / 3);
      group.apps.slice(s.page[gi] * 3, s.page[gi] * 3 + 3).forEach((app, index) => {
        const itemIndex = s.page[gi] * 3 + index,
          ix = x + 6 + cellW * index,
          iy = y + 27;
        if (v.input.hit(ix, iy, cellW, height - 30).clicked) {
          open = v.input.io.dbl && s.last === app.id && env.now() - s.at < 0.45;
          s.group = gi;
          s.selected[gi] = itemIndex;
          s.last = app.id;
          s.at = env.now();
        }
        v.draw.sprDesktop(catalogIcon(app.id), ix + Math.floor(cellW / 2) - 16, iy);
        if (s.group === gi && s.selected[gi] === itemIndex)
          v.draw.rect(ix, iy + 33, cellW, 27, v.draw.TH.sel);
        wrapCopy(app.name, cellW - 4, v.draw.tw)
          .slice(0, 2)
          .forEach((line, row) =>
            v.draw.text(line, ix + Math.floor(cellW / 2), iy + 36 + row * 12, {
              align: 'center',
              color:
                s.group === gi && s.selected[gi] === itemIndex ? v.draw.TH.selText : v.draw.TH.text,
            }),
          );
      });
    });
    if (open) {
      const app = groups[s.group].apps[s.selected[s.group]];
      if (app)
        s.notice = env.open(app.id).accepted
          ? `${app.name} opened.`
          : `${app.name} is unavailable.`;
      v.input.consumePointer('dbl');
    }
  },
});
