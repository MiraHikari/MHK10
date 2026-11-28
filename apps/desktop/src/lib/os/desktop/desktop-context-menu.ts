import { QUICK_LAUNCH_CAPACITY } from './desktop-settings';
import type { StartEntry } from './start-menu';

export interface DesktopContextApplication {
  readonly id: string;
  readonly icon?: string;
}

export interface DesktopContextEntry {
  readonly kind: 'folder' | 'file';
  readonly targetId: string;
  readonly shortcutAppId?: string;
  readonly openWith: readonly { readonly label: string; readonly application: string }[];
}

export interface DesktopContextView {
  readonly surface: 'taskbar' | 'icon' | 'desktop';
  readonly quickLaunch: boolean;
  readonly quickLaunchItems: readonly string[];
  readonly taskbarLabels: boolean;
  readonly autoArrangeIcons: boolean;
  readonly showDesktopIcons: boolean;
  readonly activeAppId?: string;
  readonly canRestoreDesktop: boolean;
  readonly selectionCount: number;
  readonly clipboard: boolean;
  readonly entry?: DesktopContextEntry;
  readonly applications: readonly DesktopContextApplication[];
}

function program(
  applications: readonly DesktopContextApplication[],
  id: string,
  label: string,
): StartEntry[] {
  const app = applications.find((item) => item.id === id);
  return app ? [{ label, command: id, ...(app.icon ? { icon: app.icon } : {}) }] : [];
}

function openWith(entry: DesktopContextEntry | undefined): StartEntry[] {
  if (!entry || entry.kind !== 'file' || entry.openWith.length < 2) return [];
  return [
    {
      label: 'Open With',
      children: [
        ...entry.openWith.map((choice) => ({
          label: choice.label,
          command: `$open-with:${entry.targetId}:${choice.application}`,
        })),
        { label: '-' },
        { label: 'Choose default...', command: `$choose-file:${entry.targetId}` },
      ],
    },
  ];
}

/** Context-menu structure for the desktop, an icon, or the taskbar. */
export function desktopContextMenu(view: DesktopContextView): StartEntry[] {
  if (view.surface === 'taskbar') {
    return [
      {
        label: 'Toolbars',
        children: [
          {
            label: 'Quick Launch',
            checked: view.quickLaunch,
            command: '$toggle-quicklaunch',
          },
          {
            label: 'Add active application',
            command: `$pin:${view.activeAppId ?? ''}`,
            disabled: !view.activeAppId || view.quickLaunchItems.length >= QUICK_LAUNCH_CAPACITY,
          },
          { label: 'Restore Quick Launch', command: '$reset-quicklaunch' },
        ],
      },
      {
        label: 'Window Labels',
        checked: view.taskbarLabels,
        command: '$toggle-task-labels',
      },
      { label: '-' },
      { label: 'Cascade Windows', command: '$cascade' },
      { label: 'Tile Horizontally', command: '$tile-horizontal' },
      { label: 'Tile Vertically', command: '$tile-vertical' },
      {
        label: view.canRestoreDesktop ? 'Restore Windows' : 'Show Desktop',
        command: view.canRestoreDesktop ? '$restore-desktop' : '$desktop',
      },
      { label: '-' },
      { label: 'Properties', command: 'taskbar-settings' },
    ];
  }
  if (view.surface === 'icon') {
    const shortcut = view.entry?.shortcutAppId;
    return [
      { label: 'Open', command: '$open-selected', default: true },
      ...openWith(view.entry),
      ...(view.entry
        ? [
            { label: 'Cut', command: '$file:cut', disabled: view.selectionCount !== 1 },
            { label: 'Copy', command: '$file:copy', disabled: view.selectionCount !== 1 },
            { label: 'Rename', command: '$file:rename', disabled: view.selectionCount !== 1 },
            { label: 'Delete', command: '$file:delete' },
          ]
        : []),
      { label: '-' },
      {
        label: 'Properties',
        command: '$properties-selected',
        disabled: view.selectionCount !== 1,
      },
      ...(shortcut
        ? [
            {
              label: 'Add to Quick Launch',
              command: `$pin:${shortcut}`,
              disabled:
                view.quickLaunchItems.includes(shortcut) ||
                view.quickLaunchItems.length >= QUICK_LAUNCH_CAPACITY,
            },
          ]
        : []),
    ];
  }
  return [
    ...program(view.applications, 'computer', 'Explore My Computer'),
    ...program(view.applications, 'notepad', 'Open Notepad'),
    {
      label: 'Arrange Icons',
      children: [
        { label: 'By Name', command: '$arrange-icons' },
        {
          label: 'Auto Arrange',
          checked: view.autoArrangeIcons,
          command: '$auto-arrange-icons',
        },
      ],
    },
    { label: 'Line up Icons', command: '$line-icons' },
    { label: 'New', children: [{ label: 'Folder', command: '$new-folder' }] },
    { label: 'Paste', command: '$file:paste', disabled: !view.clipboard },
    {
      label: 'Show Desktop Icons',
      checked: view.showDesktopIcons,
      command: '$toggle-desktop-icons',
    },
    { label: '-' },
    { label: 'Cascade Windows', command: '$cascade' },
    { label: 'Tile Horizontally', command: '$tile-horizontal' },
    { label: 'Tile Vertically', command: '$tile-vertical' },
    { label: 'Show Desktop', command: '$desktop' },
    {
      label: 'Restore Windows',
      command: '$restore-desktop',
      disabled: !view.canRestoreDesktop,
    },
    { label: '-' },
    ...program(view.applications, 'display', 'Display Properties'),
    ...program(view.applications, 'recovery', 'Recovery Console'),
  ];
}
