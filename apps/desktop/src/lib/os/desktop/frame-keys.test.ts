import { describe, expect, it } from 'vite-plus/test';
import { embeddedShellShortcut, frameKeyPrelude } from './frame-keys';

const keys = (...names: string[]) => new Set(names);

describe('frame key prelude', () => {
  it('dismisses the context and system menus for F10 when no dialog is open', () => {
    expect(frameKeyPrelude(keys('F10'), { modal: false, workspaceActive: false })).toEqual({
      closeContext: true,
      closeStart: true,
      dismissSystemMenu: true,
      cancelWorkspace: false,
    });
  });
  it('dismisses other menus and leaves Start to process its own toggle command', () => {
    expect(frameKeyPrelude(keys('StartMenu'), { modal: false, workspaceActive: false })).toEqual({
      closeContext: true,
      closeStart: false,
      dismissSystemMenu: true,
      cancelWorkspace: false,
    });
  });

  it('keeps F10 from dismissing menus while a dialog is open', () => {
    expect(frameKeyPrelude(keys('F10'), { modal: true, workspaceActive: false })).toEqual({
      closeContext: false,
      closeStart: false,
      dismissSystemMenu: false,
      cancelWorkspace: false,
    });
  });

  it('closes Start and the context menu for the system-menu key', () => {
    expect(frameKeyPrelude(keys('SystemMenu'), { modal: false, workspaceActive: false })).toEqual({
      closeContext: true,
      closeStart: true,
      dismissSystemMenu: false,
      cancelWorkspace: false,
    });
  });

  it('closes Start, the context menu and the system menu while cycling windows', () => {
    expect(
      frameKeyPrelude(keys('CycleWindowReverse'), { modal: true, workspaceActive: false }),
    ).toEqual({
      closeContext: true,
      closeStart: true,
      dismissSystemMenu: true,
      cancelWorkspace: false,
    });
  });

  it('cancels an icon gesture for menu and cycle keys without closing unrelated menus', () => {
    expect(frameKeyPrelude(keys('ContextMenu'), { modal: false, workspaceActive: true })).toEqual({
      closeContext: false,
      closeStart: false,
      dismissSystemMenu: false,
      cancelWorkspace: true,
    });
    expect(frameKeyPrelude(keys('F10'), { modal: true, workspaceActive: true })).toEqual({
      closeContext: false,
      closeStart: false,
      dismissSystemMenu: false,
      cancelWorkspace: true,
    });
  });

  it('combines simultaneous menu keys', () => {
    expect(
      frameKeyPrelude(keys('F10', 'SystemMenu'), { modal: false, workspaceActive: true }),
    ).toEqual({
      closeContext: true,
      closeStart: true,
      dismissSystemMenu: true,
      cancelWorkspace: true,
    });
  });
});

describe('embedded shell shortcuts', () => {
  it.each([
    'StartMenu',
    'ContextMenu',
    'CycleWindow',
    'CycleWindowReverse',
    'SystemMenu',
    'CloseWindow',
    'TaskManager',
    'Run',
    'ShowDesktop',
  ])('forwards %s', (command) => {
    expect(embeddedShellShortcut(command)).toBe(command);
  });

  it('leaves document keys and unknown commands in the embedded window', () => {
    expect(embeddedShellShortcut('F2')).toBeUndefined();
    expect(embeddedShellShortcut('F10')).toBeUndefined();
    expect(embeddedShellShortcut('F5')).toBeUndefined();
    expect(embeddedShellShortcut('Save')).toBeUndefined();
    expect(embeddedShellShortcut('ArrowLeft')).toBeUndefined();
    expect(embeddedShellShortcut(undefined)).toBeUndefined();
  });
});
