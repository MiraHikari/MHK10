import { APP_CATALOG, appRoute, resolveAppId } from '../../../data/app-catalog';
import { publicFileTarget } from '../../../data/public-files';
import { clamp, R } from '../../gfx/primitives';
import type { Bounds } from '../../ui/canvas/layout';
import type { FileAssociationStore } from '../files/file-associations';
import type { FileSystem } from '../files/filesystem';
import { fileHandlerLabel, fileOpenChoices, resolveFileOpen } from '../files/file-types';
import type { AppServices, AppSessionSurface, MsgSpec, OpenResult } from '../host/app-contracts';
import type { WindowSessions } from '../windows/window-sessions';
import type { WM } from '../windows/wm';
import { rememberRecentProgram, type DesktopSettings } from './desktop-settings';

export interface DesktopLauncherDeps {
  disposed(): boolean;
  modalOpen(): boolean;
  personal: boolean;
  sessions: WindowSessions;
  wm: WM;
  files: FileSystem;
  associations: Pick<FileAssociationStore, 'snapshot' | 'setDefault'>;
  settings(): Readonly<DesktopSettings>;
  updateRecent(ids: readonly string[]): void;
  width(): number;
  height(): number;
  requestClose(): Promise<boolean>;
  msg(spec: MsgSpec): void;
  services: AppServices;
  surface: Omit<AppSessionSurface, 'owner'>;
  iconBounds(id: string): Bounds | undefined;
  storedLaunchBounds(id: string): Bounds | undefined;
  location: { readonly origin: string; assign(url: string): void };
}

