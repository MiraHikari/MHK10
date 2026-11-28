import { FUSION_QUERY } from '@mhk/site-core/fusion/protocol-model';
import { STORAGE_KEYS } from '../../../data/storage-keys';
import { createShell } from '../desktop/shell';
import { APPS } from '../../apps/eager';
import { createSaveDialogApp } from '../files/save-dialog';
import { defineCanvasApp } from './app-session';
import { createBrowserRuntime } from './browser-runtime';
import { htmlApps } from './html-apps';
import { resolveAppId } from '../../../data/app-catalog';

export async function mountDesktopEntry(hybrid: boolean) {
  const canvas = document.getElementById('screen') as HTMLCanvasElement;
  // The full-shell embed boots hidden behind the classic site; mute the boot
  // sound before mounting so a hidden desktop never speaks for the page.
  const embeddedFullShell = (() => {
    try {
      return (
        window.self !== window.top &&
        new URLSearchParams(location.search).get(FUSION_QUERY.shell) === FUSION_QUERY.full
      );
    } catch {
      return false;
    }
  })();
  let returningVisit = false;
  try {
    returningVisit = !!(
      localStorage.getItem(STORAGE_KEYS.desktop) || localStorage.getItem(STORAGE_KEYS.files)
    );
  } catch {
    /* First-session defaults. */
  }
  let runtime: ReturnType<typeof createBrowserRuntime> | undefined;
  let shell: ReturnType<typeof createShell> | undefined;
  try {
    runtime = createBrowserRuntime('story');
    const current = resolveAppId(
      document.getElementById('primary-window')?.dataset.window ?? 'home',
      'hybrid',
    );
    // Strip the fusion shell parameter so a nested html app pointing back at
    // this page does not boot another full-shell desktop (infinite recursion).
    const selfUrl = new URL(location.href);
    selfUrl.searchParams.delete(FUSION_QUERY.shell);
    selfUrl.searchParams.delete('fusion');
    const personal = htmlApps.map((app) => ({
      ...app,
      html: app.id === current ? selfUrl.pathname + selfUrl.search + selfUrl.hash : app.html,
    }));
    const files = runtime.files;
    shell = createShell(
      hybrid ? [...personal, ...APPS] : APPS,
      runtime,
      {
        initialApp: hybrid ? current : undefined,
        returningVisit,
        embedded: embeddedFullShell,
        startupSkip: document.getElementById('startup-skip') ?? undefined,
        ejectRestart: document.getElementById('eject-restart') ?? undefined,
        assistantForm:
          canvas.parentElement?.querySelector<HTMLFormElement>('[data-assistant-composer]') ??
          undefined,
        saveDialog: (request, complete) =>
          defineCanvasApp(createSaveDialogApp(request, complete, files)),
      },
      canvas,
    );
    if (embeddedFullShell) shell.setAudioMuted(true);
    await shell.mount(canvas);
    document.getElementById('boot-hint')?.remove();
  } catch (error) {
    if (shell) shell.dispose();
    else runtime?.dispose();
    console.error('MHK10 could not start', error);
    document.documentElement.classList.remove('hybrid-mode');
    const hint = document.getElementById('boot-hint');
    if (hint) hint.textContent = 'MHK10 could not start. Reload to try again.';
  }
  return shell;
}
