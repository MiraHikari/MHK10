import { describe, expect, it } from 'vite-plus/test';
import { desktopAction } from './desktop-command-model';

describe('desktop command identifiers', () => {
  it('ignores an empty command and the menu close sentinel', () => {
    expect(desktopAction(undefined)).toEqual({ kind: 'ignore' });
    expect(desktopAction('$close')).toEqual({ kind: 'ignore' });
  });

  it('keeps file operations and treats an unknown file command as copy', () => {
    expect(desktopAction('$file:cut')).toEqual({ kind: 'file', operation: 'cut' });
    expect(desktopAction('$file:paste')).toEqual({ kind: 'file', operation: 'paste' });
    expect(desktopAction('$file:bogus')).toEqual({ kind: 'file', operation: 'copy' });
  });

  it('splits Open With on the final colon so library ids stay intact', () => {
    expect(desktopAction('$open-with:library:article:colophon:blog')).toEqual({
      kind: 'open-with',
      fileId: 'library:article:colophon',
      application: 'blog',
    });
    expect(desktopAction('$open-with:notes')).toEqual({ kind: 'ignore' });
    expect(desktopAction('$choose-file:library:article:colophon')).toEqual({
      kind: 'choose-file',
      fileId: 'library:article:colophon',
    });
  });

  it('maps window arrangement and leaves application ids to open', () => {
    expect(desktopAction('$tile-vertical')).toEqual({
      kind: 'arrange-windows',
      mode: 'vertical',
    });
    expect(desktopAction('$arrange-icons')).toEqual({ kind: 'arrange-icons', byName: true });
    expect(desktopAction('$line-icons')).toEqual({ kind: 'arrange-icons', byName: false });
    expect(desktopAction('$pin:notepad')).toEqual({ kind: 'pin', id: 'notepad' });
    expect(desktopAction('$unpin:home')).toEqual({ kind: 'unpin', id: 'home' });
    expect(desktopAction('taskbar-settings')).toEqual({ kind: 'open', id: 'taskbar-settings' });
  });
});
