import { appMetadata } from '../../../data/app-catalog';
import { defineCanvasApp } from '../../os/host/app-session';

import { HELP_TOPICS, TOUR_STOPS } from '../../ui/help';
import { wrapCopy } from '../../ui/text/copy';

interface State {
  page: number;
  notice: string;
}
export const welcomeApp = defineCanvasApp<State>({
  ...appMetadata('welcome'),
  needsFrame: () => false,
  create: () => ({ page: 0, notice: '' }),
  menus: () => ({ Help: [{ command: 'help', label: 'Desktop Help', shortcut: 'F1' }] }),
  status: (s) => s.notice || `Introduction ${s.page + 1} of ${TOUR_STOPS.length}`,
  draw(s, v, env) {
    if (v.menuSel?.command === 'help')
      env.msg({ ...HELP_TOPICS.desktop, lines: [...HELP_TOPICS.desktop.lines], icon: 'info' });
    const c = v.client;
    v.draw.rect(c.x, c.y, 76, c.h, v.draw.TH.sel);
    v.draw.sprDesktop('i_start', c.x + 22, c.y + 22);
    v.draw.text('MHK10', c.x + 38, c.y + 72, {
      font: 'bold',
      color: v.draw.TH.selText,
      align: 'center',
    });
    const page = TOUR_STOPS[s.page];
    v.draw.text('Getting started', c.x + 90, c.y + 15, { font: 'bold' });
    v.draw.text(page.title, c.x + 90, c.y + 44, { font: 'bold' });
    wrapCopy(page.text, c.w - 110, v.draw.tw).forEach((line, i) =>
      v.draw.text(line, c.x + 90, c.y + 66 + i * 15),
    );
    if (v.widgets.button(c.x + 90, c.y + 149, 128, 23, page.action))
      s.notice = env.open(page.app).accepted ? '' : 'This page is unavailable here.';
    const y = c.y + c.h - 32;
    if (v.widgets.button(c.x + 90, y, 68, 23, 'Back', { disabled: s.page === 0 })) {
      s.page--;
      s.notice = '';
    }
    if (
      v.widgets.button(c.x + 164, y, 68, 23, 'Next', { disabled: s.page === TOUR_STOPS.length - 1 })
    ) {
      s.page++;
      s.notice = '';
    }
    if (v.widgets.button(c.x + c.w - 82, y, 72, 23, 'Finish', { def: true })) {
      env.desktop?.updateSettings({ welcome: false, welcomeCompleted: true });
      env.close(v.win.id);
    }
  },
});
