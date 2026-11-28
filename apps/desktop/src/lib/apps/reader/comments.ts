import { createLifetime } from '../../ui/browser/lifetime';
import { themeFor } from '../../gfx/palette';
import { giscusThemeCss, commentThemeColors } from './giscus-theme';
import { READING_THEMES, type ReadingTheme } from '@mhk/site-core/fusion/reading-model';
import {
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
  giscusThemeUrl,
  giscusWidgetUrl,
  isGiscusConfigured,
  parseGiscusMessage,
  parseGiscusSession,
  takeGiscusRedirect,
  type CommentView,
} from './comments-model';

/** Mount one themed GitHub Discussions window. Closing keeps a draft; dispose releases it. */
export function mountComments(host: HTMLElement): () => void {
  if (claimedHosts.has(host)) return () => {};
  const lifetime = createLifetime();
  try {
    claimedHosts.add(host);
    lifetime.defer(() => claimedHosts.delete(host));
    lifetime.defer(() => {
      delete host.dataset.commentsBound;
    });
    bind(host, lifetime);
    host.dataset.commentsBound = 'true';
  } catch (error) {
    lifetime.dispose();
    throw error;
  }
  lifetime.listen(window, 'pagehide', (event) => {
    if (!event.persisted) lifetime.dispose();
  });
  return lifetime.dispose;
}

const claimedHosts = new WeakSet<HTMLElement>();

