/** Shared reading measurement: one pace for article cards and the Reader estimate. */

export const READING_PACE = {
  wordsPerMinute: 200,
  cjkCharactersPerMinute: 400,
} as const;

export interface ReadingPace {
  readonly wordsPerMinute: number;
  readonly cjkCharactersPerMinute: number;
}

export interface ReadingTextMeasurement {
  readonly words: number;
  readonly cjkCharacters: number;
  /** Unrounded minutes; callers choose whether to display a rounded label. */
  readonly minutes: number;
  readonly seconds: number;
}

const cjkCharacter = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
const word = /[\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:['’][\p{L}\p{N}][\p{L}\p{N}\p{M}]*)*/gu;

/** Count CJK characters and non-CJK words; images and elapsed time do not contribute. */
export function measureReadingText(
  text: string,
  pace: ReadingPace = READING_PACE,
): ReadingTextMeasurement {
  let cjkCharacters = 0;
  const remaining = text.replace(cjkCharacter, () => {
    cjkCharacters += 1;
    return ' ';
  });
  let words = 0;
  for (const _match of remaining.matchAll(word)) words += 1;
  const minutes = words / pace.wordsPerMinute + cjkCharacters / pace.cjkCharactersPerMinute;
  return { words, cjkCharacters, minutes, seconds: minutes * 60 };
}
