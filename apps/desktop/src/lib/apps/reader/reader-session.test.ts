import { describe, expect, it } from 'vite-plus/test';
import { ReaderSession } from './reader-session';
import type { ReaderState } from '@mhk/site-core/fusion/reading-model';

function harness(saved?: unknown) {
  let state = saved;
  let fail = false;
  let writes = 0;
  const timers = new Set<() => void>();
  const create = () =>
    new ReaderSession({
      storage: {
        read: () => state,
        write: (next: ReaderState) => {
          writes++;
          if (fail) throw new Error('Storage unavailable');
          state = structuredClone(next);
        },
      },
      now: () => 123,
      schedule: (callback, delay) => {
        expect(delay).toBe(200);
        timers.add(callback);
        return () => timers.delete(callback);
      },
    });
  return {
    create,
    fail: (next: boolean) => {
      fail = next;
    },
    writes: () => writes,
    timers,
    run: () => {
      const callbacks = [...timers];
      timers.clear();
      callbacks.forEach((callback) => callback());
    },
  };
}

function backup(text: string) {
  return JSON.stringify({
    format: 'mhk10-reader-notebook',
    version: 1,
    documents: {
      book: {
        progress: 0.2,
        anchor: 'chapter',
        lastOpened: 1,
        bookmarks: [],
        notes: [{ id: text, text, quote: '', progress: 0.2, anchor: 'chapter' }],
      },
    },
  });
}
function deferredFile() {
  let resolve!: (source: string) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<string>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { file: { size: 100, text: () => promise }, resolve, reject };
}

