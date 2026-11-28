import { STORAGE_KEYS } from '../../../data/storage-keys';
import { createCanvasSurfaceRuntime } from './canvas-surface-runtime';
// A standalone canvas application uses the same session contract as the desktop.
import { loadApp } from '../../apps';
import { appRoute, resolveAppId } from '../../../data/app-catalog';

import { THEMES, themeProperties } from '../../gfx/palette';

import { mountDesktop } from './screen';
import { mountAssistantComposer } from './assistant-composer';
import { playInRegister } from '../audio/soundscape';
import { applyDisplayPalette } from '../../gfx/display-palette';

import { createBrowserRuntime } from './browser-runtime';
import { createLifetime, claimSurface } from '../../ui/browser/lifetime';
import { prepareFonts } from './browser-fonts';
import { parseBridgeMessage } from './browser-bridge';
import { createDomSavePicker } from '../files/dom-save-picker';
import { downloadText, downloadSandbox } from '../files/browser-files';
import { openSaveDialog } from '../files/save-dialog';
import { DOCUMENT_BACKUP_LIMIT } from '../files/document-backup';
import { createNativeFileServices } from '../files/native-file-service';
import { windowClient } from '../../ui/canvas/layout';
import { resolveFileOpen, fileHandlerLabel, fileOpenChoices } from '../files/file-types';
import { publicFileTarget } from '../../../data/public-files';
import type { OpenResult } from './app-contracts';
import { mountHybridUi } from '../../ui/browser/hybrid-ui';
import '../../../styles/hybrid-ui.css';
import { createDesktopSettings } from '../desktop/browser-desktop-settings';
import { textClipboard } from './text-clipboard';
import { createBrowserFilePicker } from './browser-file-picker';
import { createBrowserFileAudio } from '../audio/browser-file-audio';
import { resolveGlobalShortcut } from '../../ui/browser/keyboard-shortcuts';
import type { MenuCommand } from '../../ui/canvas/menu-types';

import type { Saver } from '../../gfx/saver-model';
import type { AppServices, MsgSpec, AppSession, AppMenuSelection } from './app-contracts';

import '../../../styles/app-host.css';

