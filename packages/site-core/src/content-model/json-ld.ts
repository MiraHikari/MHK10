export type JsonLdEntity = Record<string, unknown>;

export interface JsonLdIdReference {
  readonly '@id': string;
}

export interface JsonLdPerson {
  readonly '@type': 'Person';
  readonly name: string;
  readonly url?: string;
}

export interface BlogPostingFacts {
  readonly id?: string;
  readonly url?: string;
  readonly headline: string;
  readonly description?: string;
  readonly datePublished?: string;
  readonly dateModified?: string;
  readonly image?: string | readonly string[];
  readonly inLanguage?: string;
  readonly keywords?: string | readonly string[];
  readonly author?: JsonLdPerson | JsonLdIdReference;
  readonly publisher?: JsonLdPerson | JsonLdIdReference;
  readonly mainEntityOfPage?: string | JsonLdIdReference;
  readonly articleSection?: string;
  readonly license?: string | JsonLdIdReference;
  readonly copyrightYear?: number;
  readonly copyrightHolder?: JsonLdPerson | JsonLdIdReference;
  readonly copyrightNotice?: string;
  readonly creditText?: string;
  readonly isPartOf?: JsonLdIdReference;
}

export interface BreadcrumbItem {
  readonly name: string;
  readonly item: string;
}

function omitUndefined(fields: JsonLdEntity): JsonLdEntity {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

/**
 * Build a BlogPosting entity without `@context`; the caller owns the graph and
 * its presentation-specific labels. Optional facts are omitted entirely.
 */
export function blogPostingJsonLd(facts: BlogPostingFacts): JsonLdEntity {
  return omitUndefined({
    '@type': 'BlogPosting',
    '@id': facts.id,
    url: facts.url,
    headline: facts.headline,
    description: facts.description,
    datePublished: facts.datePublished,
    dateModified: facts.dateModified,
    image: facts.image,
    inLanguage: facts.inLanguage,
    keywords: facts.keywords,
    author: facts.author,
    publisher: facts.publisher,
    mainEntityOfPage: facts.mainEntityOfPage,
    articleSection: facts.articleSection,
    license: facts.license,
    copyrightYear: facts.copyrightYear,
    copyrightHolder: facts.copyrightHolder,
    copyrightNotice: facts.copyrightNotice,
    creditText: facts.creditText,
    isPartOf: facts.isPartOf,
  });
}

/** Build a BreadcrumbList entity without `@context`. */
export function breadcrumbJsonLd(items: readonly BreadcrumbItem[]): JsonLdEntity {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((breadcrumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: breadcrumb.name,
      item: breadcrumb.item,
    })),
  };
}
