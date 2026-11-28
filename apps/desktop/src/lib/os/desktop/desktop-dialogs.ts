import { C } from '../../gfx/palette';
import type { Application, AppServices, CanvasApp } from '../host/app-contracts';
import { defineCanvasApp } from '../host/app-session';
import { moveList } from '../../ui/canvas/list-navigation';
import type { DesktopEntry } from './desktop-workspace';
import type { FolderId } from '../files/filesystem';
import { resolveFileOpen } from '../files/file-types';
import {
  findOpenAction,
  myDocumentsSnapshot,
  searchFiles,
  type FileSearchRecord,
  type FindHit,
} from '../files/file-search';
import { resolveRunCommand } from './start-menu';
import { rememberRecentProgram, rememberRunCommand } from './desktop-settings';

const LIST_KEYS = ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'] as const;

function listed(
  keyPressed: { has(key: string): boolean },
  consume: (key: string) => boolean,
  cursor: { index: number; top: number; count: number; rows: number },
): { index: number; top: number } | undefined {
  if (cursor.count < 1) return;
  for (const key of LIST_KEYS) {
    if (!keyPressed.has(key)) continue;
    const moved = moveList({ ...cursor, index: Math.max(0, cursor.index) }, key);
    if (!moved) continue;
    consume(key);
    return moved;
  }
}

function displayCommands(values: readonly string[]): string[] {
  return values
    .filter((command): command is string => typeof command === 'string')
    .map((command) =>
      command
        .replace(/[\u0000-\u001f]/g, ' ')
        .trim()
        .slice(0, 64),
    )
    .filter((command) => command.length > 0)
    .slice(0, 8);
}

function runHistory(
  recentCommands: readonly string[] | (() => readonly string[]) | undefined,
  services: AppServices,
): readonly string[] {
  const supplied = typeof recentCommands === 'function' ? recentCommands() : recentCommands;
  return displayCommands(supplied ?? services.desktop?.getSettings().recentRunCommands ?? []);
}

function storeRecentLaunch(
  services: AppServices,
  command: string | undefined,
  programId: string,
): void {
  const desktop = services.desktop;
  if (!desktop) return;
  const current = desktop.getSettings();
  const withCommand = command === undefined ? current : rememberRunCommand(current, command);
  const next = rememberRecentProgram(withCommand, programId);
  const patch: {
    recentRunCommands?: readonly string[];
    recentProgramIds?: readonly string[];
  } = {};
  if (next.recentRunCommands !== current.recentRunCommands)
    patch.recentRunCommands = next.recentRunCommands;
  if (next.recentProgramIds !== current.recentProgramIds)
    patch.recentProgramIds = next.recentProgramIds;
  if (patch.recentRunCommands || patch.recentProgramIds) desktop.updateSettings(patch);
}

function chooseRecent(
  state: {
    recentIndex: number;
    recentTop: number;
    text: string;
    caret: number;
    anchor: number;
    error: string;
  },
  recent: readonly string[],
  key: string,
  rows: number,
): void {
  if (state.recentIndex < 0) {
    state.recentIndex = key === 'ArrowUp' || key === 'PageUp' ? recent.length - 1 : 0;
    state.recentTop = Math.max(0, Math.min(state.recentIndex, Math.max(0, recent.length - rows)));
  } else {
    const moved = moveList(
      { count: recent.length, rows, index: state.recentIndex, top: state.recentTop },
      key,
    );
    if (!moved) return;
    state.recentIndex = moved.index;
    state.recentTop = moved.top;
  }
  const command = recent[state.recentIndex] ?? '';
  state.text = command;
  state.caret = command.length;
  state.anchor = command.length;
  state.error = '';
}

/**
 * Recent commands are the optional argument when it is passed.
 * Omitting it reads the live desktop settings instead.
 * The shell can also call rememberRunCommand after any other successful Run.
 */
