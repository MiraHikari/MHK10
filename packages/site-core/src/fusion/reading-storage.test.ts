import { describe, expect, it } from 'vite-plus/test';
import { ReaderModel } from './reading-model';
import {
  createReaderStorage,
  READER_STORAGE_KEY,
  SHARED_READING_STORAGE_KEY,
} from './reading-storage';

function notebook() {
  const model = new ReaderModel();
  model.open('book', 1, 'Book');
  model.annotate('note', '', 'Original');
  return model.serialize();
}
function port(initial: string | null = null) {
  let raw = initial;
  let writable = true;
  return {
    getItem: (_key: string) => raw,
    setItem: (_key: string, value: string) => {
      if (writable) raw = value;
    },
    repair: (value: string) => {
      raw = value;
    },
    deny: () => {
      writable = false;
    },
    allow: () => {
      writable = true;
    },
  };
}
describe('shared notebook storage Interface', () => {
  it('preserves the existing keys independently of the host presentation', () => {
    expect(READER_STORAGE_KEY).toBe('doom95.reader.v2');
    expect(SHARED_READING_STORAGE_KEY).toBe('mirahikari-portfolio:visitor:reader-v1');
  });
  it('does not accept a silently rejected write as the new durable baseline', () => {
    const storage = port(JSON.stringify(notebook()));
    let notifications = 0;
    const session = createReaderStorage(storage, () => {
      notifications++;
    });
    const local = session.read();
    local.documents.book.notes[0].text = 'Session copy';
    storage.deny();
    expect(() => session.write(local)).toThrow('could not be saved');
    expect(notifications).toBe(0);
    expect(JSON.parse(storage.getItem(READER_STORAGE_KEY)!).documents.book.notes[0].text).toBe(
      'Original',
    );
    storage.allow();
    expect(session.write(local).documents.book.notes[0].text).toBe('Session copy');
    expect(notifications).toBe(1);
  });
  it.each(['{broken', '{"version":2,"documents":{}}'])(
    'preserves unreadable records while retaining a recovery export: %s',
    (raw) => {
      const storage = port(raw);
      const session = createReaderStorage(storage);
      expect(() => session.read()).toThrow('Export a recovery backup');
      expect(session.recovery?.()).toBe(raw);
      expect(() => session.write(notebook())).toThrow('Export a recovery backup');
      expect(storage.getItem(READER_STORAGE_KEY)).toBe(raw);
    },
  );
  it('reconciles a stale session before a subsequent independent edit', () => {
    const storage = port(JSON.stringify(notebook()));
    const first = createReaderStorage(storage);
    const second = createReaderStorage(storage);
    const own = first.read();
    const remote = second.read();
    remote.preferences.focus = true;
    second.write(remote);
    const refreshed = first.reconcile(own);
    refreshed.documents.book.notes[0].text = 'My edit';
    const saved = first.write(refreshed);
    expect(saved.preferences.focus).toBe(true);
    expect(saved.documents.book.notes[0].text).toBe('My edit');
  });
  it('keeps refusing writes after damage even when the record is repaired externally', () => {
    const storage = port('{broken');
    const session = createReaderStorage(storage);
    expect(() => session.read()).toThrow('Export a recovery backup');
    expect(session.recovery?.()).toBe('{broken');
    storage.repair(JSON.stringify(notebook()));
    expect(() => session.write(notebook())).toThrow('damaged or uses a newer format');
    expect(JSON.parse(storage.getItem(READER_STORAGE_KEY)!).documents.book.notes[0].text).toBe(
      'Original',
    );
  });
  it('sets the same one-way guard when reconciliation encounters damage', () => {
    const storage = port('{broken');
    const session = createReaderStorage(storage);
    expect(() => session.reconcile(notebook())).toThrow('Export a recovery backup');
    storage.repair(JSON.stringify(notebook()));
    expect(() => session.write(notebook())).toThrow('damaged or uses a newer format');
  });
  it('keeps caller-selected keys and returns detached copies', () => {
    const records = new Map<string, string>();
    const storage = {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => void records.set(key, value),
    };
    const session = createReaderStorage(storage, undefined, SHARED_READING_STORAGE_KEY);
    expect(session.write(notebook()).documents.book.notes[0].text).toBe('Original');
    expect(records.has(READER_STORAGE_KEY)).toBe(false);
    expect(records.has(SHARED_READING_STORAGE_KEY)).toBe(true);
    const copy = session.read();
    copy.documents.book.notes[0].text = 'Local only';
    expect(session.read().documents.book.notes[0].text).toBe('Original');
  });
});
