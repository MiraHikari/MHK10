import { describe, expect, it } from 'vite-plus/test';
import {
  StartNavigation,
  desktopStartEntries,
  recentProgramEntries,
  resolveRunCommand,
  type StartEntry,
} from './start-menu';

const entries: StartEntry[] = [
  {
    label: 'Programs',
    children: [
      { label: 'Accessories', children: [{ label: 'Notepad', command: 'notepad' }] },
      { label: 'Minesweeper', command: 'mines' },
    ],
  },
  { label: '-' },
  { label: 'Unavailable', disabled: true, command: 'missing' },
  { label: 'Help', command: '$help' },
];

describe('Start navigation', () => {
  it('opens nested programs using the keyboard and closes one level at a time', () => {
    const nav = new StartNavigation(entries);
    nav.key('ArrowRight');
    nav.key('ArrowRight');
    expect(nav.levels()).toHaveLength(3);
    expect(nav.key('Enter')).toBe('notepad');
    expect(nav.key('Escape')).toBeUndefined();
    expect(nav.levels()).toHaveLength(2);
    nav.key('ArrowLeft');
    expect(nav.key('Escape')).toBe('$close');
  });
  it('skips separators and disabled commands and wraps selection', () => {
    const nav = new StartNavigation(entries);
    nav.key('ArrowDown');
    expect(nav.key('Enter')).toBe('$help');
    nav.key('ArrowDown');
    expect(nav.selections).toEqual([0]);
    nav.key('End');
    expect(nav.selections).toEqual([3]);
    nav.key('Home');
    expect(nav.selections).toEqual([0]);
  });
  it('delays sibling hover to preserve the open submenu while crossing it', () => {
    const nav = new StartNavigation(entries);
    nav.activate();
    nav.hover(0, 3, 1);
    nav.hover(0, 3, 1.1);
    expect(nav.levels()).toHaveLength(2);
    nav.hover(0, 3, 1.23);
    expect(nav.levels()).toHaveLength(1);
    expect(nav.key('Enter')).toBe('$help');
  });
  it('touch activation opens submenus immediately and reset clears the trail', () => {
    const nav = new StartNavigation(entries);
    nav.select(0, 0);
    nav.activate(0);
    nav.select(1, 0);
    nav.activate(1);
    expect(nav.levels()).toHaveLength(3);
    nav.reset();
    expect(nav.levels()).toHaveLength(1);
  });
  it('does not activate disabled entries', () => {
    const nav = new StartNavigation(entries);
    nav.select(0, 2);
    expect(nav.activate()).toBeUndefined();
  });
  it('starts nested menus on their first available row and follows mnemonics', () => {
    const nav = new StartNavigation([
      { label: 'Unavailable', disabled: true, command: 'missing' },
      {
        label: 'Programs',
        children: [
          { label: 'Disabled', disabled: true, command: 'disabled' },
          { label: 'Notepad', command: 'notepad' },
        ],
      },
    ]);
    expect(nav.selections).toEqual([1]);
    nav.key('p');
    expect(nav.selections).toEqual([1, 1]);
    expect(nav.key('d')).toBeUndefined();
    expect(nav.key('n')).toBe('notepad');
  });
  it('cycles duplicate Start commands and opens the highlighted command with Enter', () => {
    const nav = new StartNavigation([
      { label: 'Programs', children: [{ label: 'Notepad', command: 'notepad' }] },
      { label: 'Properties', command: '$properties' },
    ]);
    expect(nav.key('p')).toBeUndefined();
    expect(nav.selections).toEqual([1]);
    expect(nav.key('Enter')).toBe('$properties');
    nav.reset();
    nav.key('p');
    nav.key('p');
    expect(nav.selections).toEqual([0]);
    nav.key('Enter');
    expect(nav.levels()).toHaveLength(2);
  });
});

describe('Run program resolution', () => {
  const apps = [
    { id: 'home', title: 'My Website' },
    { id: 'mines', title: 'Minesweeper' },
    { id: 'notepad', title: 'diary.txt - Notepad' },
  ];
  it('accepts case-insensitive titles, IDs, and familiar executable aliases', () => {
    expect(resolveRunCommand('  WinMine.EXE ', apps)).toBe('mines');
    expect(resolveRunCommand('MY WEBSITE', apps)).toBe('home');
    expect(resolveRunCommand('notepad.exe', apps)).toBe('notepad');
  });
  it('builds recent program rows without unknown or dialog ids', () => {
    const programs = [
      { id: 'notepad', title: 'Notepad', icon: 'i_note' },
      { id: 'mines', title: 'Minesweeper' },
    ];
    expect(
      recentProgramEntries(['missing', 'mines', 'mines', '$run', 'notepad', 'chat'], programs),
    ).toEqual([
      { label: 'Minesweeper', command: 'mines' },
      { label: 'Notepad', icon: 'i_note', command: 'notepad' },
    ]);
    expect(
      recentProgramEntries(
        ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => id),
        ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ({ id, title: id })),
      ),
    ).toHaveLength(6);
  });
  it('places recent programs ahead of the fixed desktop commands', () => {
    expect(desktopStartEntries('canvas', []).map((entry) => entry.label)).not.toContain('Recent');
    const entries = desktopStartEntries('canvas', ['notepad']);
    expect(entries[0]).toMatchObject({ label: 'Recent' });
    expect(entries.at(-1)).toMatchObject({ label: 'Shut Down...', command: '$shutdown' });
    expect(entries[0]?.children?.[0]?.command).toBe('notepad');
  });
  it('offers the classic site hand-off only in the fusion embed', () => {
    expect(desktopStartEntries('hybrid', []).map((entry) => entry.command)).not.toContain(
      '$classic',
    );
    const embedded = desktopStartEntries('hybrid', [], true);
    expect(embedded.map((entry) => entry.label)).toContain('Classic Site');
    expect(embedded.at(-1)).toMatchObject({ label: 'Shut Down...', command: '$shutdown' });
  });
  it('rejects missing aliases, empty input and arbitrary commands', () => {
    expect(resolveRunCommand('control', apps)).toBeUndefined();
    expect(resolveRunCommand(' ', apps)).toBeUndefined();
    expect(resolveRunCommand('javascript:alert(1)', apps)).toBeUndefined();
    expect(resolveRunCommand('notepad; shutdown', apps)).toBeUndefined();
  });
});