function bind(host: HTMLElement, lifetime: ReturnType<typeof createLifetime>): void {
  const need = <T extends Element>(selector: string): T => {
    const element = host.querySelector<T>(selector);
    if (!element) throw new Error(`Missing discussion element: ${selector}`);
    return element;
  };
  const dialog = need<HTMLDialogElement>('dialog');
  const status = need<HTMLElement>('[data-comments-status]');
  const stateText = need<HTMLElement>('[data-comments-state-text]');
  const stateTitle = need<HTMLElement>('[data-comments-state-title]');
  const surface = need<HTMLElement>('[data-comments-surface]');
  const frame = need<HTMLElement>('[data-comments-frame]');
  const close = need<HTMLButtonElement>('[data-comments-close]');
  const reload = need<HTMLButtonElement>('[data-comments-reload]');
  const retry = need<HTMLButtonElement>('[data-comments-retry]');
  const reloadPrompt = need<HTMLElement>('[data-comments-reload-prompt]');
  const confirmReload = need<HTMLButtonElement>('[data-comments-confirm-reload]');
  const cancelReload = need<HTMLButtonElement>('[data-comments-cancel-reload]');
  const github = need<HTMLAnchorElement>('[data-comments-github]');
  if (!host.id) throw new Error('Missing discussion id');
  const openers = [
    ...document.querySelectorAll<HTMLButtonElement>(
      `[data-comments-open="${CSS.escape(host.id)}"]`,
    ),
  ];
  if (openers.length === 0) throw new Error('Missing discussion opener');
  const term = discussionTerm(host.getAttribute('data-comments-term'));
  const readerRoot = host.closest<HTMLElement>('.reader');
  let view: CommentView = { phase: 'closed', status: stateText.textContent?.trim() || '' };
  let iframe: HTMLIFrameElement | undefined;
  let frameLifetime: ReturnType<typeof createLifetime> | undefined;
  let themeUrl = '';
  let slowTimer = 0;
  let reloadedCredentials = false;
  let hasContent = false;
  let redirectSession: string | undefined;
  let lastOpener: HTMLButtonElement | undefined;

  const setText = (element: HTMLElement, text: string): void => {
    if (element.textContent !== text) element.textContent = text;
  };
  const render = (): void => {
    if (lifetime.disposed) return;
    if (host.dataset.phase !== view.phase) host.dataset.phase = view.phase;
    host.dataset.hasContent = String(hasContent);
    setText(status, commentStatusLabel(view.phase));
    setText(stateText, view.status);
    const titles = {
      closed: 'Join the discussion',
      loading: 'Connecting to GitHub',
      slow: 'Taking a little longer',
      failed: 'Comments are unavailable',
      missing: 'Start the conversation',
      ready: 'Discussion',
    };
    setText(stateTitle, titles[view.phase]);
    retry.hidden = view.phase !== 'failed' && view.phase !== 'slow';
    reload.disabled = view.phase === 'loading';
    surface.setAttribute('aria-busy', String(view.phase === 'loading' || view.phase === 'slow'));
  };
  const clearTimer = (): void => {
    if (!slowTimer) return;
    window.clearTimeout(slowTimer);
    slowTimer = 0;
  };
  const readSession = (): string => {
    if (redirectSession !== undefined) return redirectSession;
    try {
      const raw = localStorage.getItem(GISCUS_SESSION_KEY);
      if (!raw) return '';
      try {
        const parsed: unknown = JSON.parse(raw);
        return parseGiscusSession(parsed);
      } catch {
        return parseGiscusSession(raw);
      }
    } catch {
      return '';
    }
  };
  const writeSession = (session: string): void => {
    redirectSession = session;
    try {
      if (session) localStorage.setItem(GISCUS_SESSION_KEY, JSON.stringify(session));
      else localStorage.removeItem(GISCUS_SESSION_KEY);
    } catch {
      /* Keep this page's sign-in usable even when persistent storage is unavailable. */
    }
  };
  const absorbRedirect = (): void => {
    const taken = takeGiscusRedirect(location.href);
    if (!taken) return;
    if (taken.session) writeSession(taken.session);
    history.replaceState(history.state, '', taken.href);
  };
  const destroyFrame = (): void => {
    clearTimer();
    frameLifetime?.dispose();
    frameLifetime = undefined;
    iframe?.remove();
    iframe = undefined;
    hasContent = false;
    frame.replaceChildren();
  };
  lifetime.defer(() => {
    if (dialog.open) dialog.close();
    destroyFrame();
    reloadPrompt.hidden = true;
    reload.setAttribute('aria-expanded', 'false');
    host.dataset.phase = 'closed';
    delete host.dataset.hasContent;
    surface.setAttribute('aria-busy', 'false');
  });
  const pageOrigin = (): string => {
    const page = new URL(location.href);
    page.searchParams.delete('giscus');
    page.hash = '';
    return page.toString();
  };
  function readingTheme(): ReadingTheme | undefined {
    const value = readerRoot?.dataset.readingTheme;
    return READING_THEMES.includes(value as ReadingTheme) ? (value as ReadingTheme) : undefined;
  }
  function currentTheme() {
    const name = document.documentElement.dataset.theme ?? 'std';
    const theme = themeFor(name);
    return commentThemeColors(theme, readingTheme());
  }
  const loadFrame = (): void => {
    destroyFrame();
    if (!term.ok) {
      view = commentFailed(term.error);
      render();
      return;
    }
    if (!isGiscusConfigured()) {
      view = commentFailed('Comments are not configured.');
      render();
      return;
    }
    view = beginCommentLoad();
    github.href = `https://github.com/${GISCUS_CONFIG.repo}/discussions`;
    github.setAttribute('aria-label', 'Open discussions on GitHub (new tab)');
    surface.scrollTop = 0;
    render();
    const origin = pageOrigin();
    const element = document.createElement('iframe');
    element.className = 'comments-frame';
    element.title = 'GitHub Discussions';
    element.setAttribute('scrolling', 'auto');
    element.allow = 'clipboard-write';
    element.src = giscusWidgetUrl({
      ...GISCUS_CONFIG,
      term: term.term,
      theme: themeUrl,
      session: readSession(),
      origin,
      description:
        document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
      backLink: origin,
    });
    frameLifetime = createLifetime();
    frameLifetime.listen(element, 'error', () => {
      if (lifetime.disposed || iframe !== element) return;
      clearTimer();
      hasContent = false;
      view = commentFailed('The discussion window could not be loaded. Reload to try again.');
      render();
    });
    iframe = element;
    frame.append(element);
    slowTimer = window.setTimeout(() => {
      slowTimer = 0;
      view = commentTimedOut(view);
      render();
    }, GISCUS_SLOW_MS);
  };
  const reloadFrame = (): void => {
    reloadPrompt.hidden = true;
    reload.setAttribute('aria-expanded', 'false');
    reloadedCredentials = false;
    loadFrame();
    close.focus();
  };
  const cancelReloadPrompt = (): void => {
    reloadPrompt.hidden = true;
    reload.setAttribute('aria-expanded', 'false');
    reload.focus();
  };
  const sendTheme = (): void => {
    iframe?.contentWindow?.postMessage(
      { giscus: { setConfig: { theme: themeUrl } } },
      GISCUS_ORIGIN,
    );
  };
  const applyTheme = (): void => {
    if (lifetime.disposed) return;
    const colors = currentTheme();
    host.style.setProperty('--comments-paper', colors.background);
    host.style.setProperty('--comments-ink', colors.ink);
    const next = giscusThemeUrl(giscusThemeCss(colors));
    if (next === themeUrl) return;
    themeUrl = next;
    sendTheme();
  };

  const originalColors = ['--comments-paper', '--comments-ink'].map((property) => ({
    property,
    value: host.style.getPropertyValue(property),
  }));
  lifetime.defer(() => {
    for (const { property, value } of originalColors) {
      if (value) host.style.setProperty(property, value);
      else host.style.removeProperty(property);
    }
  });
  applyTheme();
  absorbRedirect();
  lifetime.listen(window, 'message', (event) => {
    if (lifetime.disposed || event.origin !== GISCUS_ORIGIN) return;
    if (!iframe || event.source !== iframe.contentWindow) return;
    const data: unknown = event.data;
    const notice = parseGiscusMessage(data);
    if (notice.type === 'ignored') return;
    if (notice.type === 'sign-out') {
      writeSession('');
      reloadedCredentials = false;
      loadFrame();
      return;
    }
    if (notice.type === 'error') {
      if (notice.code === 'credentials') writeSession('');
      if (notice.code === 'credentials' && !reloadedCredentials && !hasContent) {
        reloadedCredentials = true;
        loadFrame();
        return;
      }
      clearTimer();
      view =
        notice.code === 'discussion' ? commentDiscussionMissing() : commentFailed(notice.status);
      if (notice.code === 'discussion') hasContent = true;
      render();
      return;
    }
    const linkedDiscussion =
      notice.type === 'ready' || notice.type === 'resize' ? notice.discussionUrl : undefined;
    if (linkedDiscussion) {
      github.href = linkedDiscussion;
      github.setAttribute('aria-label', 'Open this discussion on GitHub (new tab)');
    }
    if (notice.type === 'resize') iframe.style.height = `${notice.height}px`;
    clearTimer();
    const wasLoading = view.phase === 'loading' || view.phase === 'slow';
    view = commentReady(view, notice);
    if (view.phase === 'ready') hasContent = true;
    if (wasLoading) sendTheme();
    render();
  });
  for (const opener of openers)
    lifetime.listen(opener, 'click', () => {
      if (lifetime.disposed) return;
      try {
        if (!dialog.open) {
          lastOpener = opener;
          dialog.showModal();
          close.focus();
        }
      } catch {
        view = commentFailed('The discussion window could not be opened.');
        render();
        return;
      }
      if (!iframe || (view.phase === 'failed' && !hasContent)) loadFrame();
    });
  lifetime.listen(close, 'click', () => {
    dialog.close();
  });
  lifetime.listen(dialog, 'close', () => {
    reloadPrompt.hidden = true;
    reload.setAttribute('aria-expanded', 'false');
    if (!lifetime.disposed) lastOpener?.focus();
  });
  lifetime.listen(dialog, 'cancel', (event) => {
    if (reloadPrompt.hidden) return;
    event.preventDefault();
    cancelReloadPrompt();
  });
  const requestReload = (): void => {
    if (!hasContent) {
      reloadFrame();
      return;
    }
    reloadPrompt.hidden = false;
    reload.setAttribute('aria-expanded', 'true');
    cancelReload.focus();
  };
  lifetime.listen(reload, 'click', requestReload);
  lifetime.listen(confirmReload, 'click', reloadFrame);
  lifetime.listen(cancelReload, 'click', cancelReloadPrompt);
  lifetime.listen(retry, 'click', requestReload);
  if (typeof MutationObserver === 'function') {
    const siteTheme = new MutationObserver(applyTheme);
    siteTheme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    lifetime.defer(() => siteTheme.disconnect());
    if (readerRoot) {
      const readingThemeObserver = new MutationObserver(applyTheme);
      readingThemeObserver.observe(readerRoot, {
        attributes: true,
        attributeFilter: ['data-reading-theme'],
      });
      lifetime.defer(() => readingThemeObserver.disconnect());
    }
  }
  render();
}
