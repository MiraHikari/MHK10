import { describe, expect, it } from 'vite-plus/test';
import { navigateMenu, type MenuItem } from './menu-navigation';

const items: MenuItem[] = [
  { command: 'restore', mnemonic: 'r', disabled: true },
  { command: 'move', mnemonic: 'm' },
  { separator: true },
  { command: 'close', mnemonic: 'c' },
  { command: 'missing', disabled: true },
];

describe('menu navigation', () => {
  it('skips separators and disabled rows and wraps', () => {
    expect(navigateMenu(items, 1, 'ArrowDown')).toEqual({ type: 'highlight', index: 3 });
    expect(navigateMenu(items, 3, 'ArrowDown')).toEqual({ type: 'highlight', index: 1 });
    expect(navigateMenu(items, 1, 'ArrowUp')).toEqual({ type: 'highlight', index: 3 });
    expect(navigateMenu(items, 1, 'Home')).toEqual({ type: 'highlight', index: 1 });
    expect(navigateMenu(items, 1, 'End')).toEqual({ type: 'highlight', index: 3 });
  });

  it('leaves a disabled row toward the next available command', () => {
    expect(navigateMenu(items, 0, 'ArrowDown')).toEqual({ type: 'highlight', index: 1 });
    expect(navigateMenu(items, 4, 'ArrowUp')).toEqual({ type: 'highlight', index: 3 });
  });

  it('chooses an enabled command and ignores a disabled mnemonic', () => {
    expect(navigateMenu(items, 1, 'Enter')).toEqual({ type: 'choose', command: 'move' });
    expect(navigateMenu(items, 0, 'Enter')).toEqual({ type: 'ignore' });
    expect(navigateMenu(items, 1, 'c')).toEqual({ type: 'choose', command: 'close' });
    expect(navigateMenu(items, 1, 'r')).toEqual({ type: 'ignore' });
    expect(navigateMenu(items, 1, 'Escape')).toEqual({ type: 'close' });
  });

  it('highlights nothing when every row is unavailable', () => {
    expect(
      navigateMenu([{ separator: true }, { disabled: true, command: 'no' }], 0, 'Home'),
    ).toEqual({ type: 'highlight', index: -1 });
  });

  it('starts at the appropriate end when an opened menu has no selected row', () => {
    const commands = [{ command: 'first' }, { command: 'middle' }, { command: 'last' }];
    expect(navigateMenu(commands, -1, 'ArrowUp')).toEqual({ type: 'highlight', index: 2 });
    expect(navigateMenu(commands, -1, 'ArrowDown')).toEqual({ type: 'highlight', index: 0 });
    expect(navigateMenu(commands, 6, 'ArrowUp')).toEqual({ type: 'highlight', index: 2 });
  });
  it('cycles duplicate mnemonics without executing a command until Enter', () => {
    const commands = [
      { command: 'save', mnemonic: 's' },
      { command: 'disabled', mnemonic: 's', disabled: true },
      { command: 'save-as', mnemonic: 'S' },
    ];
    expect(navigateMenu(commands, -1, 's')).toEqual({ type: 'highlight', index: 0 });
    expect(navigateMenu(commands, 0, 's')).toEqual({ type: 'highlight', index: 2 });
    expect(navigateMenu(commands, 2, 's')).toEqual({ type: 'highlight', index: 0 });
    expect(navigateMenu(commands, 2, 'Enter')).toEqual({ type: 'choose', command: 'save-as' });
  });
  it('opens a submenu through its unique mnemonic and ignores non-actions', () => {
    const commands = [
      { mnemonic: 'p' },
      { submenu: true, mnemonic: 'p' },
      { command: 'close', mnemonic: 'c' },
    ];
    expect(navigateMenu(commands, -1, 'p')).toEqual({ type: 'submenu', index: 1 });
    expect(navigateMenu(commands, 1, 'Enter')).toEqual({ type: 'submenu', index: 1 });
    expect(navigateMenu(commands, 0, 'Home')).toEqual({ type: 'highlight', index: 1 });
  });
});
