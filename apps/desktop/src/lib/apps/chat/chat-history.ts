import type { AppFrame, AssistantView } from '../../os/host/app-contracts';
import { createAssistantDrawing } from '../../ui/canvas/assistant';
import { wrapCopy } from '../../ui/text/copy';

type Messages = AssistantView['messages'];
type Line = { role: Messages[number]['role']; first: boolean; text: string };

export interface ChatHistory {
  offset: number;
  count: number;
  readingEarlier: boolean;
  dragOffset: number | null;
  portrait?: HTMLCanvasElement;
  committed?: { messages: Messages; width: number; lines: Line[] };
  partial?: { text: string; width: number; lines: Line[] };
}

export function drawChatHistory(
  frame: AppFrame,
  history: ChatHistory,
  messages: Messages,
  partial: string,
): void {
  const { client, draw, input, widgets } = frame;
  const theme = draw.TH;
  const panel = { x: client.x + 4, y: client.y + 3, w: client.w - 8, h: client.h - 62 };
  if (panel.w < 64 || panel.h < 40) return;
  widgets.field(panel.x, panel.y, panel.w, panel.h);

  const header = { x: panel.x + 2, y: panel.y + 2, w: panel.w - 4, h: 19 };
  draw.rect(header.x, header.y, header.w, header.h, theme.title);
  draw.text(
    draw.fitText('Paperclip / Desk log', header.w - 18, 'bold'),
    header.x + 9,
    header.y + 5,
    {
      font: 'bold',
      color: theme.titleText,
    },
  );

  const log = { x: panel.x + 2, y: panel.y + 23, w: panel.w - 4, h: panel.h - 25 };
  const context = draw.getCtx();
  context.save();
  context.beginPath();
  context.rect(log.x, log.y, log.w, log.h);
  context.clip();

  if (!messages.length) {
    const card = {
      x: log.x + 11,
      y: log.y + Math.max(2, Math.floor((log.h - 64) / 2)),
      w: 62,
      h: 63,
    };
    draw.rect(card.x + 2, card.y + 2, card.w, card.h, theme.shadow);
    draw.rect(card.x, card.y, card.w, card.h, theme.face);
    draw.frame(card.x, card.y, card.w, card.h, theme.shadow);
    draw.rect(card.x + 4, card.y + 4, card.w - 8, 43, theme.field);
    history.portrait ??= createAssistantDrawing(draw).clipSprite();
    context.drawImage(history.portrait, card.x + 17, card.y - 1);
    draw.rect(card.x + 1, card.y + 48, card.w - 2, 14, theme.sel);
    draw.text('ON DUTY', card.x + 31, card.y + 51, { align: 'center', color: theme.selText });

    const left = card.x + card.w + 17;
    const width = log.x + log.w - 14 - left;
    const top = card.y + 15;
    const welcome = wrapCopy('I find things. You do the signing.', width, (text) =>
      draw.tw(text, 'bold'),
    );
    for (const [index, line] of welcome.entries())
      draw.text(line, left, top + index * 13, { font: 'bold', color: theme.text });
    const exampleY = top + welcome.length * 13 + 7;
    draw.rect(left, exampleY - 2, 1, 13, theme.title);
    draw.text(draw.fitText('Try “打开计算器”.', width - 8), left + 8, exampleY, {
      color: theme.text,
    });
    context.restore();
    if (header.w >= 240)
      draw.text('SESSION ONLY', header.x + header.w - 7, header.y + 5, {
        align: 'right',
        color: theme.titleText,
      });
    return;
  }

  const speakerWidth = Math.max(draw.tw('Assistant', 'bold'), draw.tw('Online AI', 'bold')) + 8;
  const width = Math.max(24, log.w - speakerWidth - 39);
  const wrap = (role: Messages[number]['role'], text: string): Line[] =>
    wrapCopy(text, width, draw.tw).map((line, index) => ({ role, first: index === 0, text: line }));
  const updated = history.committed?.messages !== messages;
  if (updated || history.committed?.width !== width)
    history.committed = {
      messages,
      width,
      lines: messages.flatMap(({ role, text }) => wrap(role, text)),
    };
  if (partial && (history.partial?.text !== partial || history.partial.width !== width))
    history.partial = { text: partial, width, lines: wrap('Online AI', partial) };
  else if (!partial) history.partial = undefined;

  const lines = history.committed.lines;
  const count = lines.length + (history.partial?.lines.length ?? 0);
  const visible = Math.max(1, Math.floor((log.h - 6) / 15));
  const maxOffset = Math.max(0, count - visible);
  if (updated && !history.readingEarlier) {
    const replyStart =
      messages.at(-1)?.role !== 'You' ? lines.findLastIndex(({ first }) => first) : count;
    history.offset = Math.max(0, count - replyStart - visible);
  } else if (history.offset > 0) history.offset += count - history.count;
  history.count = count;
  const initialOffset = history.offset;
  const { px, py, wheel } = input.io;
  if (frame.pointerIn && px >= log.x && px < log.x + log.w && py >= log.y && py < log.y + log.h)
    history.offset -= Math.sign(wheel) * 3;
  if (frame.focused && frame.win.menu.open < 0 && !frame.menuSel) {
    if (input.io.keyPressed.has('PageUp')) history.offset += visible;
    if (input.io.keyPressed.has('PageDown')) history.offset -= visible;
    if (input.io.keyPressed.has('Home')) history.offset = maxOffset;
    if (input.io.keyPressed.has('End')) history.offset = 0;
  }
  history.offset = Math.max(0, Math.min(maxOffset, history.offset));

  if (maxOffset && log.h >= 44) {
    const arrowX = log.x + log.w - 15;
    const bottom = log.y + log.h - 14;
    if (widgets.button(arrowX, log.y, 14, 14, '', { disabled: history.offset === maxOffset }))
      history.offset++;
    if (widgets.button(arrowX, bottom, 14, 14, '', { disabled: history.offset === 0 }))
      history.offset--;
    draw.poly(
      [
        [arrowX + 3, log.y + 9],
        [arrowX + 7, log.y + 5],
        [arrowX + 11, log.y + 9],
      ],
      history.offset === maxOffset ? theme.shadow : theme.text,
    );
    draw.poly(
      [
        [arrowX + 3, bottom + 5],
        [arrowX + 11, bottom + 5],
        [arrowX + 7, bottom + 9],
      ],
      history.offset === 0 ? theme.shadow : theme.text,
    );

    const trackY = log.y + 14,
      trackHeight = log.h - 28,
      thumbHeight = Math.min(
        trackHeight,
        Math.max(13, Math.floor((trackHeight * visible) / count)),
      ),
      travel = trackHeight - thumbHeight;
    const thumbY = () => trackY + Math.round((travel * (maxOffset - history.offset)) / maxOffset);
    const thumb = input.hit(arrowX, thumbY(), 14, thumbHeight);
    if (thumb.hover && input.io.wentDown) history.dragOffset = py - thumbY();
    if (input.io.cancelled || !input.io.down) history.dragOffset = null;
    if (history.dragOffset !== null && travel > 0)
      history.offset =
        maxOffset - Math.round(((py - trackY - history.dragOffset) / travel) * maxOffset);
    if (input.hit(arrowX, trackY, 14, trackHeight).clicked && !thumb.hover)
      history.offset += py < thumbY() ? visible : -visible;
    history.offset = Math.max(0, Math.min(maxOffset, history.offset));
    draw.rect(arrowX, trackY, 14, trackHeight, theme.face);
    widgets.bevel(arrowX, thumbY(), 14, thumbHeight, 'button');
  } else history.dragOffset = null;

  if (!history.offset || history.offset !== initialOffset)
    history.readingEarlier = history.offset > 0;
  const end = count - history.offset;
  const start = Math.max(0, end - visible);
  const left = log.x + 9;
  const body = left + speakerWidth + 11;
  draw.rect(log.x, log.y, body - log.x - 6, log.h, theme.face);
  draw.rect(body - 6, log.y, 1, log.h, theme.shadow);
  for (let index = start; index < end; index++) {
    const line = lines[index] ?? history.partial?.lines[index - lines.length];
    if (!line) continue;
    const top = log.y + 4 + (index - start) * 15;
    if (line.first || index === start) {
      const online = line.role === 'Online AI';
      if (online) draw.rect(left, top, draw.tw(line.role, 'bold') + 8, 13, theme.sel);
      draw.text(line.role, left + 4, top + 2, {
        font: 'bold',
        color: online ? theme.selText : theme.text,
      });
    }
    draw.text(line.text, body, top + 2, { color: theme.text });
  }
  context.restore();
  if (maxOffset && header.w >= 240)
    draw.text(`LINES ${start + 1}-${end} / ${count}`, header.x + header.w - 7, header.y + 5, {
      align: 'right',
      color: theme.titleText,
    });
}
