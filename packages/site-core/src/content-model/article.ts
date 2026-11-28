export type AILevel = 'generated' | 'assisted' | 'human';

/** Shared publication fields; adapters own date representations and derived reading data. */
export interface ArticleMetadata {
  title: string;
  description: string;
  tags?: readonly string[];
  category?: string;
  heroImage?: string;
  heroAlt?: string;
  draft?: boolean;
  listed?: boolean;
  featured?: boolean;
  comments?: boolean;
  author?: string;
  aiLevel?: AILevel;
  aiModel?: string;
  related?: readonly string[];
  series?: string;
  seriesOrder?: number;
  version?: string;
}

export function desktopPublicationMetadata(
  data: Record<string, unknown>,
  presentation: Record<string, unknown>,
  image: (path: string) => string,
): Record<string, unknown> {
  const { publishDate, updatedDate, ...shared } = data;
  return {
    ...shared,
    published: publishDate,
    ...(updatedDate ? { updated: updatedDate } : {}),
    ...presentation,
    heroImage: typeof data.heroImage === 'string' ? image(data.heroImage) : undefined,
  };
}
