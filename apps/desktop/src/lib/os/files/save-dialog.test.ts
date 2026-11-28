import { describe, expect, it, vi } from 'vite-plus/test';
import { createFileSystem, type FileSystem } from './filesystem';
import type { SaveTextRequest, SaveTextResult } from './save-request';
import { createSaveDialogApp } from './save-dialog';
import { appTestFixture, memoryStorage } from '../../apps/testing/app-test-fixture';

function fixture(sharedFiles?: FileSystem, request: Partial<SaveTextRequest> = {}) {
  const storage = memoryStorage();
  const files = sharedFiles ?? createFileSystem(storage);
  const onSave = vi.fn<(result: SaveTextResult) => void>();
  const app = createSaveDialogApp(
    { name: 'note.txt', content: 'Saved text', folder: 'notes', ...request },
    onSave,
    files,
  );
  const c = appTestFixture(app, { files }, { x: 0, y: 0, w: 396, h: 242 });
  vi.mocked(c.env.close).mockImplementation(() => {
    void c.session.requestClose();
  });
  const save = () => c.click('Save');
  const confirmation = () => vi.mocked(c.env.msg).mock.calls.at(-1)![0];
  const folder = () => {
    c.text.mockClear();
    c.frame();
    return c.text.mock.calls.find(([text]) => String(text).endsWith('  v'))?.[0];
  };
  return {
    ...c,
    files,
    storage,
    onSave,
    save,
    confirmation,
    folder,
    up: () => c.clickAt(375, 15),
    clickRow: (row: number) => c.clickAt(30, 48 + row * 20),
  };
}

