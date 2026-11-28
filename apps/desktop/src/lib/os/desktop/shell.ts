import { STORAGE_KEYS } from '../../../data/storage-keys';
import { createDesktopWorkspace } from './desktop-workspace';
import { createDesktopChrome } from './desktop-chrome';
import {
  createDesktopLifecycle,
  drawBoot as paintBoot,
  drawFirmwareDesktop as paintFirmware,
  drawShutdown as paintShutdown,
  drawSplash as paintSplash,
  type FirmwareConsole,
} from './desktop-lifecycle';
import { frameKeyPrelude } from './frame-keys';
import { createRunDialog, createFindDialog, createRenameDialog } from './desktop-dialogs';
import { createDesktopLauncher } from './desktop-launch';
import { createDesktopFileDrag } from './desktop-file-drag';
import { createMessageWindows } from './message-window';
import { desktopAction } from './desktop-command-model';
import { requestClassic } from '../host/embed-host';
import {
  destinationFromUrl,
  destinationPath,
  parseFusionDestination,
  FUSION_EVENTS,
  type FusionDestination,
} from '@mhk/site-core/fusion/protocol-model';
import { desktopKeySteps, type DesktopKeyStep } from './desktop-key-model';
import { desktopContextMenu } from './desktop-context-menu';
import {
  desktopNeedsPaint,
  doomSlamWindow,
  htmlCompositingEnabled,
  sameDesktopScene,
  shutdownNeedsPaint,
  type DesktopPaintScene,
} from './frame-paint-model';
import { createCanvasSurfaceRuntime } from '../host/canvas-surface-runtime';
import { createWindowSessions } from '../windows/window-sessions';
import { resolveAppId } from '../../../data/app-catalog';
import { mountDesktop } from '../host/screen';
import { mountMonitor } from '../host/monitor';
import { mountAssistantComposer } from '../host/assistant-composer';
import { prepareFonts } from '../host/browser-fonts';
import { textClipboard } from '../host/text-clipboard';
import { createBrowserFilePicker } from '../host/browser-file-picker';
import { createBrowserFileAudio } from '../audio/browser-file-audio';
// Compose one desktop surface and schedule frames across its owners.

import { FPS } from '../../gfx/context';
import { CLASSIC_SIZE, TASKBAR_HEIGHT, type DisplayMetrics } from '../../gfx/display-metrics';
import { C, THEMES } from '../../gfx/palette';
import { clamp, R, hash, prog } from '../../gfx/primitives';

import { WM, truncateLabel, type WinState } from '../windows/wm';

import { pdoomText, pdoomColor, doomMood } from '../story/doom';
import { createAssistantDrawing } from '../../ui/canvas/assistant';
import { assistantPlacement } from './assistant-placement';
import { createHtmlWindows, type HtmlWindowView, type HtmlRect } from '../windows/html-windows';
import { resolveAppHref } from './desktop-state';
import { createPointerLayer } from '../../ui/browser/pointer-layer';
import { desktopStartEntries } from './start-menu';
import type { StoryState } from '../story/story';
import type { BrowserRuntime } from '../host/browser-runtime';
import { browserStorage } from '../host/browser-runtime';
import type {
  Application,
  CanvasApp,
  AppServices,
  MsgSpec,
  OpenResult,
} from '../host/app-contracts';
import type { SaveTextRequest, SaveTextResult } from '../files/save-request';
import { createLifetime, claimSurface } from '../../ui/browser/lifetime';
import { interactionPolicy } from '../windows/interaction';
import { downloadText, downloadSandbox } from '../files/browser-files';
import { openSaveDialog } from '../files/save-dialog';
import { DOCUMENT_BACKUP_LIMIT } from '../files/document-backup';

import { createDesktopSettings } from './browser-desktop-settings';
import { DEFAULT_SETTINGS, pinQuickLaunch, unpinQuickLaunch } from './desktop-settings';
import { playInRegister } from '../audio/soundscape';
import { HELP_TOPICS } from '../../ui/help';
import { systemClock } from '../story/doom';

import type { Bounds } from '../../ui/canvas/layout';
import { windowClient } from '../../ui/canvas/layout';
import type { TransferSource, TransferTarget } from '../files/file-transfer';
import { fileHandlerLabel, fileOpenChoices } from '../files/file-types';
import { mountNativeFileHost } from '../files/native-file-bridge';
import { createNativeFileServices } from '../files/native-file-service';

export type { App, AppServices, AppFrame, MsgSpec } from '../host/app-contracts';
export interface ShellOptions {
  initialApp?: string;
  returningVisit?: boolean;
  embedded?: boolean;
  startupSkip?: HTMLElement;
  ejectRestart?: HTMLElement;
  assistantForm?: HTMLFormElement;
  saveDialog(request: SaveTextRequest, complete: (result: SaveTextResult) => void): CanvasApp;
}

