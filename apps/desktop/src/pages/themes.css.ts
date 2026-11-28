import { themeCss } from '../lib/gfx/palette';
import { DLG } from '../lib/ui/canvas/layout';
export const GET = () =>
  new Response(
    themeCss() +
      `\n:root{--control-height:${DLG.btnH}px;--control-row:${DLG.row}px;--control-gap:${DLG.gap}px;--control-margin:${DLG.margin}px;--control-tab:${DLG.tabH}px}`,
    { headers: { 'Content-Type': 'text/css; charset=utf-8' } },
  );