describe('Save As picker through its session', () => {
  it('refuses old overwrite confirmations after changing the name or folder', () => {
    for (const change of ['name', 'folder']) {
      const c = fixture();
      const old = c.files.createText('note.txt', 'Old text', 'notes').file!;
      c.save();
      const confirmation = c.confirmation();
      if (change === 'name') c.fillAt(90, 167, 'changed.txt');
      else c.up();
      confirmation.onBtn?.(0, c.env);
      expect(c.files.get(old.id)?.content).toBe('Old text');
      expect(c.files.findByName('changed.txt', 'notes')).toBeUndefined();
      expect(c.files.findByName('note.txt', 'root')).toBeUndefined();
      expect(c.onSave).not.toHaveBeenCalled();
      expect(c.session.status()).toContain('destination changed');
    }
  });
  it('allows only the newest overwrite confirmation to save', () => {
    const c = fixture();
    const old = c.files.createText('note.txt', 'Old text', 'notes').file!;
    c.save();
    const first = c.confirmation();
    c.save();
    const second = c.confirmation();
    first.onBtn?.(0, c.env);
    expect(c.files.get(old.id)?.content).toBe('Old text');
    second.onBtn?.(0, c.env);
    expect(c.files.get(old.id)?.content).toBe('Saved text');
    expect(c.onSave).toHaveBeenCalledOnce();
  });
  it('moves up exactly one parent from a nested visitor folder', () => {
    const files = createFileSystem(memoryStorage());
    const parent = files.createFolder('Project', 'notes');
    if (!parent.ok) throw new Error(parent.error);
    const child = files.createFolder('Drafts', parent.folder.id);
    if (!child.ok) throw new Error(child.error);
    const c = fixture(files, { folder: child.folder.id });
    c.up();
    c.save();
    expect(files.findByName('note.txt', parent.folder.id)?.content).toBe('Saved text');
    expect(files.findByName('note.txt', 'root')).toBeUndefined();
  });
  it('navigates into a custom folder and saves through the picker', () => {
    const files = createFileSystem(memoryStorage());
    const created = files.createFolder('Radio Projects');
    if (!created.ok) throw new Error(created.error);
    const c = fixture(files);
    c.up();
    c.clickRow(3);
    c.clickRow(3);
    c.save();
    expect(c.onSave).toHaveBeenCalledWith({
      status: 'saved',
      persisted: true,
      file: expect.objectContaining({ name: 'note.txt', folder: created.folder.id }),
    });
  });
  it.each(['Save', 'Cancel'])(
    'stays usable for %s after cancelling repeated unload attempts',
    async (action) => {
      const c = fixture();
      expect(c.session.prepareUnload()).toBe(false);
      expect(c.session.prepareUnload()).toBe(false);
      expect(c.onSave).not.toHaveBeenCalled();
      expect(c.session.closed).toBe(false);
      c.click(action);
      await c.session.flushClose();
      expect(c.onSave).toHaveBeenCalledOnce();
      expect(c.session.closed).toBe(true);
      expect(c.onSave).toHaveBeenCalledWith(
        action === 'Save'
          ? {
              status: 'saved',
              persisted: true,
              file: expect.objectContaining({ name: 'note.txt', content: 'Saved text' }),
            }
          : { status: 'cancelled' },
      );
    },
  );
  it('completes cancellation once on close and idempotent disposal without creating a file', async () => {
    const c = fixture();
    const closing = c.session.requestClose();
    await c.session.flushClose();
    await closing;
    c.session.dispose();
    c.session.dispose();
    c.frame();
    expect(c.onSave).toHaveBeenCalledExactlyOnceWith({ status: 'cancelled' });
    expect(c.files.list('documents', 'notes')).toHaveLength(0);
  });
  it('retains failed persistence for retry without creating duplicates', () => {
    const c = fixture();
    vi.spyOn(c.storage, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota');
    });
    c.save();
    const first = c.files.findByName('note.txt', 'notes')!;
    expect(first.content).toBe('Saved text');
    expect(c.session.status()).toContain('Storage unavailable');
    expect(c.onSave).not.toHaveBeenCalled();
    expect(c.env.close).not.toHaveBeenCalled();
    c.save();
    expect(c.files.list('documents', 'notes')).toHaveLength(1);
    expect(c.onSave).toHaveBeenCalledExactlyOnceWith({
      status: 'saved',
      persisted: true,
      file: expect.objectContaining({ id: first.id }),
    });
    expect(c.env.msg).not.toHaveBeenCalled();
  });
  it('shows export and reload recovery when another tab changed the files', () => {
    const c = fixture();
    createFileSystem(c.storage).createText('remote.txt', 'newer work');
    c.save();
    expect(c.onSave).not.toHaveBeenCalled();
    expect(c.session.status()).toContain('another tab');
    expect(c.session.status()).toContain('export your edits, then reload');
    expect(createFileSystem(c.storage).findByName('remote.txt')?.content).toBe('newer work');
  });
  it('does not overwrite newer edits while retrying failed persistence', () => {
    const c = fixture();
    vi.spyOn(c.storage, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota');
    });
    c.save();
    const first = c.files.findByName('note.txt', 'notes')!;
    c.files.writeText(first.id, 'newer');
    c.save();
    expect(c.files.get(first.id)?.content).toBe('newer');
    expect(c.onSave).not.toHaveBeenCalled();
    expect(c.session.status()).toContain('changed');
    c.save();
    expect(c.env.msg).toHaveBeenCalledOnce();
  });
  it('does not resurrect pending saves after a documents reset', () => {
    const c = fixture();
    c.files.createText('note.txt', 'old', 'notes');
    c.save();
    const confirmation = c.confirmation();
    c.files.reset();
    confirmation.onBtn?.(0, c.env);
    expect(c.files.list('documents', 'notes')).toHaveLength(0);
    expect(c.onSave).not.toHaveBeenCalled();
    c.save();
    expect(c.session.status()).toContain('reset');
  });
  it('keeps independently constructed request contents separate', () => {
    const first = fixture(undefined, { content: 'first' });
    const second = fixture(first.files, { name: 'second.txt', content: 'second' });
    first.save();
    second.save();
    expect(first.onSave).toHaveBeenCalledWith({
      status: 'saved',
      persisted: true,
      file: expect.objectContaining({ content: 'first' }),
    });
    expect(second.onSave).toHaveBeenCalledWith({
      status: 'saved',
      persisted: true,
      file: expect.objectContaining({ content: 'second' }),
    });
  });
  it('starts with the entire filename selected for replacement', () => {
    const c = fixture();
    c.frame();
    c.type('replacement.txt');
    c.save();
    expect(c.onSave).toHaveBeenCalledWith({
      status: 'saved',
      persisted: true,
      file: expect.objectContaining({ name: 'replacement.txt' }),
    });
  });
  it('saves in the chosen folder without replacing a same-name file elsewhere', () => {
    const c = fixture();
    c.files.createText('note.txt', 'Root text');
    c.save();
    expect(c.files.findByName('note.txt', 'notes')?.content).toBe('Saved text');
    expect(c.files.findByName('note.txt', 'root')?.content).toBe('Root text');
    expect(c.env.close).toHaveBeenCalledWith('$saveas');
  });
  it('requires overwrite confirmation and respects cancellation', () => {
    const c = fixture();
    const old = c.files.createText('note.txt', 'Old text', 'notes').file!;
    c.save();
    expect(c.files.get(old.id)?.content).toBe('Old text');
    expect(c.confirmation().def).toBe(1);
    c.confirmation().onBtn?.(1, c.env);
    expect(c.onSave).not.toHaveBeenCalled();
    c.save();
    c.confirmation().onBtn?.(0, c.env);
    expect(c.files.get(old.id)?.content).toBe('Saved text');
  });
  it('refuses an overwrite when a file changes after the confirmation appeared', () => {
    const c = fixture();
    const old = c.files.createText('note.txt', 'Old text', 'notes').file!;
    c.save();
    c.files.writeText(old.id, 'Newer work');
    c.confirmation().onBtn?.(0, c.env);
    expect(c.files.get(old.id)?.content).toBe('Newer work');
    expect(c.session.status()).toContain('changed');
    expect(c.onSave).not.toHaveBeenCalled();
  });
  it('ignores queued Enter while another modal has focus', () => {
    const c = fixture();
    c.view.focused = false;
    c.key('Enter');
    expect(c.files.findByName('note.txt', 'notes')).toBeUndefined();
  });
  it('leaves the source untouched on Cancel and keeps invalid names open', () => {
    const cancelled = fixture();
    cancelled.click('Cancel');
    expect(cancelled.files.list('documents', 'notes')).toHaveLength(0);
    const c = fixture();
    c.frame();
    c.type('../bad');
    c.save();
    expect(c.env.close).not.toHaveBeenCalled();
    expect(c.onSave).not.toHaveBeenCalled();
    expect(c.session.status()).not.toBe('Ready');
  });
  it('selects a Save in folder using arrows and Enter without saving', () => {
    const c = fixture();
    c.click('Notes  v');
    c.key('ArrowDown');
    c.frame();
    c.key('Enter');
    expect(c.folder()).toBe('Chat Logs  v');
    expect(c.input.io.keyPressed.has('Enter')).toBe(false);
    expect(c.onSave).not.toHaveBeenCalled();
    expect(c.files.list('documents', 'chat')).toHaveLength(0);
  });
  it('closes only the dropdown on Escape and closes the dialog on the next Escape', () => {
    const c = fixture();
    c.click('Notes  v');
    c.key('ArrowDown');
    c.key('Escape');
    expect(c.folder()).toBe('Notes  v');
    expect(c.input.io.keyPressed.has('Escape')).toBe(false);
    expect(c.env.close).not.toHaveBeenCalled();
    c.key('Escape');
    expect(c.env.close).toHaveBeenCalledExactlyOnceWith('$saveas');
  });
  it('swallows an outside Save click while dismissing the dropdown', () => {
    const c = fixture();
    c.click('Notes  v');
    c.clickAt(350, 165);
    expect(c.onSave).not.toHaveBeenCalled();
    expect(c.files.list('documents', 'notes')).toHaveLength(0);
    c.save();
    expect(c.onSave).toHaveBeenCalledOnce();
  });
  it('requires paired folder clicks and does not pass the double click to a file', () => {
    const c = fixture(undefined, { folder: 'root' });
    c.files.createText('existing.txt', 'original', 'notes');
    c.clickRow(0);
    expect(c.folder()).toBe('My Documents  v');
    c.clickRow(0);
    expect(c.folder()).toBe('Notes  v');
    c.clickRow(0);
    expect(c.onSave).not.toHaveBeenCalled();
    expect(c.env.msg).not.toHaveBeenCalled();
    c.clickRow(0);
    expect(c.files.findByName('existing.txt', 'notes')?.content).toBe('original');
    expect(c.onSave).not.toHaveBeenCalled();
    c.save();
    expect(c.confirmation().lines[0]).toBe('existing.txt');
  });
  it('uses list Enter to navigate and filename Enter to save', () => {
    const c = fixture(undefined, { folder: 'root' });
    c.clickRow(0);
    c.key('Enter');
    expect(c.folder()).toBe('Notes  v');
    expect(c.onSave).not.toHaveBeenCalled();
    expect(c.input.io.keyPressed.has('Enter')).toBe(false);
    c.clickAt(90, 167);
    c.key('Enter');
    expect(c.onSave).toHaveBeenCalledWith({
      status: 'saved',
      persisted: true,
      file: expect.objectContaining({ folder: 'notes' }),
    });
  });
  it('ignores dropdown and list navigation while unfocused', () => {
    const c = fixture();
    c.click('Notes  v');
    c.view.focused = false;
    c.input.queueInput({ key: 'ArrowDown' });
    c.key('Enter');
    expect(c.folder()).toBe('Notes  v');
    expect(c.onSave).not.toHaveBeenCalled();
    c.view.focused = true;
    c.save();
    expect(c.onSave).toHaveBeenCalledWith({
      status: 'saved',
      persisted: true,
      file: expect.objectContaining({ name: 'note.txt', folder: 'notes' }),
    });
  });
});
