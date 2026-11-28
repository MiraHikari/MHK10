/** GitHub Discussions protocol for one publication or the friends thread. No browser globals. */

import {
  GISCUS_CONFIG,
  GISCUS_ORIGIN,
  GISCUS_SESSION_KEY,
  GISCUS_SLOW_MS,
  giscusWidgetUrl,
  isGiscusConfigured,
  type GiscusConfig,
} from '@mhk/site-core/config/giscus';

export {
  GISCUS_CONFIG,
  GISCUS_ORIGIN,
  GISCUS_SESSION_KEY,
  GISCUS_SLOW_MS,
  giscusWidgetUrl,
  isGiscusConfigured,
  type GiscusConfig,
};

export const FRIENDS_DISCUSSION_TERM = 'friends-links';

export type CommentPhase = 'closed' | 'loading' | 'slow' | 'ready' | 'missing' | 'failed';

export interface CommentView {
  readonly phase: CommentPhase;
  readonly status: string;
}

export type GiscusNotice =
  | { readonly type: 'resize'; readonly height: number; readonly discussionUrl?: string }
  | { readonly type: 'sign-out' }
  | { readonly type: 'error'; readonly code: GiscusErrorCode; readonly status: string }
  | { readonly type: 'ready'; readonly discussionUrl: string }
  | { readonly type: 'ignored' };

export type GiscusErrorCode = 'credentials' | 'discussion' | 'rate-limit' | 'other';

const TERM = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const DISCUSSIONS_HOST = /^(?:www\.)?github\.com$/i;
const DISCUSSIONS_PATH = /^\/([^/]+)\/([^/]+)\/discussions\/[1-9]\d*\/?$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function discussionTerm(
  value: unknown,
): { ok: true; term: string } | { ok: false; error: string } {
  if (typeof value !== 'string') return { ok: false, error: 'The discussion id is not valid.' };
  const term = value.trim();
  if (!TERM.test(term)) return { ok: false, error: 'The discussion id is not valid.' };
  return { ok: true, term };
}

export function parseGiscusSession(value: unknown): string {
  if (typeof value !== 'string') return '';
  const session = value.trim();
  if (!session || session.length > 4096 || /[\u0000-\u001f\s]/.test(session)) return '';
  return session;
}

/** Remove the redirect parameter; an empty session must not replace saved credentials. */
export function takeGiscusRedirect(href: string): { href: string; session: string } | undefined {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return undefined;
  }
  if (!url.searchParams.has('giscus')) return undefined;
  const session = parseGiscusSession(url.searchParams.get('giscus'));
  url.searchParams.delete('giscus');
  return { href: url.toString(), session };
}

/** Only discussion links in the configured repository may become the external action. */
export function giscusDiscussionUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      !DISCUSSIONS_HOST.test(url.hostname) ||
      url.username ||
      url.password ||
      url.port
    )
      return '';
    const path = DISCUSSIONS_PATH.exec(url.pathname);
    if (!path || `${path[1]}/${path[2]}`.toLowerCase() !== GISCUS_CONFIG.repo.toLowerCase())
      return '';
    return url.toString();
  } catch {
    return '';
  }
}

/** Inline theme so the cross-origin frame can load it without a second host. */
export function giscusThemeUrl(css: string): string {
  return `data:text/css;charset=utf-8,${encodeURIComponent(css)}`;
}

export function describeGiscusError(message: string): {
  code: GiscusErrorCode;
  status: string;
} {
  if (
    message.includes('Bad credentials') ||
    message.includes('Invalid state value') ||
    message.includes('State has expired')
  )
    return {
      code: 'credentials',
      status: 'The sign-in expired. Reload and sign in to GitHub again.',
    };
  if (message.includes('Discussion not found'))
    return {
      code: 'discussion',
      status: 'This discussion does not exist yet. The first comment creates it.',
    };
  if (message.includes('API rate limit exceeded'))
    return { code: 'rate-limit', status: 'GitHub is rate limiting comments. Try again later.' };
  return {
    code: 'other',
    status: 'GitHub did not return the discussion. Reload to try again.',
  };
}

export function parseGiscusMessage(data: unknown): GiscusNotice {
  if (!isRecord(data) || !isRecord(data.giscus)) return { type: 'ignored' };
  const body = data.giscus;
  if (typeof body.error === 'string' && body.error) {
    const described = describeGiscusError(body.error);
    if (described.code === 'credentials' || body.signOut !== true)
      return { type: 'error', code: described.code, status: described.status };
  }
  if (body.signOut === true) return { type: 'sign-out' };
  const discussion = isRecord(body.discussion) ? body.discussion : undefined;
  const discussionUrl = discussion ? giscusDiscussionUrl(discussion.url) : '';
  if (
    typeof body.resizeHeight === 'number' &&
    Number.isFinite(body.resizeHeight) &&
    body.resizeHeight > 0
  ) {
    return {
      type: 'resize',
      height: Math.min(4000, Math.max(80, Math.round(body.resizeHeight))),
      ...(discussionUrl ? { discussionUrl } : {}),
    };
  }
  return discussionUrl ? { type: 'ready', discussionUrl } : { type: 'ignored' };
}

export function beginCommentLoad(): CommentView {
  return { phase: 'loading', status: 'Opening GitHub Discussions...' };
}

export function commentTimedOut(view: CommentView): CommentView {
  if (view.phase !== 'loading') return view;
  return {
    phase: 'slow',
    status: 'GitHub is slow to respond. Keep waiting or reload the discussion.',
  };
}

/** A size-only message cannot turn an empty discussion into an existing one. */
export function commentReady(
  view: CommentView,
  notice: Extract<GiscusNotice, { type: 'ready' | 'resize' }>,
): CommentView {
  if (view.phase === 'failed' || view.phase === 'closed') return view;
  if (view.phase === 'missing' && !notice.discussionUrl) return view;
  return {
    phase: 'ready',
    status: 'Discussion loaded. Comments are stored in GitHub Discussions, not on this site.',
  };
}

export function commentFailed(status: string): CommentView {
  return { phase: 'failed', status };
}

export function commentDiscussionMissing(): CommentView {
  return {
    phase: 'missing',
    status: 'This discussion has no comments yet. The first comment creates it in GitHub.',
  };
}

/** Short text for the window's status bar; the state panel keeps the full message. */
export function commentStatusLabel(phase: CommentPhase): string {
  if (phase === 'loading') return 'Opening...';
  if (phase === 'slow') return 'Waiting for GitHub...';
  if (phase === 'ready') return 'Connected';
  if (phase === 'missing') return 'No comments yet';
  if (phase === 'failed') return 'Unavailable';
  return 'Not opened';
}
