import { describe, expect, it } from 'vite-plus/test';
import { desktopKeySteps, type DesktopKeyState } from './desktop-key-model';

const state = (patch: Partial<DesktopKeyState> = {}): DesktopKeyState => ({
  doomLocked: false,
  modal: false,
  workspaceActive: false,
  pressed: new Set<string>(),
  control: false,
  shift: false,
  focusedWindow: false,
  startOpen: false,
  canRestoreDesktop: false,
  showDesktopIcons: true,
  ...patch,
});

const pressed = (...keys: string[]) => state({ pressed: new Set(keys) });

describe('desktop shortcut ordering', () => {
  it('drops every shortcut while firmware or a dialog owns the frame', () => {
    expect(desktopKeySteps(pressed('F1', 'Escape'))).toEqual([
      { action: { kind: 'help' }, consume: ['F1'], consumeFirst: true },
    ]);
    expect(desktopKeySteps({ ...pressed('Escape', 'F1'), doomLocked: true })).toEqual([]);
    expect(desktopKeySteps({ ...pressed('F1'), modal: true })).toEqual([]);
  });

  it('lets an active workspace cancel and ignores the remaining keys', () => {
    expect(desktopKeySteps({ ...pressed('Escape', 'F1'), workspaceActive: true })).toEqual([
      { action: { kind: 'cancel-workspace' }, consume: ['Escape'] },
    ]);
    expect(desktopKeySteps({ ...pressed('Delete'), workspaceActive: true })).toEqual([]);
  });

  it('flips Start before deciding whether Escape dismisses a tip or icons run', () => {
    expect(desktopKeySteps(pressed('StartMenu', 'Escape', 'Enter'))).toEqual([
      { action: { kind: 'toggle-start' }, consume: ['StartMenu'] },
    ]);
    expect(
      desktopKeySteps({ ...pressed('StartMenu', 'Escape', 'Enter'), startOpen: true }),
    ).toEqual([
      { action: { kind: 'toggle-start' }, consume: ['StartMenu'] },
      { action: { kind: 'dismiss-tip' }, consume: [] },
      { action: { kind: 'activate-selected' }, consume: ['Enter'] },
    ]);
  });

  it('stops after a shell command and prefers Task Manager when Run is also pressed', () => {
    expect(desktopKeySteps(pressed('StartMenu', 'TaskManager', 'Run', 'Enter'))).toEqual([
      { action: { kind: 'toggle-start' }, consume: ['StartMenu'] },
      { action: { kind: 'command', command: 'task-manager' }, consume: ['TaskManager', 'Run'] },
    ]);
    expect(desktopKeySteps({ ...pressed('ShowDesktop'), canRestoreDesktop: true })).toEqual([
      { action: { kind: 'command', command: '$restore-desktop' }, consume: ['ShowDesktop'] },
    ]);
    expect(desktopKeySteps(pressed('CycleWindow', 'CycleWindowReverse'))).toEqual([
      {
        action: { kind: 'cycle', reverse: true },
        consume: ['CycleWindow', 'CycleWindowReverse'],
      },
    ]);
  });

  it('opens the desktop menu only when no window is focused', () => {
    expect(desktopKeySteps(pressed('ContextMenu'))).toEqual([
      { action: { kind: 'context-menu' }, consume: ['ContextMenu'] },
    ]);
    expect(
      desktopKeySteps({ ...pressed('ContextMenu', 'CloseWindow'), focusedWindow: true }),
    ).toEqual([{ action: { kind: 'request-close' }, consume: [] }]);
  });
  it('leaves F10 for the focused application menu bar', () => {
    expect(desktopKeySteps({ ...pressed('F10'), focusedWindow: true })).toEqual([]);
    expect(desktopKeySteps(pressed('F10'))).toEqual([]);
  });

  it('keeps icon commands behind a focused window, Start, or hidden icons', () => {
    expect(
      desktopKeySteps({ ...pressed('Delete', 'Enter', 'MaximizeWindow'), focusedWindow: true }),
    ).toEqual([{ action: { kind: 'toggle-maximize' }, consume: ['MaximizeWindow'] }]);
    expect(desktopKeySteps({ ...pressed('NewFolder'), showDesktopIcons: false })).toEqual([]);
    expect(desktopKeySteps({ ...pressed('F2'), startOpen: true })).toEqual([]);
  });

  it('orders icon editing, navigation and activation for one quiet desktop', () => {
    expect(
      desktopKeySteps({
        ...pressed('PageUp', 'PageDown', 'Copy', 'ArrowLeft', 'SelectAll', ' ', 'Enter'),
        control: true,
        shift: true,
      }),
    ).toEqual([
      { action: { kind: 'change-page', delta: 1 }, consume: ['PageDown', 'PageUp'] },
      { action: { kind: 'file', operation: 'copy' }, consume: ['Copy'], consumeFirst: true },
      {
        action: { kind: 'navigate', key: 'ArrowLeft', extend: true, fine: true },
        consume: ['ArrowLeft'],
      },
      { action: { kind: 'select-all' }, consume: ['SelectAll', 'a'] },
      {
        action: { kind: 'desktop-space', toggle: true },
        consume: [' '],
        consumeText: true,
      },
      { action: { kind: 'activate-selected' }, consume: ['Enter'] },
    ]);
    expect(desktopKeySteps({ ...pressed('a'), control: true })[0]).toEqual({
      action: { kind: 'select-all' },
      consume: ['SelectAll', 'a'],
    });
    expect(desktopKeySteps(pressed('Properties', 'NewFolder'))).toEqual([
      {
        action: { kind: 'command', command: '$new-folder' },
        consume: ['NewFolder'],
        consumeFirst: true,
      },
      {
        action: { kind: 'command', command: '$properties-selected' },
        consume: ['Properties'],
        consumeFirst: true,
      },
    ]);
  });
});
