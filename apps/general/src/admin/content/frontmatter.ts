import { parse, stringify } from 'yaml';
import { formatToday } from './dates';

export interface MarkdownDocument {
  data: Record<string, unknown>;
  body: string;
}

const FRONTMATTER_RE = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?/;

/**
 * 将任意 Date 实例递归转换为作者本地的 YYYY-MM-DD 字符串，其余值保持不变。
 * 返回值是新对象，不修改原始数据。
 */
function normalizeDates<T>(value: T): T {
  if (value instanceof Date) {
    return formatToday(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeDates) as T;
  }

  if (typeof value === 'object' && value !== null) {
    const clone: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      clone[key] = normalizeDates(val);
    }
    return clone as T;
  }

  return value;
}

/**
 * 解析 Markdown 源文本，分离 YAML frontmatter 与正文。
 * 无 frontmatter 时返回 data = {}，body 原样保留（不 trim）。
 */
export function splitFrontmatter(raw: string): MarkdownDocument {
  const match = FRONTMATTER_RE.exec(raw);

  if (!match) {
    return { data: {}, body: raw };
  }

  const yamlContent = match[1];
  const body = raw.slice(match[0].length);

  if (yamlContent.trim() === '') {
    return { data: {}, body };
  }

  const parsed = parse(yamlContent);

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { data: {}, body };
  }

  return { data: normalizeDates(parsed), body };
}

/**
 * 将 frontmatter 与正文序列化为 Markdown 源文本。
 * - frontmatter 与 body 之间恰好一个换行；
 * - 文件末尾恰好一个换行；
 * - 键顺序保持传入对象的顺序；
 * - Date 值会被规范化为 YYYY-MM-DD。
 */
export function serializeDocument(data: Record<string, unknown>, body: string): string {
  const normalized = normalizeDates(data);
  const frontmatter = `---\n${stringify(normalized)}---\n`;
  const trimmedBody = body.replace(/\n+$/, '');

  if (trimmedBody.length === 0) {
    return frontmatter;
  }

  return `${frontmatter}${trimmedBody}\n`;
}