export function createRunDialog(
  applications: readonly Pick<Application, 'id' | 'title'>[],
  recentCommands?: readonly string[] | (() => readonly string[]),
): CanvasApp {
  const apps = applications.map((app) => ({ id: app.id, title: app.title }));
  return defineCanvasApp({
    id: '$run',
    title: 'Run',
    icon: 'i_find',
    w: 310,
    h: 210,
    ctl: 'x',
    create: () => ({
      text: '',
      caret: 0,
      anchor: 0,
      error: '',
      initialized: false,
      recentIndex: -1,
      recentTop: 0,
    }),
    draw(state, frame, services) {
      const { draw, widgets, input, client: c } = frame;
      if (!state.initialized) {
        widgets.focusTextField('run-command');
        state.initialized = true;
      }
      const recent = runHistory(recentCommands, services);
      const listX = c.x + 10;
      const listW = c.w - 20;
      const listY = c.y + 72;
      const buttonY = c.y + c.h - 26;
      const rows = Math.max(1, Math.floor((buttonY - 18 - listY) / 16));
      state.recentTop = Math.max(0, Math.min(state.recentTop, Math.max(0, recent.length - rows)));
      if (state.recentIndex >= recent.length)
        state.recentIndex = recent.length ? recent.length - 1 : -1;
      if (frame.focused && recent.length) {
        for (const key of ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp'] as const) {
          if (!input.io.keyPressed.has(key)) continue;
          input.consumeKey(key);
          chooseRecent(state, recent, key, rows);
          break;
        }
        recent.slice(state.recentTop, state.recentTop + rows).forEach((command, index) => {
          const absolute = state.recentTop + index;
          if (!input.hit(listX, listY + index * 16, listW, 16).clicked) return;
          state.recentIndex = absolute;
          state.text = command;
          state.caret = command.length;
          state.anchor = command.length;
          state.error = '';
        });
      }
      draw.spr('i_find', c.x + 9, c.y + 9);
      draw.text('Type the name of a program to open it.', c.x + 32, c.y + 12);
      draw.text('Open:', c.x + 10, c.y + 40);
      Object.assign(
        state,
        widgets.textField('run-command', c.x + 45, c.y + 32, c.w - 55, 21, state, {
          max: 64,
          focused: frame.focused,
        }),
      );
      draw.text('Recent:', c.x + 10, c.y + 58);
      widgets.field(listX, listY, listW, rows * 16 + 2);
      if (!recent.length)
        draw.text('No recent commands.', listX + 4, listY + 4, { color: draw.TH.shadow });
      recent.slice(state.recentTop, state.recentTop + rows).forEach((command, index) => {
        const absolute = state.recentTop + index;
        const y = listY + index * 16;
        const selected = state.recentIndex === absolute;
        if (selected) draw.rect(listX + 2, y, listW - 4, 16, draw.TH.sel);
        draw.text(draw.fitText(command, listW - 8), listX + 4, y + 3, {
          color: selected ? draw.TH.selText : draw.TH.text,
        });
      });
      draw.text(state.error, c.x + 10, buttonY - 16, {
        color: state.error ? C.maroon : draw.TH.text,
      });
      const submit = widgets.button(c.x + c.w - 150, buttonY, 65, 21, 'OK', { def: true });
      const cancel = widgets.button(c.x + c.w - 77, buttonY, 65, 21, 'Cancel');
      if (cancel || (frame.focused && input.consumeKey('Escape'))) {
        services.close(frame.win.id);
        return;
      }
      if (submit || (frame.focused && input.consumeKey('Enter'))) {
        const id = resolveRunCommand(state.text, apps);
        if (id) {
          services.close(frame.win.id);
          if (services.open(id).accepted) storeRecentLaunch(services, state.text, id);
        } else {
          state.error = 'Program not found. Check its name and try again.';
          services.play('error');
        }
      }
    },
  });
}

function programHits(apps: readonly { id: string; title: string }[], query: string): FindHit[] {
  const needle = query.trim().toLowerCase();
  return apps
    .filter(
      (app) => !app.id.startsWith('$') && `${app.id} ${app.title}`.toLowerCase().includes(needle),
    )
    .map((app) => ({ kind: 'program', id: app.id, label: app.title }));
}

