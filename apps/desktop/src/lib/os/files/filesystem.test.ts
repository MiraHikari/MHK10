import { describe, expect, it, vi } from 'vite-plus/test';
import { createFileSystem, FILES_KEY, ORIGINAL_DIARY } from './filesystem';

function memory(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
describe('visitor file system', () => {
  it('persists custom folders and file membership without changing legacy identities', () => {
    const storage = memory(),
      files = createFileSystem(storage),
      created = files.createFolder('Radio Projects');
    expect(created).toMatchObject({ ok: true, persisted: true });
    if (!created.ok) throw new Error(created.error);
    const id = created.folder.id;
    const note = files.createText('parts.txt', '1 crystal', id).file!;
    expect(files.renameFolder(id, 'Radio Bench')).toMatchObject({ ok: true });
    const loaded = createFileSystem(storage);
    expect(loaded.folderName(id)).toBe('Radio Bench');
    expect(loaded.list('documents', id)).toMatchObject([{ id: note.id, content: '1 crystal' }]);
    expect(loaded.get('diary')?.name).toBe('diary.txt');
    expect(JSON.parse(loaded.exportData())).toMatchObject({
      version: 1,
      folders: [{ id, name: 'Radio Bench' }],
    });
    const copy = loaded.folders().find((folder) => folder.id === id)!;
    copy.name = 'External mutation';
    expect(loaded.folderName(id)).toBe('Radio Bench');
  });
  it('validates folder names, gives default folders unique names and resets them with documents', () => {
    const files = createFileSystem(memory());
    expect(files.createFolder('Notes')).toMatchObject({ ok: false });
    expect(files.createFolder('../bad')).toMatchObject({ ok: false });
    expect(files.createText('bad.txt', '', 'folder:unknown')).toMatchObject({ ok: false });
    expect(files.createFolder()).toMatchObject({ ok: true, folder: { name: 'New Folder' } });
    expect(files.createFolder()).toMatchObject({ ok: true, folder: { name: 'New Folder (2)' } });
    const before = files.epoch;
    files.reset();
    expect(files.epoch).toBe(before + 1);
    expect(files.folders()).toHaveLength(5);
  });
  it('preserves folder changes in a session when a newer tab blocks persistence', () => {
    const storage = memory(),
      earlier = createFileSystem(storage),
      newer = createFileSystem(storage);
    newer.createFolder('Saved elsewhere');
    expect(earlier.createFolder('Keep this session')).toMatchObject({ ok: true, persisted: false });
    expect(earlier.folders().map((folder) => folder.name)).toContain('Keep this session');
    expect(
      createFileSystem(storage)
        .folders()
        .map((folder) => folder.name),
    ).toContain('Saved elsewhere');
    expect(
      createFileSystem(storage)
        .folders()
        .map((folder) => folder.name),
    ).not.toContain('Keep this session');
  });
  it('preserves malformed folder snapshots for export instead of overwriting them', () => {
    const raw = JSON.stringify({
      version: 1,
      folders: [{ id: 'root', name: 'Impostor' }],
      files: [],
    });
    const storage = memory({ [FILES_KEY]: raw }),
      files = createFileSystem(storage);
    expect(files.createFolder('Session only')).toMatchObject({ ok: true, persisted: false });
    expect(storage.getItem(FILES_KEY)).toBe(raw);
    expect(files.exportData()).toContain('recoveryRaw');
  });
  it('does not erase files another tab created after this session opened', () => {
    const storage = memory(),
      firstTab = createFileSystem(storage),
      secondTab = createFileSystem(storage);
    const created = firstTab.createText('first-tab.txt', 'must survive').file!;
    const write = vi.spyOn(storage, 'setItem');
    const result = secondTab.createText('second-tab.txt', 'keep this draft');
    expect(result).toMatchObject({ ok: true, persisted: false });
    expect(secondTab.notice).toContain('another tab');
    expect(secondTab.notice).toContain('export your edits, then reload');
    expect(secondTab.exportData()).toContain('keep this draft');
    expect(write).not.toHaveBeenCalled();
    const reloaded = createFileSystem(storage);
    expect(reloaded.get(created.id)?.content).toBe('must survive');
    expect(reloaded.findByName('second-tab.txt')).toBeUndefined();
    // Repeated attempts cannot silently approve the stale session's contents.
    expect(secondTab.writeText('diary', 'another attempt').persisted).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });
  it('preserves the newer stored edit when another tab saves the same document', () => {
    const storage = memory(),
      firstTab = createFileSystem(storage),
      secondTab = createFileSystem(storage);
    firstTab.writeText('diary', 'newer saved edit');
    expect(secondTab.writeText('diary', 'older tab draft')).toMatchObject({
      ok: true,
      persisted: false,
    });
    expect(secondTab.get('diary')?.content).toBe('older tab draft');
    expect(createFileSystem(storage).get('diary')?.content).toBe('newer saved edit');
  });
  it('keeps edits in memory when storage cannot be read and permits retry when it returns', () => {
    const storage = memory(),
      fs = createFileSystem(storage);
    fs.writeText('diary', 'stored');
    const stored = storage.getItem(FILES_KEY),
      write = vi.spyOn(storage, 'setItem');
    vi.spyOn(storage, 'getItem').mockImplementationOnce(() => {
      throw new Error('read blocked');
    });
    expect(fs.writeText('diary', 'retry me')).toMatchObject({ ok: true, persisted: false });
    expect(fs.get('diary')?.content).toBe('retry me');
    expect(write).not.toHaveBeenCalled();
    expect(storage.getItem(FILES_KEY)).toBe(stored);
    expect(fs.writeText('diary', 'retry me').persisted).toBe(true);
    expect(createFileSystem(storage).get('diary')?.content).toBe('retry me');
  });
  it('does not trust mutable result objects as live files or storage baselines', () => {
    const storage = memory(),
      fs = createFileSystem(storage);
    const result = fs.createText('original.txt', 'original');
    const id = result.file!.id;
    result.file!.content = 'injected';
    result.file!.name = 'changed.txt';
    expect(fs.writeText('diary', 'next write').persisted).toBe(true);
    expect(createFileSystem(storage).get(id)).toMatchObject({
      name: 'original.txt',
      content: 'original',
    });
    expect(JSON.parse(storage.getItem(FILES_KEY)!).version).toBe(1);
  });
  it('commits generated identity, content and revision exactly once per command', () => {
    const storage = memory(),
      write = vi.spyOn(storage, 'setItem'),
      fs = createFileSystem(storage);
    const first = fs.saveGeneratedText('log', 'SYSTEM.LOG', 'first', 'story');
    expect(first.file).toMatchObject({ source: 'story', generatedKey: 'log', content: 'first' });
    expect(write).toHaveBeenCalledTimes(1);
    expect(fs.revision).toBe(1);
    const reloaded = createFileSystem(storage);
    expect(reloaded.saveGeneratedText('log', 'SYSTEM.LOG', 'second', 'story').file?.id).toBe(
      first.file?.id,
    );
    expect(write).toHaveBeenCalledTimes(2);
    expect(reloaded.revision).toBe(1);
    expect(reloaded.list('documents', 'evidence')).toHaveLength(1);
  });
  it('retains the previous complete generated record after a failed update and reload', () => {
    const storage = memory(),
      fs = createFileSystem(storage);
    const first = fs.saveGeneratedText('log', 'SYSTEM.LOG', 'first', 'story').file!;
    vi.spyOn(storage, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota');
    });
    expect(fs.saveGeneratedText('log', 'SYSTEM.LOG', 'second', 'story').persisted).toBe(false);
    const reloaded = createFileSystem(storage);
    expect(reloaded.get(first.id)).toMatchObject({ content: 'first', generatedKey: 'log' });
    expect(reloaded.saveGeneratedText('log', 'SYSTEM.LOG', 'retry', 'story').file?.id).toBe(
      first.id,
    );
    expect(reloaded.list('documents', 'evidence')).toHaveLength(1);
  });
  it('rejects stale expected versions without mutating or persisting a file', () => {
    const storage = memory(),
      fs = createFileSystem(storage),
      version = fs.getVersion('diary');
    fs.writeText('diary', 'newer');
    const write = vi.spyOn(storage, 'setItem'),
      revision = fs.revision;
    expect(fs.writeText('diary', 'stale', { expectedVersion: version }).ok).toBe(false);
    expect(fs.get('diary')?.content).toBe('newer');
    expect(fs.revision).toBe(revision);
    expect(write).not.toHaveBeenCalled();
  });
  it('creates, edits and renames text that survives a new session', () => {
    const storage = memory(),
      fs = createFileSystem(storage);
    const result = fs.createText('Notes.txt', 'first');
    expect(result.ok).toBe(true);
    expect(result.persisted).toBe(true);
    expect(fs.writeText(result.file!.id, 'Hello\n世界').ok).toBe(true);
    expect(fs.rename(result.file!.id, 'Readme.txt').ok).toBe(true);
    expect(createFileSystem(storage).get(result.file!.id)).toMatchObject({
      name: 'Readme.txt',
      content: 'Hello\n世界',
    });
  });
  it('preserves the legacy diary and keeps unrelated browser data', () => {
    const storage = memory({ 'doom95.diary.v1': 'My old diary', unrelated: 'keep' });
    const fs = createFileSystem(storage);
    expect(fs.get('diary')?.content).toBe('My old diary');
    fs.newText();
    expect(createFileSystem(storage).get('diary')?.content).toBe('My old diary');
    fs.reset();
    expect(storage.getItem('unrelated')).toBe('keep');
    expect(storage.getItem('doom95.diary.v1')).toBeNull();
    expect(createFileSystem(storage).get('diary')?.content).toBe(ORIGINAL_DIARY);
  });
  it('exposes immutable personal links and rejects all write operations on them', () => {
    const fs = createFileSystem(memory());
    expect(fs.list('personal').map((file) => file.appId)).toEqual([
      'profile',
      'blog',
      'gallery',
      'skills',
    ]);
    const link = fs.list('personal')[0];
    link.name = 'Changed';
    expect(fs.list('personal')[0].name).toBe('MiraHikari');
    expect(fs.list('personal')[0].id).toBe('personal:about');
    expect(fs.writeText(link.id, 'bad').ok).toBe(false);
    expect(fs.rename(link.id, 'bad').ok).toBe(false);
    expect(fs.remove(link.id).ok).toBe(false);
    expect(fs.exportData()).not.toContain('personal:');
  });
  it('retains oversized legacy diaries in the export instead of silently truncating the backup', () => {
    const diary = 'x'.repeat(20001),
      storage = memory({ 'doom95.diary.v1': diary }),
      fs = createFileSystem(storage);
    expect(fs.notice).toContain('too large');
    expect(fs.newText().persisted).toBe(false);
    expect(JSON.parse(JSON.parse(fs.exportData()).recoveryRaw).legacyDiary).toBe(diary);
    expect(storage.getItem('doom95.diary.v1')).toBe(diary);
    expect(storage.getItem(FILES_KEY)).toBeNull();
  });
  it('rejects invalid names, case-insensitive duplicates and oversized text', () => {
    const fs = createFileSystem(memory());
    for (const name of ['', '../x', 'a/b', 'a\\b', 'nul\0.txt', '.', 'file.', 'a'.repeat(65)])
      expect(fs.createText(name).ok).toBe(false);
    expect(fs.createText('DIARY.TXT').ok).toBe(false);
    expect(fs.createText('long.txt', 'a'.repeat(20001)).ok).toBe(false);
    expect(fs.writeText('diary', 'a'.repeat(20001)).ok).toBe(false);
    expect(fs.createText('boundary.txt', 'a'.repeat(20000)).ok).toBe(true);
  });
  it('deletes and restores with a collision-safe filename and intact content', () => {
    const fs = createFileSystem(memory()),
      id = fs.createText('report.txt', 'old').file!.id;
    fs.remove(id);
    fs.createText('report.txt', 'new');
    fs.createText('report (2).txt');
    expect(fs.list('bin')).toHaveLength(1);
    expect(fs.writeText(id, 'changed').ok).toBe(false);
    expect(fs.restore(id).file).toMatchObject({
      name: 'report (3).txt',
      content: 'old',
      deleted: false,
    });
    expect(fs.list('bin')).toHaveLength(0);
    expect(fs.restore(id).ok).toBe(false);
  });
  it('permanently empties only deleted files and persists the result', () => {
    const storage = memory(),
      fs = createFileSystem(storage),
      id = fs.newText().file!.id;
    fs.remove(id);
    fs.emptyBin();
    expect(fs.get(id)).toBeUndefined();
    expect(fs.restore(id).ok).toBe(false);
    expect(createFileSystem(storage).list('documents')).toHaveLength(1);
    expect(createFileSystem(storage).list('bin')).toHaveLength(0);
  });
  it('keeps collision-restored names valid at the 64-character boundary', () => {
    const storage = memory(),
      fs = createFileSystem(storage),
      name = `a.${'b'.repeat(62)}`;
    const id = fs.createText(name, 'kept').file!.id;
    fs.remove(id);
    fs.createText(name);
    const restored = fs.restore(id).file!;
    expect(restored.name.length).toBeLessThanOrEqual(64);
    expect(restored.name).not.toBe(name);
    expect(createFileSystem(storage).get(id)?.content).toBe('kept');
  });
  it('continues in memory and reports storage failures without claiming persistence', () => {
    const fs = createFileSystem({
      getItem: () => null,
      setItem: () => {
        throw new Error('Quota');
      },
      removeItem: () => {},
    });
    const result = fs.createText('session.txt', 'do not lose');
    expect(result).toMatchObject({ ok: true, persisted: false });
    expect(fs.notice).toContain('Session only');
    expect(fs.get(result.file!.id)?.content).toBe('do not lose');
    expect(fs.exportData()).toContain('do not lose');
    expect(createFileSystem(null).notice).toContain('Storage unavailable');
  });
  it('preserves a corrupt snapshot for export and only overwrites it on reset', () => {
    const storage = memory({ [FILES_KEY]: '{broken' }),
      fs = createFileSystem(storage);
    expect(fs.notice).toContain('damaged');
    expect(fs.newText().persisted).toBe(false);
    expect(storage.getItem(FILES_KEY)).toBe('{broken');
    expect(JSON.parse(fs.exportData()).recoveryRaw).toBe('{broken');
    fs.reset();
    expect(fs.epoch).toBe(1);
    expect(fs.persisted).toBe(true);
    expect(createFileSystem(storage).get('diary')?.content).toBe(ORIGINAL_DIARY);
  });
  it('rejects malformed entries, duplicate ids and injected personal files', () => {
    const good = {
      id: 'a',
      name: 'a.txt',
      content: 'a',
      source: 'visitor',
      readonly: false,
      deleted: false,
    };
    for (const files of [
      [{ ...good, content: null }],
      [good, { ...good, name: 'b.txt' }],
      [{ ...good, id: 'personal:about' }],
      [{ ...good, readonly: true }],
      [{ ...good, appId: 'about' }],
    ]) {
      const storage = memory({ [FILES_KEY]: JSON.stringify({ version: 1, files }) });
      expect(createFileSystem(storage).notice).toContain('damaged');
    }
  });
  it('keeps exports detached from live state', () => {
    const fs = createFileSystem(memory());
    const doc = fs.get('diary')!;
    doc.content = 'change';
    fs.list('documents')[0].name = 'change';
    expect(fs.get('diary')).toMatchObject({ name: 'diary.txt', content: ORIGINAL_DIARY });
  });
  it('updates generated documents by key without overwriting visitor filenames', () => {
    const fs = createFileSystem(memory());
    fs.createText('chat.txt', 'private', 'chat');
    const saved = fs.saveGeneratedText('conversation-1', 'chat.txt', 'hello', 'chat');
    expect(saved.file?.name).toBe('chat (2).txt');
    expect(fs.saveGeneratedText('conversation-1', 'chat.txt', 'hello again', 'chat').file?.id).toBe(
      saved.file?.id,
    );
    expect(fs.get(saved.file!.id)?.content).toBe('hello again');
    fs.remove(saved.file!.id);
    expect(fs.saveGeneratedText('conversation-1', 'chat.txt', 'surprise', 'chat').ok).toBe(false);
    expect(fs.list('documents', 'chat').find((file) => file.name === 'chat.txt')?.content).toBe(
      'private',
    );
  });
  it('limits total files including the bin and frees capacity after emptying it', () => {
    const fs = createFileSystem(memory());
    for (let i = 0; i < 199; i++) expect(fs.createText(`note-${i}.txt`).ok).toBe(true);
    expect(fs.newText().ok).toBe(false);
    fs.remove('diary');
    expect(fs.newText().ok).toBe(false);
    fs.emptyBin();
    expect(fs.newText().ok).toBe(true);
  });
  it('allows the same filename in different folders and scopes rename collisions', () => {
    const fs = createFileSystem(memory());
    const root = fs.createText('note.txt', 'root').file!,
      note = fs.createText('note.txt', 'notes', 'notes').file!;
    expect(fs.list('documents', 'notes').map((file) => file.id)).toEqual([note.id]);
    expect(fs.list('documents').some((file) => file.id === root.id)).toBe(true);
    expect(fs.createText('NOTE.TXT', '', 'notes').ok).toBe(false);
    expect(fs.rename(note.id, 'diary.txt').ok).toBe(true);
    expect(fs.get(note.id)?.folder).toBe('notes');
  });
  it('moves files without changing identity and refuses same-folder name collisions', () => {
    const storage = memory(),
      fs = createFileSystem(storage);
    const file = fs.createText('move.txt', 'kept').file!;
    fs.createText('move.txt', 'other', 'notes');
    expect(fs.move(file.id, 'notes').ok).toBe(false);
    expect(fs.get(file.id)?.folder).toBe('root');
    expect(fs.move(file.id, 'evidence').ok).toBe(true);
    expect(createFileSystem(storage).get(file.id)).toMatchObject({
      folder: 'evidence',
      content: 'kept',
    });
    expect(fs.move('personal:about', 'notes').ok).toBe(false);
  });
  it('restores into the original directory and resolves only collisions there', () => {
    const fs = createFileSystem(memory()),
      file = fs.createText('note.txt', 'original', 'notes').file!;
    fs.remove(file.id);
    fs.createText('note.txt', '', 'root');
    expect(fs.restore(file.id).file).toMatchObject({ folder: 'notes', name: 'note.txt' });
    fs.remove(file.id);
    fs.createText('note.txt', '', 'notes');
    expect(fs.restore(file.id).file).toMatchObject({
      folder: 'notes',
      name: 'note (2).txt',
      content: 'original',
    });
  });
  it('migrates older flat saves by source without losing content or deleted files', () => {
    const item = { name: 'same.txt', content: 'kept', readonly: false, deleted: false };
    const storage = memory({
      [FILES_KEY]: JSON.stringify({
        version: 1,
        files: [
          { ...item, id: 'visitor', source: 'visitor' },
          { ...item, id: 'chat', source: 'chat', generatedKey: 'conversation' },
          { ...item, id: 'story', source: 'story', generatedKey: 'log', deleted: true },
        ],
      }),
    });
    const fs = createFileSystem(storage);
    expect(fs.get('visitor')?.folder).toBe('root');
    expect(fs.get('chat')?.folder).toBe('chat');
    expect(fs.get('story')?.folder).toBe('evidence');
    expect(fs.list('bin')[0].content).toBe('kept');
    fs.writeText('visitor', 'new');
    expect(createFileSystem(storage).get('chat')?.folder).toBe('chat');
  });
  it('creates generated chat and story files in their folders and preserves later moves', () => {
    const fs = createFileSystem(memory());
    const chat = fs.saveGeneratedText('chat', 'chat.txt', 'one', 'chat').file!;
    expect(chat.folder).toBe('chat');
    expect(fs.saveGeneratedText('log', 'SYSTEM.LOG', 'one', 'story').file?.folder).toBe('evidence');
    fs.move(chat.id, 'notes');
    expect(fs.saveGeneratedText('chat', 'chat.txt', 'two', 'chat').file).toMatchObject({
      id: chat.id,
      folder: 'notes',
      content: 'two',
    });
  });
  it('requires an explicit still-matching overwrite target for Save As', () => {
    const fs = createFileSystem(memory()),
      file = fs.createText('note.txt', 'old', 'notes').file!;
    expect(fs.saveTextAs('note.txt', 'unconfirmed', 'notes').ok).toBe(false);
    expect(fs.get(file.id)?.content).toBe('old');
    expect(
      fs.saveTextAs('NOTE.TXT', 'confirmed', 'notes', { overwriteId: file.id }).file?.content,
    ).toBe('confirmed');
    expect(fs.saveTextAs('note.txt', 'wrong folder', 'root', { overwriteId: file.id }).ok).toBe(
      false,
    );
    fs.rename(file.id, 'renamed.txt');
    expect(fs.saveTextAs('note.txt', 'stale target', 'notes', { overwriteId: file.id }).ok).toBe(
      false,
    );
    expect(fs.findByName('renamed.TXT', 'notes')?.id).toBe(file.id);
    expect(fs.saveTextAs('fresh.txt', 'new', 'evidence').file?.folder).toBe('evidence');
  });
});
