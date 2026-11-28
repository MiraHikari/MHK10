import { describe, expect, it } from 'vite-plus/test';
import { resolveGlobalShortcut } from './keyboard-shortcuts';

describe('global keyboard shortcuts', () => {
  it.each([
    [{ ctrlKey: true, key: 'Escape' }, 'StartMenu'],
    [{ key: 'F10' }, 'F10'],
    [{ ctrlKey: true, key: 'Tab' }, 'CycleWindow'],
    [{ ctrlKey: true, shiftKey: true, key: 'Tab' }, 'CycleWindowReverse'],
    [{ altKey: true, key: ' ' }, 'SystemMenu'],
    [{ shiftKey: true, key: 'F10' }, 'ContextMenu'],
    [{ ctrlKey: true, key: 'F4' }, 'CloseWindow'],
    [{ altKey: true, key: 'F4' }, 'CloseWindow'],
    [{ ctrlKey: true, key: 'a' }, 'SelectAll'],
    [{ ctrlKey: true, key: 'Home' }, 'Home'],
    [{ ctrlKey: true, key: 'End' }, 'End'],
    [{ ctrlKey: true, key: 's' }, 'Save'],
    [{ ctrlKey: true, shiftKey: true, key: 's' }, 'SaveAs'],
    [{ ctrlKey: true, key: 'z' }, 'Undo'],
    [{ ctrlKey: true, shiftKey: true, key: 'z' }, 'Redo'],
    [{ ctrlKey: true, key: 'y' }, 'Redo'],
    [{ ctrlKey: true, key: 'c' }, 'Copy'],
    [{ ctrlKey: true, key: 'x' }, 'Cut'],
    [{ ctrlKey: true, key: 'v' }, 'Paste'],
    [{ ctrlKey: true, key: 'p' }, 'Print'],
    [{ ctrlKey: true, key: 'f' }, 'Find'],
    [{ ctrlKey: true, shiftKey: true, key: 'f' }, undefined],
    [{ ctrlKey: true, shiftKey: true, key: 'Escape' }, 'TaskManager'],
    [{ ctrlKey: true, altKey: true, key: 'd' }, 'ShowDesktop'],
    [{ altKey: true, key: 'F2' }, 'Run'],
    [{ altKey: true, key: 'ArrowLeft' }, 'NavigationBack'],
    [{ altKey: true, key: 'ArrowRight' }, 'NavigationForward'],
    [{ altKey: true, key: 'ArrowUp' }, 'NavigationUp'],
    [{ altKey: true, key: 'Enter' }, 'Properties'],
    [{ ctrlKey: true, shiftKey: true, key: 'N' }, 'NewFolder'],
  ] as const)('maps %j', (event, command) => {
    expect(resolveGlobalShortcut(event)).toBe(command);
  });

  it('supports Command as the cross-platform Ctrl equivalent', () => {
    expect(resolveGlobalShortcut({ metaKey: true, key: 's' })).toBe('Save');
  });

  it('preserves desktop navigation gestures', () => {
    expect(resolveGlobalShortcut({ ctrlKey: true, key: 'ArrowRight' })).toBe('ArrowRight');
    expect(resolveGlobalShortcut({ ctrlKey: true, shiftKey: true, key: 'ArrowLeft' })).toBe(
      'ArrowLeft',
    );
    expect(resolveGlobalShortcut({ ctrlKey: true, key: ' ' })).toBe(' ');
  });

  it('does not consume composing or browser modifier combinations', () => {
    expect(resolveGlobalShortcut({ ctrlKey: true, key: 's', isComposing: true })).toBeUndefined();
    expect(resolveGlobalShortcut({ altKey: true, key: 's' })).toBeUndefined();
    expect(resolveGlobalShortcut({ key: 'F3' })).toBeUndefined();
    expect(resolveGlobalShortcut({ ctrlKey: true, altKey: true, key: 's' })).toBeUndefined();
    expect(resolveGlobalShortcut({ ctrlKey: true, key: 'n' })).toBeUndefined();
    expect(resolveGlobalShortcut({ altKey: true, key: 'Tab' })).toBeUndefined();
    expect(resolveGlobalShortcut({ altKey: true, ctrlKey: true, key: 'F4' })).toBeUndefined();
  });
});
