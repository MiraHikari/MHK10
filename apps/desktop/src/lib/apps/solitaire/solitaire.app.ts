import type { AppFrame } from '../../os/host/app-contracts';
import { appMetadata } from '../../../data/app-catalog';
import { C } from '../../gfx/palette';

import { defineCanvasApp } from '../../os/host/app-session';
import type { AppServices } from '../../os/host/app-contracts';

import {
  dealSolitaire,
  drawSolitaire,
  moveSolitaire,
  redCard,
  selectedCards,
  solitaireCascade,
  solitaireWon,
  type Card,
  type CardSource,
  type CardTarget,
  type SolitaireGame,
} from './solitaire-model';

const CARD_W = 54,
  CARD_H = 62;
interface SolitaireState {
  game: SolitaireGame | null;
  selected: CardSource | null;
  history: SolitaireGame[];
  wonAt: number | null;
  notice: string;
  alive: boolean;
}
function suit(frame: AppFrame, card: Card, x: number, y: number): void {
  const ink = redCard(card) ? C.red : C.black;
  if (card.suit === 'diamonds')
    frame.draw.poly(
      [
        [x + 4, y],
        [x + 8, y + 5],
        [x + 4, y + 10],
        [x, y + 5],
      ],
      ink,
    );
  else if (card.suit === 'hearts') {
    frame.draw.rect(x, y + 1, 4, 4, ink);
    frame.draw.rect(x + 5, y + 1, 4, 4, ink);
    frame.draw.poly(
      [
        [x, y + 4],
        [x + 8, y + 4],
        [x + 4, y + 10],
      ],
      ink,
    );
  } else if (card.suit === 'spades') {
    frame.draw.poly(
      [
        [x + 4, y],
        [x + 9, y + 6],
        [x, y + 6],
      ],
      ink,
    );
    frame.draw.rect(x + 3, y + 5, 3, 5, ink);
  } else {
    frame.draw.rect(x + 3, y, 4, 4, ink);
    frame.draw.rect(x, y + 4, 4, 4, ink);
    frame.draw.rect(x + 6, y + 4, 4, 4, ink);
    frame.draw.rect(x + 4, y + 4, 2, 7, ink);
  }
}
function drawCard(frame: AppFrame, card: Card, x: number, y: number, selected = false): void {
  frame.draw.rect(x, y, CARD_W, CARD_H, selected ? C.yellow : C.black);
  frame.draw.rect(x + 1, y + 1, CARD_W - 2, CARD_H - 2, C.white);
  if (!card.faceUp) {
    frame.draw.rect(x + 3, y + 3, CARD_W - 6, CARD_H - 6, C.navy);
    for (let yy = y + 5; yy < y + CARD_H - 4; yy += 4)
      for (let xx = x + 5; xx < x + CARD_W - 4; xx += 4)
        frame.draw.rect(xx + ((yy - y) % 8 ? 1 : 0), yy, 1, 1, C.aqua);
    return;
  }
  const rank = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][card.rank];
  const ink = redCard(card) ? C.red : C.black;
  frame.draw.text(rank, x + 4, y + 3, { color: ink });
  suit(frame, card, x + CARD_W - 15, y + 3);
  suit(frame, card, x + 22, y + 26);
  frame.draw.text(rank, x + CARD_W - 4, y + CARD_H - 14, { color: ink, align: 'right' });
  if (selected) frame.draw.frame(x + 2, y + 2, CARD_W - 4, CARD_H - 4, C.yellow);
}
function accept(state: SolitaireState, next: SolitaireGame, env: AppServices): boolean {
  if (next === state.game) return false;
  if (state.game) state.history = [...state.history.slice(-99), state.game];
  state.game = next;
  state.selected = null;
  state.notice = '';
  env.play('click');
  if (solitaireWon(next)) {
    state.wonAt = env.now();
    env.play('tada');
  }
  return true;
}
function deal(state: SolitaireState, env: AppServices): void {
  if (env.story.get().ending === 'doom') {
    state.notice = 'AGI.EXE has declined to deal.';
    env.msg({
      title: 'Solitaire',
      icon: 'info',
      lines: ['AGI.EXE has declined to deal.', 'There are no more hands to play.'],
    });
    return;
  }
  state.game = dealSolitaire();
  state.selected = null;
  state.history = [];
  state.wonAt = null;
  state.notice = '';
}

