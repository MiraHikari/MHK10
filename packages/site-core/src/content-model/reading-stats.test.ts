import { describe, expect, it } from 'vite-plus/test';
import { READING_PACE, measureReadingText } from './reading-stats';

describe('shared reading measurement', () => {
  it('states one pace for both presentations', () => {
    expect(READING_PACE).toEqual({ wordsPerMinute: 200, cjkCharactersPerMinute: 400 });
  });

  it.each(['', ' \n\t ', '…。，!? — 😀'])('does not invent reading time for %j', (text) => {
    expect(measureReadingText(text)).toEqual({
      words: 0,
      cjkCharacters: 0,
      minutes: 0,
      seconds: 0,
    });
  });

  it('counts Han, kana and Hangul characters as CJK', () => {
    expect(measureReadingText('字'.repeat(400))).toEqual({
      words: 0,
      cjkCharacters: 400,
      minutes: 1,
      seconds: 60,
    });
    expect(measureReadingText('かなカナ한글')).toMatchObject({ words: 0, cjkCharacters: 6 });
  });

  it('counts Latin words at the shared pace', () => {
    expect(measureReadingText('word '.repeat(200))).toEqual({
      words: 200,
      cjkCharacters: 0,
      minutes: 1,
      seconds: 60,
    });
  });

  it('combines both counts in mixed-language body text', () => {
    const measurement = measureReadingText('阅读 MHK10，hello world! 日本語 かな カナ 한글');
    expect(measurement.words).toBe(3);
    expect(measurement.cjkCharacters).toBe(11);
    expect(measurement.minutes).toBeCloseTo(0.0425);
    expect(measurement.seconds).toBeCloseTo(2.55);
  });

  it('keeps Unicode words and apostrophes intact while punctuation and blocks separate words', () => {
    expect(measureReadingText("Don't stop. Café café\nnext—line 2026").words).toBe(7);
    expect(measureReadingText('one\ntwo\nthree').words).toBe(3);
    expect(measureReadingText('一one二two').words).toBe(2);
  });

  it('accepts an explicit pace without rounding the result', () => {
    expect(
      measureReadingText('word '.repeat(100), {
        wordsPerMinute: 100,
        cjkCharactersPerMinute: 200,
      }),
    ).toEqual({ words: 100, cjkCharacters: 0, minutes: 1, seconds: 60 });
    expect(
      measureReadingText('字字字', { wordsPerMinute: 200, cjkCharactersPerMinute: 7 }).minutes,
    ).toBeCloseTo(3 / 7);
  });
});
