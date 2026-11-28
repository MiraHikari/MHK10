import { describe, expect, it } from 'vite-plus/test';
import { desktopAction } from './desktop-command-model';
import { desktopContextMenu, type DesktopContextView } from './desktop-context-menu';
import type { StartEntry } from './start-menu';

const view = (patch: Partial<DesktopContextView> = {}): DesktopContextView => ({
  surface: 'desktop',
  quickLaunch: true,
  quickLaunchItems: ['home'],
  taskbarLabels: true,
  autoArrangeIcons: false,
  showDesktopIcons: true,
  canRestoreDesktop: false,
  selectionCount: 1,
  clipboard: false,
  applications: [
    { id: 'computer', icon: 'app_computer' },
    { id: 'notepad', icon: 'app_notepad' },
  ],
  ...patch,
});

const commands = (entries: readonly StartEntry[]): string[] =>
  entries.flatMap((entry) => [
    ...(entry.command ? [entry.command] : []),
    ...(entry.children ? commands(entry.children) : []),
  ]);

describe('desktop context menus', () => {
  it('builds the desktop menu from installed programs and parses every command', () => {
    const menu = desktopContextMenu(view());
    expect(menu.map((entry) => entry.label)).toContain('Explore My Computer');
    expect(menu.map((entry) => entry.label)).not.toContain('Display Properties');
    expect(commands(menu).map((command) => desktopAction(command).kind)).not.toContain('ignore');
    const paste = commands(menu);
    expect(menu.find((entry) => entry.command === '$file:paste')?.disabled).toBe(true);
    expect(paste).toContain('$new-folder');
  });

  it('offers Open With only when a file has two handlers', () => {
    const one = desktopContextMenu(
      view({
        surface: 'icon',
        entry: {
          kind: 'file',
          targetId: 'note',
          openWith: [{ label: 'Notepad', application: 'notepad' }],
        },
      }),
    );
    expect(one.map((entry) => entry.label)).not.toContain('Open With');
    const two = desktopContextMenu(
      view({
        surface: 'icon',
        selectionCount: 2,
        entry: {
          kind: 'file',
          targetId: 'library:article:colophon',
          shortcutAppId: 'notepad',
          openWith: [
            { label: 'Notepad', application: 'notepad' },
            { label: 'Documents', application: 'blog' },
          ],
        },
      }),
    );
    const openWith = two.find((entry) => entry.label === 'Open With');
    expect(openWith?.children?.map((entry) => entry.command)).toEqual([
      '$open-with:library:article:colophon:notepad',
      '$open-with:library:article:colophon:blog',
      undefined,
      '$choose-file:library:article:colophon',
    ]);
    expect(two.find((entry) => entry.command === '$file:cut')?.disabled).toBe(true);
    expect(two.find((entry) => entry.label === 'Add to Quick Launch')?.command).toBe(
      '$pin:notepad',
    );
  });

  it('switches the taskbar between Show Desktop and Restore Windows', () => {
    expect(
      desktopContextMenu(view({ surface: 'taskbar' })).find(
        (entry) => entry.command === '$desktop' || entry.command === '$restore-desktop',
      )?.label,
    ).toBe('Show Desktop');
    expect(
      desktopContextMenu(view({ surface: 'taskbar', canRestoreDesktop: true })).find(
        (entry) => entry.command === '$restore-desktop',
      )?.label,
    ).toBe('Restore Windows');
  });
  it('keeps menu state separate from labels and marks the default icon action', () => {
    const taskbar = desktopContextMenu(view({ surface: 'taskbar' }));
    expect(taskbar.find((entry) => entry.command === '$toggle-task-labels')).toMatchObject({
      label: 'Window Labels',
      checked: true,
    });
    const desktop = desktopContextMenu(view());
    expect(desktop.find((entry) => entry.command === '$toggle-desktop-icons')).toMatchObject({
      label: 'Show Desktop Icons',
      checked: true,
    });
    const icon = desktopContextMenu(view({ surface: 'icon' }));
    expect(icon[0]).toMatchObject({ label: 'Open', command: '$open-selected', default: true });
  });
});