export const solitaireApp = defineCanvasApp<SolitaireState>({
  ...appMetadata('solitaire'),
  // 只有 18 秒胜利瀑布需要连续帧。
  needsFrame: (s, env) => s.wonAt !== null && !env.reducedMotion && env.now() - s.wonAt <= 18,
  create: (env) => ({
    game: env.story.get().ending === 'doom' ? null : dealSolitaire(),
    selected: null,
    history: [],
    wonAt: null,
    notice: env.story.get().ending === 'doom' ? 'AGI.EXE has declined to deal.' : '',
    alive: true,
  }),
  menus: (state) => ({
    Game: [
      { command: 'deal', label: 'Deal' },
      { command: 'undo', label: 'Undo', disabled: !state.history.length },
      '-',
      { command: 'exit', label: 'Exit' },
    ],
    Help: [{ command: 'rules', label: 'How to play' }],
  }),
  status: (state) =>
    state.notice ||
    (state.game
      ? solitaireWon(state.game)
        ? 'You won. A perfect waste of time.'
        : `${state.game.moves} moves | ${state.game.foundations.reduce((sum, pile) => sum + pile.length, 0)} / 52 cards home`
      : 'No game in progress.'),
  dispose: (state) => {
    state.alive = false;
    state.history = [];
  },
  draw(state, view, env) {
    const c = view.client;
    const action = view.menuSel?.command;
    if (action === 'deal') {
      if (
        state.game &&
        state.game.moves &&
        !solitaireWon(state.game) &&
        env.story.get().ending !== 'doom'
      )
        env.msg({
          title: 'Solitaire',
          icon: 'question',
          lines: ['End this game and deal a new hand?'],
          buttons: ['Deal', 'Cancel'],
          def: 1,
          onBtn: (index) => {
            if (index === 0 && state.alive) deal(state, env);
          },
        });
      else deal(state, env);
    }
    if (
      action === 'undo' ||
      (view.focused && view.win.menu.open < 0 && view.input.io.keyPressed.has('Undo'))
    ) {
      const previous = state.history.pop();
      if (previous) {
        state.game = previous;
        state.selected = null;
        state.wonAt = null;
        state.notice = '';
      }
    }
    if (action === 'exit') env.close(view.win.id);
    if (action === 'rules')
      env.msg({
        title: 'Solitaire Help',
        icon: 'info',
        lines: [
          'Build the four foundations from Ace to King by suit.',
          'Tableau cards descend in alternating colours.',
          'Only a King can occupy an empty tableau column.',
          'Select a card or stack, then select its destination.',
          'Double-click a top card to send it to a foundation.',
          'The stock draws one card. An empty stock turns over.',
        ],
      });
    view.draw.rect(c.x, c.y, c.w, c.h, C.green);
    const game = state.game;
    if (!game) {
      view.draw.text('AGI.EXE has declined to deal.', c.x + Math.floor(c.w / 2), c.y + 90, {
        color: C.white,
        align: 'center',
      });
      return;
    }
    const gap = Math.floor((c.w - 16 - CARD_W) / 6);
    const xFor = (column: number) => c.x + 8 + column * gap;
    const top = c.y + 6;
    const base = c.y + 80;
    const slots: { source: CardSource; x: number; y: number; h: number }[] = [];
    const targetSlots: { target: CardTarget; x: number; y: number; h: number }[] = [];
    const selected = (source: CardSource) =>
      JSON.stringify(source) === JSON.stringify(state.selected);
    view.draw.frame(xFor(0), top, CARD_W, CARD_H, C.lime);
    if (game.stock.length) drawCard(view, game.stock.at(-1)!, xFor(0), top);
    else {
      view.draw.text('O', xFor(0) + 27, top + 23, { color: C.lime, align: 'center', font: 'bold' });
    }
    if (game.waste.length) {
      drawCard(view, game.waste.at(-1)!, xFor(1), top, selected({ pile: 'waste' }));
      slots.push({ source: { pile: 'waste' }, x: xFor(1), y: top, h: CARD_H });
    }
    game.foundations.forEach((pile, column) => {
      const x = xFor(column + 3);
      view.draw.frame(x, top, CARD_W, CARD_H, C.lime);
      if (pile.length) {
        drawCard(view, pile.at(-1)!, x, top, selected({ pile: 'foundation', column }));
        slots.push({ source: { pile: 'foundation', column }, x, y: top, h: CARD_H });
      } else view.draw.text('A', x + 27, top + 23, { color: C.lime, align: 'center' });
      targetSlots.push({ target: { pile: 'foundation', column }, x, y: top, h: CARD_H });
    });
    game.tableau.forEach((pile, column) => {
      const x = xFor(column);
      view.draw.frame(x, base, CARD_W, CARD_H, C.lime);
      const step = Math.max(
        3,
        Math.min(15, Math.floor((c.h - 86 - CARD_H) / Math.max(1, pile.length - 1))),
      );
      pile.forEach((card, index) => {
        const source: CardSource = { pile: 'tableau', column, index };
        const chosen =
          state.selected?.pile === 'tableau' &&
          state.selected.column === column &&
          index >= state.selected.index;
        drawCard(view, card, x, base + index * step, chosen);
        slots.push({
          source,
          x,
          y: base + index * step,
          h: index === pile.length - 1 ? CARD_H : step,
        });
      });
      targetSlots.push({
        target: { pile: 'tableau', column },
        x,
        y: base,
        h: Math.max(CARD_H, (pile.length - 1) * step + CARD_H),
      });
    });
    if (view.input.hit(xFor(0), top, CARD_W, CARD_H).clicked)
      accept(state, drawSolitaire(game), env);
    else {
      const slot = slots.find((entry) => view.input.hit(entry.x, entry.y, CARD_W, entry.h).clicked);
      const target = targetSlots.find(
        (entry) => view.input.hit(entry.x, entry.y, CARD_W, entry.h).clicked,
      );
      let moved = false;
      if (state.selected && target)
        moved = accept(state, moveSolitaire(game, state.selected, target.target), env);
      if (!moved && slot && selectedCards(game, slot.source).length) {
        if (view.input.io.dbl) {
          for (let column = 0; column < 4 && !moved; column++)
            moved = accept(
              state,
              moveSolitaire(game, slot.source, { pile: 'foundation', column }),
              env,
            );
        }
        if (!moved) state.selected = selected(slot.source) ? null : slot.source;
      } else if (!moved && target) {
        state.notice = 'That card cannot be placed there.';
        env.play('error');
      }
    }
    if (view.focused && view.input.io.keyPressed.has('Escape')) state.selected = null;
    if (state.wonAt !== null) {
      solitaireCascade(env.now() - state.wonAt, c.w, c.h, env.reducedMotion).forEach((card) =>
        drawCard(view, { ...card, faceUp: true }, c.x + card.x, c.y + card.y),
      );
      if (env.reducedMotion || env.now() - state.wonAt > 18) {
        view.draw.rect(c.x + 130, c.y + 110, c.w - 260, 36, C.navy);
        view.draw.text('You won!', c.x + Math.floor(c.w / 2), c.y + 121, {
          color: C.white,
          font: 'bold',
          align: 'center',
        });
      }
    }
  },
});
