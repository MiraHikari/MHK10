// Layout keeps source offsets, including whitespace, so wrapped editors can place a caret.
export interface DocumentLine {
  text: string;
  start: number;
  end: number;
}

interface LineCache {
  source: string;
  width: number;
  measure: (s: string) => number;
  lines: DocumentLine[];
}

let lineCache: LineCache | undefined;

export function documentLines(
  source: string,
  width: number,
  measure: (s: string) => number,
): DocumentLine[] {
  if (
    lineCache &&
    lineCache.source === source &&
    lineCache.width === width &&
    lineCache.measure === measure
  )
    return lineCache.lines;
  const lines = layoutLines(source, width, measure);
  lineCache = { source, width, measure, lines };
  return lines;
}

function layoutLines(
  source: string,
  width: number,
  measure: (s: string) => number,
): DocumentLine[] {
  const lines: DocumentLine[] = [];
  let offset = 0;
  for (const paragraph of source.split('\n')) {
    if (!paragraph) lines.push({ text: '', start: offset, end: offset });
    else appendWrapped(paragraph, offset, width, measure, lines);
    offset += paragraph.length + 1;
  }
  return lines;
}

/** Sum character widths once instead of measuring every growing prefix. */
function appendWrapped(
  paragraph: string,
  offset: number,
  width: number,
  measure: (s: string) => number,
  lines: DocumentLine[],
): void {
  let start = 0;
  let used = 0;
  let index = 0;
  for (const ch of paragraph) {
    const size = measure(ch);
    if (index > start && used + size > width) {
      lines.push({
        text: paragraph.slice(start, index),
        start: offset + start,
        end: offset + index,
      });
      start = index;
      used = 0;
    }
    used += size;
    index += ch.length;
  }
  lines.push({
    text: paragraph.slice(start),
    start: offset + start,
    end: offset + paragraph.length,
  });
}

export function caretLine(lines: DocumentLine[], caret: number): number {
  for (let i = lines.length - 1; i >= 0; i--) if (caret >= lines[i].start) return i;
  return 0;
}

export function caretAt(line: DocumentLine, x: number, measure: (s: string) => number): number {
  let offset = 0,
    left = 0;
  for (const ch of line.text) {
    const right = left + measure(ch);
    if (x < (left + right) / 2) break;
    offset += ch.length;
    left = right;
  }
  return line.start + offset;
}

/** Only rasterize the glyphs intersecting the viewport, keeping source offsets for selection. */
export function visibleDocumentLine(
  line: DocumentLine,
  left: number,
  width: number,
  measure: (s: string) => number,
): DocumentLine & { x: number } {
  let x = 0;
  let start = 0;
  let end = 0;
  let origin = 0;
  for (const ch of line.text) {
    const size = measure(ch);
    const next = end + ch.length;
    if (x + size <= left) {
      start = next;
      origin = x + size;
    }
    if (x >= left + width) break;
    end = next;
    x += size;
  }
  return {
    text: line.text.slice(start, end),
    start: line.start + start,
    end: line.start + end,
    x: origin,
  };
}