function openFindHit(
  hit: FindHit,
  state: { error: string },
  winId: string,
  services: AppServices,
): void {
  const action = findOpenAction(hit, (id) => resolveFileOpen(services.files, id));
  if (action.kind === 'failed') {
    state.error = action.error;
    services.play('error');
    return;
  }
  const openFile = services.openFile;
  if (action.kind === 'file') {
    if (!openFile) {
      state.error = 'Find cannot open files from this window.';
      services.play('error');
      return;
    }
    services.close(winId);
    openFile(action.id);
    return;
  }
  services.close(winId);
  if (services.open(action.id).accepted) storeRecentLaunch(services, undefined, action.id);
}

export function createFindDialog(
  applications: readonly Pick<Application, 'id' | 'title'>[],
): CanvasApp {
  const apps = applications.map((app) => ({ id: app.id, title: app.title }));
  type DocumentSearch =
    | { status: 'idle' }
    | { status: 'cancelled' }
    | { status: 'loading'; query: string; epoch: number; revision: number }
    | { status: 'ready'; query: string; epoch: number; revision: number; hits: FindHit[] }
    | { status: 'failed'; query: string; epoch: number; revision: number };
  return defineCanvasApp({
    id: '$find',
    title: 'Find: Programs',
    icon: 'i_find',
    w: 320,
    h: 238,
    ctl: 'x',
    create: () => ({
      text: '',
      caret: 0,
      anchor: 0,
      scope: 'programs' as 'programs' | 'documents',
      index: 0,
      top: 0,
      initialized: false,
      error: '',
      disposed: false,
      request: 0,
      cachedEpoch: Number.NaN,
      cachedRevision: Number.NaN,
      cachedDocuments: [] as FileSearchRecord[],
      documentSearch: { status: 'idle' } as DocumentSearch,
      lastClick: undefined as { id: string; t: number } | undefined,
    }),
    dispose: (state) => {
      state.disposed = true;
      state.request++;
      state.cachedDocuments = [];
      state.documentSearch = { status: 'cancelled' };
    },
    draw(state, frame, services) {
      const { draw, widgets, input, client: c } = frame;
      if (!state.initialized) {
        widgets.focusTextField('find-program');
        state.initialized = true;
      }
      services.setTitle(
        frame.win.id,
        state.scope === 'documents' ? 'Find: My Documents' : 'Find: Programs',
      );
      const documents = () => {
        if (
          services.files.revision !== state.cachedRevision ||
          services.files.epoch !== state.cachedEpoch
        ) {
          state.cachedDocuments = myDocumentsSnapshot(services.files);
          state.cachedRevision = services.files.revision;
          state.cachedEpoch = services.files.epoch;
        }
        return state.cachedDocuments;
      };
      const collect = (): FindHit[] => {
        if (state.scope === 'programs' || !state.text.trim()) {
          if (state.documentSearch.status !== 'idle') {
            state.request++;
            state.documentSearch = { status: 'idle' };
          }
          return state.scope === 'programs'
            ? programHits(apps, state.text)
            : searchFiles(documents(), state.text).map((file) => ({
                kind: 'file',
                id: file.id,
                label: file.name,
              }));
        }
        const current = state.documentSearch;
        if (
          current.status !== 'idle' &&
          current.status !== 'cancelled' &&
          current.query === state.text &&
          current.epoch === services.files.epoch &&
          current.revision === services.files.revision
        )
          return current.status === 'ready' ? current.hits : [];
        const snapshot = documents();
        const publications = snapshot.filter(
          (file) =>
            file.readonly &&
            file.source === 'personal' &&
            (!file.kind || file.kind === 'text') &&
            !file.content,
        );
        if (!publications.length) {
          const hits: FindHit[] = searchFiles(snapshot, state.text).map((file) => ({
            kind: 'file',
            id: file.id,
            label: file.name,
          }));
          state.documentSearch = {
            status: 'ready',
            query: state.text,
            epoch: services.files.epoch,
            revision: services.files.revision,
            hits,
          };
          state.error = '';
          return hits;
        }
        const request = ++state.request;
        const accepted = {
          query: state.text,
          epoch: services.files.epoch,
          revision: services.files.revision,
        };
        state.documentSearch = { status: 'loading', ...accepted };
        void Promise.all(publications.map((file) => services.files.readText(file.id))).then(
          (loaded) => {
            if (state.disposed || request !== state.request) return;
            // The accepted query owns this result. New input or a reset starts a
            // different request; it cannot inherit an older search's completion.
            if (
              state.scope !== 'documents' ||
              state.text !== accepted.query ||
              services.files.epoch !== accepted.epoch
            ) {
              state.documentSearch = { status: 'cancelled' };
              services.invalidate();
              return;
            }
            const failure = loaded.find((result) => !result.ok);
            if (failure && !failure.ok) {
              state.error = failure.error;
              state.documentSearch = {
                status: 'failed',
                ...accepted,
                revision: services.files.revision,
              };
            } else {
              // Text hydration is a read, not a visitor-file revision. Refresh
              // this session's detached search snapshot explicitly.
              state.cachedDocuments = myDocumentsSnapshot(services.files);
              state.cachedEpoch = services.files.epoch;
              state.cachedRevision = services.files.revision;
              state.error = '';
              state.documentSearch = {
                status: 'ready',
                query: accepted.query,
                epoch: state.cachedEpoch,
                revision: state.cachedRevision,
                hits: searchFiles(state.cachedDocuments, accepted.query).map((file) => ({
                  kind: 'file',
                  id: file.id,
                  label: file.name,
                })),
              };
            }
            services.invalidate();
          },
        );
        return [];
      };
      const buttonY = c.y + c.h - 24;
      const listY = c.y + 64;
      const rowH = 18;
      const rows = Math.max(1, Math.floor((buttonY - 16 - listY) / rowH));
      let results = collect();
      if (results.length && state.index < 0) state.index = 0;
      if (frame.focused) {
        const moved = listed(input.io.keyPressed, (key) => input.consumeKey(key), {
          index: state.index,
          top: state.top,
          count: results.length,
          rows,
        });
        if (moved) {
          state.index = moved.index;
          state.top = moved.top;
        }
      }
      const beforeText = state.text;
      const beforeScope = state.scope;
      if (widgets.radio(c.x + 9, c.y + 4, 'Programs', state.scope === 'programs')) {
        state.scope = 'programs';
        widgets.focusTextField('find-program');
      }
      if (widgets.radio(c.x + 120, c.y + 4, 'My Documents', state.scope === 'documents')) {
        state.scope = 'documents';
        widgets.focusTextField('find-program');
      }
      draw.text('Named:', c.x + 9, c.y + 28);
      Object.assign(
        state,
        widgets.textField('find-program', c.x + 50, c.y + 22, c.w - 61, 21, state, {
          max: 48,
          focused: frame.focused,
        }),
      );
      if (beforeText !== state.text || beforeScope !== state.scope) {
        state.request++;
        state.documentSearch = { status: 'idle' };
        state.index = 0;
        state.top = 0;
        state.error = '';
        state.lastClick = undefined;
        results = collect();
      }
      if (!results.length) state.index = -1;
      else if (state.index < 0 || state.index >= results.length) state.index = 0;
      state.top = Math.max(0, Math.min(state.top, Math.max(0, results.length - rows)));
      if (input.hit(c.x + 4, listY - 2, c.w - 8, rows * rowH + 4).hover && input.io.wheel)
        state.top = Math.max(
          0,
          Math.min(Math.max(0, results.length - rows), state.top + Math.sign(input.io.wheel) * 3),
        );
      const noun = state.scope === 'programs' ? 'program' : 'document';
      const loading = state.documentSearch.status === 'loading';
      const failed = state.documentSearch.status === 'failed';
      draw.text(
        loading
          ? 'Searching documents...'
          : failed
            ? 'Search could not finish.'
            : `${results.length} ${noun}(s) found.`,
        c.x + 9,
        c.y + 48,
      );
      const listX = c.x + 6;
      const listW = c.w - 12;
      widgets.field(c.x + 4, listY - 2, c.w - 8, rows * rowH + 4);
      if (!results.length)
        draw.text(
          loading
            ? 'Loading publication text...'
            : failed
              ? 'Retry to search the complete Library.'
              : state.scope === 'programs'
                ? 'No matching programs.'
                : 'No matching documents.',
          c.x + 12,
          listY + 8,
          { color: draw.TH.shadow },
        );
      let activate = false;
      results.slice(state.top, state.top + rows).forEach((hit, index) => {
        const absolute = state.top + index;
        const y = listY + index * rowH;
        const row = input.hit(listX, y, listW, rowH - 1);
        if (row.clicked) {
          if (state.lastClick?.id === hit.id && services.now() - state.lastClick.t < 0.45)
            activate = true;
          state.lastClick = { id: hit.id, t: services.now() };
          state.index = absolute;
        }
        if (state.index === absolute) draw.rect(listX, y, listW, rowH - 1, draw.TH.sel);
        draw.text(draw.fitText(hit.label, listW - 8), listX + 4, y + 4, {
          color: state.index === absolute ? draw.TH.selText : draw.TH.text,
        });
      });
      if (state.error)
        draw.text(draw.fitText(state.error, c.w - 18), c.x + 9, buttonY - 14, { color: C.maroon });
      const open = widgets.button(c.x + 9, buttonY, 64, 20, 'Open', {
        def: true,
        disabled: state.index < 0,
      });
      const close = widgets.button(c.x + c.w - 75, buttonY, 64, 20, 'Close');
      if (failed && widgets.button(c.x + 84, buttonY, 64, 20, 'Retry')) {
        state.request++;
        state.documentSearch = { status: 'idle' };
        state.error = '';
        collect();
      }
      if (close || (frame.focused && input.consumeKey('Escape'))) {
        services.close(frame.win.id);
        return;
      }
      if (open || activate || (frame.focused && input.consumeKey('Enter'))) {
        const hit = results[state.index];
        if (hit) openFindHit(hit, state, frame.win.id, services);
      }
    },
  });
}

