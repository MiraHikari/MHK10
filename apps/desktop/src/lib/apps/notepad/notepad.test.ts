import { describe, expect, it, vi } from 'vite-plus/test';
import type { SaveTextResult } from '../../os/files/save-request';
import { createFileSystem, type FileSystem } from '../../os/files/filesystem';
import { createDocuments } from '../../os/files/documents';
import { notepadApp } from './notepad.app';
import { appTestFixture, memoryStorage } from '../testing/app-test-fixture';

function editor(content = '', initial?: (files: FileSystem) => string) {
  const storage = memoryStorage();
  const files = createFileSystem(storage);
  files.writeText('diary', content);
  const documents = createDocuments(files);
  const id = initial?.(files) ?? 'diary';
  documents.requestOpen(id);
  let resolveSave!: (result: SaveTextResult) => void;
  const c = appTestFixture(
    notepadApp,
    {
      files,
      documents,
      saveText: vi.fn(
        () =>
          new Promise<SaveTextResult>((resolve) => {
            resolveSave = resolve;
          }),
      ),
    },
    { x: 0, y: 0, w: 330, h: 190 },
  );
  const finishSave = async (result: SaveTextResult) => {
    resolveSave(result);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    c.frame();
  };
  const close = async () => {
    const result = c.session.requestClose();
    await c.session.flushClose();
    return result;
  };
  return { ...c, files, storage, documents, id, finishSave, close };
}

