export type ReaderPanelName = 'contents' | 'notebook';
export type ReaderDialogName = 'options' | 'find' | 'properties' | 'help' | 'note';

/** Sidebar facts the command table needs. The mount owns the elements themselves. */
export interface ReaderCommandView {
  readonly focus: boolean;
  readonly sidebarHidden: boolean;
  readonly panelHidden: Readonly<Record<ReaderPanelName, boolean>>;
}

/** What a command id asks the session and mount to do. The mount applies it. */
export type ReaderIntent =
  | { type: 'open-navigation' }
  | { type: 'open-panel'; panel: ReaderPanelName }
  | { type: 'close-panel' }
  | { type: 'open-dialog'; dialog: ReaderDialogName; focus?: 'query' }
  | { type: 'close-dialog'; dialog: ReaderDialogName }
  | { type: 'toggle-focus' }
  | { type: 'reset-options' }
  | { type: 'navigate'; direction: -1 | 1 }
  | { type: 'bookmark' }
  | { type: 'highlight' }
  | { type: 'compose-note' }
  | { type: 'save-note' }
  | { type: 'copy'; kind: 'link' | 'citation' }
  | { type: 'print' }
  | { type: 'export'; kind: 'book' | 'notebook' | 'backup' }
  | { type: 'import-notebook' }
  | { type: 'save-notes' }
  | { type: 'fullscreen' };

function panelIntent(view: ReaderCommandView, panel: ReaderPanelName): ReaderIntent {
  if (!view.sidebarHidden && !view.focus && !view.panelHidden[panel])
    return { type: 'close-panel' };
  return { type: 'open-panel', panel };
}

const READER_COMMANDS: Record<string, (view: ReaderCommandView) => ReaderIntent> = {
  jump: () => ({ type: 'open-navigation' }),
  contents: (view) => panelIntent(view, 'contents'),
  notebook: (view) => panelIntent(view, 'notebook'),
  'close-sidebar': () => ({ type: 'close-panel' }),
  options: () => ({ type: 'open-dialog', dialog: 'options' }),
  focus: () => ({ type: 'toggle-focus' }),
  'close-options': () => ({ type: 'close-dialog', dialog: 'options' }),
  'reset-options': () => ({ type: 'reset-options' }),
  find: () => ({ type: 'open-dialog', dialog: 'find', focus: 'query' }),
  'close-find': () => ({ type: 'close-dialog', dialog: 'find' }),
  properties: () => ({ type: 'open-dialog', dialog: 'properties' }),
  'close-properties': () => ({ type: 'close-dialog', dialog: 'properties' }),
  help: () => ({ type: 'open-dialog', dialog: 'help' }),
  'close-help': () => ({ type: 'close-dialog', dialog: 'help' }),
  'close-note': () => ({ type: 'close-dialog', dialog: 'note' }),
  previous: () => ({ type: 'navigate', direction: -1 }),
  next: () => ({ type: 'navigate', direction: 1 }),
  bookmark: () => ({ type: 'bookmark' }),
  highlight: () => ({ type: 'highlight' }),
  note: () => ({ type: 'compose-note' }),
  'save-note': () => ({ type: 'save-note' }),
  'copy-link': () => ({ type: 'copy', kind: 'link' }),
  'copy-citation': () => ({ type: 'copy', kind: 'citation' }),
  print: () => ({ type: 'print' }),
  'export-book': () => ({ type: 'export', kind: 'book' }),
  'export-notebook': () => ({ type: 'export', kind: 'notebook' }),
  'backup-notebook': () => ({ type: 'export', kind: 'backup' }),
  'import-notebook': () => ({ type: 'import-notebook' }),
  'save-notes': () => ({ type: 'save-notes' }),
  fullscreen: () => ({ type: 'fullscreen' }),
};

export const READER_COMMAND_IDS: readonly string[] = Object.keys(READER_COMMANDS);

/** Resolve a stable command id to the intent the Reader mount applies. */
export function readerIntent(action: string, view: ReaderCommandView): ReaderIntent | undefined {
  return Object.hasOwn(READER_COMMANDS, action) ? READER_COMMANDS[action](view) : undefined;
}
