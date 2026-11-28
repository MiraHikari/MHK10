/** Logical paper units; the browser maps this complete page to A4 without repagination. */
export interface PrintLayout {
  pages: readonly (readonly string[])[];
  width: number;
  height: number;
  margin: number;
  lineHeight: number;
  fontSize: number;
  headerHeight: number;
  footerHeight: number;
}

export const PRINT_PAPER = {
  width: 480,
  height: 680,
  margin: 32,
  lineHeight: 16,
  fontSize: 12,
  headerHeight: 24,
  footerHeight: 24,
} as const;
const NO_START = new Set(Array.from('、。，．？！：；…）》」』】〕〉％%!?;:,.)]}'));
const NO_END = new Set(Array.from('（《「『【〔〈([{'));
const cjk = (character: string) =>
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(character);
const word = (character: string) => !cjk(character) && /[\p{Letter}\p{Number}_'’]/u.test(character);
const segments = new Intl.Segmenter('zh-Hans', { granularity: 'grapheme' });
function breakBetween(before: string, after: string): boolean {
  if (NO_END.has(before) || NO_START.has(after)) return false;
  return !word(before) || !word(after);
}

/** Natural word/CJK breaks, with grapheme-only emergency wrapping for oversized words. */
export function printLines(
  content: string,
  width: number,
  measure: (text: string) => number,
): string[] {
  const lines: string[] = [];
  const limit = Math.max(1, width);
  for (const paragraph of content.replace(/\r\n?/g, '\n').split('\n')) {
    const chars = Array.from(segments.segment(paragraph), (part) => part.segment);
    if (!chars.length) {
      lines.push('');
      continue;
    }
    let start = 0;
    while (start < chars.length) {
      let end = start + 1;
      while (end < chars.length && measure(chars.slice(start, end + 1).join('')) <= limit) end++;
      if (end < chars.length) {
        let legal = end;
        while (legal > start && !breakBetween(chars[legal - 1], chars[legal])) legal--;
        if (legal > start) end = legal;
      }
      lines.push(chars.slice(start, end).join('').trimEnd());
      start = end;
      while (start < chars.length && /^\s+$/u.test(chars[start])) start++;
    }
  }
  return lines;
}

export function paginatePrintLines(
  content: string,
  width: number,
  rows: number,
  measure: (text: string) => number,
): string[][] {
  const lines = printLines(content, width, measure);
  const pages: string[][] = [];
  const count = Math.max(1, Math.floor(rows));
  for (let index = 0; index < lines.length; index += count)
    pages.push(lines.slice(index, index + count));
  return pages.length ? pages : [['']];
}

export function createPrintLayout(content: string, measure: (text: string) => number): PrintLayout {
  const paper = PRINT_PAPER;
  const rows = Math.floor(
    (paper.height - paper.margin * 2 - paper.headerHeight - paper.footerHeight) / paper.lineHeight,
  );
  return {
    ...paper,
    pages: paginatePrintLines(content, paper.width - paper.margin * 2, rows, measure),
  };
}