describe('Notepad document lifecycle through its session', () => {
  it('waits for a publication body before editing or exporting its text', async () => {
    const body = Promise.withResolvers<string | undefined>();
    const files = createFileSystem(memoryStorage(), {
      library: {
        folders: [],
        files: [
          {
            id: 'publication',
            name: 'Article.txt',
            content: '',
            folder: 'root',
            source: 'personal',
            deleted: false,
            readonly: true,
          },
        ],
        readText: () => body.promise,
      },
    });
    const c = appTestFixture(notepadApp, { files, initialFileId: 'publication' });
    expect(c.session.status()).toBe('Loading Article.txt...');
    c.command('export-text');
    c.type('ignored while loading');
    expect(c.env.downloadText).not.toHaveBeenCalled();
    body.resolve('Published author text');
    await vi.waitFor(() => expect(c.session.status()).toContain('21 characters'));
    c.command('export-text');
    expect(c.env.downloadText).toHaveBeenCalledWith('Article.txt', 'Published author text');
    expect(files.get('publication')?.content).toBe('Published author text');
  });

  it('shows a failed publication read and retries without opening a blank document', async () => {
    const readText = vi
      .fn<() => Promise<string | undefined>>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce('Loaded after retry');
    const files = createFileSystem(memoryStorage(), {
      library: {
        folders: [],
        files: [
          {
            id: 'publication',
            name: 'Article.txt',
            content: '',
            folder: 'root',
            source: 'personal',
            deleted: false,
            readonly: true,
          },
        ],
        readText,
      },
    });
    const c = appTestFixture(notepadApp, { files, initialFileId: 'publication' });
    await vi.waitFor(() => expect(c.session.status()).toBe('The publication text is unavailable.'));
    c.command('export-text');
    expect(c.env.downloadText).not.toHaveBeenCalled();
    c.click('Retry');
    await vi.waitFor(() => expect(c.session.status()).toContain('18 characters'));
    expect(readText).toHaveBeenCalledTimes(2);
    c.command('export-text');
    expect(c.env.downloadText).toHaveBeenCalledWith('Article.txt', 'Loaded after retry');
  });

  it('ignores late publication text after switching documents or closing the editor', async () => {
    for (const change of ['switch', 'dispose']) {
      const body = Promise.withResolvers<string | undefined>();
      const files = createFileSystem(memoryStorage(), {
        library: {
          folders: [],
          files: [
            {
              id: 'publication',
              name: 'Article.txt',
              content: '',
              folder: 'root',
              source: 'personal',
              deleted: false,
              readonly: true,
            },
          ],
          readText: () => body.promise,
        },
      });
      const documents = createDocuments(files);
      documents.requestOpen('publication');
      const open = vi.spyOn(documents, 'open');
      const c = appTestFixture(notepadApp, { files, documents });
      if (change === 'switch') {
        documents.requestOpen('diary');
        c.frame();
      } else c.session.dispose();
      const opened = open.mock.calls.length;
      body.resolve('Late publication');
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(open).toHaveBeenCalledTimes(opened);
      if (change === 'switch') {
        c.command('export-text');
        expect(c.env.downloadText).toHaveBeenCalledWith('diary.txt', files.get('diary')!.content);
      }
    }
  });
  it('ignores restore confirmations after edits, a file switch, an external change or disposal', () => {
    for (const change of ['edit', 'switch', 'external', 'reset', 'dispose']) {
      const c = editor('original');
      c.command('restore');
      const confirmation = vi.mocked(c.env.msg).mock.calls.at(-1)![0];
      if (change === 'edit') c.type(' newer');
      if (change === 'switch') {
        const next = c.files.createText('next.txt', 'next').file!;
        c.documents.requestOpen(next.id);
        c.frame();
      }
      if (change === 'external') c.files.writeText('diary', 'external');
      if (change === 'reset') c.files.reset();
      if (change === 'dispose') c.session.dispose();
      confirmation.onBtn?.(0, c.env);
      if (change === 'dispose') {
        expect(c.files.get('diary')?.content).toBe('original');
      } else {
        c.command('export-text');
        expect(c.env.downloadText).toHaveBeenLastCalledWith(
          change === 'switch' ? 'next.txt' : 'diary.txt',
          change === 'edit'
            ? 'original newer'
            : change === 'switch'
              ? 'next'
              : c.files.get('diary')!.content,
        );
      }
    }
  });
  it('completes an accepted delayed paste before saving and closing', async () => {
    let finish!: (value: string) => void;
    vi.stubGlobal('navigator', {
      clipboard: {
        readText: () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          }),
      },
    });
    try {
      const c = editor('original');
      c.key('Paste');
      expect(c.session.prepareUnload()).toBe(false);
      const closing = c.close();
      finish(' pasted');
      expect(await closing).toBe(true);
      expect(c.files.get('diary')?.content).toBe('original pasted');
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it.each(['Save', 'SaveAs'])(
    'includes an accepted delayed paste in the following %s request',
    async (key) => {
      const clipboard = Promise.withResolvers<string>();
      vi.stubGlobal('navigator', { clipboard: { readText: () => clipboard.promise } });
      try {
        const c = editor('original');
        c.type(' edited');
        c.key('Paste');
        c.key(key);
        expect(c.files.get('diary')?.content).toBe('original');
        expect(c.env.saveText).not.toHaveBeenCalled();
        clipboard.resolve(' pasted');
        if (key === 'SaveAs') {
          await vi.waitFor(() => expect(c.env.saveText).toHaveBeenCalledOnce());
          const request = vi.mocked(c.env.saveText).mock.calls[0][0];
          expect(request.content).toBe('original edited pasted');
          const saved = c.files.saveTextAs('copy.txt', request.content, 'notes');
          await c.finishSave({ status: 'saved', file: saved.file!, persisted: saved.persisted });
          expect(c.files.get('diary')?.content).toBe('original');
        } else {
          await vi.waitFor(() =>
            expect(c.files.get('diary')?.content).toBe('original edited pasted'),
          );
        }
        c.command('export-text');
        expect(c.env.downloadText).toHaveBeenLastCalledWith(
          key === 'SaveAs' ? 'copy.txt' : 'diary.txt',
          'original edited pasted',
        );
        await vi.waitFor(() => expect(c.session.prepareUnload()).toBe(true));
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );
  it.each(['Save', 'SaveAs'])(
    'still rejects a paste after an external file change while %s waits',
    async (key) => {
      const clipboard = Promise.withResolvers<string>();
      vi.stubGlobal('navigator', { clipboard: { readText: () => clipboard.promise } });
      try {
        const c = editor('original');
        c.type(' local edits');
        c.key('Paste');
        c.key(key);
        c.files.writeText('diary', 'external edit');
        clipboard.resolve(' stale paste');
        if (key === 'SaveAs') {
          await vi.waitFor(() => expect(c.env.saveText).toHaveBeenCalledOnce());
          const request = vi.mocked(c.env.saveText).mock.calls[0][0];
          expect(request.content).toBe('original local edits');
          const saved = c.files.saveTextAs('copy.txt', request.content, 'notes');
          await c.finishSave({ status: 'saved', file: saved.file!, persisted: saved.persisted });
        } else {
          await vi.waitFor(() => expect(c.session.status()).toContain('File changed elsewhere'));
          expect(await c.close()).toBe(false);
        }
        expect(c.files.get('diary')?.content).toBe('external edit');
        c.command('export-text');
        expect(c.env.downloadText).toHaveBeenLastCalledWith(
          key === 'SaveAs' ? 'copy.txt' : 'diary.txt',
          'original local edits',
        );
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );
  it('waits for a Save As queued behind a paste before accepting close', async () => {
    const clipboard = Promise.withResolvers<string>();
    vi.stubGlobal('navigator', { clipboard: { readText: () => clipboard.promise } });
    try {
      const c = editor('original');
      c.key('Paste');
      c.key('SaveAs');
      const closing = c.close();
      clipboard.resolve(' pasted');
      await vi.waitFor(() => expect(c.env.saveText).toHaveBeenCalledOnce());
      expect(c.session.closed).toBe(false);
      const request = vi.mocked(c.env.saveText).mock.calls[0][0];
      expect(request.content).toBe('original pasted');
      const saved = c.files.saveTextAs('copy.txt', request.content, 'notes');
      await c.finishSave({ status: 'saved', file: saved.file!, persisted: saved.persisted });
      expect(await closing).toBe(true);
      expect(c.files.get(saved.file!.id)?.content).toBe('original pasted');
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('keeps the editor open when a Save As queued behind a paste is cancelled', async () => {
    const clipboard = Promise.withResolvers<string>();
    vi.stubGlobal('navigator', { clipboard: { readText: () => clipboard.promise } });
    try {
      const c = editor('original');
      c.key('Paste');
      c.key('SaveAs');
      const closing = c.close();
      clipboard.resolve(' pasted');
      await vi.waitFor(() => expect(c.env.saveText).toHaveBeenCalledOnce());
      await c.finishSave({ status: 'cancelled' });
      expect(await closing).toBe(false);
      expect(c.session.closed).toBe(false);
      expect(c.files.get('diary')?.content).toBe('original');
      c.command('export-text');
      expect(c.env.downloadText).toHaveBeenLastCalledWith('diary.txt', 'original pasted');
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it.each(['Save', 'SaveAs'])(
    'abandons a queued %s request when the document is reset before paste completes',
    async (key) => {
      const clipboard = Promise.withResolvers<string>();
      vi.stubGlobal('navigator', { clipboard: { readText: () => clipboard.promise } });
      try {
        const c = editor('original');
        c.key('Paste');
        c.key(key);
        c.files.reset();
        const revision = c.files.revision;
        clipboard.resolve(' stale paste');
        await vi.waitFor(() => expect(c.session.prepareUnload()).toBe(true));
        expect(c.files.revision).toBe(revision);
        expect(c.env.saveText).not.toHaveBeenCalled();
        c.command('export-text');
        expect(c.env.downloadText).toHaveBeenLastCalledWith(
          'diary.txt',
          c.files.get('diary')?.content,
        );
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );
  it('keeps a delayed Save As completion from resynchronizing a newly opened document', async () => {
    const c = editor('original');
    c.command('save-as');
    const request = vi.mocked(c.env.saveText).mock.calls[0][0];
    const next = c.files.createText('next.txt', 'next').file!;
    c.documents.requestOpen(next.id);
    c.frame();
    c.type(' newer');
    const saved = c.files.saveTextAs('copy.txt', request.content, 'notes');
    await c.finishSave({ status: 'saved', file: saved.file!, persisted: saved.persisted });
    c.command('export-text');
    expect(c.env.downloadText).toHaveBeenLastCalledWith('next.txt', 'next newer');
  });
  it('checkpoints repeated unload checks without duplicate writes, closing or messages', () => {
    const c = editor('draft');
    const write = vi.spyOn(c.files, 'writeText');
    c.type(' checkpoint');
    expect(c.session.prepareUnload()).toBe(true);
    expect(c.session.prepareUnload()).toBe(true);
    expect(write).toHaveBeenCalledOnce();
    expect(c.files.get('diary')?.content).toBe('draft checkpoint');
    expect(c.session.closed).toBe(false);
    expect(c.env.close).not.toHaveBeenCalled();
    expect(c.env.msg).not.toHaveBeenCalled();
  });
  it('refuses a failed unload checkpoint without opening an application dialog', () => {
    const c = editor();
    c.storage.setItem = () => {
      throw new Error('quota');
    };
    c.type('keep this');
    expect(c.session.prepareUnload()).toBe(false);
    expect(c.session.prepareUnload()).toBe(false);
    expect(c.files.exportData()).toContain('keep this');
    expect(c.env.msg).not.toHaveBeenCalled();
    expect(c.env.close).not.toHaveBeenCalled();
  });
  it('exports all accepted text even when browser storage is unavailable', () => {
    const c = editor('draft');
    c.storage.setItem = () => {
      throw new Error('quota');
    };
    c.input.queueInput({ typed: ' tail' });
    c.command('export-text');
    expect(c.env.downloadText).toHaveBeenCalledWith('diary.txt', 'draft tail');
  });
  it('processes queued text before an Exit menu command requests closing', async () => {
    const c = editor('draft');
    let closing: Promise<boolean> | undefined;
    vi.mocked(c.env.close).mockImplementation(() => {
      closing = c.session.requestClose();
    });
    c.input.queueInput({ typed: ' tail' });
    c.command('exit');
    expect(await closing).toBe(true);
    expect(c.files.get('diary')?.content).toBe('draft tail');
    expect(c.env.close).toHaveBeenCalledWith('notepad');
  });
  it('opens a requested document and saves its edits on close', async () => {
    const c = editor('', (files) => files.createText('notes.txt', 'before').file!.id);
    c.type(' after');
    expect(await c.close()).toBe(true);
    expect(c.files.get(c.id)?.content).toBe('before after');
  });
  it('saves the old document before opening a new request in the same session', () => {
    const c = editor();
    c.type('diary edit');
    const file = c.files.createText('second.txt', 'second').file!;
    c.documents.requestOpen(file.id);
    c.frame();
    expect(c.files.get('diary')?.content).toBe('diary edit');
    c.command('export-text');
    expect(c.env.downloadText).toHaveBeenLastCalledWith('second.txt', 'second');
  });
  it('vetoes closing a deleted document and permits saving a copy', async () => {
    const c = editor();
    c.type('keep this');
    c.files.remove('diary');
    expect(await c.close()).toBe(false);
    expect(c.env.msg).toHaveBeenCalledOnce();
    c.command('save-as');
    const request = vi.mocked(c.env.saveText).mock.calls[0][0];
    const saved = c.files.saveTextAs('rescued.txt', request.content, 'notes');
    await c.finishSave({ status: 'saved', file: saved.file!, persisted: saved.persisted });
    c.command('export-text');
    expect(c.env.downloadText).toHaveBeenLastCalledWith('rescued.txt', 'keep this');
    expect(await c.close()).toBe(true);
  });
  it('keeps failed disk writes open with an exportable session copy', async () => {
    const c = editor();
    c.storage.setItem = () => {
      throw new Error('quota');
    };
    c.type('session copy');
    expect(await c.close()).toBe(false);
    expect(c.files.get('diary')?.content).toBe('session copy');
    expect(c.session.status()).toContain('Session only');
    expect(c.files.exportData()).toContain('session copy');
  });
  it('does not resurrect old buffers after an explicitly confirmed reset', async () => {
    const c = editor();
    c.type('discard on reset');
    c.files.reset();
    c.frame();
    c.command('export-text');
    expect(c.env.downloadText).toHaveBeenLastCalledWith('diary.txt', c.files.get('diary')?.content);
    expect(c.files.get('diary')?.content).not.toBe('discard on reset');
    expect(await c.close()).toBe(true);
  });
  it('makes the Save shortcut and explicit menu save persist the same file', () => {
    const c = editor();
    c.type('keyboard');
    c.key('Save');
    expect(c.files.get('diary')?.content).toBe('keyboard');
    c.type(' menu');
    c.command('save');
    expect(c.files.get('diary')?.content).toBe('keyboard menu');
    expect(c.session.prepareUnload()).toBe(true);
  });
  it('applies batched text before Save and closes with the complete value', async () => {
    const c = editor('', (files) => files.createText('qa.txt', 'Q').file!.id);
    c.input.queueInput({ typed: 'A note with the final text' });
    c.input.queueInput({ key: 'Save' });
    const closing = c.session.requestClose();
    c.frame();
    expect(await closing).toBe(true);
    expect(c.files.get(c.id)?.content).toBe('QA note with the final text');
    c.frame();
    expect(c.files.get(c.id)?.content).toBe('QA note with the final text');
  });
  it('applies text before simultaneous explicit Save and shortcut without saving twice', () => {
    const c = editor('before');
    const revision = c.files.revision;
    c.input.queueInput({ typed: ' tail' });
    c.input.queueInput({ key: 'Save' });
    c.command('save');
    expect(c.files.get('diary')?.content).toBe('before tail');
    expect(c.files.revision).toBe(revision + 1);
  });
  it('keeps Undo precedence without reinserting input batched with the shortcut', () => {
    const c = editor('original');
    c.type(' added');
    c.input.queueInput({ typed: 'do not reinsert' });
    c.input.queueInput({ key: 'Undo' });
    c.key('Save');
    expect(c.files.get('diary')?.content).toBe('original');
    c.command('export-text');
    expect(c.env.downloadText).toHaveBeenLastCalledWith('diary.txt', 'original');
    expect(c.session.menus()?.Edit).toContainEqual(
      expect.objectContaining({ command: 'undo', disabled: true }),
    );
  });
  it('does not overwrite generated updates with an older unsaved buffer', async () => {
    const c = editor(
      '',
      (files) => files.saveGeneratedText('system-log', 'SYSTEM.LOG', '', 'story').file!.id,
    );
    c.type('my annotation');
    c.files.saveGeneratedText('system-log', 'SYSTEM.LOG', 'chapter 2', 'story');
    c.command('save');
    expect(c.files.get(c.id)?.content).toBe('chapter 2');
    expect(c.session.status()).toContain('changed elsewhere');
    expect(await c.close()).toBe(false);
    c.command('save-as');
    const request = vi.mocked(c.env.saveText).mock.calls[0][0];
    const saved = c.files.saveTextAs('annotation.txt', request.content, 'notes');
    await c.finishSave({ status: 'saved', file: saved.file!, persisted: saved.persisted });
    expect(saved.file?.content).toBe('my annotation');
    expect(c.files.get(c.id)?.content).toBe('chapter 2');
  });
  it('tracks external renames and permits edits after a deleted file is restored', () => {
    const c = editor();
    c.type('pending edit');
    c.files.rename('diary', 'renamed.txt');
    c.frame();
    expect(c.env.setTitle).toHaveBeenCalledWith('notepad', expect.stringContaining('renamed.txt'));
    c.files.remove('diary');
    c.frame();
    expect(c.session.status()).toContain('File deleted');
    c.files.restore('diary');
    c.frame();
    expect(c.session.status()).not.toContain('File deleted');
    c.command('save');
    expect(c.files.get('diary')?.content).toBe('pending edit');
    expect(c.session.prepareUnload()).toBe(true);
  });
  it('passes the complete text and current folder to Save As and adopts the saved location', async () => {
    const c = editor('', (files) => files.createText('note.txt', 'draft', 'notes').file!.id);
    c.input.queueInput({ typed: ' complete' });
    c.command('save-as');
    const request = vi.mocked(c.env.saveText).mock.calls[0][0];
    expect(request).toMatchObject({ name: 'note.txt', folder: 'notes', content: 'draft complete' });
    expect(c.input.io.typed).toBe('');
    const saved = c.files.saveTextAs('final.txt', request.content, 'evidence');
    await c.finishSave({ status: 'saved', file: saved.file!, persisted: saved.persisted });
    c.command('export-text');
    expect(c.env.downloadText).toHaveBeenLastCalledWith('final.txt', 'draft complete');
    expect(c.files.get(c.id)?.content).toBe('draft');
    expect(c.session.prepareUnload()).toBe(true);
  });
  it('does not replace newer editor state when an older Save As callback completes', async () => {
    const c = editor();
    c.type('snapshot');
    c.command('save-as');
    const request = vi.mocked(c.env.saveText).mock.calls[0][0];
    for (const _ of 'snapshot') c.key('Backspace');
    c.type('newer edits');
    const saved = c.files.saveTextAs('snapshot.txt', request.content, 'notes');
    await c.finishSave({ status: 'saved', file: saved.file!, persisted: saved.persisted });
    c.command('export-text');
    expect(c.env.downloadText).toHaveBeenLastCalledWith('diary.txt', 'newer edits');
    expect(c.files.get(saved.file!.id)?.content).toBe('snapshot');
  });
});

describe('Notepad editing commands', () => {
  it('keeps characters received with Find in the query and immediately edits after a text-area click', () => {
    const c = editor('hello');
    c.input.queueInput({ key: 'Find' });
    c.input.queueInput({ typed: 'query' });
    c.frame();
    c.clickAt(8, 10);
    c.type('X');
    c.command('export-text');
    expect(c.env.downloadText).toHaveBeenLastCalledWith('diary.txt', 'hXello');
  });
  it('routes the advertised Find and Save As shortcuts through the same editor actions', () => {
    const c = editor('hello');
    c.key('Find');
    c.type('HELLO');
    c.key('Enter');
    c.key('Delete');
    c.key('SaveAs');
    expect(vi.mocked(c.env.saveText).mock.calls[0][0]).toMatchObject({ content: '' });
  });
  it('rejects a delayed paste when the selection or external file changes before completion', async () => {
    for (const change of ['caret', 'external', 'reset']) {
      let finish!: (value: string) => void;
      vi.stubGlobal('navigator', {
        clipboard: {
          readText: () =>
            new Promise<string>((resolve) => {
              finish = resolve;
            }),
        },
      });
      try {
        const c = editor('original');
        c.key('Paste');
        if (change === 'caret') c.key('ArrowLeft');
        if (change === 'external') c.files.writeText('diary', 'external');
        if (change === 'reset') c.files.reset();
        finish('wrong target');
        await Promise.resolve();
        await Promise.resolve();
        c.command('export-text');
        expect(c.env.downloadText).toHaveBeenLastCalledWith(
          'diary.txt',
          change === 'caret' ? 'original' : c.files.get('diary')!.content,
        );
      } finally {
        vi.unstubAllGlobals();
      }
    }
  });
  it('returns from the find field to document editing on a text-area click', () => {
    const c = editor('hello');
    c.command('find');
    c.type('query');
    c.clickAt(8, 10);
    c.type('X');
    c.command('export-text');
    expect(c.env.downloadText).toHaveBeenLastCalledWith('diary.txt', 'hXello');
  });
  it('follows an unwrapped long-line caret while painting only the viewport', () => {
    const c = editor('a'.repeat(20000));
    c.command('word-wrap');
    c.text.mockClear();
    c.frame();
    const plain = c.text.mock.calls
      .map((call) => String(call[0]))
      .filter((line) => /^a+$/.test(line));
    expect(plain).toHaveLength(1);
    expect(plain[0].length).toBeLessThan(100);
    c.key('Home');
    c.type('START');
    c.key('Delete');
    c.command('export-text');
    expect(vi.mocked(c.env.downloadText).mock.calls.at(-1)?.[1]).toBe('a'.repeat(19999));
  });
  it('exposes edit commands and keeps the line and character status', () => {
    const c = editor('hello');
    const commands = (c.session.menus()?.Edit ?? []).flatMap((item) =>
      item === '-' ? [] : [item.command],
    );
    expect(commands).toEqual(
      expect.arrayContaining([
        'cut',
        'copy',
        'paste',
        'delete',
        'find',
        'find-next',
        'select-all',
        'insert-datetime',
      ]),
    );
    expect(c.session.menus()?.Format).toContainEqual(
      expect.objectContaining({ command: 'word-wrap', label: 'Word Wrap', checked: true }),
    );
    c.type('!');
    expect(c.session.status()).toMatch(/Modified \| Ln \d+ \| \d+ characters/);
  });

  it('cuts a selection through the shared clipboard and pastes it back', async () => {
    vi.stubGlobal('navigator', {});
    try {
      const c = editor('hello');
      c.key('SelectAll');
      c.key('Cut');
      await Promise.resolve();
      c.command('export-text');
      expect(c.env.downloadText).toHaveBeenLastCalledWith('diary.txt', '');
      c.key('Paste');
      await Promise.resolve();
      c.frame();
      c.command('export-text');
      expect(c.env.downloadText).toHaveBeenLastCalledWith('diary.txt', 'hello');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('deletes the next word when Ctrl+Left is held', () => {
    const c = editor('');
    c.type('hello world');
    c.input.io.keyDown.add('Control');
    c.key('ArrowLeft');
    c.key('Delete');
    c.command('export-text');
    expect(c.env.downloadText).toHaveBeenLastCalledWith('diary.txt', 'hello orld');
  });

  it('finds a case-insensitive match from the in-window field and repeats with F3', () => {
    const c = editor('one one');
    c.command('find');
    c.type('ONE');
    c.key('Enter');
    c.key('F3');
    c.key('Delete');
    c.command('export-text');
    expect(c.env.downloadText).toHaveBeenLastCalledWith('diary.txt', 'one ');
  });

  it('inserts the local date from F5', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 2, 3, 4, 5));
    try {
      const c = editor('');
      c.key('F5');
      c.command('export-text');
      expect(c.env.downloadText).toHaveBeenLastCalledWith('diary.txt', '2026-01-02 03:04');
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops wrapping lines when Word Wrap is turned off', () => {
    const c = editor('');
    const body = 'a'.repeat(80);
    c.type(body);
    c.text.mockClear();
    c.frame();
    const wrapped = c.text.mock.calls
      .map((call) => String(call[0]))
      .filter((line) => /^a+$/.test(line));
    expect(wrapped.length).toBeGreaterThan(1);
    expect(wrapped.join('')).toBe(body);
    c.text.mockClear();
    c.command('word-wrap');
    const plain = c.text.mock.calls
      .map((call) => String(call[0]))
      .filter((line) => /^a+$/.test(line));
    expect(plain).toHaveLength(1);
    expect(body).toContain(plain[0]);
    expect(c.session.status()).toMatch(/Ln 1 \| 80 characters/);
  });
});
