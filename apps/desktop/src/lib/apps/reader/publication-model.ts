import type { ArticleMetadata } from '@mhk/site-core/content-model/article';

export interface ReaderPublication extends Pick<
  ArticleMetadata,
  'title' | 'description' | 'author' | 'related' | 'series' | 'seriesOrder'
> {
  id: string;
  body: string;
  published: string;
}

/** Read the publication's shared identity and citation facts at the browser boundary. */
export function parseReaderPublication(value: unknown): ReaderPublication | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== 'string' ||
    !item.id ||
    item.id.length > 160 ||
    ['__proto__', 'constructor', 'prototype'].includes(item.id) ||
    typeof item.title !== 'string' ||
    typeof item.body !== 'string' ||
    item.body.length > 2000000
  )
    return null;
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    description: typeof item.description === 'string' ? item.description : '',
    published: typeof item.published === 'string' ? item.published : '',
    ...(typeof item.author === 'string' && item.author.trim() && item.author.length <= 200
      ? { author: item.author }
      : {}),
    ...(Array.isArray(item.related) &&
    item.related.every((id) => typeof id === 'string' && id.length <= 200)
      ? { related: [...item.related] as string[] }
      : {}),
    ...(typeof item.series === 'string' && item.series.length <= 200
      ? { series: item.series }
      : {}),
    ...(typeof item.seriesOrder === 'number' && Number.isFinite(item.seriesOrder)
      ? { seriesOrder: item.seriesOrder }
      : {}),
  };
}

export function readerCitation(
  publication: ReaderPublication,
  canonical: string,
  defaultAuthor: string,
): string {
  return `${publication.title} — ${publication.author ?? defaultAuthor}. ${canonical}`;
}
