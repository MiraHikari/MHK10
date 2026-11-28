import { describe, expect, it, vi } from 'vite-plus/test';
import { createDocuments } from './documents';
import { createFileSystem, FILES_KEY, ORIGINAL_DIARY } from './filesystem';
import type { SaveTextResult } from './save-request';

function fixture() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const files = createFileSystem(storage),
    documents = createDocuments(files);
  return { files, documents, storage };
}
function picker() {
  let complete: (result: SaveTextResult) => void = () => {};
  const saveText = vi.fn(
    () =>
      new Promise<SaveTextResult>((resolve) => {
        complete = resolve;
      }),
  );
  return { saveText, complete: (result: SaveTextResult) => complete(result) };
}

describe('document sessions', () => {
  it('preserves drafts, file identities and epochs when a destructive reset cannot commit', () => {
    for (const reason of ['quota', 'conflict']) {
      const { files, documents, storage } = fixture();
      files.writeText('diary', 'saved work');
      const session = documents.open();
      session.edit('unsaved work');
      const epoch = files.epoch;
      const version = files.getVersion('diary');
      if (reason === 'quota')
        vi.spyOn(storage, 'setItem').mockImplementation(() => {
          throw new Error('quota');
        });
      else createFileSystem(storage).createText('remote.txt', 'remote work');
      const durable = storage.getItem(FILES_KEY);
      expect(files.reset()).toMatchObject({ ok: false, persisted: false });
      expect(files.epoch).toBe(epoch);
      expect(files.getVersion('diary')).toBe(version);
      expect(files.get('diary')?.content).toBe('saved work');
      expect(session.refresh()).toMatchObject({ content: 'unsaved work', dirty: true });
      expect(storage.getItem(FILES_KEY)).toBe(durable);
    }
  });
  it('isolates open requests between desktop sessions and consumes them once', () => {
    const { files, documents } = fixture(),
      other = createDocuments(files);
    documents.requestOpen('one');
    documents.requestOpen('two');
    expect(other.consumeOpen()).toBeUndefined();
    expect(documents.consumeOpen()).toBe('two');
    expect(documents.consumeOpen()).toBeUndefined();
  });
  it('rejects an old editing session without overwriting the newer saved document', () => {
    const { files, documents } = fixture(),
      first = documents.open(),
      second = documents.open();
    first.edit('first edit');
    second.edit('second edit');
    expect(first.save()).toMatchObject({ status: 'saved', persisted: true });
    expect(second.save()).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('changed elsewhere'),
    });
    expect(files.get('diary')?.content).toBe('first edit');
    expect(second.get().content).toBe('second edit');
  });
  it('reloads a clean editor but preserves dirty content across rename, delete and restore', () => {
    const { files, documents } = fixture(),
      session = documents.open(),
      version = session.get().version;
    files.writeText('diary', 'external');
    expect(session.refresh()).toMatchObject({ content: 'external', version: version + 1 });
    session.edit('my edits');
    files.rename('diary', 'renamed.txt');
    expect(session.refresh()).toMatchObject({
      name: 'renamed.txt',
      content: 'my edits',
      version: version + 1,
    });
    files.remove('diary');
    expect(session.save().status).toBe('failed');
    files.restore('diary');
    expect(session.refresh().notice).not.toContain('File deleted');
    expect(session.save().status).toBe('saved');
    expect(files.get('diary')?.content).toBe('my edits');
  });
  it('discards stale buffers on explicit reset and does not resurrect them on save', () => {
    const { files, documents } = fixture(),
      session = documents.open();
    session.edit('old');
    files.reset();
    session.edit('late old input');
    session.save();
    expect(session.get()).toMatchObject({ content: ORIGINAL_DIARY, dirty: false });
    expect(files.get('diary')?.content).toBe(ORIGINAL_DIARY);
  });
  it('keeps a failed disk write dirty and permits a later retry', () => {
    const { files, documents, storage } = fixture(),
      session = documents.open();
    vi.spyOn(storage, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota');
    });
    session.edit('keep me');
    expect(session.save()).toMatchObject({ status: 'saved', persisted: false });
    expect(session.get()).toMatchObject({ dirty: true, content: 'keep me' });
    expect(files.exportData()).toContain('keep me');
    expect(session.save()).toMatchObject({ status: 'saved', persisted: true });
    expect(session.get().dirty).toBe(false);
  });
  it('merges repeated Save As requests and adopts the completed copy', async () => {
    const { files, documents } = fixture(),
      session = documents.open(),
      save = picker();
    session.edit('copy');
    const operation = session.saveAs(save.saveText);
    expect(session.saveAs(save.saveText)).toBe(operation);
    expect(save.saveText).toHaveBeenCalledOnce();
    const result = files.saveTextAs('copy.txt', 'copy', 'notes');
    save.complete({ status: 'saved', file: result.file!, persisted: result.persisted });
    await operation;
    expect(session.get()).toMatchObject({
      fileId: result.file!.id,
      folder: 'notes',
      dirty: false,
      content: 'copy',
    });
  });
  it('keeps current edits when an older Save As completes', async () => {
    const { files, documents } = fixture(),
      session = documents.open(),
      save = picker();
    session.edit('snapshot');
    const operation = session.saveAs(save.saveText);
    session.edit('newer');
    const result = files.saveTextAs('copy.txt', 'snapshot');
    save.complete({ status: 'saved', file: result.file!, persisted: true });
    await operation;
    expect(session.get()).toMatchObject({ fileId: 'diary', content: 'newer', dirty: true });
    expect(session.get().notice).toContain('Current edits kept');
  });
  it('ignores Save As adoption after reset or document disposal', async () => {
    for (const dispose of [false, true]) {
      const { files, documents } = fixture(),
        session = documents.open(),
        save = picker();
      session.edit('old');
      const operation = session.saveAs(save.saveText);
      const result = files.saveTextAs('copy.txt', 'old');
      if (dispose) session.dispose();
      else files.reset();
      const before = session.get();
      save.complete({ status: 'saved', file: result.file!, persisted: true });
      await operation;
      if (dispose) expect(session.get()).toEqual(before);
      else
        expect(session.get()).toMatchObject({
          content: ORIGINAL_DIARY,
          dirty: false,
          fileId: 'diary',
        });
    }
  });
  it('does not adopt a saved copy that another writer changed before completion', async () => {
    const { files, documents } = fixture(),
      session = documents.open(),
      save = picker();
    session.edit('snapshot');
    const operation = session.saveAs(save.saveText);
    const result = files.saveTextAs('copy.txt', 'snapshot');
    files.writeText(result.file!.id, 'newer');
    save.complete({ status: 'saved', file: result.file!, persisted: true });
    await operation;
    expect(session.get()).toMatchObject({ fileId: 'diary', content: 'snapshot', dirty: true });
  });
  it('keeps edits on cancellation, explicit failure and rejected adapters', async () => {
    const { documents } = fixture(),
      session = documents.open();
    session.edit('draft');
    expect(await session.saveAs(async () => ({ status: 'cancelled' }))).toEqual({
      status: 'cancelled',
    });
    expect(await session.saveAs(async () => ({ status: 'failed', error: 'No space' }))).toEqual({
      status: 'failed',
      error: 'No space',
    });
    expect(
      await session.saveAs(() => {
        throw new Error('Picker unavailable');
      }),
    ).toEqual({ status: 'failed', error: 'Picker unavailable' });
    expect(session.get()).toMatchObject({
      content: 'draft',
      dirty: true,
      fileId: 'diary',
      notice: 'Picker unavailable',
    });
  });
});
