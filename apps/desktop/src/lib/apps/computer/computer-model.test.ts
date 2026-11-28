import { describe, expect, it } from 'vite-plus/test';
import { createFileSystem, type FileStorage, type FolderId } from '../../os/files/filesystem';
import { createComputerModel, type ComputerBrowseCommand } from './computer-model';

function setup() {
  const records = new Map<string, string>();
  const storage: FileStorage = {
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => {
      records.set(key, value);
    },
    removeItem: (key) => {
      records.delete(key);
    },
  };
  const files = createFileSystem(storage);
  const model = createComputerModel(files);
  const command = (command: ComputerBrowseCommand) => model.dispatch({ type: 'command', command });
  const navigate = (folder: FolderId = 'root') =>
    model.dispatch({ type: 'navigate', path: 'documents', folder });
  const selected = () => model.entries()[model.state.sel];
  return { files, model, storage, command, navigate, selected };
}

describe('Computer browsing Interface', () => {
  it('preserves root destinations and projects extensions without changing file identities', () => {
    const { files, model } = setup();
    expect(model.entries().map((entry) => entry.label)).toEqual([
      'Personal Site',
      'Desktop',
      'My Documents',
      'Programs',
      'Control Panel',
      'Recycle Bin',
    ]);
    const file = files.createText('Report.txt', 'kept', 'notes').file!;
    const hidden = createComputerModel(files, { showFileExtensions: () => false });
    hidden.dispatch({ type: 'navigate', path: 'documents', folder: 'notes' });
    expect(hidden.entries()).toContainEqual(
      expect.objectContaining({ fileId: file.id, label: 'Report' }),
    );
    expect(files.get(file.id)?.name).toBe('Report.txt');
    expect(hidden.writable()).toBe(true);
    hidden.dispatch({ type: 'navigate', path: 'personal' });
    expect(hidden.writable()).toBe(false);
    expect(hidden.canModify(hidden.entries()[0])).toBe(false);
  });

  it('goes up through ancestors, restores history and discards the forward branch on navigation', () => {
    const { model, navigate, command } = setup();
    navigate('notes');
    expect(model.title()).toBe('My Documents\\Notes');
    command('up');
    expect(model.state).toMatchObject({ path: 'documents', folder: 'root' });
    command('up');
    expect(model.state.path).toBe('');
    command('back');
    expect(model.state).toMatchObject({ path: 'documents', folder: 'root', canForward: true });
    command('back');
    expect(model.state.folder).toBe('notes');
    command('forward');
    navigate('chat');
    expect(model.state.canForward).toBe(false);
    command('back');
    expect(model.state.folder).toBe('root');
  });

  it('bounds history to 32 destinations and ignores navigating to the current location', () => {
    const { model, navigate, command } = setup();
    for (let i = 0; i < 40; i++) navigate(i % 2 ? 'notes' : 'chat');
    navigate('notes');
    let back = 0;
    while (model.state.canBack) {
      command('back');
      back++;
    }
    expect(back).toBe(32);
    expect(model.state.canForward).toBe(true);
  });

  it('keeps folders first and the selected file stable across name, type and byte-size sorting', () => {
    const { files, model, navigate, command, selected } = setup();
    const small = files.createText('Item 10.txt', 'x', 'notes').file!;
    const large = files.createText('Item 2.txt', '中', 'notes').file!;
    files.createFolder('Z folder', 'notes');
    navigate('notes');
    model.dispatch({ type: 'select-entry', id: small.id });
    command('sort-name');
    expect(model.entries().map((entry) => entry.label)).toEqual([
      'Z folder',
      'Item 2.txt',
      'Item 10.txt',
    ]);
    expect(selected()?.fileId).toBe(small.id);
    command('sort-size');
    expect(
      model
        .entries()
        .map((entry) => entry.fileId)
        .slice(1),
    ).toEqual([small.id, large.id]);
    command('reverse-sort');
    expect(
      model
        .entries()
        .map((entry) => entry.fileId)
        .slice(1),
    ).toEqual([large.id, small.id]);
    command('sort-type');
    expect(selected()?.fileId).toBe(small.id);
    expect(model.entries()[0].folder).toBeDefined();
  });

  it('does not let sorting one session change a new session catalog order', () => {
    const { files, model, command } = setup();
    model.dispatch({ type: 'navigate', path: 'programs' });
    const original = model.entries().map((entry) => entry.open);
    command('sort-name');
    command('reverse-sort');
    const other = createComputerModel(files);
    other.dispatch({ type: 'navigate', path: 'programs' });
    expect(other.entries().map((entry) => entry.open)).toEqual(original);
    expect(other.state.sort).toBe('none');
  });

  it('keeps state projections detached while navigation and selection still use commands', () => {
    const { files, model, navigate } = setup();
    files.createText('Report.txt', 'kept', 'notes');
    const previous = model.state;
    expect(Reflect.set(previous, 'folder', 'notes')).toBe(false);
    expect(Reflect.set(previous, 'sel', 99)).toBe(false);
    expect(model.state).toMatchObject({ path: '', folder: 'root', sel: -1 });
    navigate('notes');
    model.dispatch({ type: 'select', index: 0 });
    expect(previous).toMatchObject({ path: '', folder: 'root', sel: -1, canBack: false });
    expect(model.state).toMatchObject({
      path: 'documents',
      folder: 'notes',
      sel: 0,
      canBack: true,
    });
  });

  it.each(['', 'programs', 'control', 'documents'] as const)(
    'keeps returned %s entries from changing either browsing session',
    (path) => {
      const { files, model } = setup();
      files.createText('Report.txt', 'kept');
      const other = createComputerModel(files);
      model.dispatch({ type: 'navigate', path });
      other.dispatch({ type: 'navigate', path });
      const before = other.entries();
      const entries = model.entries();
      expect(entries.length).toBeGreaterThan(0);
      expect(Reflect.set(entries[0], 'label', 'Changed by a view')).toBe(false);
      expect(Reflect.set(entries, '0', { label: 'Replacement', icon: 'i_bin' })).toBe(false);
      expect(model.entries()).toEqual(before);
      expect(other.entries()).toEqual(before);

      model.dispatch({ type: 'click', index: 0, at: 1, double: false });
      const result = model.dispatch({ type: 'click', index: 0, at: 1.2, double: true });
      expect(result.kind).toBe('activate');
      if (result.kind !== 'activate') throw new Error('Expected paired-click activation');
      expect(Reflect.set(result.entry, 'label', 'Changed by activation')).toBe(false);
      expect(result.entry).toEqual(before[0]);
      expect(model.entries()).toEqual(before);
      expect(other.entries()).toEqual(before);
    },
  );

  it('pairs double clicks by directory item and clears pairing after navigation or deselection', () => {
    const { model, navigate } = setup();
    const click = (index: number, at: number, double = true) =>
      model.dispatch({ type: 'click', index, at, double });
    expect(click(2, 1).kind).toBe('handled');
    expect(click(2, 1.2).kind).toBe('activate');
    navigate();
    expect(click(2, 1.3).kind).toBe('handled');
    model.dispatch({ type: 'select', index: -1 });
    expect(click(2, 1.4).kind).toBe('handled');
    expect(click(2, 2).kind).toBe('handled');
    expect(click(1, 2.1).kind).toBe('handled');
  });

  it('keeps keyboard selection visible and clamps paging and empty directories', () => {
    const { files, model, navigate, command } = setup();
    for (let i = 0; i < 12; i++) files.createText(`Item ${i}.txt`, '', 'notes');
    model.dispatch({ type: 'viewport', rows: 4 });
    navigate('notes');
    command('End');
    expect(model.state).toMatchObject({ sel: 11, top: 8 });
    command('PageUp');
    expect(model.state).toMatchObject({ sel: 7, top: 7 });
    command('Home');
    expect(model.state).toMatchObject({ sel: 0, top: 0 });
    model.dispatch({ type: 'scroll', delta: 99 });
    expect(model.state.top).toBe(8);
    navigate('chat');
    command('ArrowUp');
    expect(model.state).toMatchObject({ sel: -1, top: 0 });
  });

  it('uses timed type-ahead and resets the query on navigation', () => {
    const { files, model, navigate, selected } = setup();
    files.createText('Alpha.txt', '', 'notes');
    files.createText('Beta.txt', '', 'notes');
    navigate('notes');
    model.dispatch({ type: 'search', text: 'b', at: 1 });
    model.dispatch({ type: 'search', text: 'e', at: 1.2 });
    expect(selected()?.label).toBe('Beta.txt');
    model.dispatch({ type: 'search', text: 'a', at: 2.1 });
    expect(selected()?.label).toBe('Alpha.txt');
    navigate();
    model.dispatch({ type: 'search', text: 'c', at: 2.2 });
    expect(selected()?.folder).toBe('chat');
  });

  it('reconciles deleted folders and clears history and selection after a filesystem reset', () => {
    const { files, model, navigate, command } = setup();
    const created = files.createFolder('Temporary');
    if (!created.ok) throw new Error(created.error);
    navigate(created.folder.id);
    files.removeFolder(created.folder.id);
    expect(model.dispatch({ type: 'reconcile' })).toEqual({
      kind: 'reset',
      reason: 'missing-folder',
    });
    expect(model.state).toMatchObject({ folder: 'root', sel: -1 });
    navigate('notes');
    command('back');
    files.reset();
    expect(model.dispatch({ type: 'reconcile' })).toEqual({ kind: 'reset', reason: 'epoch' });
    expect(model.state).toMatchObject({ sel: -1, canBack: false, canForward: false });
  });

  it('preserves session-only persistence notices and returns file failures to its caller', () => {
    const { files, model, storage, navigate } = setup();
    navigate('notes');
    storage.setItem = () => {
      throw new Error('quota');
    };
    const result = files.createText('Unsaved.txt', '', 'notes');
    expect(result).toMatchObject({ ok: true, persisted: false });
    expect(model.dispatch({ type: 'report', result })).toEqual({ kind: 'handled' });
    expect(model.state.notice).toContain('Session only');
    expect(
      model.dispatch({ type: 'report', result: { ok: false, error: 'Read-only folder.' } }),
    ).toEqual({ kind: 'failed', message: 'Read-only folder.' });
    expect(model.state.notice).toBe('Read-only folder.');
    expect(model.dispatch({ type: 'report', result: { ok: false } })).toEqual({
      kind: 'failed',
      message: 'The operation could not be completed.',
    });
  });
});