describe('ReaderSession ownership', () => {
  it('keeps scroll updates local while durable commands and storage notifications reconcile', () => {
    let reconciles = 0;
    let notify: (() => void) | undefined;
    const session = new ReaderSession({
      storage: {
        read: () => undefined,
        write: () => {},
        reconcile: (state) => {
          reconciles++;
          return state;
        },
        subscribe: (listener) => {
          notify = listener;
          return () => {
            notify = undefined;
          };
        },
      },
      now: () => 123,
      schedule: () => () => {},
    });
    session.open({ id: 'book', title: 'Book' });
    const initial = reconciles;
    for (let index = 0; index < 100; index++)
      session.command({ type: 'position', progress: index / 100, anchor: 'chapter' });
    expect(reconciles).toBe(initial);
    expect(session.snapshot().document?.progress).toBe(0.99);
    session.command({ type: 'bookmark', id: 'mark', label: 'Here', anchor: 'chapter' });
    expect(reconciles).toBe(initial + 1);
    notify?.();
    expect(reconciles).toBe(initial + 2);
    session.dispose();
  });
  it('rejects invalid import sizes and oversized source text before parsing', async () => {
    const session = harness().create();
    session.open({ id: 'book', title: 'Book' });
    session.command({ type: 'annotate', id: 'local', text: 'Local', quote: '', anchor: '' });
    for (const size of [-1, NaN, Infinity, 1.5]) {
      let read = false;
      expect(
        await session.import({
          size,
          text: async () => {
            read = true;
            return backup('Invalid');
          },
        }),
      ).toMatchObject({ status: 'failed' });
      expect(read).toBe(false);
    }
    expect(
      await session.import({ size: 1, text: async () => ' '.repeat(10 * 1024 * 1024 + 1) }),
    ).toMatchObject({ status: 'failed' });
    expect(session.snapshot().document?.notes.map((note) => note.text)).toEqual(['Local']);
    session.dispose();
  });
  it('ignores a cancelled save callback without losing ownership of the newer timer', () => {
    const storage = harness();
    const session = storage.create();
    session.open({ id: 'book', title: 'Book' });
    session.command({ type: 'configure', preferences: { zoom: 150 } });
    const stale = [...storage.timers][0];
    session.command({ type: 'configure', preferences: { zoom: 125 } });
    session.command({ type: 'position', progress: 0.8, anchor: 'chapter' });
    stale();
    expect(storage.writes()).toBe(1);
    expect(session.snapshot().pendingSave).toBe(true);
    expect(session.snapshot().document).toMatchObject({ progress: 0.8, anchor: 'chapter' });
    expect(session.snapshot().preferences.zoom).toBe(125);
    expect(storage.timers.size).toBe(1);
    session.dispose();
    expect(storage.timers.size).toBe(0);
  });

  it('keeps accepted notes and navigation after failed saving, then persists them on retry', () => {
    const storage = harness();
    const session = storage.create();
    session.open({ id: 'book', title: 'Book' });
    storage.fail(true);
    expect(
      session.command({
        type: 'annotate',
        id: 'one',
        quote: 'Quote',
        text: 'Keep me',
        anchor: 'chapter',
      }),
    ).toEqual({ status: 'applied' });
    session.command({ type: 'position', progress: 0.5, anchor: 'chapter', pages: 11 });
    expect(storage.timers.size).toBe(1);
    storage.run();
    expect(session.snapshot()).toMatchObject({
      pendingSave: true,
      page: 5,
      document: { progress: 0.5, notes: [{ text: 'Keep me' }] },
    });
    expect(session.snapshot('notebook').notebook.documents.book.notes[0].text).toBe('Keep me');
    storage.fail(false);
    expect(session.flush()).toEqual({ status: 'saved' });
    session.dispose();
    const remounted = storage.create();
    remounted.open({ id: 'book', title: 'Book' });
    expect(remounted.snapshot()).toMatchObject({
      pendingSave: false,
      document: { progress: 0.5, notes: [{ text: 'Keep me' }] },
    });
    remounted.dispose();
  });

  it('flushes the latest accepted edit once and freezes snapshots without exposing model state', () => {
    const storage = harness();
    const session = storage.create();
    session.open({ id: 'book', title: 'Book' });
    session.command({ type: 'annotate', id: 'note', quote: '', text: 'First', anchor: '' });
    session.command({ type: 'edit-note', id: 'note', text: 'Second' });
    session.command({ type: 'configure', preferences: { mode: 'pages', zoom: 150 } });
    expect(storage.timers.size).toBe(1);
    expect(session.flush()).toEqual({ status: 'saved' });
    expect(storage.timers.size).toBe(0);
    expect(storage.writes()).toBe(2);
    const snapshot = session.snapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.document?.notes[0])).toBe(true);
    expect(snapshot).toMatchObject({
      preferences: { mode: 'pages', zoom: 150 },
      document: { notes: [{ text: 'Second' }] },
    });
    session.dispose();
    session.dispose();
    expect(storage.writes()).toBe(2);
  });

  it('accepts only the latest import and keeps a merged notebook when persistence fails', async () => {
    const storage = harness();
    const session = storage.create();
    session.open({ id: 'book', title: 'Book' });
    session.command({ type: 'annotate', id: 'local', text: 'Local', quote: '', anchor: '' });
    const older = deferredFile();
    const newer = deferredFile();
    const oldResult = session.import(older.file);
    const newResult = session.import(newer.file);
    storage.fail(true);
    newer.resolve(backup('New'));
    expect(await newResult).toMatchObject({ status: 'imported', persisted: false, notes: 1 });
    older.resolve(backup('Old'));
    expect(await oldResult).toEqual({ status: 'ignored' });
    expect(session.snapshot().document?.notes.map((note) => note.text)).toEqual(['Local', 'New']);
    expect(session.snapshot().pendingSave).toBe(true);
    session.dispose();
  });

  it('invalidates late reads, failures and queued saves on dispose without saving implicitly', async () => {
    const storage = harness();
    const session = storage.create();
    session.open({ id: 'book', title: 'Book' });
    session.command({
      type: 'annotate',
      id: 'queued',
      quote: '',
      text: 'Queued',
      anchor: '',
    });
    session.command({ type: 'position', progress: 0.8 });
    const queuedSave = [...storage.timers][0];
    const pending = deferredFile();
    const result = session.import(pending.file);
    session.dispose();
    session.dispose();
    expect(storage.timers.size).toBe(0);
    queuedSave();
    pending.reject(new Error('Read failed late'));
    expect(await result).toEqual({ status: 'ignored' });
    expect(await session.import({ size: 100, text: async () => backup('No') })).toEqual({
      status: 'ignored',
    });
    expect(session.command({ type: 'page', page: 0 })).toEqual({ status: 'disposed' });
    expect(session.open({ id: 'other', title: 'Other' })).toEqual({ status: 'disposed' });
    expect(session.flush()).toEqual({ status: 'disposed' });
    expect(storage.writes()).toBe(1);
    const remounted = storage.create();
    remounted.open({ id: 'book', title: 'Book' });
    expect(remounted.snapshot().document?.progress).toBe(0);
    expect(remounted.snapshot().document?.notes).toEqual([]);
    remounted.dispose();
  });

  it('keeps scroll position in memory until flush or the next notebook save', () => {
    const storage = harness();
    const session = storage.create();
    session.open({ id: 'book', title: 'Book' });
    session.command({ type: 'position', progress: 0.2, anchor: 'one' });
    session.command({ type: 'position', progress: 0.4, anchor: 'two', pages: 5 });
    expect(storage.timers.size).toBe(0);
    expect(storage.writes()).toBe(1);
    expect(session.snapshot()).toMatchObject({
      pendingSave: false,
      page: 2,
      document: { progress: 0.4, anchor: 'two' },
    });
    storage.fail(true);
    expect(session.flush()).toEqual({ status: 'failed', error: 'Storage unavailable' });
    expect(session.snapshot()).toMatchObject({
      pendingSave: true,
      saveError: 'Storage unavailable',
    });
    expect(session.snapshot().document?.progress).toBe(0.4);
    storage.fail(false);
    expect(session.flush()).toEqual({ status: 'saved' });
    expect(storage.writes()).toBe(3);
    session.dispose();
    const remounted = storage.create();
    remounted.open({ id: 'book', title: 'Book' });
    expect(remounted.snapshot().document).toMatchObject({ progress: 0.4, anchor: 'two' });
    remounted.command({ type: 'position', progress: 0.8 });
    remounted.command({ type: 'bookmark', id: 'mark', label: 'Here', anchor: 'two' });
    expect(storage.timers.size).toBe(1);
    storage.run();
    expect(storage.writes()).toBe(5);
    remounted.dispose();
    const saved = storage.create();
    saved.open({ id: 'book', title: 'Book' });
    expect(saved.snapshot().document).toMatchObject({
      progress: 0.8,
      bookmarks: [{ label: 'Here' }],
    });
    saved.dispose();
  });

  it('keeps existing content when a newer import is unreadable or malformed', async () => {
    const session = harness().create();
    session.open({ id: 'book', title: 'Book' });
    session.command({ type: 'annotate', id: 'local', text: 'Local', quote: '', anchor: '' });
    const pending = deferredFile();
    const stale = session.import(pending.file);
    expect(await session.import({ size: 100, text: async () => '{broken' })).toMatchObject({
      status: 'failed',
    });
    pending.resolve(backup('Ignored'));
    expect(await stale).toEqual({ status: 'ignored' });
    expect(
      await session.import({ size: 11 * 1024 * 1024, text: async () => backup('Large') }),
    ).toMatchObject({ status: 'failed' });
    expect(session.snapshot().document?.notes.map((note) => note.text)).toEqual(['Local']);
    session.dispose();
  });
});
