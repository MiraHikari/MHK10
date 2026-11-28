import type { DesktopFileOperation } from './desktop-command-model';

export type DesktopKeyAction =
  | { readonly kind: 'cancel-workspace' }
  | { readonly kind: 'help' }
  | { readonly kind: 'toggle-start' }
  | { readonly kind: 'command'; readonly command: string }
  | { readonly kind: 'context-menu' }
  | { readonly kind: 'cycle'; readonly reverse: boolean }
  | { readonly kind: 'dismiss-tip' }
  | { readonly kind: 'toggle-maximize' }
  | { readonly kind: 'request-close' }
  | { readonly kind: 'change-page'; readonly delta: number }
  | { readonly kind: 'file'; readonly operation: DesktopFileOperation }
  | {
      readonly kind: 'navigate';
      readonly key: string;
      readonly extend: boolean;
      readonly fine: boolean;
    }
  | { readonly kind: 'select-all' }
  | { readonly kind: 'desktop-space'; readonly toggle: boolean }
  | { readonly kind: 'activate-selected' };

export interface DesktopKeyState {
  readonly doomLocked: boolean;
  readonly modal: boolean;
  readonly workspaceActive: boolean;
  readonly pressed: ReadonlySet<string>;
  readonly control: boolean;
  readonly shift: boolean;
  readonly focusedWindow: boolean;
  readonly startOpen: boolean;
  readonly canRestoreDesktop: boolean;
  readonly showDesktopIcons: boolean;
}

export interface DesktopKeyStep {
  readonly action: DesktopKeyAction;
  readonly consume: readonly string[];
  readonly consumeFirst?: boolean;
  readonly consumeText?: boolean;
}

const FILE_KEYS: readonly (readonly [string, DesktopFileOperation])[] = [
  ['Copy', 'copy'],
  ['Cut', 'cut'],
  ['Paste', 'paste'],
  ['F2', 'rename'],
  ['Delete', 'delete'],
];

const NAVIGATION_KEYS = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'] as const;

function step(
  action: DesktopKeyAction,
  consume: readonly string[] = [],
  options?: { readonly consumeFirst?: boolean; readonly consumeText?: boolean },
): DesktopKeyStep {
  return {
    action,
    consume,
    ...(options?.consumeFirst ? { consumeFirst: true } : {}),
    ...(options?.consumeText ? { consumeText: true } : {}),
  };
}

/**
 * Ordered shortcut actions for one desktop frame.
 * StartMenu flips Start before tip dismissal and icon commands, matching the shell's
 * same-frame order. Keys that stop the frame omit everything after them.
 */
export function desktopKeySteps(state: DesktopKeyState): readonly DesktopKeyStep[] {
  if (state.doomLocked || state.modal) return [];
  const keys = state.pressed;
  if (state.workspaceActive)
    return keys.has('Escape') ? [step({ kind: 'cancel-workspace' }, ['Escape'])] : [];

  const steps: DesktopKeyStep[] = [];
  if (keys.has('F1')) return [step({ kind: 'help' }, ['F1'], { consumeFirst: true })];

  let startOpen = state.startOpen;
  if (keys.has('StartMenu')) {
    steps.push(step({ kind: 'toggle-start' }, ['StartMenu']));
    startOpen = !startOpen;
  }
  if (keys.has('TaskManager') || keys.has('Run')) {
    steps.push(
      step({ kind: 'command', command: keys.has('TaskManager') ? 'task-manager' : '$run' }, [
        'TaskManager',
        'Run',
      ]),
    );
    return steps;
  }
  if (keys.has('ShowDesktop')) {
    steps.push(
      step(
        {
          kind: 'command',
          command: state.canRestoreDesktop ? '$restore-desktop' : '$desktop',
        },
        ['ShowDesktop'],
      ),
    );
    return steps;
  }
  if (keys.has('ContextMenu') && !state.focusedWindow) {
    steps.push(step({ kind: 'context-menu' }, ['ContextMenu']));
    return steps;
  }
  if (keys.has('CycleWindow') || keys.has('CycleWindowReverse')) {
    steps.push(
      step({ kind: 'cycle', reverse: keys.has('CycleWindowReverse') }, [
        'CycleWindow',
        'CycleWindowReverse',
      ]),
    );
    return steps;
  }
  if (keys.has('Escape') && !startOpen) steps.push(step({ kind: 'dismiss-tip' }));
  if (keys.has('MaximizeWindow') && state.focusedWindow)
    steps.push(step({ kind: 'toggle-maximize' }, ['MaximizeWindow']));
  if (keys.has('CloseWindow') && state.focusedWindow) steps.push(step({ kind: 'request-close' }));
  if (startOpen || state.focusedWindow || !state.showDesktopIcons) return steps;

  if (keys.has('PageDown') || keys.has('PageUp'))
    steps.push(
      step({ kind: 'change-page', delta: keys.has('PageDown') ? 1 : -1 }, ['PageDown', 'PageUp']),
    );
  for (const [key, operation] of FILE_KEYS) {
    if (keys.has(key)) steps.push(step({ kind: 'file', operation }, [key], { consumeFirst: true }));
  }
  if (keys.has('NewFolder'))
    steps.push(
      step({ kind: 'command', command: '$new-folder' }, ['NewFolder'], { consumeFirst: true }),
    );
  if (keys.has('Properties'))
    steps.push(
      step({ kind: 'command', command: '$properties-selected' }, ['Properties'], {
        consumeFirst: true,
      }),
    );
  for (const key of NAVIGATION_KEYS) {
    if (keys.has(key))
      steps.push(step({ kind: 'navigate', key, extend: state.shift, fine: state.control }, [key]));
  }
  if (keys.has('SelectAll') || (state.control && keys.has('a')))
    steps.push(step({ kind: 'select-all' }, ['SelectAll', 'a']));
  if (keys.has(' '))
    steps.push(
      step({ kind: 'desktop-space', toggle: state.control }, [' '], { consumeText: true }),
    );
  if (keys.has('Enter')) steps.push(step({ kind: 'activate-selected' }, ['Enter']));
  return steps;
}
