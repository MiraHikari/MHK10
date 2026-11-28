/** Normalized browser projection of an authored project. */
export interface ProjectRecord {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly image?: string;
  readonly tags: readonly string[];
  readonly link?: string;
  readonly github?: string;
  readonly date: string;
  readonly featured: boolean;
  readonly order: number;
  readonly active: boolean;
  readonly highlights: readonly string[];
}