export function createShell(
  applications: Application[],
  runtime: BrowserRuntime,
  options: ShellOptions,
  canvas: HTMLCanvasElement,
) {
  const apps = applications.map((app) => ({ ...app }));
  const { story, files, documents, ai, risk, associations } = runtime;
  const lifetime = createLifetime();
  try {
    const surfaceRuntime = createCanvasSurfaceRuntime(canvas);
    lifetime.defer(surfaceRuntime.dispose);
    const { draw: renderer, input, effects, audio, widgets } = surfaceRuntime;
    const { applyFX, wordart, dim } = effects;
    const assistantDrawing = createAssistantDrawing(renderer);
    lifetime.defer(assistantDrawing.dispose);
    const { assistant } = assistantDrawing;
    let mounted = false;
    let animation = 0;
    let suspended = false;
    let presentationSuspended = false;
    let resumeFrame: (() => void) | undefined;
    let renderingReady = false;
    renderer.registerAppIcons();
    const wm = new WM(renderer, input, widgets);
    let launcher: ReturnType<typeof createDesktopLauncher> | undefined;
    let fileDrag: ReturnType<typeof createDesktopFileDrag> | undefined;
    let messages: ReturnType<typeof createMessageWindows> | undefined;

    let systemInput = false;
    let taskbarAnimated = false;
    let shutdownAnimated = true;
    let paintedScene: DesktopPaintScene | undefined;
    let paintedSecond = -1;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let resolutionDirty = false;
    let presentedPhase = '';
    const doom = risk.doom;
    const personal = apps.some((app) => app.kind === 'html');
    let assistantComposer: ReturnType<typeof mountAssistantComposer> | undefined;
    function setPresentationSuspended(value: boolean): void {
      if (lifetime.disposed || value === presentationSuspended) return;
      if (value && renderingReady) {
        // Consume already accepted input before parking; saving continues in its session.
        input.beginFrame(performance.now() / 1000);
        frame(0);
      }
      presentationSuspended = value;
      // Fusion lifecycle marker: the parent can observe that a hidden desktop is
      // parked, and the handoff can verify a cancelled return was resumed.
      try {
        document.documentElement.toggleAttribute('data-presentation-suspended', value);
      } catch {
        /* Minimal DOM stubs used by shell tests may not expose toggleAttribute. */
      }
      if (value) {
        assistantComposer?.hide();
        cancelAnimationFrame(animation);
        input.cancelPointerInput();
        clearStartupPresses();
      } else if (!suspended) {
        paintedScene = undefined;
        resumeFrame?.();
      }
    }
    const hostKind = personal ? 'hybrid' : 'canvas';
    // Fusion embed（?shell=full）由 embed-host 在 <html data-embed-full> 标记；
    // 开始菜单据此显示「Classic Site」回经典站入口。hasAttribute 探测需容忍
    // 测试环境的最小 DOM 桩。
    const embedFull = () => {
      try {
        return document.documentElement.hasAttribute?.('data-embed-full') === true;
      } catch {
        return false;
      }
    };
    const chrome = createDesktopChrome(
      renderer,
      input,
      widgets,
      desktopStartEntries(hostKind, [], embedFull()),
    );
    lifetime.defer(chrome.dispose);
    const sessions = createWindowSessions(wm, apps, (id, message) => {
      if (message?.title === 'Shut Down MHK10') shutOpen = false;
      launcher?.release(id);
      fileDrag?.remove(id);
      messages?.remove(id, message);
    });
    lifetime.defer(sessions.dispose);
    let saveRequest: Promise<SaveTextResult> | undefined;
    let filePicker: ReturnType<typeof createBrowserFilePicker> | undefined;
    let desktopFileOperation: Promise<void> | undefined;
    lifetime.defer(() => filePicker?.dispose());
    let htmlWindows: ReturnType<typeof createHtmlWindows> | null = null;
    let pointerLayer: ReturnType<typeof createPointerLayer> | null = null;
    let monitor: ReturnType<typeof mountMonitor> | null = null;
    let surface: HTMLCanvasElement | null = null;
    let htmlViews: HtmlWindowView[] = [];
    const { startupSkip } = options;
    let startupFocusPending = false;
    let startupPointer: number | undefined;
    const startupKeys = new Set<string>();
    function clearStartupPresses(): void {
      startupKeys.clear();
      startupPointer = undefined;
    }

    let initialPreferredTheme = 'std';
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.theme);
      if (saved && Object.hasOwn(THEMES, saved)) initialPreferredTheme = saved;
    } catch {
      /* Standard theme. */
    }

    let systemReducedMotion = false;

    const lifecycle = createDesktopLifecycle(initialPreferredTheme);
    lifetime.defer(lifecycle.dispose);
    const desktopSettings = createDesktopSettings(renderer, audio, lifecycle.previewSaver);
    lifetime.defer(desktopSettings.dispose);
    let resolutionMode = desktopSettings.capabilities.getSettings().resolutionMode;
    const loadFileAsset = runtime.readFileAsset;
    const nativeFiles = createNativeFileServices(
      files,
      (request) => env.saveText(request),
      openFile,
      (file) => loadFileAsset(file.id),
    );

    const env: AppServices = {
      clipboard: textClipboard,
      pickFile: (request) => {
        filePicker ??= createBrowserFilePicker(canvas.parentElement ?? document.body);
        return filePicker.pick(request);
      },
      fileAudio: {
        open: (fileId) =>
          createBrowserFileAudio(
            () => loadFileAsset(fileId),
            () => ({ volume: audio.getVolume(), muted: audio.isMuted() }),
          ),
      },
      invalidate: () => {
        paintedScene = undefined;
      },
      openFile: (id, application) => openFile(id, application),
      chooseFileApplication: (id) => chooseFileApplication(id),
      loadFileAsset,
      nativeFiles,
      takeFileOpen: (appId) => launcher?.takeFolder(appId),
      get reducedMotion() {
        return lifecycle.reducedMotion;
      },
      desktop: desktopSettings.capabilities,
      now: () => lifecycle.t,
      audio,
      wallpaper: {
        getWallpaper: renderer.getWallpaper,
        setWallpaper: desktopSettings.setWallpaper,
      },
      doom,
      files,
      documents,
      exportDocuments: runtime.documentBackup.export,
      openSaveDialog: (frame, request, save) => openSaveDialog(frame, request, env, save),
      exportSandbox: () => downloadSandbox(files, runtime.documentBackup.export),
      documentBackupLimit: DOCUMENT_BACKUP_LIMIT,
      importDocuments: runtime.documentBackup.import,
      story,
      ai,
      snapshot: risk.snapshot,
      doomUp: () => {
        if (risk.up().recovery) openApp('recovery');
      },
      doomDown: risk.down,
      open: (id, origin) => openApp(id, origin),
      close: (id) => {
        void closeWin(id);
      },
      processes: () =>
        wm.wins
          .filter((win) => win.appId !== '$msg')
          .map((win) => ({
            id: win.id,
            appId: win.appId,
            title: win.title,
            focused: wm.focused === win.id,
            minimized: win.minimized,
          })),
      focus: (id) => wm.restore(id),
      fileSurfaces: {
        publish: (id, view) => {
          if (!lifetime.disposed) fileDrag?.publish(id, view);
        },
        remove: (id) => {
          fileDrag?.remove(id);
        },
      },
      setTitle: (id, title) => {
        wm.setTitle(id, title);
      },
      downloadText,
      saveText: (request) => {
        if (lifetime.disposed)
          return Promise.resolve({ status: 'failed', error: 'The desktop is closed.' });
        if (saveRequest)
          return Promise.resolve({
            status: 'failed',
            error: 'Finish the open Save As dialog first.',
          });
        const pending = Promise.withResolvers<SaveTextResult>();
        saveRequest = pending.promise;
        const complete = (result: SaveTextResult) => {
          saveRequest = undefined;
          pending.resolve(result);
        };
        let dialogId: string | undefined;
        try {
          const app = options.saveDialog(request, complete);
          dialogId = app.id;
          sessions.register(app);
          if (!openApp(app.id).accepted) {
            sessions.unregister(app.id);
            complete({ status: 'failed', error: 'The Save As dialog could not open.' });
          }
        } catch {
          if (dialogId) {
            sessions.discard(dialogId);
            sessions.unregister(dialogId);
          }
          complete({
            status: 'failed',
            error: 'The Save As dialog could not open. Retry or export your document.',
          });
        }
        return pending.promise;
      },
      msg: (spec) => openMsg(spec),
      play: (s) => {
        const register =
          sessions.application(wm.byId(wm.focused ?? '')?.appId ?? '')?.register ?? 'L2';
        playInRegister(audio, s, register, desktopSettings.capabilities.getSettings().soundScheme);
      },
      setTheme: (n) => {
        if (Object.hasOwn(THEMES, n)) {
          lifecycle.chooseTheme(n);
          renderer.theme.setTheme(n);
          desktopSettings.applyTheme(n);
          document.documentElement.dataset.theme = n;
        }
      },
      themeName: () => lifecycle.themeName,
    };

    const modalOpen = () => wm.wins.some((w) => w.modal && !w.minimized);

    function openApp(
      id: string,
      launchBounds?: Bounds,
      initialFileId?: string,
      desktopSourceId?: string,
      htmlHref?: string,
    ): OpenResult {
      if (!launcher) return { accepted: false, reason: 'unavailable' };
      const opened = launcher.openApp(id, launchBounds, initialFileId, desktopSourceId, htmlHref);
      if (opened.accepted) window.dispatchEvent(new Event(FUSION_EVENTS.location));
      return opened;
    }

    function getFusionDestination(): FusionDestination {
      const focused = wm.byId(wm.focused ?? '');
      const frames = Array.from(document.querySelectorAll<HTMLIFrameElement>('[data-html-window]'));
      const ordered = [
        ...frames.filter((frame) => frame.dataset.htmlWindow === focused?.id),
        ...frames.filter((frame) => frame.dataset.htmlWindow !== focused?.id).reverse(),
      ];
      for (const frame of ordered) {
        try {
          const destination = destinationFromUrl(
            new URL(frame.contentWindow?.location.href ?? frame.src),
            'desktop',
          );
          if (destination) return destination;
        } catch {
          /* Foreign content cannot choose a portfolio destination. */
        }
      }
      const href = focused ? sessions.htmlUrl(focused.id) : undefined;
      if (href)
        return destinationFromUrl(new URL(href, location.origin), 'desktop') ?? { kind: 'home' };
      // During boot no HTML window exists yet. The document URL still names the
      // requested destination, so a deep-linked desktop must not report Home and
      // leave the fusion parent waiting for a frame that will never match.
      return destinationFromUrl(new URL(location.href), 'desktop') ?? { kind: 'home' };
    }

    function navigateFusionDestination(value: FusionDestination): boolean {
      const destination = parseFusionDestination(value);
      if (!destination || lifetime.disposed) return false;
      const id =
        destination.kind === 'article' || destination.kind === 'blog' || destination.kind === 'tag'
          ? 'blog'
          : destination.kind === 'project' ||
              destination.kind === 'projects' ||
              destination.kind === 'profile'
            ? 'profile'
            : destination.kind === 'friends'
              ? 'profile'
              : destination.kind === 'gallery' && destination.id
                ? 'acdsee'
                : destination.kind;
      return openApp(
        id,
        undefined,
        undefined,
        undefined,
        new URL(destinationPath(destination, 'desktop'), location.origin).href,
      ).accepted;
    }

    function chooseFileApplication(
      id: string,
      launchBounds?: Bounds,
      desktopSourceId?: string,
    ): OpenResult {
      if (!launcher) return { accepted: false, reason: 'unavailable' };
      return launcher.chooseFileApplication(id, launchBounds, desktopSourceId);
    }

    function openFile(
      id: string,
      requestedApplication?: string,
      launchBounds?: Bounds,
      desktopSourceId?: string,
    ): OpenResult {
      if (!launcher) return { accepted: false, reason: 'unavailable' };
      return launcher.openFile(id, requestedApplication, launchBounds, desktopSourceId);
    }

    const closeWin = (id: string) => {
      htmlWindows?.prepareClose(id);
      return sessions.requestClose(id);
    };

    async function requestClose(): Promise<boolean> {
      if (desktopFileOperation) await desktopFileOperation;
      if (fileDrag?.pending) await fileDrag.settled();
      const ids = wm.wins.map((win) => win.id);
      if (ids.includes('notepad')) {
        ids.splice(ids.indexOf('notepad'), 1);
        ids.unshift('notepad');
      }
      for (const id of ids) {
        const result = closeWin(id);
        if (!(await result)) return false;
      }
      return true;
    }

    function openMsg(spec: MsgSpec): void {
      messages?.open(spec);
    }

    async function restartDesktop(): Promise<boolean> {
      if (!(await requestClose())) return false;
      chrome.reflow();
      wm.closeSystemMenu();
      lifecycle.reset(doom.v);
      renderer.theme.setTheme(lifecycle.themeName);
      workspace.clear();
      updateStartAvailability();
      launcher?.resetCascade();
      return true;
    }

    // ---------- boot ----------
    function toDesktop(): void {
      const entry = wm.focused;
      const preferences = desktopSettings.capabilities.getSettings();
      if (preferences.welcome && !preferences.welcomeCompleted && (!entry || entry === 'home')) {
        const reducedMotion = wm.reducedMotion;
        wm.reducedMotion = true;
        openApp('welcome');
        if (entry) wm.focus(entry);
        wm.reducedMotion = reducedMotion;
      }
      if (!preferences.hasVisited) desktopSettings.update({ hasVisited: true });
    }

    function beginStartup(): void {
      startupFocusPending = true;
      const mode = lifecycle.beginStartup(
        desktopSettings.capabilities.getSettings(),
        options.returningVisit,
      );
      if (surface) surface.dataset.startupMode = mode;
      if (options.initialApp) {
        const reducedMotion = wm.reducedMotion;
        wm.reducedMotion = true;
        openApp(options.initialApp);
        wm.reducedMotion = reducedMotion;
      }
      if (mode === 'ready') toDesktop();
    }

    // ---------- shutdown ----------
    function restartFromEject(): void {
      if (lifecycle.phase !== 'shutdown') return;
      lifecycle.enterDesktop();
      surface?.focus({ preventScroll: true });
      void restartDesktop().then((ok) => {
        if (ok) beginStartup();
      });
    }
    function drawShutdown(): { animated: boolean } {
      return paintShutdown(renderer, {
        phaseT: lifecycle.phaseT,
        reducedMotion: lifecycle.reducedMotion,
        endingDoom: story.get().ending === 'doom',
        themeName: lifecycle.themeName,
        restartRequested: input.io.wentDown || input.io.keyPressed.has('Enter'),
        paintDesktop() {
          drawDesktop();
        },
        dim,
        onRestart: restartFromEject,
      });
    }

    // ---------- the desktop ----------
    // Keep the desktop legible; the complete collection lives in Programs.

    const workspace = createDesktopWorkspace({
      files,
      storage: browserStorage() ?? null,
      settings: desktopSettings.capabilities.getSettings,
      workArea: renderer.getDisplayMetrics().workArea,
    });
    lifetime.defer(workspace.dispose);
    function refreshDesktopLaunchBounds(): void {
      launcher?.refreshLaunchBounds();
    }
    function syncDesktopIcons(force = false): void {
      if (workspace.sync({ force, workArea: renderer.getDisplayMetrics().workArea }))
        refreshDesktopLaunchBounds();
    }
    function changeDesktopPage(delta: number): void {
      workspace.changePage(delta);
      refreshDesktopLaunchBounds();
    }
    function transferItems(sources: readonly TransferSource[], destination: TransferTarget): void {
      fileDrag?.transfer(sources, destination);
    }
    function handleDesktopDrop(
      sources: readonly TransferSource[],
      point: Readonly<{ x: number; y: number }>,
    ): boolean {
      return fileDrag?.drop(sources, point) ?? false;
    }
    function updateFileDrag(): void {
      if (fileDrag?.update()) systemInput = true;
    }
    function drawFileDrag(): void {
      fileDrag?.paint();
    }
    messages = createMessageWindows({
      sessions,
      renderer,
      widgets,
      input,
      width: () => renderer.W,
      height: () => renderer.H,
      focused: (id) => wm.focused === id,
      systemInput: () => systemInput,
      interacting: () => wm.interacting,
      drawChrome: (id) => wm.draw(id, { active: true }),
      close: (id) => {
        void closeWin(id);
      },
      playClick: () => audio.play('click'),
      activate: (message, index, checked) => {
        message.onBtn?.(index, env, checked);
      },
    });
    lifetime.defer(() => messages?.dispose());
    launcher = createDesktopLauncher({
      disposed: () => lifetime.disposed,
      modalOpen,
      personal,
      sessions,
      wm,
      files,
      associations,
      settings: () => desktopSettings.capabilities.getSettings(),
      updateRecent: (ids) => desktopSettings.update({ recentProgramIds: ids }),
      width: () => renderer.W,
      height: () => renderer.H,
      requestClose,
      msg: openMsg,
      services: env,
      surface: { draw: renderer, input, effects },
      iconBounds: (id) => {
        if (!desktopSettings.capabilities.getSettings().showDesktopIcons) return;
        const icon = workspace.items.find((item) => item.id === id);
        return icon ? { x: icon.x + 18, y: icon.y, w: 32, h: 32 } : undefined;
      },
      storedLaunchBounds: (id) => workspace.launchBounds(id),
      location,
    });
    fileDrag = createDesktopFileDrag({
      input,
      files,
      blocked: () => modalOpen() || chrome.startOpen || !!chrome.contextBounds || wm.interacting,
      workspaceActive: () => workspace.active,
      windows: () => wm.wins,
      windowOpen: (id) => {
        const win = wm.byId(id);
        return !!win && !win.minimized;
      },
      desktopSurface: () => workspace.fileSurface(),
      syncIcons: () => syncDesktopIcons(),
      playClick: () => audio.play('click'),
      notify(notice) {
        if (notice.kind === 'failed')
          openMsg({ title: 'File Transfer', icon: 'info', lines: [notice.message] });
        else
          openMsg({
            title: 'File Transfer',
            lines: [
              'Changes are available for this session only.',
              'Export your documents before closing MHK10.',
            ],
          });
      },
      render: (view) => {
        workspace.paintFileDrag({ renderer, ...view });
      },
    });
    lifetime.defer(() => {
      fileDrag?.clear();
      launcher?.releaseAll();
    });
    syncDesktopIcons(true);
    function arrangeDesktopIcons(byName: boolean): void {
      workspace.arrange(byName);
      refreshDesktopLaunchBounds();
    }

    function updateStartAvailability(): void {
      chrome.restrictCommands(lifecycle.restrictedCommands);
    }
    chrome.setStartSource(() =>
      desktopStartEntries(
        hostKind,
        desktopSettings.capabilities.getSettings().recentProgramIds,
        embedFull(),
      ),
    );
    sessions.register(createRunDialog(apps), 'desktop');
    sessions.register(createFindDialog(apps), 'desktop');

    function launchIcon(id: string): void {
      const entry = workspace.entry(id);
      if (!entry) return;
      const icon = workspace.items.find((item) => item.id === id);
      const origin = icon ? { x: icon.x + 18, y: icon.y, w: 32, h: 32 } : undefined;
      const result = openFile(entry.targetId, undefined, origin, id);
      if (!result.accepted)
        openMsg({
          title: 'Open',
          lines: ['This item is unavailable. Check its target in Properties.'],
        });
    }

    function showDesktopProperties(id: string): void {
      const entry = workspace.entry(id);
      const lines = workspace.properties(id);
      if (!entry || !lines) return;
      openMsg({ title: `${entry.label} Properties`, icon: 'info', lines: [...lines] });
    }

    function renameDesktopItem(): void {
      const entry = workspace.entry([...workspace.selected][0]);
      if (!entry || workspace.selected.size !== 1 || wm.byId('$rename')) return;
      const item =
        entry.kind === 'folder' ? files.getFolder(entry.targetId) : files.get(entry.targetId);
      if (!item || item.readonly || item.deleted) return;
      const rename = createRenameDialog(entry, item.name, files.epoch);
      sessions.register(rename);
      openApp(rename.id);
    }

    function desktopFileCommand(command: string): void {
      if (desktopFileOperation || fileDrag?.pending) return;
      const entries = [...workspace.selected].flatMap((id) => {
        const entry = workspace.entry(id);
        return entry ? [entry] : [];
      });
      if (command === 'rename') {
        renameDesktopItem();
        return;
      }
      if (command === 'delete') {
        transferItems(
          entries.map((entry) => ({
            id: entry.targetId,
            kind: entry.kind,
            parent: 'desktop',
            volume: 'desktop',
          })),
          { id: 'bin', folder: 'desktop', volume: 'bin', isTrash: true, acceptsDrop: true },
        );
        return;
      }
      const entry = entries[0];
      if (command === 'paste') {
        desktopFileOperation = files
          .paste('desktop')
          .then((result) => {
            if (lifetime.disposed) return;
            if (!result.ok) openMsg({ title: 'Files', lines: [result.error] });
            else {
              syncDesktopIcons();
              if (!result.persisted)
                openMsg({ title: 'Files', lines: ['Changes will last for this session only.'] });
            }
          })
          .finally(() => {
            desktopFileOperation = undefined;
            paintedScene = undefined;
          });
        return;
      }
      const result =
        entry && entries.length === 1
          ? files.setClipboard(
              entry.targetId,
              command === 'cut' ? 'cut' : 'copy',
              entry.kind === 'folder' ? 'folder' : 'file',
            )
          : undefined;
      if (result && !result.ok)
        openMsg({ title: 'Files', lines: [result.error ?? 'Unable to complete the operation.'] });
    }

    function drawDesktopIcons(): void {
      systemInput = workspace.paintIcons({
        renderer,
        widgets,
        input,
        systemInput,
        blocked: modalOpen() || chrome.startOpen || !!chrome.contextBounds || wm.interacting,
        gated: wm.gated !== null,
        showIcons: desktopSettings.capabilities.getSettings().showDesktopIcons,
        showAssistant: desktopSettings.capabilities.getSettings().showAssistant,
        showFocus: !wm.focused && !chrome.startOpen,
        syncIcons() {
          syncDesktopIcons();
        },
        onContextMenu(x, y, id) {
          openDesktopMenu(x, y, id);
        },
        onActivate(id) {
          launchIcon(id);
          audio.play('click');
        },
        onDrop: handleDesktopDrop,
        onLayoutChanged() {
          refreshDesktopLaunchBounds();
        },
        onPage(delta) {
          changeDesktopPage(delta);
        },
      });
    }

    function policy() {
      return interactionPolicy({
        desktop: lifecycle.phase === 'desktop',
        systemInput: systemInput || workspace.active || lifecycle.saverVisible || chrome.volumeOpen,
        manipulating: wm.interacting,
        desktopMenu: !!chrome.contextBounds,
        modal: modalOpen(),
        start: chrome.startOpen,
        pointerDown: input.io.down,
        menuOpen: wm.wins.some((win) => !win.minimized && win.menu.open >= 0),
      });
    }

    let acceptedKeyboardWindow: WinState | undefined;

    function deliverHiddenInput(win: WinState): void {
      if (acceptedKeyboardWindow?.id !== win.id) return;
      const session = sessions.session(win.id);
      if (!session) return;
      input.setGate(null);
      const ctx = renderer.getCtx();
      ctx.save();
      try {
        // Preserve client geometry for editing while keeping its raster hidden.
        ctx.beginPath();
        ctx.rect(0, 0, 0, 0);
        ctx.clip();
        session.frame({
          t: lifecycle.t,
          dt: frameDelta,
          win: acceptedKeyboardWindow,
          client: windowClient(
            acceptedKeyboardWindow,
            !!session.menus(),
            session.status() !== undefined,
          ),
          menuSel: null,
          focused: true,
          pointerIn: false,
        });
      } finally {
        ctx.restore();
      }
    }

    function drawWindows(): void {
      for (const initial of wm.wins) {
        let win = initial;
        if (win.minimized) {
          deliverHiddenInput(win);
          continue;
        }
        input.setGate(wm.gated === win.id ? win.id : null);
        if (win.appId === '$msg') {
          messages?.paint(win);
          continue;
        }
        const app = sessions.application(win.appId);
        const session = sessions.session(win.id);
        if (!app) continue;
        const menuWasOpen = win.menu.open >= 0;
        const res = wm.draw(win.id, {
          menus: session?.menus(),
          status: session?.status(),
          active: wm.focused === win.id,
          register:
            doom.v >= 61 && ['recovery', 'diagnostics'].includes(win.appId) ? 'L1' : undefined,
          statusFont: app.register === 'L1' ? 'dos' : undefined,
        });
        if (!res) {
          const current = wm.byId(win.id);
          if (current?.minimized) deliverHiddenInput(current);
          continue;
        }
        win = wm.byId(win.id) ?? win;
        if (app.kind === 'html') {
          htmlViews.push({ win, client: res.client, href: sessions.htmlUrl(win.id) ?? app.html });
          continue;
        }
        if (
          menuWasOpen ||
          win.menu.open >= 0 ||
          chrome.startOpen ||
          systemInput ||
          chrome.contextBounds ||
          wm.interacting
        )
          input.setGate(null);
        const ctx = renderer.getCtx();
        ctx.save();
        ctx.beginPath();
        ctx.rect(res.client.x, res.client.y, res.client.w, Math.max(0, res.client.h));
        ctx.clip();
        try {
          session?.frame({
            t: lifecycle.t,
            dt: frameDelta,
            win,
            client: res.client,
            menuSel: res.menuSel,
            focused: policy().client(
              wm.focused === win.id &&
                (!acceptedKeyboardWindow ||
                  !wm.byId(acceptedKeyboardWindow.id)?.minimized ||
                  acceptedKeyboardWindow.id === win.id),
              win.modal === true,
              menuWasOpen || win.menu.open >= 0,
            ),
            pointerIn:
              policy().pointer(wm.gated === win.id, menuWasOpen || win.menu.open >= 0) &&
              input.io.px >= res.client.x &&
              input.io.px < res.client.x + res.client.w &&
              input.io.py >= res.client.y &&
              input.io.py < res.client.y + res.client.h,
          });
        } catch (error) {
          console.error(`Application frame failed (${win.appId})`, error);
        } finally {
          ctx.restore();
        }
        wm.drawMenuOverlay(win.id, session?.menus());
      }
      void sessions.flushClose();
    }

    let taskbarLayout: { key: string; value: ReturnType<typeof chrome.layoutTasks> } | undefined;
    function taskbarState() {
      const preferences = desktopSettings.capabilities.getSettings();
      const now = new Date();
      const clock = systemClock(
        doom.v,
        now.getHours() * 60 + now.getMinutes() + preferences.clockOffsetMinutes,
        {
          hour24: preferences.clock24Hour,
          seconds: preferences.showSeconds ? now.getSeconds() : undefined,
        },
      );
      const tasks = wm.taskWindows();
      const quickApps = preferences.quickLaunchItems.flatMap((id) => {
        const app = sessions.application(id === 'home' && !personal ? 'display' : id);
        return app
          ? [{ id: app.id, settingId: id, label: app.title, icon: app.icon ?? 'i_doc' }]
          : [];
      });
      const contexts = ['print-preview', 'dialup'].filter((id) => wm.byId(id));
      const options = {
        quickLaunch: preferences.quickLaunch,
        quickCount: quickApps.length + 1,
        labels: preferences.taskbarLabels,
        clockWidth: renderer.tw(clock) + 12,
        risk:
          preferences.riskDisplay === 'always' ||
          (preferences.riskDisplay === 'auto' && doom.v > 5),
        contexts: contexts.length,
      };
      // The input and paint passes share geometry while the roster, focus and
      // preferences match. A command that changes them recomputes its anchors.
      const key = JSON.stringify([
        tasks.map((win) => win.id),
        wm.focused,
        options,
        renderer.W,
        renderer.H,
      ]);
      if (taskbarLayout?.key !== key) {
        const value = chrome.layoutTasks(
          tasks,
          wm.focused,
          options,
          renderer.W,
          renderer.H - TASKBAR_HEIGHT,
        );
        taskbarLayout = { key, value };
        tasks.forEach((win, index) => wm.setTaskBounds(win.id, value.anchor(index)));
      }
      const layout = taskbarLayout.value;
      return { preferences, now, clock, tasks, contexts, layout, quickApps };
    }

    function drawTaskbar(): { animated: boolean } {
      const state = taskbarState();
      const displayedDate = new Date(
        state.now.getTime() + state.preferences.clockOffsetMinutes * 60000,
      );
      const riskShown =
        state.preferences.riskDisplay === 'always' ||
        (state.preferences.riskDisplay === 'auto' && doom.v > 5);
      const painted = chrome.drawTaskbar({
        modal: modalOpen(),
        systemInput,
        interacting: wm.interacting,
        gated: wm.gated,
        tasks: state.tasks.map((win) => ({
          id: win.id,
          title: win.title,
          icon: win.icon,
          minimized: win.minimized,
        })),
        quickApps: state.quickApps,
        contexts: state.contexts.map((id) => ({
          id,
          title: sessions.application(id)?.title ?? id,
          icon: id === 'print-preview' ? 'app_print-preview' : 'app_dialup',
        })),
        clock: state.clock,
        clockHint: displayedDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        showLabels: state.preferences.taskbarLabels,
        layout: state.layout,
        risk: riskShown
          ? { value: doom.v, text: pdoomText(doom.v), color: pdoomColor(doom.v) }
          : null,
        canRestoreDesktop: wm.canRestoreDesktop,
        volume: audio.getVolume(),
        muted: audio.isMuted(),
        time: lifecycle.t,
        focused: () => wm.focused,
        truncate: (label, font, width) => truncateLabel(renderer.tw, label, font, width),
        closeSystemMenu: () => wm.closeSystemMenu(),
        playClick: () => audio.play('click'),
        showDesktop: () => wm.showDesktop(),
        restoreDesktop: () => wm.restoreDesktop(),
        open: (id, origin) => openApp(id, origin),
        activateTask(id, minimized) {
          if (minimized) wm.restore(id);
          else if (wm.focused === id) wm.minimize(id);
          else wm.focus(id);
          audio.play('click');
        },
        openSystemMenu: (id, x, y) => wm.openSystemMenu(id, x, y),
        setVolume(volume) {
          audio.setVolume(volume);
          desktopSettings.update({ volume });
        },
        toggleMuted() {
          audio.setMuted(!audio.isMuted());
        },
        openBarMenu(x, y) {
          openDesktopMenu(x, y, undefined, true);
        },
      });
      taskbarAnimated = painted.animated;
      return painted;
    }

    function showHelp(): void {
      openMsg({
        title: 'MHK10 Help',
        icon: 'info',
        lines: [...HELP_TOPICS.desktop.lines],
        buttons: ['About MHK10', 'Close'],
        def: 1,
        onBtn: (index) => {
          if (index === 0) openApp('system-about');
        },
      });
    }

    function startCommand(command?: string, origin?: Bounds): void {
      if (!command) return;
      chrome.closeStart();
      const action = desktopAction(command);
      const settings = () => desktopSettings.capabilities.getSettings();
      switch (action.kind) {
        case 'ignore':
          return;
        case 'file':
          desktopFileCommand(action.operation);
          return;
        case 'unpin':
          desktopSettings.update({
            quickLaunchItems: unpinQuickLaunch(settings().quickLaunchItems, action.id),
          });
          return;
        case 'pin': {
          const pinned = sessions.application(action.id)
            ? pinQuickLaunch(settings().quickLaunchItems, action.id)
            : undefined;
          if (pinned) desktopSettings.update(pinned);
          return;
        }
        case 'reset-quick-launch':
          desktopSettings.update({ quickLaunchItems: [...DEFAULT_SETTINGS.quickLaunchItems] });
          return;
        case 'toggle-desktop-icons':
          desktopSettings.update({ showDesktopIcons: !settings().showDesktopIcons });
          return;
        case 'auto-arrange': {
          const enabled = !settings().autoArrangeIcons;
          desktopSettings.update({ autoArrangeIcons: enabled });
          if (enabled) arrangeDesktopIcons(true);
          return;
        }
        case 'toggle-quick-launch':
          desktopSettings.update({ quickLaunch: !settings().quickLaunch });
          return;
        case 'toggle-task-labels':
          desktopSettings.update({ taskbarLabels: !settings().taskbarLabels });
          return;
        case 'open-selected':
          for (const id of workspace.selected) launchIcon(id);
          return;
        case 'choose-file':
          chooseFileApplication(action.fileId);
          return;
        case 'open-with':
          openFile(action.fileId, action.application);
          return;
        case 'properties': {
          const id = workspace.focused ?? [...workspace.selected][0];
          if (id) showDesktopProperties(id);
          return;
        }
        case 'shutdown':
          openShutDown();
          return;
        case 'request-classic':
          requestClassic();
          return;
        case 'help':
          showHelp();
          return;
        case 'show-desktop':
          wm.showDesktop();
          if (workspace.items[0]) workspace.select(workspace.items[0].id);
          return;
        case 'restore-desktop':
          wm.restoreDesktop();
          return;
        case 'arrange-windows':
          wm.arrange(action.mode);
          return;
        case 'arrange-icons':
          workspace.clear();
          arrangeDesktopIcons(action.byName);
          return;
        case 'new-folder': {
          const result = files.createFolder(undefined, 'desktop');
          if (result.ok) {
            syncDesktopIcons();
            if (!result.persisted)
              openMsg({
                title: 'New Folder',
                lines: [
                  'The folder is available for this session.',
                  'Export your documents before closing MHK10.',
                ],
              });
          } else openMsg({ title: 'New Folder', icon: 'error', lines: [result.error] });
          return;
        }
        case 'open':
          openApp(action.id, origin);
          return;
      }
    }

    function drawStartMenu(): void {
      const selected = chrome.drawStartMenu(lifecycle.t, modalOpen());
      if (selected) startCommand(selected.command, selected.launchBounds);
    }

    function openDesktopMenu(x: number, y: number, appId?: string, taskbar = false): void {
      chrome.closeStart();
      wm.closeSystemMenu();
      wm.closeMenus();
      const settings = desktopSettings.capabilities.getSettings();
      const activeAppId = wm.focused ? wm.byId(wm.focused)?.appId : undefined;
      const selectedEntry = appId ? workspace.entry(appId) : undefined;
      const shortcutAppId =
        selectedEntry?.kind === 'file'
          ? files.get(selectedEntry.targetId)?.target?.appId
          : undefined;
      const choices =
        selectedEntry?.kind === 'file'
          ? fileOpenChoices(files, selectedEntry.targetId, associations.snapshot())
          : undefined;
      chrome.openContext(
        x,
        y,
        desktopContextMenu({
          surface: taskbar ? 'taskbar' : appId ? 'icon' : 'desktop',
          quickLaunch: settings.quickLaunch,
          quickLaunchItems: settings.quickLaunchItems,
          taskbarLabels: settings.taskbarLabels,
          autoArrangeIcons: settings.autoArrangeIcons,
          showDesktopIcons: settings.showDesktopIcons,
          ...(activeAppId ? { activeAppId } : {}),
          canRestoreDesktop: wm.canRestoreDesktop,
          selectionCount: workspace.selected.size,
          clipboard: !!files.clipboard() && !desktopFileOperation && !fileDrag?.pending,
          ...(selectedEntry
            ? {
                entry: {
                  kind: selectedEntry.kind,
                  targetId: selectedEntry.targetId,
                  ...(shortcutAppId ? { shortcutAppId } : {}),
                  openWith: (choices?.applications ?? []).map((application) => ({
                    label: fileHandlerLabel(application),
                    application,
                  })),
                },
              }
            : {}),
          applications: ['computer', 'notepad', 'display', 'recovery'].flatMap((id) => {
            const app = sessions.application(id);
            return app ? [{ id: app.id, ...(app.icon ? { icon: app.icon } : {}) }] : [];
          }),
        }),
      );
    }

    let shutOpen = false;
    function openShutDown(): void {
      if (shutOpen) return;
      shutOpen = true;
      openMsg({
        title: 'Shut Down MHK10',
        icon: 'question',
        lines: [
          'What do you want the computer to do?',
          '',
          story.get().ending === 'doom'
            ? 'AGI.EXE reports no remaining customers.'
            : 'Open documents are checked before shutdown.',
        ],
        buttons: ['Shut down', 'Restart', 'Cancel'],
        def: 2,
        onBtn: async (i) => {
          shutOpen = false;
          if (i === 0) {
            if (!(await requestClose())) return;
            lifecycle.shutdown();
            audio.play('shutdown');
            chrome.closeStart();
          } else if (i === 1 && (await restartDesktop())) beginStartup();
        },
      });
    }

    function applyDesktopKey(step: DesktopKeyStep): void {
      const perform = (): void => {
        const action = step.action;
        switch (action.kind) {
          case 'cancel-workspace':
            workspace.cancel();
            systemInput = true;
            return;
          case 'help':
            showHelp();
            return;
          case 'toggle-start':
            chrome.toggleStart();
            chrome.closeContext();
            wm.closeMenus();
            return;
          case 'command':
            startCommand(action.command);
            return;
          case 'context-menu': {
            const item = workspace.items.find((icon) => icon.id === workspace.focused);
            openDesktopMenu(item ? item.x + 18 : 20, item ? item.y + 44 : 60, item?.id);
            return;
          }
          case 'cycle':
            chrome.closeStart();
            chrome.closeContext();
            wm.closeSystemMenu();
            wm.cycleFocus(action.reverse);
            return;
          case 'dismiss-tip':
            lifecycle.dismissTip();
            return;
          case 'toggle-maximize': {
            const win = wm.focused ? wm.byId(wm.focused) : undefined;
            if (win && (win.ctl ?? 'mx').includes('m')) wm.toggleMaximize(win.id);
            return;
          }
          case 'request-close': {
            const win = wm.focused ? wm.byId(wm.focused) : undefined;
            // Let the client consume text queued in the same frame before saving/closing.
            if (win && !win.noClose) wm.requestClose(win.id);
            return;
          }
          case 'change-page':
            changeDesktopPage(action.delta);
            return;
          case 'file':
            desktopFileCommand(action.operation);
            return;
          case 'navigate':
            workspace.navigate(action.key, action.extend, action.fine);
            return;
          case 'select-all':
            workspace.selectAll();
            return;
          case 'desktop-space':
            if (action.toggle) workspace.toggleFocused();
            else if (workspace.focused || workspace.items[0])
              workspace.select(workspace.focused ?? workspace.items[0].id);
            return;
          case 'activate-selected':
            for (const id of workspace.selected) launchIcon(id);
            return;
          default: {
            const unreachable: never = action;
            return unreachable;
          }
        }
      };
      if (step.consumeFirst) for (const key of step.consume) input.consumeKey(key);
      perform();
      if (!step.consumeFirst) for (const key of step.consume) input.consumeKey(key);
      if (step.consumeText) input.consumeText();
    }

    function desktopKeys(): void {
      const steps = desktopKeySteps({
        doomLocked: doom.v >= 99.9,
        modal: modalOpen(),
        workspaceActive: workspace.active,
        pressed: input.io.keyPressed,
        control: input.io.keyDown.has('Control'),
        shift: input.io.keyDown.has('Shift'),
        focusedWindow: !!wm.focused,
        startOpen: chrome.startOpen,
        canRestoreDesktop: wm.canRestoreDesktop,
        showDesktopIcons: desktopSettings.capabilities.getSettings().showDesktopIcons,
      });
      for (const step of steps) applyDesktopKey(step);
    }

    function drawAssistant(): void {
      const workArea = renderer.getDisplayMetrics().workArea;
      const place = assistantPlacement(workArea.w, workArea.h);
      const AX = place.x,
        AY = place.y,
        s = place.scale;
      const look: [number, number] = [
        clamp((input.io.px - AX) / 160, -1, 1),
        clamp((input.io.py - (AY - 60)) / 160, -1, 1),
      ];
      const mood = doomMood(doom.v) === 'evil' ? 'evil' : 'happy';
      assistant(
        AX,
        AY,
        s,
        {
          look,
          blink: assistantPose.blink,
          mood,
          sparks: assistantPose.sparks,
          bob: assistantPose.bob,
        },
        lifecycle.reducedMotion ? 0 : lifecycle.t,
      );
      if (!modalOpen()) {
        const r = input.hit(place.hit.x, place.hit.y, place.hit.w, place.hit.h);
        if (r.clicked) {
          openApp('chat');
          audio.play('click');
        }
      }
      if (lifecycle.tip && wm.byId(wm.focused ?? '')?.appId !== 'chat') {
        const bubbleWidth = 146;
        // Flip the bubble to the left of the clip, clamped onto the screen.
        const bx = clamp(AX - bubbleWidth - 6, 2, renderer.W - bubbleWidth - 2);
        const by = clamp(
          AY - 130,
          2,
          renderer.H - TASKBAR_HEIGHT - 8 - lifecycle.tip.lines.length * 13,
        );
        const b = widgets.bubble(
          bx,
          by,
          bubbleWidth,
          8 + lifecycle.tip.lines.length * 13,
          AX - 14,
          AY - 88,
        );
        lifecycle.tip.lines.forEach((l, i) => renderer.text(l, b.x, b.y + 2 + i * 13));
        if (lifecycle.t > lifecycle.tip.until) lifecycle.dismissTip();
      }
    }

    function drawDesktop(): void {
      taskbarAnimated = false;
      if (doom.v >= 99.9) {
        drawFirmwareDesktop();
        return;
      }
      renderer.rect(0, 0, renderer.W, renderer.H, renderer.TH.desk);
      renderer.drawDesktopWallpaper();
      if (lifecycle.currentShell === 'desktop') drawDesktopIcons();
      // Keep the paperclip in the desktop world, behind windows and their controls.
      input.setGate(
        !modalOpen() &&
          !chrome.startOpen &&
          !systemInput &&
          !chrome.contextBounds &&
          !wm.interacting &&
          wm.gated === null
          ? 'desktop'
          : null,
      );
      if (desktopSettings.capabilities.getSettings().showAssistant) drawAssistant();
      drawWindows();
      wm.drawTransitions();
      wm.drawSwitcher();
      drawTaskbar();
      wm.drawSystemMenu();
      startCommand(chrome.drawContext());
      drawStartMenu();
      drawFileDrag();
      // the P(doom) slam overlay, composed like the video's hook shot
      const since = lifecycle.t - lifecycle.slamT;
      if (!lifecycle.reducedMotion && doomSlamWindow(since)) {
        const k = prog(since, 0, 0.14);
        wordart(
          "I'm upping my",
          R(renderer.W / 2),
          R((renderer.H - CLASSIC_SIZE.height) / 2) + 40,
          3,
          3,
          {
            k,
            depth: 1,
          },
        );
        wordart(
          'P(doom)',
          R(renderer.W / 2),
          R((renderer.H - CLASSIC_SIZE.height) / 2) + 122,
          7,
          3,
          {
            k: prog(since, 0.1, 0.24),
            arch: 14,
          },
        );
        effects.FX.shake = 7 * Math.exp(-4 * since);
        if (since < 0.4) effects.FX.flash = [C.white, 0.5 * Math.exp(-12 * since)];
      }
    }

    const firmwareConsole: FirmwareConsole = { page: 'status', file: 0 };
    function drawFirmwareDesktop(): { animated: boolean } {
      return paintFirmware(renderer, firmwareConsole, {
        pressed: (key) => input.io.keyPressed.has(key),
        clearPressed() {
          input.io.keyPressed.clear();
        },
        processCount: sessions.size,
        documents: files.folders().flatMap((folder) => files.list('documents', folder.id)),
        logs: story.get().logs,
        onReset() {
          story.reset();
        },
        onExport(name, content) {
          downloadText(name, content);
        },
      });
    }

    // ---------- the P(doom) story ----------
    function syncStory(current: StoryState, animate = true): void {
      const changed = lifecycle.syncStory(
        current,
        doom.v,
        desktopSettings.capabilities.getSettings().followStoryTheme,
        animate,
      );
      renderer.theme.setTheme(lifecycle.themeName);
      document.documentElement.dataset.theme = lifecycle.themeName;
      updateStartAvailability();
      files.saveGeneratedText(
        'system-log',
        'SYSTEM.LOG',
        current.logs
          .map((log) => `${String(log.seq).padStart(2, '0')} [${log.source}] ${log.message}`)
          .join('\n'),
        'story',
      );
      if (changed.playEnding) audio.play('chord');
    }

    // ---------- frame ----------
    let frameDelta = 0;
    /**
     * The assistant's visible state, quantized once per frame. It is part of
     * the paint scene, so an idle desktop only repaints when the 2 px bob, the
     * blink or a spark actually changes (~5 Hz) instead of every frame.
     */
    let assistantPose = { bob: 0, blink: 0, sparks: 0, tick: 0 };
    function frame(dt: number): void {
      frameDelta = dt;
      acceptedKeyboardWindow = undefined;
      const preferences = desktopSettings.capabilities.getSettings();
      const assistantAnimated = preferences.showAssistant && !lifecycle.reducedMotion;
      const inputNow =
        input.io.cancelled ||
        input.io.wentDown ||
        input.io.wentUp ||
        input.io.rwentDown ||
        input.io.rwentUp ||
        input.io.dbl ||
        input.io.wheel !== 0 ||
        input.io.typed.length > 0 ||
        input.io.keyPressed.size > 0 ||
        input.io.keyboardEvents.length > 0 ||
        input.io.px !== lastPointerX ||
        input.io.py !== lastPointerY;
      if (preferences.resolutionMode !== resolutionMode) {
        resolutionMode = preferences.resolutionMode;
        resolutionDirty = true;
        monitor?.refresh();
      }
      const changed = lifecycle.frame(dt, {
        preferences,
        story: story.get(),
        risk: doom.v,
        modal: modalOpen(),
        input: input.io,
        systemReducedMotion,
      });
      wm.reducedMotion = lifecycle.reducedMotion || !preferences.windowAnimations;
      {
        // Computed after lifecycle.frame() advanced `t`, so the paint key and
        // the drawing below resolve the same bob/blink/spark state.
        const sparks = assistantAnimated ? (doom.v >= 34 ? 1 : doom.v >= 20 ? 0.3 : 0) : 0;
        assistantPose = {
          bob: assistantAnimated ? R(2 * Math.sin(lifecycle.t * 2.4)) : 0,
          blink: assistantAnimated && lifecycle.t % 3.3 < 0.12 ? 1 : 0,
          sparks,
          tick: sparks > 0 ? Math.floor(lifecycle.t * 12) : 0,
        };
      }
      if (changed.themeChanged) {
        renderer.theme.setTheme(lifecycle.themeName);
        document.documentElement.dataset.theme = lifecycle.themeName;
      }
      if (changed.restrictionsChanged) updateStartAvailability();
      if (changed.shellChanged) {
        if (changed.shellChanged === 'progman') openApp('progman');
        else void closeWin('progman');
      }
      if (changed.consumeWakeInput) {
        input.consumePointer();
        input.consumeText();
        input.consumeWheel();
        for (const key of input.io.keyPressed) input.consumeKey(key);
        systemInput = true;
      }
      effects.resetFX();
      htmlViews = [];
      chrome.beginFrame();
      taskbarLayout = undefined;
      let paintFrame = true;

      if (lifecycle.phase === 'boot' || lifecycle.phase === 'splash') {
        if (input.io.wentDown || input.io.rwentDown || input.io.typed || input.io.keyPressed.size)
          lifecycle.skipBoot();
        input.consumePointer();
        input.consumeText();
        input.consumeWheel();
        for (const key of input.io.keyPressed) input.consumeKey(key);
        const next = lifecycle.advanceIntro(
          input.io.down || input.io.rdown || startupPointer !== undefined || startupKeys.size > 0,
        );
        if (next === 'splash' && !options.embedded && document.visibilityState !== 'hidden')
          audio.play('boot');
        if (next === 'desktop') {
          input.cancelPointerInput();
          input.io.keyDown.clear();
          toDesktop();
        }
      }

      if (lifecycle.saverVisible) {
        input.setGate(null);
        renderer.drawSaver(
          lifecycle.requestedSaver,
          lifecycle.saverElapsed,
          renderer.W,
          renderer.H,
          lifecycle.reducedMotion,
          preferences.marquee,
          doom.v,
        );
      } else if (lifecycle.phase === 'boot' || lifecycle.phase === 'splash') {
        if (lifecycle.phase === 'boot') {
          const checkpoint = story.get();
          paintBoot(renderer, {
            phaseT: lifecycle.phaseT,
            bootLines: lifecycle.bootLines,
            filesPersisted: files.persisted,
            checkpoint: checkpoint.ending ?? checkpoint.stage,
          });
        } else {
          paintSplash(renderer, {
            phaseT: lifecycle.phaseT,
            themeName: lifecycle.themeName,
            reducedMotion: lifecycle.reducedMotion,
          });
        }
        const win = wm.byId(wm.focused ?? '');
        const app = win && sessions.application(win.appId);
        if (win && app?.kind === 'html')
          htmlViews.push({
            win,
            client: windowClient(win, false, false),
            href: sessions.htmlUrl(win.id) ?? app.html,
          });
      } else if (lifecycle.phase === 'shutdown') {
        const phaseKey = `${lifecycle.phase}:${lifecycle.saverVisible}`;
        if (
          shutdownNeedsPaint({
            phaseChanged: phaseKey !== presentedPhase,
            animated: shutdownAnimated,
            input: inputNow,
            resolutionDirty,
            themeChanged: changed.themeChanged,
          })
        )
          shutdownAnimated = drawShutdown().animated;
        else paintFrame = false;
      } else {
        const prelude = frameKeyPrelude(input.io.keyPressed, {
          modal: modalOpen(),
          workspaceActive: workspace.active,
        });
        if (prelude.closeContext) chrome.closeContext();
        if (prelude.closeStart) chrome.closeStart();
        if (prelude.dismissSystemMenu) wm.cancelKeyboardGesture();
        if (prelude.cancelWorkspace) workspace.cancel();
        taskbarState();
        systemInput = wm.handleKeys() || chrome.volumeOpen || lifecycle.wakeUntilRelease;
        if (chrome.contextBounds) {
          systemInput = true;
          input.consumeText();
          for (const key of input.io.keyboardEvents.flatMap((event) =>
            event.key ? [event.key] : [],
          )) {
            startCommand(chrome.contextKey(key));
            input.consumeKey(key);
          }
        }
        if (!systemInput) {
          const focused = wm.byId(wm.focused ?? '');
          if (
            focused &&
            focused.k === 1 &&
            !focused.minimized &&
            input.io.keyboardEvents.length &&
            policy().client(true, focused.modal === true, focused.menu.open >= 0)
          )
            acceptedKeyboardWindow = focused;
          desktopKeys();
        }
        systemInput ||= workspace.active;
        wm.syncSwitcher();
        wm.tick(dt);
        if (chrome.startOpen || chrome.contextBounds || workspace.active) wm.computeGate(true);
        else wm.computeGate();
        updateFileDrag();
        const since = lifecycle.t - lifecycle.slamT;
        const scene: DesktopPaintScene = {
          phase: lifecycle.phase,
          theme: lifecycle.themeName,
          width: renderer.W,
          height: renderer.H,
          risk: doom.v,
          focused: wm.focused ?? '',
          switcher: wm.switcherVisible,
          systemMenu: wm.systemMenuOpen,
          start: chrome.startOpen,
          volume: chrome.volumeOpen,
          context: !!chrome.contextBounds,
          tip: lifecycle.tip,
          assistant: assistantPose,
          windows: wm.wins.map((win) => ({
            id: win.id,
            title: win.title,
            x: win.x,
            y: win.y,
            w: win.w,
            h: win.h,
            k: win.k,
            minimized: win.minimized,
            maximized: win.maximized,
            menu: win.menu.open,
          })),
        };
        if (
          desktopNeedsPaint({
            sceneChanged: !paintedScene || !sameDesktopScene(paintedScene, scene),
            input: inputNow,
            animating: wm.animating,
            themeChanged: changed.themeChanged,
            restrictionsChanged: changed.restrictionsChanged,
            clockSecondChanged: new Date().getSeconds() !== paintedSecond,
            resolutionDirty,
            switcherVisible: wm.switcherVisible,
            taskbarAnimated,
            clientsActive: sessions.needsFrame(),
            menusActive: chrome.startOpen || !!chrome.contextBounds || wm.systemMenuOpen,
            slam: !lifecycle.reducedMotion && doomSlamWindow(since),
          })
        ) {
          drawDesktop();
          paintedScene = scene;
        } else {
          paintFrame = false;
          void sessions.flushClose();
        }
      }

      if (paintFrame) {
        const ctx = renderer.getCtx();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        applyFX(lifecycle.t, lifecycle.reducedMotion);
        if (htmlWindows) {
          const systemBounds = wm.systemMenuBounds();
          const blockers: HtmlRect[] = [
            ...chrome.blockers,
            ...(systemBounds ? [systemBounds] : []),
          ];
          for (const win of wm.wins) {
            const bounds = wm.menuBounds(win.id, sessions.session(win.id)?.menus());
            if (bounds) blockers.push(bounds);
          }
          const fx = effects.FX,
            fr = Math.floor(lifecycle.t * FPS),
            shake = fx.shake || 0;
          const dx = R((fx.dx || 0) + (hash(fr) - 0.5) * 2 * shake);
          const dy = R((fx.dy || 0) + (hash(fr + 99) - 0.5) * 2 * shake);
          const transform = `translate(${dx}px,${dy}px) translate(${renderer.W / 2}px,${renderer.H / 2}px) rotate(${fx.tilt || 0}rad) scale(${fx.zoom || 1}) translate(${-renderer.W / 2}px,${-renderer.H / 2}px)`;
          // Row tearing and flashes are intentionally canvas-only corruption frames.
          const enabled = htmlCompositingEnabled({
            phase: lifecycle.phase,
            saverVisible: lifecycle.saverVisible,
            firmware: doom.v >= 99.9,
            slam: !lifecycle.reducedMotion && doomSlamWindow(lifecycle.t - lifecycle.slamT),
            glitch: !!fx.glitch,
            wobble: !!fx.wobble,
            invert: !!fx.invert,
            flash: !!(fx.flash && fx.flash[1] > 0),
          });
          htmlWindows.sync(
            htmlViews,
            wm.wins,
            blockers,
            enabled,
            enabled && policy().html && !wm.wins.some((win) => !win.minimized && win.k < 1),
            lifecycle.themeName,
            transform,
            lifecycle.reducedMotion,
            preferences.pixelImages,
            wm.focused,
            chrome.startOpen ||
              !!chrome.contextBounds ||
              wm.interacting ||
              wm.wins.some((win) => !win.minimized && win.menu.open >= 0),
          );
        }
        presentedPhase = `${lifecycle.phase}:${lifecycle.saverVisible}`;
        paintedSecond = new Date().getSeconds();
        resolutionDirty = false;
      }
      if (assistantComposer) {
        const foreground = wm.focused ? wm.byId(wm.focused) : undefined;
        const owner = foreground && sessions.session(foreground.id);
        if (
          foreground &&
          owner?.assistantView &&
          !foreground.minimized &&
          foreground.k === 1 &&
          policy().html &&
          !wm.switcherVisible &&
          !wm.systemMenuOpen &&
          !presentationSuspended &&
          doom.v < 99.9 &&
          !effects.FX.glitch &&
          !effects.FX.flash
        ) {
          assistantComposer.sync(
            owner,
            windowClient(foreground, !!owner.menus(), owner.status() !== undefined),
          );
        } else assistantComposer.hide();
      }
      lastPointerX = input.io.px;
      lastPointerY = input.io.py;
      pointerLayer?.draw(
        input.io.px,
        input.io.py,
        saveRequest || desktopFileOperation || fileDrag?.pending
          ? 'working'
          : htmlWindows?.containsPointer()
            ? htmlWindows.cursorKind()
            : input.io.cursor,
        !lifecycle.saverVisible &&
          (lifecycle.phase === 'desktop' ||
            (lifecycle.phase === 'shutdown' && lifecycle.phaseT < 0.5)) &&
          !htmlWindows?.overChildFrame(),
        lifecycle.t,
        lifecycle.reducedMotion,
        preferences.cursorSet,
      );
      if (surface) surface.dataset.captureTab = String(modalOpen());
      surface?.setAttribute(
        'aria-busy',
        String(
          lifecycle.phase === 'boot' ||
            lifecycle.phase === 'splash' ||
            !!desktopFileOperation ||
            !!fileDrag?.pending,
        ),
      );
      if (surface && startupFocusPending) {
        const phase = lifecycle.phase;
        const active = document.activeElement;
        const directUnfocused = !options.embedded && active === document.body;
        if (phase === 'boot' || phase === 'splash') {
          if (!surface.dataset.startupPhase && directUnfocused)
            surface.focus({ preventScroll: true });
          if (surface.dataset.startupPhase !== phase) surface.dataset.startupPhase = phase;
          if (startupSkip) startupSkip.hidden = false;
        } else if (phase === 'desktop' && !presentationSuspended) {
          if ((startupSkip && active === startupSkip) || directUnfocused)
            surface.focus({ preventScroll: true });
          delete surface.dataset.startupPhase;
          if (startupSkip) startupSkip.hidden = true;
          startupFocusPending = false;
        }
      }
      const activeTitle = wm.focused ? wm.byId(wm.focused)?.title : undefined;
      if (surface) {
        const eject =
          lifecycle.phase === 'shutdown' ? (shutdownAnimated ? 'ejecting' : 'safe') : undefined;
        if (eject && surface.dataset.ejectPhase !== eject) surface.dataset.ejectPhase = eject;
        else if (!eject && surface.dataset.ejectPhase) delete surface.dataset.ejectPhase;
        if (options.ejectRestart && options.ejectRestart.hidden === (eject === 'safe'))
          options.ejectRestart.hidden = eject !== 'safe';
      }
      const accessibleName =
        lifecycle.phase === 'shutdown'
          ? shutdownAnimated
            ? 'MHK10 — Ejecting disk'
            : 'It is now safe to turn off MHK10. 下次见。'
          : lifecycle.phase === 'boot'
            ? 'MHK10 startup — System checks'
            : lifecycle.phase === 'splash'
              ? 'MHK10 startup — Opening desktop'
              : activeTitle
                ? `MHK10 desktop — ${activeTitle}`
                : 'MHK10 desktop';
      if (surface?.getAttribute('aria-label') !== accessibleName)
        surface?.setAttribute('aria-label', accessibleName);
    }

    // ---------- mount ----------
    async function mount(cv: HTMLCanvasElement = canvas): Promise<void> {
      if (cv !== canvas) throw new Error('A renderer is bound to its original canvas');
      if (mounted || lifetime.disposed)
        throw new Error('This desktop session cannot be mounted again');
      try {
        lifetime.defer(claimSurface(cv));
        mounted = true;
        surface = cv;
        const fontsReady = prepareFonts(lifetime, renderer.fonts);
        // Claim the loading state before async font work; each frame keeps it current.
        cv.setAttribute(
          'aria-busy',
          String(lifecycle.phase === 'boot' || lifecycle.phase === 'splash'),
        );
        if (startupSkip) {
          const skip = startupSkip;
          const releasePointer = (event: PointerEvent) => {
            if (event.pointerId === startupPointer) startupPointer = undefined;
          };
          lifetime.listen(skip, 'click', () => lifecycle.skipBoot());
          lifetime.listen(skip, 'pointerdown', (event) => {
            if (event.isPrimary && event.button === 0) startupPointer = event.pointerId;
          });
          lifetime.listen(window, 'pointerup', releasePointer, true);
          lifetime.listen(window, 'pointercancel', releasePointer, true);
        }
        lifetime.defer(() => {
          if (startupSkip) startupSkip.hidden = true;
          delete cv.dataset.startupPhase;
        });
        lifetime.listen(
          window,
          'keydown',
          (event) => {
            if (presentationSuspended || !cv.dataset.startupPhase || event.isComposing) return;
            const active = document.activeElement;
            if (active !== cv && active !== startupSkip && active !== document.body) return;
            if (event.key === 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return;
            if (event.key.length > 1 && /^(Shift|Control|Alt|Meta|CapsLock)$/.test(event.key))
              return;
            startupKeys.add(event.code || event.key);
            if (active === startupSkip && (event.key === 'Enter' || event.key === ' ')) return;
            lifecycle.skipBoot();
            event.preventDefault();
            event.stopImmediatePropagation();
          },
          true,
        );
        lifetime.listen(
          window,
          'keyup',
          (event) => startupKeys.delete(event.code || event.key),
          true,
        );
        lifetime.listen(window, 'blur', clearStartupPresses);
        lifetime.defer(mountDesktop(cv, input, audio));
        if (options.ejectRestart) {
          lifetime.listen(options.ejectRestart, 'click', restartFromEject);
          lifetime.defer(() => {
            if (options.ejectRestart) options.ejectRestart.hidden = true;
          });
        }
        monitor = mountMonitor(
          cv,
          {
            mode: () => desktopSettings.capabilities.getSettings().resolutionMode,
            changed: (metrics: DisplayMetrics) => {
              const previous = renderer.getDisplayMetrics();
              const reflow = cv.width !== metrics.width || cv.height !== metrics.height;
              const presentation = previous.scale !== metrics.scale;
              renderer.setDisplayMetrics(metrics);
              if (reflow) {
                cv.width = metrics.width;
                cv.height = metrics.height;
                if (renderingReady) renderer.getCtx().imageSmoothingEnabled = false;
                wm.resizeWorkArea(metrics.workArea.w, metrics.workArea.h);
                syncDesktopIcons(true);
                chrome.closeStart();
                chrome.closeContext();
                chrome.reflow();
              }
              if (reflow || presentation) input.cancelPointerInput();
              if (reflow || presentation) fileDrag?.clear();
            },
          },
          input,
          audio,
        );
        lifetime.defer(monitor.dispose);
        if (options.assistantForm) {
          assistantComposer = mountAssistantComposer(cv, options.assistantForm, () =>
            lifecycle.noteActivity(),
          );
          lifetime.defer(assistantComposer.dispose);
        }
        const reported = navigator as Navigator & { userAgentData?: unknown };
        lifecycle.setBootInfo({
          userAgent: reported.userAgent,
          userAgentData: reported.userAgentData,
          platform: reported.platform,
          language: reported.language,
          hardwareConcurrency: reported.hardwareConcurrency,
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
        });
        const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        systemReducedMotion = motion?.matches ?? false;
        if (motion)
          lifetime.listen(motion, 'change', (event) => {
            systemReducedMotion = event.matches;
          });
        renderer.getCtx().imageSmoothingEnabled = false;
        pointerLayer = createPointerLayer(cv);
        lifetime.defer(pointerLayer.dispose);
        lifetime.listen(window, 'message', (event) => {
          if (
            event.origin === location.origin &&
            Array.from(document.querySelectorAll('iframe')).some(
              (frame) => frame.contentWindow === event.source,
            )
          )
            lifecycle.noteActivity();
        });
        if (apps.some((app) => app.kind === 'html'))
          htmlWindows = createHtmlWindows(
            cv,
            {
              activity: () => {
                lifecycle.noteActivity();
              },
              focus: (id) => {
                wm.focus(id);
                window.dispatchEvent(new Event(FUSION_EVENTS.location));
              },
              close: (id) => {
                void closeWin(id);
              },
              canInteract: () => policy().html,
              open: (id, href) => {
                id = resolveAppId(id, personal ? 'hybrid' : 'canvas');
                const app = sessions.application(id);
                if (!app) {
                  if (!href || resolveAppHref(id, href, location.origin)) openApp(id);
                  return;
                }
                if (href) {
                  const safeHref = resolveAppHref(id, href, location.origin);
                  if (!safeHref) return;
                  const fileId = new URL(safeHref).searchParams.get('file');
                  if (
                    fileId &&
                    files.get(fileId) &&
                    !files.get(fileId)?.deleted &&
                    openFile(fileId, id).accepted
                  )
                    return;
                  if (app.kind === 'html') {
                    openApp(id, undefined, undefined, undefined, safeHref);
                    return;
                  }
                }
                openApp(id);
              },
            },
            input,
          );
        if (htmlWindows) lifetime.defer(htmlWindows.dispose);
        lifetime.defer(mountNativeFileHost(nativeFiles));
        syncStory(story.get(), false);
        lifetime.defer(story.subscribe((current) => syncStory(current)));
        const checkpoint = () => {
          if (lifetime.disposed) return true;
          htmlWindows?.prepareClose();
          if (renderingReady) {
            input.beginFrame(performance.now() / 1000);
            frame(0);
          }
          return !desktopFileOperation && !fileDrag?.pending && sessions.prepareUnload();
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
            clearStartupPresses();
          } else dispose();
        });
        lifetime.listen(window, 'pageshow', (event) => {
          if (!event.persisted || !suspended || lifetime.disposed) return;
          suspended = false;
          paintedScene = undefined;
          resumeFrame?.();
        });
        if (!(await fontsReady)) return;
        renderingReady = true;
        lifecycle.frame(0, {
          preferences: desktopSettings.capabilities.getSettings(),
          story: story.get(),
          risk: doom.v,
          modal: modalOpen(),
          input: input.io,
          systemReducedMotion,
        });
        wm.reducedMotion =
          lifecycle.reducedMotion || !desktopSettings.capabilities.getSettings().windowAnimations;
        beginStartup();
        let last = performance.now();
        const loop = (now: number) => {
          if (lifetime.disposed || suspended || presentationSuspended) return;
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          input.beginFrame(now / 1000);
          try {
            frame(dt);
          } catch (e) {
            console.error(e);
          }
          if (!lifetime.disposed && !suspended && !presentationSuspended)
            animation = requestAnimationFrame(loop);
        };
        resumeFrame = () => {
          last = performance.now();
          animation = requestAnimationFrame(loop);
        };
        if (!suspended && !presentationSuspended) resumeFrame();
      } catch (error) {
        dispose();
        throw error;
      }
    }

    function dispose() {
      if (lifetime.disposed) return;
      cancelAnimationFrame(animation);
      lifetime.dispose();
      if (surface) delete surface.dataset.captureTab;
    }

    // Enroll the owned runtime only when construction has succeeded. Disposal
    // marks the lifetime closed before application cleanup can reenter the host.
    lifetime.defer(runtime.dispose);

    return {
      mount,
      requestClose,
      dispose,
      env,
      get phase() {
        return lifecycle.phase;
      },
      // Fusion seam: the parent-site embed host mutes shell audio while the
      // iframe is hidden behind the classic site.
      setAudioMuted: (value: boolean) => audio.setMuted(value),
      setPresentationSuspended,
      getFusionDestination,
      navigateFusionDestination,
    };
  } catch (error) {
    lifetime.dispose();
    throw error;
  }
}