/** Opens applications and files, including cascade placement, routes and recent programs. */
export function createDesktopLauncher(deps: DesktopLauncherDeps) {
  let cascade = 0;
  let navigating = false;
  let pendingFolder: string | undefined;
  const sources = new Map<string, string>();

  const noteRecent = (id: string) => {
    if (id.startsWith('$')) return;
    const current = deps.settings();
    const next = rememberRecentProgram(current, id);
    if (next !== current) deps.updateRecent(next.recentProgramIds);
  };

  const openApp = (
    id: string,
    launchBounds?: Bounds,
    initialFileId?: string,
    desktopSourceId?: string,
    htmlHref?: string,
  ): OpenResult => {
    if (deps.disposed()) return { accepted: false, reason: 'unavailable' };
    id = resolveAppId(id, deps.personal ? 'hybrid' : 'canvas');
    const app = deps.sessions.application(id);
    if (deps.modalOpen() && !app?.modal) return { accepted: false, reason: 'blocked' };
    if (!app) {
      const link = APP_CATALOG.find((entry) => entry.id === id && entry.route);
      let linkHref = link?.route;
      if (linkHref && initialFileId) {
        const url = new URL(linkHref, deps.location.origin);
        url.searchParams.set('file', initialFileId);
        linkHref = url.href;
      }
      if (!link || !linkHref) return { accepted: false, reason: 'unknown-app' };
      if (navigating) return { accepted: false, reason: 'blocked' };
      navigating = true;
      const navigate = async () => {
        try {
          if ((await deps.requestClose()) && !deps.disposed()) {
            deps.location.assign(linkHref);
            noteRecent(id);
          }
        } catch {
          /* A failed close or navigation leaves the desktop available for retry. */
        } finally {
          navigating = false;
        }
      };
      void navigate();
      return { accepted: true };
    }
    const instanceId = initialFileId ? `${id}:file:${initialFileId}` : id;
    const existing = deps.wm.byId(instanceId);
    if (existing) {
      if (htmlHref && app.kind === 'html') deps.sessions.navigateHtml(instanceId, htmlHref);
      deps.wm.restore(instanceId);
      noteRecent(id);
      return { accepted: true };
    }
    if (desktopSourceId) launchBounds = deps.iconBounds(desktopSourceId);
    const x = app.x ?? R(50 + 90 * (cascade % 5) + 12 * (cascade % 3));
    const y = app.y ?? R(8 + 24 * (cascade % 9));
    // The Reader is a reading surface: give it more of a desktop workspace
    // when one exists, while the 640×360 classic screen keeps catalog defaults.
    const roomyReader = app.id === 'blog' && deps.width() >= 900 && deps.height() >= 600;
    const windowWidth = roomyReader ? Math.min(640, deps.width() - 24) : app.w;
    const windowHeight = roomyReader ? Math.min(400, deps.height() - 40) : app.h;
    cascade++;
    if (desktopSourceId) sources.set(instanceId, desktopSourceId);
    const fileEnv: AppServices = Object.create(deps.services);
    if (initialFileId)
      Object.defineProperty(fileEnv, 'initialFileId', { value: initialFileId, enumerable: true });
    const opened = deps.sessions.open(
      {
        id: instanceId,
        appId: id,
        title: initialFileId
          ? `${deps.files.get(initialFileId)?.name ?? 'Document'} - ${APP_CATALOG.find((item) => item.id === id)?.name ?? app.title}`
          : app.title,
        icon: app.icon,
        x: clamp(x, 0, Math.max(0, deps.width() - windowWidth - 4)),
        y: clamp(y, 0, Math.max(0, deps.height() - 22 - windowHeight)),
        w: windowWidth,
        h: windowHeight,
        ctl: app.ctl,
        noClose: app.noClose,
        modal: app.modal,
        launchBounds,
        minW: app.kind === 'html' ? 280 : app.w,
        minH: app.kind === 'html' ? 180 : app.h,
      },
      {
        createSession:
          app.kind === 'canvas'
            ? () => app.createSession(fileEnv, { ...deps.surface, owner: instanceId })
            : undefined,
        htmlUrl: app.kind === 'html' ? (htmlHref ?? app.html) : undefined,
      },
    );
    if (!opened.accepted) sources.delete(instanceId);
    else noteRecent(id);
    return opened;
  };

  const openFile = (
    id: string,
    requestedApplication?: string,
    launchBounds?: Bounds,
    desktopSourceId?: string,
  ): OpenResult => {
    if (deps.disposed() || deps.modalOpen()) return { accepted: false, reason: 'blocked' };
    const target = resolveFileOpen(
      deps.files,
      id,
      requestedApplication,
      new Set<string>(),
      deps.associations.snapshot(),
    );
    if (target.kind === 'failed') return { accepted: false, reason: 'unavailable' };
    if (target.kind === 'folder') {
      pendingFolder = target.id;
      const opened = openApp('computer', launchBounds, undefined, desktopSourceId);
      if (!opened.accepted) pendingFolder = undefined;
      return opened;
    }
    if (target.kind === 'choose') return chooseFileApplication(id, launchBounds, desktopSourceId);
    const app = deps.sessions.application(target.application);
    if (!app) return openApp(target.application, launchBounds, target.fileId, desktopSourceId);
    if (app.kind === 'html' && target.fileId) {
      const published = publicFileTarget(target.fileId);
      if (published && published.application === target.application) {
        return openApp(
          target.application,
          launchBounds,
          undefined,
          desktopSourceId,
          published.href,
        );
      }
      const route = appRoute(target.application);
      if (!route) return { accepted: false, reason: 'unavailable' };
      const url = new URL(route, deps.location.origin);
      url.searchParams.set('file', target.fileId);
      return openApp(
        target.application,
        launchBounds,
        target.fileId,
        desktopSourceId,
        url.pathname + url.search,
      );
    }
    return openApp(target.application, launchBounds, target.fileId, desktopSourceId);
  };

  function chooseFileApplication(
    id: string,
    launchBounds?: Bounds,
    desktopSourceId?: string,
  ): OpenResult {
    if (deps.disposed() || deps.modalOpen()) return { accepted: false, reason: 'blocked' };
    const target = fileOpenChoices(deps.files, id, deps.associations.snapshot());
    if (!target?.applications.length) return { accepted: false, reason: 'unavailable' };
    deps.msg({
      title: 'Open With',
      lines: [target.name, 'Select an application:'],
      buttons: [...target.applications.map(fileHandlerLabel), 'Cancel'],
      def: target.applications.length,
      check: { label: 'Always use this app for this file type', checked: false },
      onBtn: (index, _env, checked) => {
        if (index < target.applications.length) {
          openFile(id, target.applications[index], launchBounds, desktopSourceId);
          if (checked) {
            const result = deps.associations.setDefault(target.name, target.applications[index]);
            if (!result.ok || !result.persisted)
              deps.msg({
                title: 'Open With',
                lines: [
                  result.ok ? 'This preference will last for this session only.' : result.error,
                ],
              });
          }
        }
      },
    });
    return { accepted: true };
  }

  return {
    openApp,
    openFile,
    chooseFileApplication,
    refreshLaunchBounds(): void {
      for (const [windowId, iconId] of sources) {
        if (!deps.wm.byId(windowId)) sources.delete(windowId);
        else deps.wm.setLaunchBounds(windowId, deps.storedLaunchBounds(iconId));
      }
    },
    resetCascade(): void {
      cascade = 0;
    },
    release(windowId: string): void {
      sources.delete(windowId);
      if (windowId === 'computer') pendingFolder = undefined;
    },
    releaseAll(): void {
      sources.clear();
      pendingFolder = undefined;
    },
    takeFolder(appId: string): string | undefined {
      if (appId !== 'computer') return;
      const folder = pendingFolder;
      pendingFolder = undefined;
      return folder;
    },
  };
}

export type DesktopLauncher = ReturnType<typeof createDesktopLauncher>;
