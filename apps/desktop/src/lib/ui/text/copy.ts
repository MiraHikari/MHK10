/** Word-aware wrapping for prose; editors keep their source-position line model. */
export function wrapCopy(
  value: string,
  width: number,
  measure: (value: string) => number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && measure(`${line} ${word}`) <= width) {
        line += ` ${word}`;
        continue;
      }
      if (line) {
        lines.push(line);
        line = '';
      }
      for (const char of word) {
        if (line && measure(line + char) > width) {
          lines.push(line);
          line = '';
        }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
}
