import { describe, expect, it } from 'vite-plus/test';
import { READING_PACE, measureReadingText } from '@mhk/site-core/content-model/reading-stats';
import { measureReaderText, remainingReadingSeconds } from './reader-statistics-model';

describe('Reader text estimates', () => {
  it('uses the shared pace and measurement for body text', () => {
    expect(READING_PACE).toEqual({ wordsPerMinute: 200, cjkCharactersPerMinute: 400 });
    const text = '阅读 MHK10，hello world! 日本語 かな カナ 한글';
    expect(measureReaderText(text)).toEqual(measureReadingText(text));
  });

  it.each(['', ' \n\t ', '…。，!? — 😀'])('does not invent reading time for %j', (text) => {
    expect(measureReaderText(text)).toEqual({
      words: 0,
      cjkCharacters: 0,
      minutes: 0,
      seconds: 0,
    });
  });

  it('counts CJK characters separately from words in mixed-language body text', () => {
    const statistics = measureReaderText('阅读 MHK10，hello world! 日本語 かな カナ 한글');
    expect(statistics.words).toBe(3);
    expect(statistics.cjkCharacters).toBe(11);
    expect(statistics.minutes).toBeCloseTo(0.0425);
    expect(statistics.seconds).toBeCloseTo(2.55);
  });

  it('keeps Unicode words and apostrophes intact while punctuation and block boundaries separate words', () => {
    expect(measureReaderText("Don't stop. Café café\nnext—line 2026").words).toBe(7);
    expect(measureReaderText('one\ntwo\nthree').words).toBe(3);
    expect(measureReaderText('一one二two').words).toBe(2);
  });

  it('uses stated pace assumptions without recording elapsed activity', () => {
    const statistics = measureReaderText(`${'word '.repeat(200)}${'字'.repeat(400)}`);
    expect(statistics).toEqual({ words: 200, cjkCharacters: 400, minutes: 2, seconds: 120 });
    expect(remainingReadingSeconds(statistics, 0)).toBe(120);
    expect(remainingReadingSeconds(statistics, 0.25)).toBe(90);
    expect(remainingReadingSeconds(statistics, 1)).toBe(0);
    expect(remainingReadingSeconds(statistics, -1)).toBe(120);
    expect(remainingReadingSeconds(statistics, 2)).toBe(0);
    expect(remainingReadingSeconds(statistics, NaN)).toBe(120);
    expect(remainingReadingSeconds(statistics, Infinity)).toBe(120);
  });
});
