export interface ContactCardInput {
  readonly name: string;
  readonly email: string;
  readonly website: string;
  readonly github: string;
  readonly location: string;
  readonly summary: string;
}

function textValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/** URL properties contain URIs, so reserved punctuation stays meaningful rather than text-escaped. */
function uriValue(value: string): string {
  return value.replace(/[^a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=%-]/gu, (character) =>
    encodeURIComponent(character),
  );
}

function foldLine(value: string): string {
  const lines: string[] = [];
  let line = '';
  let bytes = 0;
  for (const character of value) {
    const code = character.charCodeAt(0);
    const size = character.length > 1 ? 4 : code > 0x7ff ? 3 : code > 0x7f ? 2 : 1;
    if (bytes + size > 75) {
      lines.push(line);
      line = ' ';
      bytes = 1;
    }
    line += character;
    bytes += size;
  }
  lines.push(line);
  return lines.join('\r\n');
}

/** vCard 3.0 with UTF-8 folding; the supplied name and locality are never split into guessed parts. */
export function serializeContactCard(card: ContactCardInput): string {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:;${textValue(card.name)};;;`,
    `FN:${textValue(card.name)}`,
  ];
  if (card.email) lines.push(`EMAIL;TYPE=INTERNET:${textValue(card.email)}`);
  for (const url of [card.website, card.github]) if (url) lines.push(`URL:${uriValue(url)}`);
  if (card.location) lines.push(`ADR:;;;${textValue(card.location)};;;`);
  if (card.summary) lines.push(`NOTE:${textValue(card.summary)}`);
  lines.push('END:VCARD');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
