import { describe, expect, it } from 'vite-plus/test';
import {
  dealSolitaire,
  drawSolitaire,
  moveSolitaire,
  selectedCards,
  solitaireCascade,
  solitaireWon,
  type Card,
  type CardSuit,
  type SolitaireGame,
} from './solitaire-model';

const card = (rank: number, suit: CardSuit = 'clubs', faceUp = true): Card => ({
  rank,
  suit,
  faceUp,
});
const game = (tableau: Card[][] = [[], [], [], [], [], [], []]): SolitaireGame => ({
  stock: [],
  waste: [],
  foundations: [[], [], [], []],
  tableau,
  moves: 0,
});

describe('Klondike rules', () => {
  it('deals all 52 unique cards with only the top tableau cards exposed', () => {
    const dealt = dealSolitaire(() => 0.5);
    const cards = [...dealt.stock, ...dealt.tableau.flat()];
    expect(cards).toHaveLength(52);
    expect(new Set(cards.map((item) => `${item.suit}:${item.rank}`)).size).toBe(52);
    expect(dealt.stock).toHaveLength(24);
    expect(dealt.stock.every((item) => !item.faceUp)).toBe(true);
    expect(dealt.tableau.map((pile) => pile.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(
      dealt.tableau.every(
        (pile) => pile.at(-1)!.faceUp && pile.slice(0, -1).every((item) => !item.faceUp),
      ),
    ).toBe(true);
    expect(dealSolitaire(() => 0.5)).toEqual(dealt);
  });

  it('draws one card and recycles waste without changing the sequence', () => {
    const initial = { ...game(), stock: [card(2, 'clubs', false), card(1, 'clubs', false)] };
    const first = drawSolitaire(initial);
    expect(first.waste[0].rank).toBe(1);
    expect(initial.stock).toHaveLength(2);
    const second = drawSolitaire(first);
    expect(second.waste.map((item) => item.rank)).toEqual([1, 2]);
    const recycled = drawSolitaire(second);
    expect(recycled.waste).toHaveLength(0);
    expect(recycled.stock.every((item) => !item.faceUp)).toBe(true);
    expect(drawSolitaire(recycled).waste[0].rank).toBe(1);
  });

  it('moves alternating descending stacks and reveals the covered card', () => {
    const initial = game([
      [card(4, 'clubs', false), card(12, 'hearts'), card(11, 'spades')],
      [card(13)],
      [],
      [],
      [],
      [],
      [],
    ]);
    const moved = moveSolitaire(
      initial,
      { pile: 'tableau', column: 0, index: 1 },
      { pile: 'tableau', column: 1 },
    );
    expect(moved.tableau[1].map((item) => item.rank)).toEqual([13, 12, 11]);
    expect(moved.tableau[0]).toEqual([card(4)]);
    expect(initial.tableau[0][0].faceUp).toBe(false);
    expect(moved.moves).toBe(1);
  });

  it('rejects hidden cards, invalid stacks, same-colour moves and empty columns without kings', () => {
    const initial = game([
      [card(10, 'hearts', false), card(9, 'clubs'), card(8, 'spades')],
      [card(10)],
      [],
      [],
      [],
      [],
      [],
    ]);
    expect(selectedCards(initial, { pile: 'tableau', column: 0, index: 0 })).toEqual([]);
    expect(selectedCards(initial, { pile: 'tableau', column: 0, index: 1 })).toEqual([]);
    expect(
      moveSolitaire(
        initial,
        { pile: 'tableau', column: 0, index: 2 },
        { pile: 'tableau', column: 1 },
      ),
    ).toBe(initial);
    expect(
      moveSolitaire(
        initial,
        { pile: 'tableau', column: 1, index: 0 },
        { pile: 'tableau', column: 2 },
      ),
    ).toBe(initial);
    expect(
      moveSolitaire(
        initial,
        { pile: 'tableau', column: 1, index: -1 },
        { pile: 'tableau', column: 2 },
      ),
    ).toBe(initial);
    expect(
      moveSolitaire(
        initial,
        { pile: 'tableau', column: 1, index: 0 },
        { pile: 'tableau', column: 99 },
      ),
    ).toBe(initial);
  });

  it('starts empty columns with kings and foundations with aces in ascending suit', () => {
    const initial = { ...game(), waste: [card(13, 'hearts')] };
    const king = moveSolitaire(initial, { pile: 'waste' }, { pile: 'tableau', column: 0 });
    expect(king.tableau[0]).toEqual([card(13, 'hearts')]);
    const ace = moveSolitaire(
      { ...game(), waste: [card(1)] },
      { pile: 'waste' },
      { pile: 'foundation', column: 0 },
    );
    const two = moveSolitaire(
      { ...ace, waste: [card(2)] },
      { pile: 'waste' },
      { pile: 'foundation', column: 0 },
    );
    expect(two.foundations[0].map((item) => item.rank)).toEqual([1, 2]);
    const wrongSuit = { ...two, waste: [card(3, 'hearts')] };
    expect(moveSolitaire(wrongSuit, { pile: 'waste' }, { pile: 'foundation', column: 0 })).toBe(
      wrongSuit,
    );
    const wrongRank = { ...two, waste: [card(4)] };
    expect(moveSolitaire(wrongRank, { pile: 'waste' }, { pile: 'foundation', column: 0 })).toBe(
      wrongRank,
    );
  });

  it('wins only after all four complete suits reach the foundations', () => {
    const suits: CardSuit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
    const almost = {
      ...game(),
      foundations: suits.map((suit) =>
        Array.from({ length: suit === 'spades' ? 12 : 13 }, (_, index) => card(index + 1, suit)),
      ),
      waste: [card(13, 'spades')],
    };
    expect(solitaireWon(almost)).toBe(false);
    const won = moveSolitaire(almost, { pile: 'waste' }, { pile: 'foundation', column: 3 });
    expect(solitaireWon(won)).toBe(true);
    expect(
      solitaireWon({ ...won, foundations: [won.foundations[0], ...won.foundations.slice(0, 3)] }),
    ).toBe(false);
  });

  it('produces bounded whole-pixel cascades and honours reduced motion', () => {
    const cards = solitaireCascade(3, 530, 250);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((item) => Number.isInteger(item.x) && Number.isInteger(item.y))).toBe(true);
    expect(solitaireCascade(3, 530, 250, true)).toEqual([]);
    expect(solitaireCascade(19, 530, 250)).toEqual([]);
  });
});
