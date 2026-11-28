export type DesktopFileOperation = 'cut' | 'copy' | 'paste' | 'rename' | 'delete';

export type DesktopAction =
  | { readonly kind: 'ignore' }
  | { readonly kind: 'file'; readonly operation: DesktopFileOperation }
  | { readonly kind: 'pin'; readonly id: string }
  | { readonly kind: 'unpin'; readonly id: string }
  | { readonly kind: 'reset-quick-launch' }
  | { readonly kind: 'toggle-desktop-icons' }
  | { readonly kind: 'auto-arrange' }
  | { readonly kind: 'toggle-quick-launch' }
  | { readonly kind: 'toggle-task-labels' }
  | { readonly kind: 'open-selected' }
  | { readonly kind: 'choose-file'; readonly fileId: string }
  | { readonly kind: 'open-with'; readonly fileId: string; readonly application: string }
  | { readonly kind: 'properties' }
  | { readonly kind: 'shutdown' }
  | { readonly kind: 'request-classic' }
  | { readonly kind: 'help' }
  | { readonly kind: 'show-desktop' }
  | { readonly kind: 'restore-desktop' }
  | { readonly kind: 'arrange-windows'; readonly mode: 'cascade' | 'horizontal' | 'vertical' }
  | { readonly kind: 'arrange-icons'; readonly byName: boolean }
  | { readonly kind: 'new-folder' }
  | { readonly kind: 'open'; readonly id: string };

const FILE_OPERATIONS = new Set<DesktopFileOperation>(['cut', 'copy', 'paste', 'rename', 'delete']);

function fileOperation(value: string): DesktopFileOperation {
  return FILE_OPERATIONS.has(value as DesktopFileOperation)
    ? (value as DesktopFileOperation)
    : 'copy';
}

/** Stable desktop command identifiers, separate from the labels that display them. */
export function desktopAction(command: string | undefined): DesktopAction {
  if (!command || command === '$close') return { kind: 'ignore' };
  if (command.startsWith('$file:'))
    return { kind: 'file', operation: fileOperation(command.slice('$file:'.length)) };
  if (command.startsWith('$unpin:')) return { kind: 'unpin', id: command.slice('$unpin:'.length) };
  if (command.startsWith('$pin:')) return { kind: 'pin', id: command.slice('$pin:'.length) };
  if (command === '$reset-quicklaunch') return { kind: 'reset-quick-launch' };
  if (command === '$toggle-desktop-icons') return { kind: 'toggle-desktop-icons' };
  if (command === '$auto-arrange-icons') return { kind: 'auto-arrange' };
  if (command === '$toggle-quicklaunch') return { kind: 'toggle-quick-launch' };
  if (command === '$toggle-task-labels') return { kind: 'toggle-task-labels' };
  if (command === '$open-selected') return { kind: 'open-selected' };
  if (command.startsWith('$choose-file:'))
    return { kind: 'choose-file', fileId: command.slice('$choose-file:'.length) };
  if (command.startsWith('$open-with:')) {
    const rest = command.slice('$open-with:'.length);
    const split = rest.lastIndexOf(':');
    if (split <= 0) return { kind: 'ignore' };
    return {
      kind: 'open-with',
      fileId: rest.slice(0, split),
      application: rest.slice(split + 1),
    };
  }
  if (command === '$properties-selected') return { kind: 'properties' };
  if (command === '$shutdown') return { kind: 'shutdown' };
  if (command === '$classic') return { kind: 'request-classic' };
  if (command === '$help') return { kind: 'help' };
  if (command === '$desktop') return { kind: 'show-desktop' };
  if (command === '$restore-desktop') return { kind: 'restore-desktop' };
  if (command === '$cascade') return { kind: 'arrange-windows', mode: 'cascade' };
  if (command === '$tile-horizontal') return { kind: 'arrange-windows', mode: 'horizontal' };
  if (command === '$tile-vertical') return { kind: 'arrange-windows', mode: 'vertical' };
  if (command === '$arrange-icons') return { kind: 'arrange-icons', byName: true };
  if (command === '$line-icons') return { kind: 'arrange-icons', byName: false };
  if (command === '$new-folder') return { kind: 'new-folder' };
  return { kind: 'open', id: command };
}