export async function mountAppHost(root: HTMLElement) {
  const id = resolveAppId(root.dataset.app ?? '', 'canvas');
  const canvas = root.querySelector<HTMLCanvasElement>('canvas');
  const menuHost = root.querySelector<HTMLElement>('[data-app-menu]');
  const status = root.querySelector<HTMLElement>('[data-app-status]');
  const dialog = root.querySelector<HTMLDialogElement>(':scope > dialog');
  if (!canvas || !menuHost || !status || !dialog) return;
  const lifetime = createLifetime();
  let animation = 0;
  let suspended = false;
  let resumeFrame: (() => void) | undefined;
  function dispose() {
    if (lifetime.disposed) return;
    cancelAnimationFrame(animation);
    lifetime.dispose();
  }
  try {
    const releasePendingMount = (event: PageTransitionEvent) => {
      if (!event.persisted) dispose();
    };
    window.addEventListener('pagehide', releasePendingMount);
    lifetime.defer(() => window.removeEventListener('pagehide', releasePendingMount));
    const app = await loadApp(id);
    window.removeEventListener('pagehide', releasePendingMount);
    if (!app || lifetime.disposed) {
      dispose();
      return { dispose, requestClose: async () => true };
    }
    lifetime.defer(claimSurface(canvas));
    const surfaceRuntime = createCanvasSurfaceRuntime(canvas);
    lifetime.defer(surfaceRuntime.dispose);
    const { draw: renderer, input, effects, audio } = surfaceRuntime;
    let hostInvalidated = true;
    const fontsReady = prepareFonts(lifetime, renderer.fonts);
    const filePicker = createBrowserFilePicker(root);
    lifetime.defer(filePicker.dispose);
    let time = 0,
      dt = 0;
    lifetime.defer(mountHybridUi(root));
    const runtime = createBrowserRuntime('legacy');
    lifetime.defer(runtime.dispose);
    let session: AppSession | undefined;
    let picker: ReturnType<typeof createDomSavePicker> | undefined;
    let closing: Promise<boolean> | undefined;
    let unloadFrame: (() => void) | undefined;
    let themeName = 'std';
    let saverPreview: { saver: Saver; start: number; x: number; y: number } | undefined;
    let previewWake = false;
    const motion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    const settings = createDesktopSettings(renderer, audio, (saver) => {
      saverPreview =
        saver === 'None' ? undefined : { saver, start: time, x: input.io.px, y: input.io.py };
    });
    lifetime.defer(() => {
      saverPreview = undefined;
      previewWake = false;
    });
    let message: MsgSpec | null = null;
    let messageLifetime = createLifetime();
    const pendingMessages: MsgSpec[] = [];
    const send = (value: object) => {
      if (window.parent !== window) window.parent.postMessage(value, location.origin);
    };
    const win = {
      id: app.id,
      appId: app.id,
      title: app.title,
      x: -3,
      y: -22,
      w: app.w,
      h: app.h,
      k: 1,
      minimized: false,
      maximized: false,
      saved: null,
      menu: { open: -1 },
    };
    lifetime.defer(() => session?.dispose());
    lifetime.defer(() => picker?.dispose());
    lifetime.defer(() => {
      messageLifetime.dispose();
      message = null;
      pendingMessages.length = 0;
      if (dialog.open) dialog.close();
      dialog.replaceChildren();
    });
    const checkpoint = () => {
      if (lifetime.disposed || !session) return true;
      unloadFrame?.();
      return session.prepareUnload();
    };
    lifetime.listen(window, 'beforeunload', (event) => {
      if (!checkpoint()) {
        event.preventDefault();
      }
    });
    lifetime.listen(window, 'pagehide', (event) => {
      checkpoint();
      if (event.persisted) {
        suspended = true;
        cancelAnimationFrame(animation);
        input.cancelPointerInput();
      } else dispose();
    });
    lifetime.listen(window, 'pageshow', (event) => {
      if (!event.persisted || !suspended || lifetime.disposed) return;
      suspended = false;
      resumeFrame?.();
    });
    function requestClose(): Promise<boolean> {
      if (closing) return closing;
      if (!session || lifetime.disposed) return Promise.resolve(true);
      closing = session.requestClose().then((accepted) => {
        if (lifetime.disposed) return accepted;
        if (accepted) {
          send({ type: 'doom95:closed', id: app!.id });
          canvas!.hidden = true;
          menuHost!.hidden = true;
          status!.textContent = 'Application closed.';
          const back = document.createElement('a');
          back.href = '/';
          back.dataset.appReturn = '';
          back.textContent = 'Return to MHK10';
          root.append(back);
          dispose();
        } else {
          closing = undefined;
          send({ type: 'doom95:close-blocked', id: app!.id });
          if (!dialog!.open)
            showMessage({
              title: 'Unable to close',
              lines: [
                'Your document could not be saved.',
                'Retry saving or use File > Export this document.',
              ],
            });
        }
        return accepted;
      });
      return closing;
    }
    function changeTheme(name: string, broadcast = false) {
      hostInvalidated = true;
      if (!Object.hasOwn(THEMES, name)) return;
      themeName = name;
      renderer.theme.setTheme(name);
      for (const [key, value] of Object.entries(themeProperties(renderer.TH)))
        root.style.setProperty(`--${key}`, value);
      root.dataset.theme = name;
      root.style.setProperty('--app-face', renderer.TH.face);
      root.style.setProperty('--app-ink', renderer.TH.text);
      root.style.setProperty('--app-title', renderer.TH.title);
      root.style.setProperty('--app-title-text', renderer.TH.titleText);
      if (broadcast) {
        settings.applyTheme(name);
        try {
          localStorage.setItem(STORAGE_KEYS.theme, name);
        } catch {
          /* Session preference. */
        }
        send({ type: 'doom95:theme', theme: name });
      }
    }
    const publishDoom = () => {
      try {
        localStorage.setItem(STORAGE_KEYS.doom, String(runtime.risk.doom.v));
      } catch {
        /* Session meter. */
      }
      send({ type: 'doom95:doom', value: runtime.risk.doom.v });
    };
    lifetime.defer(runtime.story.subscribe(publishDoom));
    function dismissMessage(index?: number) {
      if (lifetime.disposed) return;
      const spec = message;
      if (!spec || (index === undefined && spec.noClose)) return;
      dialog!.close();
      message = null;
      messageLifetime.dispose();
      if (index !== undefined) spec.onBtn?.(index, env, spec.check?.checked);
      else spec.onDismiss?.();
      const next = pendingMessages.shift();
      if (next) showMessage(next);
      else canvas!.focus({ preventScroll: true });
    }
    function showMessage(spec: MsgSpec) {
      if (lifetime.disposed) return;
      if (dialog!.open) {
        pendingMessages.push(spec);
        return;
      }
      messageLifetime.dispose();
      messageLifetime = createLifetime();
      message = spec;
      dialog!.replaceChildren();
      const title = document.createElement('h2');
      title.id = 'app-message-title';
      title.textContent = spec.title;
      dialog!.append(title);
      for (const line of spec.lines) {
        const p = document.createElement('p');
        p.textContent = line;
        dialog!.append(p);
      }
      if (spec.check) {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = spec.check.checked;
        const caption = document.createElement('span');
        caption.textContent = spec.check.label;
        label.append(checkbox, caption);
        messageLifetime.listen(checkbox, 'change', () => {
          if (spec.check) spec.check.checked = checkbox.checked;
        });
        dialog!.append(label);
      }
      const actions = document.createElement('div');
      actions.className = 'dialog-actions';
      (spec.buttons ?? ['OK']).forEach((label, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.autofocus = index === (spec.def ?? 0);
        messageLifetime.listen(button, 'click', () => dismissMessage(index));
        actions.append(button);
      });
      dialog!.append(actions);
      input.queueInput({ cancel: true });
      dialog!.showModal();
    }
    const launchUrl = new URL(location.href ?? location.origin);
    let requestedFolder = launchUrl.searchParams.get('folder') ?? undefined;
    function navigateApplication(target: string, href: string): OpenResult {
      if (lifetime.disposed || closing) return { accepted: false, reason: 'blocked' };
      if (window.parent !== window) send({ type: 'doom95:open', id: target, href });
      else
        void requestClose().then((accepted) => {
          if (accepted) location.assign(href);
        });
      return { accepted: true };
    }
    function chooseFileApplication(id: string): OpenResult {
      if (lifetime.disposed || closing || dialog!.open)
        return { accepted: false, reason: 'blocked' };
      const target = fileOpenChoices(runtime.files, id, runtime.associations.snapshot());
      if (!target?.applications.length) return { accepted: false, reason: 'unavailable' };
      showMessage({
        title: 'Open With',
        lines: [target.name, 'Select an application:'],
        buttons: [...target.applications.map(fileHandlerLabel), 'Cancel'],
        def: target.applications.length,
        check: { label: 'Always use this app for this file type', checked: false },
        onBtn: (index, _env, checked) => {
          if (index >= target.applications.length) return;
          const handler = target.applications[index];
          const launch = () => openFile(id, handler);
          if (checked) {
            const result = runtime.associations.setDefault(target.name, handler);
            if (!result.ok || !result.persisted) {
              showMessage({
                title: 'Open With',
                lines: [
                  result.ok ? 'This preference will last for this session only.' : result.error,
                ],
                onBtn: launch,
              });
              return;
            }
          }
          launch();
        },
      });
      return { accepted: true };
    }
    function openFile(id: string, application?: string): OpenResult {
      const target = resolveFileOpen(
        runtime.files,
        id,
        application,
        new Set<string>(),
        runtime.associations.snapshot(),
      );
      if (target.kind === 'failed') return { accepted: false, reason: 'unavailable' };
      if (target.kind === 'choose') return chooseFileApplication(id);
      const appId = target.kind === 'folder' ? 'computer' : target.application;
      const published =
        target.kind === 'application' && target.fileId
          ? publicFileTarget(target.fileId)
          : undefined;
      if (published && published.application === appId)
        return navigateApplication(appId, published.href);
      const route = appRoute(appId);
      if (!route) return { accepted: false, reason: 'unknown-app' };
      const url = new URL(route, location.origin);
      if (target.kind === 'folder') url.searchParams.set('folder', target.id);
      else if (target.fileId) url.searchParams.set('file', target.fileId);
      return navigateApplication(appId, url.href);
    }
    const env: AppServices = {
      openSaveDialog: (frame, request, save) => openSaveDialog(frame, request, env, save),
      exportSandbox: () => downloadSandbox(runtime.files, runtime.documentBackup.export),
      documentBackupLimit: DOCUMENT_BACKUP_LIMIT,
      clipboard: textClipboard,
      pickFile: filePicker.pick,
      fileAudio: {
        open: (fileId) =>
          createBrowserFileAudio(
            () => runtime.readFileAsset(fileId),
            () => ({ volume: audio.getVolume(), muted: audio.isMuted() }),
          ),
      },
      invalidate: () => {
        hostInvalidated = true;
      },
      nativeFiles: createNativeFileServices(
        runtime.files,
        (request) => env.saveText(request),
        openFile,
        (file) => runtime.readFileAsset(file.id),
      ),
      initialFileId: launchUrl.searchParams.get('file') ?? undefined,
      openFile,
      chooseFileApplication,
      takeFileOpen: (appId) => {
        if (appId !== 'computer') return;
        const folder = requestedFolder;
        requestedFolder = undefined;
        return folder;
      },
      loadFileAsset: runtime.readFileAsset,
      get reducedMotion() {
        return (motion?.matches ?? false) || settings.capabilities.getSettings().reducedMotion;
      },
      desktop: settings.capabilities,
      now: () => time,
      audio,
      wallpaper: { getWallpaper: renderer.getWallpaper, setWallpaper: settings.setWallpaper },
      doom: runtime.risk.doom,
      files: runtime.files,
      documents: runtime.documents,
      exportDocuments: runtime.documentBackup.export,
      importDocuments: runtime.documentBackup.import,
      story: runtime.story,
      ai: runtime.ai,
      snapshot: runtime.risk.snapshot,
      downloadText,
      doomUp: () => {
        runtime.risk.up();
        publishDoom();
      },
      doomDown: () => {
        const result = runtime.risk.down();
        publishDoom();
        return result;
      },
      open: (requested) => {
        const target = resolveAppId(requested, 'canvas');
        let href = appRoute(target);
        if (!href) return { accepted: false, reason: 'unknown-app' };
        if (target === 'notepad') {
          const fileId = runtime.documents.consumeOpen();
          if (fileId && runtime.files.get(fileId) && !runtime.files.get(fileId)?.deleted) {
            const url = new URL(href, location.origin);
            url.searchParams.set('file', fileId);
            href = url.href;
          }
        }
        return navigateApplication(target, href);
      },
      close: () => {
        void requestClose();
      },
      setTitle: (_id, title) => {
        win.title = title;
        document.title = title + ' · MHK10';
      },
      saveText: (request) => {
        if (lifetime.disposed)
          return Promise.resolve({ status: 'failed', error: 'The application is closed.' });
        picker ??= createDomSavePicker(root, runtime.files);
        return picker.saveText(request);
      },
      msg: showMessage,
      play: (sound) =>
        playInRegister(
          audio,
          sound,
          app.register ?? 'L2',
          settings.capabilities.getSettings().soundScheme,
        ),
      setTheme: (name) => changeTheme(name, true),
      themeName: () => themeName,
    };
    canvas.hidden = false;
    if (app.register === 'L1') status.style.font = '8px PS2P, monospace';
    root.querySelector('[data-app-return]')?.remove();
    renderer.registerAppIcons();
    try {
      changeTheme(localStorage.getItem(STORAGE_KEYS.theme) ?? 'std');
    } catch {
      changeTheme('std');
    }
    if (app.id === 'notepad') {
      const fileId = new URL(location.href ?? location.origin).searchParams.get('file');
      if (
        fileId &&
        runtime.files.get(fileId) &&
        !runtime.files.get(fileId)?.deleted &&
        !runtime.files.get(fileId)?.readonly
      )
        runtime.documents.requestOpen(fileId);
    }
    session = app.createSession(env, { draw: renderer, input, effects, owner: app.id });
    const composerForm =
      session.assistantView && root.querySelector<HTMLFormElement>('[data-assistant-composer]');
    const composer = composerForm ? mountAssistantComposer(canvas, composerForm) : undefined;
    if (composer) lifetime.defer(composer.dispose);
    const definitions = session.menus();
    win.y = -22 - (definitions ? 18 : 0);
    const client = windowClient(win, !!definitions, session.status() !== undefined);
    const width = client.w;
    let height = client.h;
    canvas.width = width;
    canvas.height = height;
    canvas.style.aspectRatio = width + ' / ' + height;
    root.style.setProperty('--canvas-width', width + 'px');
    const updateMetrics = () =>
      renderer.setDisplayMetrics({
        width,
        height,
        scale: 1,
        cssWidth: width,
        cssHeight: height,
        mode: 'classic',
        workArea: { x: 0, y: 0, w: width, h: height },
      });
    updateMetrics();
    const context = renderer.getCtx();
    context.imageSmoothingEnabled = false;
    let selection: AppMenuSelection | null = null;
    const menuButtons: { menu: string; index: number; button: HTMLButtonElement }[] = [];
    function updateMenuButton(button: HTMLButtonElement, item: MenuCommand): void {
      const mnemonic = (item.mnemonic ?? item.label.trim().charAt(0)).toLowerCase();
      if (
        button.getAttribute('aria-label') !== item.label ||
        button.textContent !== item.label + (item.shortcut ?? '') ||
        button.dataset.mnemonic !== mnemonic
      ) {
        const caption = document.createElement('span');
        const position = item.label.toLowerCase().indexOf(mnemonic);
        if (mnemonic && position >= 0) {
          const underline = document.createElement('u');
          underline.textContent = item.label[position];
          caption.append(item.label.slice(0, position), underline, item.label.slice(position + 1));
        } else caption.textContent = item.label;
        button.replaceChildren(caption);
        if (item.shortcut) {
          const shortcut = document.createElement('span');
          shortcut.textContent = item.shortcut;
          shortcut.style.cssText = 'float:right;margin-left:20px';
          shortcut.setAttribute('aria-hidden', 'true');
          button.append(shortcut);
        }
        button.setAttribute('aria-label', item.label);
        button.dataset.mnemonic = mnemonic;
      }
      const role =
        item.checked === undefined ? 'menuitem' : item.radio ? 'menuitemradio' : 'menuitemcheckbox';
      if (button.getAttribute('role') !== role) button.setAttribute('role', role);
      if (item.checked === undefined) button.removeAttribute('aria-checked');
      else if (button.getAttribute('aria-checked') !== String(item.checked))
        button.setAttribute('aria-checked', String(item.checked));
      const defaultItem = String(item.default === true);
      if (button.dataset.menuDefault !== defaultItem) button.dataset.menuDefault = defaultItem;
      button.dataset.menuCommand = item.command;
      if (button.disabled !== !!item.disabled) button.disabled = !!item.disabled;
    }
    for (const [name, items] of Object.entries(definitions ?? {})) {
      const group = document.createElement('details');
      menuHost.dataset.hybridMenubar = '';
      menuHost.classList.add('hybrid-menubar');
      menuHost.setAttribute('role', 'menubar');
      const label = document.createElement('summary');
      const access = document.createElement('u');
      access.textContent = name.charAt(0);
      label.append(access, name.slice(1));
      label.dataset.mnemonic = name.charAt(0).toLowerCase();
      label.setAttribute('role', 'menuitem');
      group.append(label);
      const list = document.createElement('div');
      list.className = 'app-menu-items';
      list.setAttribute('role', 'menu');
      for (const [index, item] of items.entries()) {
        if (item === '-') {
          list.append(document.createElement('hr'));
          continue;
        }
        const button = document.createElement('button');
        button.type = 'button';
        updateMenuButton(button, item);
        menuButtons.push({ menu: name, index, button });
        lifetime.listen(button, 'click', () => {
          const current = session!.menus()?.[name]?.[index];
          if (!current || current === '-' || current.disabled) return;
          selection = { menu: name, item: current.label, command: current.command };
          group.open = false;
          canvas.focus();
        });
        list.append(button);
      }
      group.append(list);
      lifetime.listen(group, 'toggle', () => {
        if (group.open)
          menuHost.querySelectorAll('details').forEach((other) => {
            if (other !== group) other.open = false;
          });
      });
      menuHost.append(group);
      lifetime.defer(() => group.remove());
    }
    menuHost.hidden = !definitions;
    status.hidden = session.status() === undefined;
    lifetime.listen(document, 'pointerdown', (event) => {
      if (!menuHost.contains(event.target as Node))
        menuHost.querySelectorAll('details').forEach((group) => {
          group.open = false;
        });
      if (root.contains(event.target as Node)) send({ type: 'doom95:focus', id: app.id });
    });
    lifetime.listen(dialog, 'cancel', (event) => {
      event.preventDefault();
      dismissMessage();
    });
    lifetime.listen(window, 'storage', (event) => {
      if (event.key === STORAGE_KEYS.theme) changeTheme(event.newValue ?? 'std');
      if (event.key === STORAGE_KEYS.doom && event.newValue !== null)
        runtime.risk.restore(Number(event.newValue));
    });
    lifetime.listen(window, 'message', (event) => {
      if (event.origin !== location.origin || event.source !== window.parent) return;
      const data = parseBridgeMessage(event.data);
      if (data?.type === 'doom95:theme') changeTheme(data.theme);
      if (data?.type === 'doom95:doom') runtime.risk.restore(data.value);
      if (data?.type === 'doom95:close' && resolveAppId(data.id, 'canvas') === app.id)
        void requestClose();
    });
    const rightButton = root.querySelector<HTMLButtonElement>('#right-click-toggle');
    if (rightButton)
      lifetime.listen(rightButton, 'click', () => {
        canvas.dataset.rightClick = String(canvas.dataset.rightClick !== 'true');
        rightButton.setAttribute('aria-pressed', canvas.dataset.rightClick);
      });
    const textEntry = root.querySelector<HTMLFormElement>('[data-text-entry]');
    if (textEntry)
      lifetime.listen(textEntry, 'submit', (event) => {
        event.preventDefault();
        const field = root.querySelector<HTMLInputElement>('[data-text-input]');
        if (!field?.value) return;
        canvas.focus();
        input.queueInput({ typed: field.value });
        field.value = '';
      });
    root.querySelectorAll<HTMLButtonElement>('[data-app-key]').forEach((button) =>
      lifetime.listen(button, 'click', () => {
        canvas.focus();
        input.queueInput({ key: button.dataset.appKey });
      }),
    );
    lifetime.defer(mountDesktop(canvas, input, audio, { w: width, h: height }));
    lifetime.listen(window, 'keydown', (event) => {
      if (!root.contains(document.activeElement)) return;
      if (resolveGlobalShortcut(event) === 'StartMenu') {
        event.preventDefault();
        send({ type: 'doom95:start' });
      }
      if (event.key === 'Escape' && !dialog.open)
        menuHost.querySelectorAll('details').forEach((group) => {
          group.open = false;
        });
    });
    if (!(await fontsReady)) return { dispose, requestClose };
    let shake = 0;
    let flash: [string, number] | null = null;
    let last = performance.now();
    let paintedBlocked = false,
      paintedFocused = false,
      lastPointerX = 0,
      lastPointerY = 0;
    function frame(now: number) {
      if (lifetime.disposed || suspended) return;
      try {
        dt = Math.min((now - last) / 1000, 0.05);
        time += dt;
        effects.resetFX();
        last = now;
        input.beginFrame(time);
        const nextStatus = session!.status();
        status!.hidden = nextStatus === undefined;
        const nextHeight = windowClient(win, !!definitions, nextStatus !== undefined).h;
        if (nextHeight !== height) {
          hostInvalidated = true;
          height = nextHeight;
          canvas!.height = height;
          canvas!.style.aspectRatio = width + ' / ' + height;
          context.imageSmoothingEnabled = false;
          updateMetrics();
        }
        const menuOpen = !!menuHost!.querySelector('details[open]');
        const blocked = dialog!.open || menuOpen || !!picker?.open || !!saverPreview || previewWake;
        composer?.sync(blocked ? undefined : session, { x: 0, y: 0, w: width, h: height });
        win.menu.open = menuOpen ? 0 : -1;
        input.setGate(blocked ? null : app!.id);
        const focused =
          !blocked && (document.activeElement === canvas || input.io.keyboardEvents.length > 0);
        const paint =
          hostInvalidated ||
          (session!.needsFrame?.() ?? true) ||
          selection !== null ||
          blocked !== paintedBlocked ||
          focused !== paintedFocused ||
          !!saverPreview ||
          previewWake ||
          shake > 0.1 ||
          (!!flash && flash[1] > 0.01) ||
          input.io.keyboardEvents.length > 0 ||
          input.io.wentDown ||
          input.io.wentUp ||
          input.io.rwentDown ||
          input.io.rwentUp ||
          input.io.wheel !== 0 ||
          input.io.px !== lastPointerX ||
          input.io.py !== lastPointerY;
        if (paint) {
          hostInvalidated = false;
          paintedBlocked = blocked;
          paintedFocused = focused;
          context.fillStyle = renderer.TH.face;
          context.fillRect(0, 0, width, height);
          if (previewWake) {
            previewWake = input.io.down || input.io.rdown;
            input.io.typed = '';
            input.io.keyPressed.clear();
            input.io.wentDown = input.io.wentUp = input.io.rwentDown = input.io.rwentUp = false;
          }
          if (saverPreview) {
            renderer.drawSaver(
              saverPreview.saver,
              time - saverPreview.start,
              width,
              height,
              env.reducedMotion,
              settings.capabilities.getSettings().marquee,
              env.doom.v,
            );
            if (
              time - saverPreview.start >= 15 ||
              input.io.wentDown ||
              input.io.wentUp ||
              input.io.rwentDown ||
              input.io.rwentUp ||
              input.io.typed ||
              input.io.keyPressed.size ||
              input.io.wheel ||
              input.io.px !== saverPreview.x ||
              input.io.py !== saverPreview.y
            ) {
              saverPreview = undefined;
              previewWake = true;
            }
          } else {
            if (!previewWake && input.io.keyPressed.has('CloseWindow')) void requestClose();
            session!.frame({
              t: time,
              dt,
              win,
              client: { x: 0, y: 0, w: width, h: height },
              menuSel: selection,
              focused,
              pointerIn:
                !blocked &&
                input.io.px >= 0 &&
                input.io.py >= 0 &&
                input.io.px < width &&
                input.io.py < height,
            });
          }
        }
        void session!.flushClose();
        const currentMenus = session!.menus();
        for (const entry of menuButtons) {
          const item = currentMenus?.[entry.menu]?.[entry.index];
          if (item && item !== '-') updateMenuButton(entry.button, item);
          else if (!entry.button.disabled) entry.button.disabled = true;
        }
        // Apply effects only to this application. Brief impulses decay across frames;
        // reduced motion disables both shake and flash without affecting game state.
        if (paint && env.reducedMotion) {
          shake = 0;
          flash = null;
        } else if (paint) {
          shake = Math.max(shake * Math.exp(-18 * dt), effects.FX.shake ?? 0);
          if (effects.FX.flash) flash = [...effects.FX.flash];
          else if (flash) flash[1] *= Math.exp(-18 * dt);
          if (shake > 0.1) {
            const x = Math.round(Math.sin(time * 87) * shake);
            const y = Math.round(Math.cos(time * 71) * shake * 0.6);
            canvas!.style.transform = `translate(${x}px, ${y}px)`;
          }
          if (flash && flash[1] > 0.01) {
            renderer.stipple(0, 0, width, height, flash[0], Math.min(0.5, Math.max(0, flash[1])));
          }
        }
        // Compare before writing: unconditional style/text writes invalidate
        // style+layout on every frame of every standalone app page.
        if (shake <= 0.1 && canvas!.style.transform) canvas!.style.transform = '';
        if (paint) applyDisplayPalette(renderer, renderer.TH);
        lastPointerX = input.io.px;
        lastPointerY = input.io.py;

        selection = null;
        const cursorStyle =
          input.io.cursor === 'ibeam' ? 'text' : input.io.cursor === 'wait' ? 'wait' : 'default';
        if (canvas!.style.cursor !== cursorStyle) canvas!.style.cursor = cursorStyle;
        const statusText = session!.status() ?? '';
        if (status!.textContent !== statusText) status!.textContent = statusText;
        if (!lifetime.disposed && !suspended) animation = requestAnimationFrame(frame);
      } catch (error) {
        dispose();
        throw error;
      }
    }
    resumeFrame = () => {
      last = performance.now();
      animation = requestAnimationFrame(frame);
    };
    if (!suspended) resumeFrame();
    unloadFrame = () => {
      cancelAnimationFrame(animation);
      frame(performance.now());
    };
    send({ type: 'doom95:ready', id: app.id, width, height });
    return { dispose, requestClose };
  } catch (error) {
    dispose();
    throw error;
  }
}
