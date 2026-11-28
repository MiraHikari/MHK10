/**
 * Pure mapping for commands owned by the desktop shell.
 *
 * The browser hosts (canvas and embedded HTML windows) both feed this model;
 * keeping the mapping here prevents platform-specific KeyboardEvent handling
 * from drifting between hosts.
 */
export interface KeyboardShortcutInput {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
}

export type GlobalShortcut =
  | 'F10'
  | 'StartMenu'
  | 'ContextMenu'
  | 'CycleWindow'
  | 'CycleWindowReverse'
  | 'SystemMenu'
  | 'CloseWindow'
  | 'SelectAll'
  | 'Save'
  | 'SaveAs'
  | 'Undo'
  | 'Redo'
  | 'Copy'
  | 'Cut'
  | 'Paste'
  | 'Print'
  | 'NavigationBack'
  | 'NavigationForward'
  | 'NavigationUp'
  | 'NewFolder'
  | 'Properties'
  | 'TaskManager'
  | 'Run'
  | 'ShowDesktop'
  | 'Find'
  | 'F2'
  | 'F5'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'ArrowUp'
  | 'ArrowDown'
  | 'Home'
  | 'End'
  | ' ';

/** Resolve one keyboard event into a shell command, or leave it to the app. */
export function resolveGlobalShortcut(event: KeyboardShortcutInput): GlobalShortcut | undefined {
  if (event.isComposing) return;
  const ctrl = !!event.ctrlKey || !!event.metaKey;
  const alt = !!event.altKey;
  const shift = !!event.shiftKey;
  const key = event.key;

  if (ctrl && !alt && shift && key === 'Escape') return 'TaskManager';
  if (ctrl && alt && !shift && key.toLowerCase() === 'd') return 'ShowDesktop';
  if (alt && !ctrl && !shift) {
    if (key === 'F2') return 'Run';
    if (key === 'ArrowLeft') return 'NavigationBack';
    if (key === 'ArrowRight') return 'NavigationForward';
    if (key === 'ArrowUp') return 'NavigationUp';
    if (key === 'Enter') return 'Properties';
  }
  if (ctrl && !alt && key === 'Escape' && !shift) return 'StartMenu';
  if (ctrl && !alt && key === 'Tab') return shift ? 'CycleWindowReverse' : 'CycleWindow';
  if (alt && !ctrl && key === ' ') return 'SystemMenu';
  if (shift && !ctrl && !alt && key === 'F10') return 'ContextMenu';
  if (ctrl && !alt && key === 'F4') return 'CloseWindow';
  if (alt && !ctrl && key === 'F4') return 'CloseWindow';

  // Ctrl+arrow and Ctrl+Space are selection gestures used by the desktop.
  // Shift stays down so an editor can extend the same arrow by word.
  if (ctrl && !alt && key.startsWith('Arrow')) return key as GlobalShortcut;
  if (ctrl && !alt && (key === 'Home' || key === 'End')) return key;
  if (ctrl && !alt && !shift && key === ' ') return ' ';
  if (ctrl && !alt && !shift && key.toLowerCase() === 'a') return 'SelectAll';

  if (ctrl && !alt) {
    switch (key.toLowerCase()) {
      case 'n':
        return shift ? 'NewFolder' : undefined;
      case 's':
        return shift ? 'SaveAs' : 'Save';
      case 'z':
        return shift ? 'Redo' : 'Undo';
      case 'y':
        return 'Redo';
      case 'c':
        return 'Copy';
      case 'x':
        return 'Cut';
      case 'v':
        return 'Paste';
      case 'p':
        return 'Print';
      case 'f':
        return shift ? undefined : 'Find';
    }
  }

  if (!ctrl && !alt && !shift && (key === 'F2' || key === 'F5')) return key;
  if (!ctrl && !alt && !shift && key === 'F10') return 'F10';
}
