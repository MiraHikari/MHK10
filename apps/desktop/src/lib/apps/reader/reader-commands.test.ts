import { describe, expect, it } from 'vite-plus/test';
import { READER_COMMAND_IDS, readerIntent, type ReaderCommandView } from './reader-commands';

function view(overrides?: {
  focus?: boolean;
  sidebarHidden?: boolean;
  panelHidden?: Partial<ReaderCommandView['panelHidden']>;
}): ReaderCommandView {
  return {
    focus: overrides?.focus ?? false,
    sidebarHidden: overrides?.sidebarHidden ?? true,
    panelHidden: {
      contents: false,
      notebook: true,
      ...overrides?.panelHidden,
    },
  };
}

describe('Reader command intents', () => {
  it('maps every command id and leaves unknown ids unset', () => {
    const idle = view();
    expect(READER_COMMAND_IDS).toEqual([
      'jump',
      'contents',
      'notebook',
      'close-sidebar',
      'options',
      'focus',
      'close-options',
      'reset-options',
      'find',
      'close-find',
      'properties',
      'close-properties',
      'help',
      'close-help',
      'close-note',
      'previous',
      'next',
      'bookmark',
      'highlight',
      'note',
      'save-note',
      'copy-link',
      'copy-citation',
      'print',
      'export-book',
      'export-notebook',
      'backup-notebook',
      'import-notebook',
      'save-notes',
      'fullscreen',
    ]);
    expect(readerIntent('jump', idle)).toEqual({ type: 'open-navigation' });
    expect(readerIntent('contents', idle)).toEqual({ type: 'open-panel', panel: 'contents' });
    expect(readerIntent('notebook', idle)).toEqual({ type: 'open-panel', panel: 'notebook' });
    expect(readerIntent('find', idle)).toEqual({
      type: 'open-dialog',
      dialog: 'find',
      focus: 'query',
    });
    expect(readerIntent('close-help', idle)).toEqual({ type: 'close-dialog', dialog: 'help' });
    expect(readerIntent('previous', idle)).toEqual({ type: 'navigate', direction: -1 });
    expect(readerIntent('next', idle)).toEqual({ type: 'navigate', direction: 1 });
    expect(readerIntent('bookmark', idle)).toEqual({ type: 'bookmark' });
    expect(readerIntent('highlight', idle)).toEqual({ type: 'highlight' });
    expect(readerIntent('note', idle)).toEqual({ type: 'compose-note' });
    expect(readerIntent('copy-citation', idle)).toEqual({ type: 'copy', kind: 'citation' });
    expect(readerIntent('export-book', idle)).toEqual({ type: 'export', kind: 'book' });
    expect(readerIntent('export-notebook', idle)).toEqual({ type: 'export', kind: 'notebook' });
    expect(readerIntent('backup-notebook', idle)).toEqual({ type: 'export', kind: 'backup' });
    expect(readerIntent('save-notes', idle)).toEqual({ type: 'save-notes' });
    expect(readerIntent('fullscreen', idle)).toEqual({ type: 'fullscreen' });
    expect(readerIntent('not-a-command', idle)).toBeUndefined();
    for (const id of ['__proto__', 'constructor', 'toString', 'valueOf'])
      expect(readerIntent(id, idle)).toBeUndefined();
    for (const id of READER_COMMAND_IDS)
      expect(readerIntent(id, idle)?.type).toEqual(expect.any(String));
  });

  it('closes the visible panel and opens the other one, including while focus reading', () => {
    const openContents = view({ sidebarHidden: false, panelHidden: { contents: false } });
    expect(readerIntent('contents', openContents)).toEqual({ type: 'close-panel' });
    expect(readerIntent('notebook', openContents)).toEqual({
      type: 'open-panel',
      panel: 'notebook',
    });
    expect(readerIntent('close-sidebar', openContents)).toEqual({ type: 'close-panel' });
    expect(readerIntent('contents', { ...openContents, focus: true })).toEqual({
      type: 'open-panel',
      panel: 'contents',
    });
  });
});
