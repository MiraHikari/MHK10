import { APP_CATALOG, appMetadata, catalogIcon, type CatalogApp } from '../../../data/app-catalog';
import { defineCanvasApp } from '../../os/host/app-session';

const items = (APP_CATALOG as readonly CatalogApp[]).filter((app) => app.applet);
interface State {
  selected: number;
  last: number;
  at: number;
}
export const controlPanelApp = defineCanvasApp<State>({
  ...appMetadata('control-panel'),
  needsFrame: () => false,
  create: () => ({ selected: 0, last: -1, at: 0 }),
  menus: () => ({
    File: [
      { command: 'open', label: 'Open', shortcut: 'Enter' },
      '-',
      { command: 'close', label: 'Close' },
    ],
  }),
  status: () => `${items.length} object(s)`,
  draw(s, v, env) {
    if (v.menuSel?.command === 'close') return env.close(v.win.id);
    let open = v.menuSel?.command === 'open';
    if (v.focused && v.win.menu.open < 0) {
      if (v.input.io.keyPressed.has('ArrowRight'))
        s.selected = Math.min(items.length - 1, s.selected + 1);
      if (v.input.io.keyPressed.has('ArrowLeft')) s.selected = Math.max(0, s.selected - 1);
      if (v.input.io.keyPressed.has('ArrowDown'))
        s.selected = Math.min(items.length - 1, s.selected + 3);
      if (v.input.io.keyPressed.has('ArrowUp')) s.selected = Math.max(0, s.selected - 3);
      if (v.input.io.keyPressed.has('Enter')) {
        open = true;
        v.input.consumeKey('Enter');
      }
    }
    const c = v.client;
    v.widgets.field(c.x, c.y, c.w, c.h);
    const colW = Math.floor((c.w - 12) / 3);
    items.forEach((app, i) => {
      const x = c.x + 6 + (i % 3) * colW;
      const y = c.y + 7 + Math.floor(i / 3) * 64;
      if (v.input.hit(x, y, colW - 4, 60).clicked) {
        open = v.input.io.dbl && s.last === i && env.now() - s.at < 0.45;
        s.last = i;
        s.at = env.now();
        s.selected = i;
      }
      if (s.selected === i) v.draw.rect(x + 2, y + 36, colW - 8, 19, v.draw.TH.sel);
      v.draw.sprDesktop(catalogIcon(app.id), x + Math.floor(colW / 2) - 16, y);
      v.draw.text(app.name, x + Math.floor(colW / 2), y + 41, {
        align: 'center',
        color: s.selected === i ? v.draw.TH.selText : v.draw.TH.text,
      });
    });
    if (open) {
      env.open(items[s.selected].id);
      v.input.consumePointer('dbl');
    }
  },
});
