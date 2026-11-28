import { defineCanvasApp } from '../../os/host/app-session';
import { appMetadata } from '../../../data/app-catalog';
import { DESKTOP_SITE_URL, GENERAL_SITE_URL, displayAddress } from '../../../data/site-addresses';
import { PROJECT_REPOSITORY_LABEL } from '@mhk/site-core/config/repository';
// about.ts: About MHK10 — the credits, in the video's About box layout (ch08).

import { C } from '../../gfx/palette';

/** Both presentations' public addresses, shown under the credits. */
const ADDRESS_LINES = [
  ...(GENERAL_SITE_URL ? [`Web: ${displayAddress(GENERAL_SITE_URL)}`] : []),
  `Desktop: ${displayAddress(DESKTOP_SITE_URL)}`,
];

const LINES = [
  'Personal Edition / MiraHikari',
  'Version 1.0',
  '',
  'Original desktop: DOOM OS 95',
  'by amemiya02',
  'github.com/amemiya02/pdoom-video-win95',
  '',
  'Icons: React95',
  '',
  ...ADDRESS_LINES,
  `Source: ${PROJECT_REPOSITORY_LABEL}`,
];

export const aboutApp = defineCanvasApp({
  ...appMetadata('system-about'),
  // 静态说明页：只在输入/状态变化时重绘，不需要每帧渲染。
  needsFrame: () => false,

  create: () => null,

  draw(_s, v, env) {
    const c = v.client;
    v.draw.spr('i_start', c.x + 9, c.y + 10, 2);
    v.draw.text('MHK10', c.x + 53, c.y + 12, { font: 'bold', scale: 2, color: v.draw.TH.text });
    v.draw.rect(c.x + 53, c.y + 35, c.w - 66, 1, v.draw.TH.shadow);
    v.draw.rect(c.x + 53, c.y + 36, c.w - 66, 1, v.draw.TH.hi);
    let y = c.y + 46;
    for (const l of LINES) {
      if (l === '') {
        y += 6;
        continue;
      }
      v.draw.text(l, c.x + 53, y, { color: l.startsWith('github.com') ? C.blue : v.draw.TH.text });
      y += 13;
    }
    y += 3;
    v.draw.rect(c.x + 53, y, c.w - 66, 1, v.draw.TH.shadow);
    v.draw.rect(c.x + 53, y + 1, c.w - 66, 1, v.draw.TH.hi);
    v.draw.text('System status: Ready', c.x + 53, y + 10, { color: v.draw.TH.text });
    if (v.widgets.button(c.x + 53, c.y + c.h - 30, 108, 21, 'Character Map')) env.open('charmap');
    if (v.widgets.button(c.x + c.w - 72, c.y + c.h - 30, 62, 21, 'OK', { def: true }))
      env.close(v.win.id);
  },
});
