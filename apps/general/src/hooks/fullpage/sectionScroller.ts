export interface SectionScroller {
  readonly scroll: number;
  readonly limit: number;
  scrollTo(target: number, options?: { immediate?: boolean }): void;
}
