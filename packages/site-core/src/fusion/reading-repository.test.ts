import { describe, expect, it, vi } from 'vite-plus/test';
import { ReaderModel, type ReaderState } from './reading-model';
import { createReadingRepository } from './reading-repository';
import { READER_STORAGE_KEY } from './reading-storage';

function notebook(): ReaderState {
  const model = new ReaderModel();
  model.open('book', 1, 'Book');
  model.annotate('note', '', 'Original');
  return model.serialize();
}

function memory(initial: string | null = null, key = READER_STORAGE_KEY) {
  const records = new Map<string, string>();
  if (initial !== null) records.set(key, initial);
  let writable = true;
  return {
    port: {
      getItem: (name: string) => records.get(name) ?? null,
      setItem: (name: string, value: string) => {
        if (writable) records.set(name, value);
      },
    },
    raw: (name = key) => records.get(name) ?? null,
    write: (value: string, name = key) => records.set(name, value),
    deny: () => {
      writable = false;
    },
    allow: () => {
      writable = true;
    },
  };
}
function noteText(raw: string | null): string | undefined {
  return raw ? JSON.parse(raw).documents.book.notes[0].text : undefined;
}

describe('reading repository', () => {
  it('reads a detached baseline and commits merged local edits to its key', () => {
    const storage = memory(JSON.stringify(notebook()));
    const notify = vi.fn();
    const repository = createReadingRepository({ port: storage.port, notify });
    const local = repository.read();
    local.preferences.focus = true;
    local.documents.book.notes[0].text = 'Updated';
    expect(noteText(storage.raw())).toBe('Original');
    const result = repository.commit(local);
    expect(result).toMatchObject({ ok: true, persisted: true });
    if (!result.ok) throw new Error(result.error);
    expect(result.state.documents.book.notes[0].text).toBe('Updated');
    expect(noteText(storage.raw())).toBe('Updated');
    expect(JSON.parse(storage.raw()!).preferences.focus).toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('honours a caller-selected legacy-compatible key', () => {
    const storage = memory(null, 'custom:reader');
    const repository = createReadingRepository({ port: storage.port, key: 'custom:reader' });
    const local = repository.read();
    local.preferences.focus = true;
    expect(repository.commit(local).ok).toBe(true);
    expect(storage.raw('custom:reader')).not.toBeNull();
    expect(storage.raw(READER_STORAGE_KEY)).toBeNull();
  });

  it('returns an error instead of throwing when the durable write is rejected', () => {
    const storage = memory(JSON.stringify(notebook()));
    const notify = vi.fn();
    const repository = createReadingRepository({ port: storage.port, notify });
    const local = repository.read();
    local.documents.book.notes[0].text = 'Session copy';
    storage.deny();
    const failed = repository.commit(local);
    expect(failed).toMatchObject({
      ok: false,
      error: expect.stringContaining('could not be saved'),
    });
    expect(notify).not.toHaveBeenCalled();
    expect(noteText(storage.raw())).toBe('Original');
    storage.allow();
    const saved = repository.commit(local);
    expect(saved.ok).toBe(true);
    expect(noteText(storage.raw())).toBe('Session copy');
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it.each(['{broken', '{"version":2,"documents":{}}'])(
    'keeps damaged records and exposes them for recovery: %s',
    (raw) => {
      const storage = memory(raw);
      const repository = createReadingRepository({ port: storage.port });
      expect(() => repository.read()).toThrow('Export a recovery backup');
      expect(repository.recovery()).toBe(raw);
      const result = repository.commit(notebook());
      expect(result).toMatchObject({
        ok: false,
        error: expect.stringContaining('Export a recovery backup'),
      });
      expect(storage.raw()).toBe(raw);
      // A repository that has not read yet must validate before replacing anything.
      const fresh = createReadingRepository({ port: storage.port });
      expect(fresh.commit(notebook()).ok).toBe(false);
      expect(fresh.recovery()).toBe(raw);
      expect(storage.raw()).toBe(raw);
      // A repaired notebook is readable again and no longer needs a recovery export.
      storage.write(JSON.stringify(notebook()));
      expect(repository.read().documents.book.notes[0].text).toBe('Original');
      expect(repository.recovery()).toBeUndefined();
    },
  );

  it('merges unrelated edits from two tabs and rejects a true conflict', () => {
    const storage = memory(JSON.stringify(notebook()));
    const first = createReadingRepository({ port: storage.port });
    const second = createReadingRepository({ port: storage.port });
    const one = first.read();
    const two = second.read();
    one.preferences.focus = true;
    expect(first.commit(one).ok).toBe(true);
    two.documents.book.notes[0].text = 'Second tab';
    expect(second.commit(two).ok).toBe(true);
    expect(JSON.parse(storage.raw()!)).toMatchObject({
      preferences: { focus: true },
      documents: { book: { notes: [{ text: 'Second tab' }] } },
    });

    const third = first.read();
    const fourth = second.read();
    third.documents.book.notes[0].text = 'First wins';
    expect(first.commit(third).ok).toBe(true);
    fourth.documents.book.notes[0].text = 'Second loses';
    expect(second.commit(fourth)).toMatchObject({
      ok: false,
      error: expect.stringContaining('changed elsewhere'),
    });
    expect(noteText(storage.raw())).toBe('First wins');
  });

  it('integrates peer edits without adopting them into the local commit baseline', () => {
    const storage = memory(JSON.stringify(notebook()));
    const notify = vi.fn();
    const repository = createReadingRepository({ port: storage.port, notify });
    const before = repository.read();
    const peer = structuredClone(before);
    peer.documents.book.notes[0].text = 'Peer edit';
    const integrated = repository.integrate(before, peer);
    expect(integrated).toMatchObject({ ok: true, persisted: true });
    expect(noteText(storage.raw())).toBe('Peer edit');
    expect(notify).toHaveBeenCalledTimes(1);

    // Integrating the durable copy again changes nothing and stays silent.
    expect(repository.integrate(before, structuredClone(before))).toMatchObject({
      ok: true,
      persisted: true,
    });
    expect(noteText(storage.raw())).toBe('Peer edit');
    expect(notify).toHaveBeenCalledTimes(1);

    // The local model still belongs to the pre-peer baseline. A commit with a
    // separate local edit must keep the peer's note, not revert it.
    const local = structuredClone(before);
    local.preferences.focus = true;
    expect(repository.commit(local).ok).toBe(true);
    expect(noteText(storage.raw())).toBe('Peer edit');
    expect(JSON.parse(storage.raw()!).preferences.focus).toBe(true);
  });

  it('reconciles without writing and adopts the remote copy as its baseline', () => {
    const storage = memory(JSON.stringify(notebook()));
    const notify = vi.fn();
    const repository = createReadingRepository({ port: storage.port, notify });
    const local = repository.read();
    const remote = structuredClone(local);
    remote.preferences.focus = true;
    const serialized = JSON.stringify(remote);
    storage.write(serialized);
    const merged = repository.reconcile(local);
    expect(merged.preferences.focus).toBe(true);
    expect(storage.raw()).toBe(serialized);
    expect(notify).not.toHaveBeenCalled();
    // The baseline now describes the remote copy, so a local reversion is a real edit.
    const reverted = structuredClone(merged);
    reverted.preferences.focus = false;
    expect(repository.commit(reverted).ok).toBe(true);
    expect(JSON.parse(storage.raw()!).preferences.focus).toBe(false);
  });

  it('delegates subscription and disposal to the injected port', () => {
    const storage = memory();
    const listeners = new Set<() => void>();
    const subscribe = vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    });
    const repository = createReadingRepository({ port: storage.port, subscribe });
    const listener = vi.fn();
    const stop = repository.subscribe(listener);
    expect(subscribe).toHaveBeenCalledTimes(1);
    for (const notify of listeners) notify();
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    expect(listeners.size).toBe(0);
    expect(createReadingRepository({ port: storage.port }).subscribe(listener)).toBeTypeOf(
      'function',
    );
  });
});
