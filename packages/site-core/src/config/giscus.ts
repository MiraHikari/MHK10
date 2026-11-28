import { SHARED_SERVICE_KEYS } from '../storage/keys';

export interface GiscusConfig {
  readonly repo: string;
  readonly repoId: string;
  readonly category: string;
  readonly categoryId: string;
}

export const GISCUS_CONFIG = Object.freeze({
  repo: 'example-user/blog-comments',
  repoId: 'R_kgXXXXXXXXXX',
  category: 'Announcements',
  categoryId: 'DIC_kwXXXXXXXXXXXX',
} as const);

export const GISCUS_ORIGIN = 'https://giscus.app';

/** Both presentations share the Giscus sign-in identity at their own origin. */
export const GISCUS_SESSION_KEY = SHARED_SERVICE_KEYS.giscusSession;

/** One wait before the comments UI admits that GitHub is slow. */
export const GISCUS_SLOW_MS = 6000;

/** One comment policy for the general article and the Reader discussion window. */
export const GISCUS_WIDGET_DEFAULTS = Object.freeze({
  mapping: 'specific',
  strict: '0',
  reactionsEnabled: '1',
  emitMetadata: '1',
  inputPosition: 'top',
  lang: 'zh-CN',
  theme: 'transparent_dark',
} as const);

export interface GiscusWidgetRequest extends GiscusConfig {
  readonly term: string;
  /** Language path segment; requests may override the shared zh-CN default. */
  readonly lang?: string;
  readonly theme?: string;
  readonly session?: string;
  readonly origin?: string;
  readonly description?: string;
  readonly backLink?: string;
}

export function isGiscusConfigured(config: GiscusConfig = GISCUS_CONFIG): boolean {
  return Boolean(config.repo && config.repoId && config.category && config.categoryId);
}

/** The canonical giscus widget URL; mapping always uses the requested specific term. */
export function giscusWidgetUrl(request: GiscusWidgetRequest): string {
  const lang = request.lang || GISCUS_WIDGET_DEFAULTS.lang;
  const params = new URLSearchParams({
    origin: request.origin ?? '',
    session: request.session ?? '',
    repo: request.repo,
    repoId: request.repoId,
    category: request.category,
    categoryId: request.categoryId,
    term: request.term,
    mapping: GISCUS_WIDGET_DEFAULTS.mapping,
    strict: GISCUS_WIDGET_DEFAULTS.strict,
    reactionsEnabled: GISCUS_WIDGET_DEFAULTS.reactionsEnabled,
    emitMetadata: GISCUS_WIDGET_DEFAULTS.emitMetadata,
    inputPosition: GISCUS_WIDGET_DEFAULTS.inputPosition,
    theme: request.theme || GISCUS_WIDGET_DEFAULTS.theme,
    description: request.description ?? '',
    backLink: request.backLink ?? '',
  });
  return `${GISCUS_ORIGIN}/${encodeURIComponent(lang)}/widget?${params.toString()}`;
}
