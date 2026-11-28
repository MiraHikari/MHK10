import { describe, expect, it } from 'vite-plus/test';
import {
  FRIENDS_DISCUSSION_TERM,
  GISCUS_CONFIG,
  GISCUS_ORIGIN,
  GISCUS_SESSION_KEY,
  GISCUS_SLOW_MS,
  beginCommentLoad,
  commentDiscussionMissing,
  commentFailed,
  commentReady,
  commentStatusLabel,
  commentTimedOut,
  discussionTerm,
  giscusDiscussionUrl,
  giscusThemeUrl,
  giscusWidgetUrl,
  isGiscusConfigured,
  parseGiscusMessage,
  parseGiscusSession,
  takeGiscusRedirect,
} from './comments-model';

describe('GitHub Discussions model', () => {
  it('keeps the previous repository, category and friends term', () => {
    expect(isGiscusConfigured()).toBe(true);
    expect(GISCUS_CONFIG.repo).toBe('example-user/blog-comments');
    expect(GISCUS_CONFIG.repoId).toBe('R_kgXXXXXXXXXX');
    expect(GISCUS_CONFIG.category).toBe('Announcements');
    expect(GISCUS_CONFIG.categoryId).toBe('DIC_kwXXXXXXXXXXXX');
    expect(FRIENDS_DISCUSSION_TERM).toBe('friends-links');
    expect(GISCUS_SLOW_MS).toBe(6000);
    expect(GISCUS_SESSION_KEY).toBe('giscus-session');
    expect(isGiscusConfigured({ ...GISCUS_CONFIG, repoId: '' })).toBe(false);
  });

  it('accepts article slugs and rejects empty or unsafe terms', () => {
    expect(discussionTerm(' advx-2026-hangzhou ')).toEqual({
      ok: true,
      term: 'advx-2026-hangzhou',
    });
    expect(discussionTerm('friends-links')).toEqual({ ok: true, term: 'friends-links' });
    expect(discussionTerm('')).toEqual({ ok: false, error: 'The discussion id is not valid.' });
    expect(discussionTerm('../secret')).toEqual({
      ok: false,
      error: 'The discussion id is not valid.',
    });
    expect(discussionTerm(12)).toEqual({ ok: false, error: 'The discussion id is not valid.' });
  });

  it('builds the shared zh-CN widget URL for a specific discussion', () => {
    const url = new URL(
      giscusWidgetUrl({
        ...GISCUS_CONFIG,
        term: 'colophon',
        theme: 'light',
        session: '',
        origin: 'https://www.example.com/blog/colophon/',
        description: '说明',
        backLink: 'https://www.example.com/blog/colophon/',
      }),
    );
    expect(url.origin).toBe(GISCUS_ORIGIN);
    expect(url.pathname).toBe('/zh-CN/widget');
    expect(url.searchParams.get('term')).toBe('colophon');
    expect(url.searchParams.get('repo')).toBe(GISCUS_CONFIG.repo);
    expect(url.searchParams.get('repoId')).toBe(GISCUS_CONFIG.repoId);
    expect(url.searchParams.get('category')).toBe(GISCUS_CONFIG.category);
    expect(url.searchParams.get('categoryId')).toBe(GISCUS_CONFIG.categoryId);
    expect(url.searchParams.get('mapping')).toBe('specific');
    expect(url.searchParams.get('strict')).toBe('0');
    expect(url.searchParams.get('reactionsEnabled')).toBe('1');
    expect(url.searchParams.get('emitMetadata')).toBe('1');
    expect(url.searchParams.get('inputPosition')).toBe('top');
    expect(url.searchParams.get('theme')).toBe('light');
    expect(url.searchParams.get('origin')).toBe('https://www.example.com/blog/colophon/');
    expect(url.searchParams.get('session')).toBe('');
    expect(url.searchParams.get('description')).toBe('说明');
    expect(url.searchParams.get('backLink')).toBe('https://www.example.com/blog/colophon/');
  });

  it('defaults to the shared transparent_dark theme when the Reader does not supply one', () => {
    const url = new URL(
      giscusWidgetUrl({
        ...GISCUS_CONFIG,
        term: 'colophon',
        session: '',
        origin: 'http://localhost:4322/reader/colophon/',
        description: '',
        backLink: 'http://localhost:4322/reader/colophon/',
      }),
    );
    expect(url.pathname).toBe('/zh-CN/widget');
    expect(url.searchParams.get('theme')).toBe('transparent_dark');
  });

  it('inlines a data URL theme so the frame does not use the default skin', () => {
    const theme = giscusThemeUrl('a { color: #000080; }');
    expect(theme.startsWith('data:text/css;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(theme)).toContain('#000080');
    const url = new URL(
      giscusWidgetUrl({
        ...GISCUS_CONFIG,
        term: 'colophon',
        theme,
        session: '',
        origin: 'http://localhost:4321/blog/colophon/',
        description: '',
        backLink: 'http://localhost:4321/blog/colophon/',
      }),
    );
    expect(url.searchParams.get('theme')).toBe(theme);
  });

  it('parses widget messages from unknown data', () => {
    expect(parseGiscusMessage(null)).toEqual({ type: 'ignored' });
    expect(parseGiscusMessage({ other: true })).toEqual({ type: 'ignored' });
    expect(parseGiscusMessage({ giscus: { discussion: {} } })).toEqual({ type: 'ignored' });
    expect(parseGiscusMessage({ giscus: { resizeHeight: 12.4 } })).toEqual({
      type: 'resize',
      height: 80,
    });
    expect(parseGiscusMessage({ giscus: { resizeHeight: 9000 } })).toEqual({
      type: 'resize',
      height: 4000,
    });
    expect(parseGiscusMessage({ giscus: { signOut: true } })).toEqual({ type: 'sign-out' });
    expect(
      parseGiscusMessage({
        giscus: { signOut: true, error: 'State has expired (user signed out).' },
      }),
    ).toMatchObject({ type: 'error', code: 'credentials' });
    expect(parseGiscusMessage({ giscus: { signOut: true, error: 'Signed out.' } })).toEqual({
      type: 'sign-out',
    });
    expect(parseGiscusMessage({ giscus: { error: 'Discussion not found' } })).toMatchObject({
      type: 'error',
      code: 'discussion',
    });
    expect(parseGiscusMessage({ giscus: { error: 'API rate limit exceeded' } })).toMatchObject({
      code: 'rate-limit',
    });
    expect(parseGiscusMessage({ giscus: { error: 'Bad credentials' } })).toMatchObject({
      code: 'credentials',
    });
    expect(parseGiscusMessage({ giscus: { error: 'something else' } })).toMatchObject({
      code: 'other',
    });
  });

  it.each([
    {},
    { unrelated: true },
    { discussion: null },
    { discussion: { url: 'https://example.com/discussions/12' } },
    { resizeHeight: '240' },
    { resizeHeight: Number.NaN },
    { resizeHeight: Number.POSITIVE_INFINITY },
    { resizeHeight: 0 },
    { resizeHeight: -240 },
    { signOut: 'true' },
    { signOut: 1 },
    { error: '' },
    { error: true },
  ])('ignores malformed or unrecognized widget content: %j', (giscus) => {
    expect(parseGiscusMessage({ giscus })).toEqual({ type: 'ignored' });
  });

  it('accepts the metadata notification that emitMetadata enables', () => {
    const discussion = `https://github.com/${GISCUS_CONFIG.repo}/discussions/12`;
    expect(
      parseGiscusMessage({
        giscus: {
          discussion: { url: discussion },
          viewer: { id: 'U_kgDOExample', avatarUrl: 'https://avatars.githubusercontent.com/u/1' },
        },
      }),
    ).toEqual({ type: 'ready', discussionUrl: discussion });
  });

  it('exposes only same-repository GitHub discussion links', () => {
    const discussion = `https://github.com/${GISCUS_CONFIG.repo}/discussions/12`;
    expect(giscusDiscussionUrl(discussion)).toBe(discussion);
    expect(parseGiscusMessage({ giscus: { discussion: { url: discussion } } })).toEqual({
      type: 'ready',
      discussionUrl: discussion,
    });
    expect(
      parseGiscusMessage({ giscus: { discussion: { url: discussion }, resizeHeight: 240 } }),
    ).toEqual({ type: 'resize', height: 240, discussionUrl: discussion });
    expect(giscusDiscussionUrl('https://example.com/discussions/12')).toBe('');
    expect(giscusDiscussionUrl(`http://github.com/${GISCUS_CONFIG.repo}/discussions/12`)).toBe('');
    expect(giscusDiscussionUrl(`https://github.com/${GISCUS_CONFIG.repo}/issues/12`)).toBe('');
    expect(giscusDiscussionUrl(`${discussion}#discussioncomment-123`)).toBe(
      `${discussion}#discussioncomment-123`,
    );
    expect(
      giscusDiscussionUrl('https://github.com/example-user/BLOG-COMMENTS/discussions/12'),
    ).toBe('https://github.com/example-user/BLOG-COMMENTS/discussions/12');
    expect(
      parseGiscusMessage({ giscus: { discussion: { url: 'https://example.com/x' } } }),
    ).toEqual({ type: 'ignored' });
  });

  it.each([
    'https://github.com/other/blog-comments/discussions/12',
    'https://github.com/example-user/other/discussions/12',
    `https://github.com/${GISCUS_CONFIG.repo}/discussions/new`,
    `https://github.com/${GISCUS_CONFIG.repo}/discussions/0`,
    `https://github.com/${GISCUS_CONFIG.repo}/discussions/12/comments`,
    `https://github.com/${GISCUS_CONFIG.repo}/discussions/12/../../issues/12`,
    `https://github.com:444/${GISCUS_CONFIG.repo}/discussions/12`,
    `https://user@github.com/${GISCUS_CONFIG.repo}/discussions/12`,
    `https://user:password@github.com/${GISCUS_CONFIG.repo}/discussions/12`,
  ])('rejects a link outside the configured discussion route: %s', (url) => {
    expect(giscusDiscussionUrl(url)).toBe('');
  });

  it('moves through loading, slow, ready and failed without reviving a failure', () => {
    const loading = beginCommentLoad();
    const resize = { type: 'resize', height: 240 } as const;
    const ready = commentReady(loading, resize);
    expect(commentTimedOut(loading).phase).toBe('slow');
    expect(commentTimedOut(ready)).toEqual(ready);
    expect(ready.phase).toBe('ready');
    const failed = commentFailed('Comments are not configured.');
    expect(commentReady(failed, resize)).toEqual(failed);
    const closed = { phase: 'closed', status: 'Not opened' } as const;
    expect(commentReady(closed, resize)).toEqual(closed);
  });

  it('keeps the empty discussion message until existing discussion metadata arrives', () => {
    const missing = commentDiscussionMissing();
    expect(commentReady(missing, { type: 'resize', height: 300 })).toEqual(missing);
    const discussionUrl = `https://github.com/${GISCUS_CONFIG.repo}/discussions/12`;
    expect(commentReady(missing, { type: 'ready', discussionUrl }).phase).toBe('ready');
    expect(commentReady(missing, { type: 'resize', height: 300, discussionUrl }).phase).toBe(
      'ready',
    );
  });

  it('labels phases for the window status bar', () => {
    expect(commentStatusLabel('closed')).toBe('Not opened');
    expect(commentStatusLabel('loading')).toBe('Opening...');
    expect(commentStatusLabel('slow')).toBe('Waiting for GitHub...');
    expect(commentStatusLabel('ready')).toBe('Connected');
    expect(commentStatusLabel('missing')).toBe('No comments yet');
    expect(commentStatusLabel('failed')).toBe('Unavailable');
  });

  it('reads a giscus redirect token and drops it from the page address', () => {
    expect(parseGiscusSession('  token_1  ')).toBe('token_1');
    expect(parseGiscusSession('bad token')).toBe('');
    expect(parseGiscusSession(1)).toBe('');
    expect(
      takeGiscusRedirect('https://www.example.com/blog/colophon/?giscus=token_1#note'),
    ).toEqual({
      href: 'https://www.example.com/blog/colophon/#note',
      session: 'token_1',
    });
    expect(takeGiscusRedirect('https://www.example.com/blog/colophon/')).toBeUndefined();
  });

  it.each(['', 'bad%20token', 'token%0Awith-newline'])(
    'removes an invalid redirect parameter without supplying credentials: %s',
    (token) => {
      expect(
        takeGiscusRedirect(
          `https://www.example.com/blog/colophon/?mode=paper&giscus=${token}#note`,
        ),
      ).toEqual({
        href: 'https://www.example.com/blog/colophon/?mode=paper#note',
        session: '',
      });
    },
  );
});
