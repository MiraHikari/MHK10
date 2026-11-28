export {
  createPrintLayout,
  paginatePrintLines as printPages,
  PRINT_PAPER,
} from '../../ui/text/print-layout';

export interface PrintableDocument {
  id: string;
  title: string;
  content: string;
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
    (entity: string, key: string) => {
      if (key[0] !== '#') return named[key.toLowerCase()] ?? entity;
      const code =
        key[1].toLowerCase() === 'x'
          ? Number.parseInt(key.slice(2), 16)
          : Number.parseInt(key.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : entity;
    },
  );
}

export function articleDocument(id: string, markdown: string): PrintableDocument {
  const header = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const title = header?.[1].match(/^title:\s*(.+)$/m)?.[1].replace(/^['"]|['"]$/g, '') ?? id;
  const body = markdown
    .slice(header?.[0].length ?? 0)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<img\b[^>]*\balt\s*=\s*(["'])([\s\S]*?)\1[^>]*>/gi, '\n$2\n')
    .replace(
      /<\/?(?:figure|figcaption|div|p|br|h[1-6]|details|summary|section|ul|ol|li|blockquote|hr|table|thead|tbody|tr)\b[^>]*>/gi,
      '\n',
    )
    .replace(/<\/?(?:a|img|span|strong|em|b|i|s|del|th|td)\b[^>]*>/gi, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^> ?/gm, '')
    .replace(/^```[^\n]*$/gm, '')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n[ \t]+\n/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { id, title: decodeEntities(title), content: decodeEntities(`${title}\n\n${body}`) };
}

export function certificateDocument(
  owner: string,
  permissions: string,
  stage: string,
): PrintableDocument {
  return {
    id: 'certificate',
    title: 'Ownership Certificate',
    content: [
      'MHK10',
      'CERTIFICATE OF SYSTEM OWNERSHIP',
      '',
      `REGISTERED OWNER: ${owner}`,
      '',
      `STATUS: ${stage}`,
      '',
      permissions,
      '',
      'This certificate records the current',
      'ownership of the MHK10 desktop.',
      '',
      'ISSUED BY: RECOVERY CONSOLE',
      'COUNTERSIGNED: THE OPERATOR',
    ].join('\n'),
  };
}