export function createRenameDialog(
  entry: Pick<DesktopEntry, 'kind' | 'targetId'>,
  name: string,
  epoch: number,
): CanvasApp {
  return defineCanvasApp({
    id: '$rename',
    title: 'Rename',
    w: 320,
    h: 150,
    ctl: 'x',
    modal: true,
    create: () => ({ text: name, caret: name.length, anchor: 0, error: '', initialized: false }),
    draw(state, frame, services) {
      const { draw, widgets, input, client: c } = frame;
      if (!state.initialized) {
        widgets.focusTextField('desktop-rename');
        state.initialized = true;
      }
      draw.text('Name:', c.x + 10, c.y + 12);
      Object.assign(
        state,
        widgets.textField('desktop-rename', c.x + 10, c.y + 29, c.w - 20, 22, state, {
          focused: frame.focused,
          max: 64,
        }),
      );
      draw.text(draw.fitText(state.error, c.w - 20), c.x + 10, c.y + 59, { color: C.maroon });
      const accept = widgets.button(c.x + c.w - 150, c.y + 84, 65, 21, 'Rename', { def: true });
      const cancel = widgets.button(c.x + c.w - 77, c.y + 84, 65, 21, 'Cancel');
      if (cancel || (frame.focused && input.consumeKey('Escape'))) {
        services.close(frame.win.id);
        return;
      }
      if (accept || (frame.focused && input.consumeKey('Enter'))) {
        const { files } = services;
        const current =
          entry.kind === 'folder' ? files.getFolder(entry.targetId) : files.get(entry.targetId);
        if (files.epoch !== epoch || !current || current.deleted || current.name !== name) {
          state.error = 'This item changed. Cancel and try again.';
          return;
        }
        const result =
          entry.kind === 'folder'
            ? files.renameFolder(entry.targetId as FolderId, state.text)
            : files.rename(entry.targetId, state.text);
        if (!result.ok) {
          state.error = result.error ?? 'Unable to rename this item.';
          return;
        }
        services.close(frame.win.id);
        if (!result.persisted)
          services.msg({
            title: 'Rename',
            lines: ['This change will last for this session only.'],
          });
      }
    },
  });
}
