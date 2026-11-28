export type CardSuit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
export interface Card {
  suit: CardSuit;
  rank: number;
  faceUp: boolean;
}
export interface SolitaireGame {
  stock: Card[];
  waste: Card[];
  foundations: Card[][];
  tableau: Card[][];
  moves: number;
}
export type CardSource =
  | { pile: 'waste' }
  | { pile: 'foundation'; column: number }
  | { pile: 'tableau'; column: number; index: number };
export type CardTarget = { pile: 'foundation' | 'tableau'; column: number };
const SUITS: readonly CardSuit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
export const redCard = (card: Card): boolean => card.suit === 'diamonds' || card.suit === 'hearts';
const copyGame = (game: SolitaireGame): SolitaireGame => ({
  stock: game.stock.map((card) => ({ ...card })),
  waste: game.waste.map((card) => ({ ...card })),
  foundations: game.foundations.map((pile) => pile.map((card) => ({ ...card }))),
  tableau: game.tableau.map((pile) => pile.map((card) => ({ ...card }))),
  moves: game.moves,
});

/** Inject randomness so deals can be replayed and verified without a browser. */
export function dealSolitaire(random: () => number = Math.random): SolitaireGame {
  const deck: Card[] = SUITS.flatMap((suit) =>
    Array.from({ length: 13 }, (_, rank) => ({ suit, rank: rank + 1, faceUp: false })),
  );
  for (let i = deck.length - 1; i > 0; i--) {
    const sample = random();
    const j = Math.floor(
      (Number.isFinite(sample) ? Math.max(0, Math.min(0.999999999, sample)) : 0) * (i + 1),
    );
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const tableau = Array.from({ length: 7 }, (_, column) => {
    const cards = deck.splice(0, column + 1);
    cards.at(-1)!.faceUp = true;
    return cards;
  });
  return { stock: deck, waste: [], tableau, foundations: [[], [], [], []], moves: 0 };
}

export function drawSolitaire(game: SolitaireGame): SolitaireGame {
  if (!game.stock.length && !game.waste.length) return game;
  const next = copyGame(game);
  if (next.stock.length) next.waste.push({ ...next.stock.pop()!, faceUp: true });
  else {
    next.stock = next.waste.reverse().map((card) => ({ ...card, faceUp: false }));
    next.waste = [];
  }
  next.moves++;
  return next;
}

export function selectedCards(game: SolitaireGame, source: CardSource): readonly Card[] {
  if (source.pile === 'waste') return game.waste.slice(-1);
  const piles = source.pile === 'tableau' ? game.tableau : game.foundations;
  if (!Number.isInteger(source.column) || !piles[source.column]) return [];
  const pile = piles[source.column];
  if (source.pile === 'foundation') return pile.slice(-1);
  if (!Number.isInteger(source.index) || source.index < 0 || source.index >= pile.length) return [];
  const cards = pile.slice(source.index);
  if (cards.some((card) => !card.faceUp)) return [];
  if (
    cards.some(
      (card, i) =>
        i > 0 && (card.rank !== cards[i - 1].rank - 1 || redCard(card) === redCard(cards[i - 1])),
    )
  )
    return [];
  return cards;
}

export function moveSolitaire(
  game: SolitaireGame,
  source: CardSource,
  target: CardTarget,
): SolitaireGame {
  const cards = selectedCards(game, source);
  if (!cards.length || !Number.isInteger(target.column)) return game;
  if (source.pile === target.pile && 'column' in source && source.column === target.column)
    return game;
  const destination = (target.pile === 'tableau' ? game.tableau : game.foundations)[target.column];
  if (!destination) return game;
  const top = destination.at(-1),
    first = cards[0];
  if (target.pile === 'foundation') {
    if (
      cards.length !== 1 ||
      (top ? top.suit !== first.suit || top.rank + 1 !== first.rank : first.rank !== 1)
    )
      return game;
  } else if (
    top
      ? !top.faceUp || redCard(top) === redCard(first) || top.rank !== first.rank + 1
      : first.rank !== 13
  )
    return game;
  const next = copyGame(game);
  if (source.pile === 'waste') next.waste.pop();
  else if (source.pile === 'foundation') next.foundations[source.column].pop();
  else {
    next.tableau[source.column].splice(source.index);
    const uncovered = next.tableau[source.column].at(-1);
    if (uncovered) uncovered.faceUp = true;
  }
  (target.pile === 'tableau' ? next.tableau : next.foundations)[target.column].push(
    ...cards.map((card) => ({ ...card })),
  );
  next.moves++;
  return next;
}

export function solitaireWon(game: SolitaireGame): boolean {
  return (
    game.stock.length === 0 &&
    game.waste.length === 0 &&
    game.tableau.every((pile) => !pile.length) &&
    game.foundations.length === 4 &&
    game.foundations.every(
      (pile) =>
        pile.length === 13 &&
        pile.every((card, index) => card.rank === index + 1 && card.suit === pile[0].suit),
    ) &&
    new Set(game.foundations.map((pile) => pile[0].suit)).size === 4
  );
}

export interface CascadeCard {
  x: number;
  y: number;
  rank: number;
  suit: CardSuit;
}
/** Whole-pixel, bounded celebration; reduced motion has no moving cards. */
export function solitaireCascade(
  time: number,
  width: number,
  height: number,
  reducedMotion = false,
): CascadeCard[] {
  if (reducedMotion || time < 0 || time > 18) return [];
  return Array.from({ length: 52 }, (_, index) => {
    const age = time - index * 0.12;
    const direction = index % 2 ? 1 : -1;
    const x = Math.round(width / 2 + direction * age * (40 + (index % 7) * 8));
    const bounce = Math.abs(Math.sin(age * 2.8)) * Math.max(0, height - 66 - age * 7);
    return {
      x,
      y: Math.round(height - 52 - bounce),
      rank: (index % 13) + 1,
      suit: SUITS[Math.floor(index / 13)],
      age,
    };
  })
    .filter((card) => card.age >= 0 && card.x > -36 && card.x < width)
    .map(({ age: _age, ...card }) => card);
}
