const EMBEDDED_SHELL_SHORTCUTS = new Set([
  'StartMenu',
  'ContextMenu',
  'CycleWindow',
  'CycleWindowReverse',
  'SystemMenu',
  'CloseWindow',
  'TaskManager',
  'Run',
  'ShowDesktop',
]);

const WORKSPACE_KEYS = [
  'StartMenu',
  'F10',
  'SystemMenu',
  'ContextMenu',
  'CycleWindow',
  'CycleWindowReverse',
] as const;

export interface FrameKeyPrelude {
  closeContext: boolean;
  closeStart: boolean;
  dismissSystemMenu: boolean;
  cancelWorkspace: boolean;
}

/** Menus dismissed before the window manager sees the same keypress. */
export function frameKeyPrelude(
  keys: { has(key: string): boolean },
  options: { modal: boolean; workspaceActive: boolean },
): FrameKeyPrelude {
  const start = keys.has('StartMenu') && !options.modal;
  const menuBar = keys.has('F10') && !options.modal;
  const systemMenu = keys.has('SystemMenu');
  const cycle = keys.has('CycleWindow') || keys.has('CycleWindowReverse');
  return {
    closeContext: start || menuBar || systemMenu || cycle,
    closeStart: menuBar || systemMenu || cycle,
    dismissSystemMenu: start || menuBar || cycle,
    cancelWorkspace: options.workspaceActive && WORKSPACE_KEYS.some((key) => keys.has(key)),
  };
}

/** Shell commands an embedded document forwards; bare F2 and F5 stay in the document. */
export function embeddedShellShortcut(resolved: string | undefined): string | undefined {
  return resolved && EMBEDDED_SHELL_SHORTCUTS.has(resolved) ? resolved : undefined;
}
