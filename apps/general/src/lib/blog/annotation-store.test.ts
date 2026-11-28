import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { addArticleNote, notesForArticle, removeArticleNote } from './annotation-store';
import { ReaderModel, type ReaderState } from '@mhk/site-core/fusion/reading-model';
import { READING_LIMITS } from '@mhk/site-core/fusion/reading-limits';
import { SHARED_READING_STORAGE_KEY } from '@mhk/site-core/fusion/reading-storage';
import { readSharedReading } from '@mhk/site-core/fusion/browser-reading';

function harness(state?: ReaderState) {
  const records = new Map<string, string>();
  if (state) records.set(SHARED_READING_STORAGE_KEY, JSON.stringify(state));
  let writable = true;
  vi.stubGlobal(
    'window',
    Object.assign(new EventTarget(), {
      localStorage: {
        getItem: (key: string) => records.get(key) ?? null,
        setItem: (key: string, value: string) => {
          if (writable) records.set(key, value);
        },
      },
    }),
  );
  return {
    records,
    deny: () => {
      writable = false;
    },
  };
}
const input = { id: 'new-note', quote: 'Quote', block: { block: 1, start: 2, end: 7 } };

describe('article annotation storage', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('adds and removes only one id while preserving non-renderable notes and position', () => {
    const model = new ReaderModel();
    model.open('article', 1);
    model.position(0.6, 'chapter');
    model.annotate('long', 'x'.repeat(2000), 'Long');
    model.annotate('text', '', 'Text only');
    model.annotate('cross', 'end of one\nstart of two', 'Cross block');
    model.annotate('missing', 'Quote no longer present', 'Still mine', '', 99);
    harness(model.serialize());
    const before = notesForArticle('article');
    expect(addArticleNote('article', input)).toEqual({ status: 'saved' });
    expect(notesForArticle('article').at(-1)).toMatchObject({
      block: input.block,
      progress: 0.6,
      anchor: 'chapter',
    });
    expect(notesForArticle('article').at(-1)).not.toHaveProperty('offset');
    expect(removeArticleNote('article', input.id)).toEqual({ status: 'saved' });
    expect(notesForArticle('article')).toEqual(before);
    expect(readSharedReading().documents.article.progress).toBe(0.6);
  });
  it('keeps a full notebook unchanged and exposes a blocked write', () => {
    const model = new ReaderModel();
    model.open('article', 1);
    for (let i = 0; i < 128; i++) model.annotate(`note-${i}`, '', `Keep ${i}`);
    const host = harness(model.serialize());
    const before = host.records.get(SHARED_READING_STORAGE_KEY);
    expect(addArticleNote('article', input)).toEqual({ status: 'rejected', reason: 'capacity' });
    expect(host.records.get(SHARED_READING_STORAGE_KEY)).toBe(before);
    host.deny();
    expect(removeArticleNote('article', 'note-0')).toEqual({ status: 'failed' });
    expect(notesForArticle('article')).toHaveLength(128);
  });
  it('preserves every existing note record, including records that still carry an offset', () => {
    const model = new ReaderModel();
    model.open('article', 1);
    model.annotate('general-old', 'Quote', 'Keep', '', 2);
    model.annotate('desktop', 'Quote', 'Global offset', '', 2);
    harness(model.serialize());
    const before = notesForArticle('article');
    expect(before).toHaveLength(2);
    expect(addArticleNote('article', input)).toEqual({ status: 'saved' });
    const after = notesForArticle('article');
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.at(-1)?.id).toBe(input.id);
    // The store no longer repairs or rewrites historical records on open.
    expect(after.find((note) => note.id === 'general-old')).toHaveProperty('offset', 2);
    expect(after.find((note) => note.id === 'desktop')).toHaveProperty('offset', 2);
  });
  it('maps shared command rejections for duplicates and invalid records', () => {
    harness();
    expect(addArticleNote('article', input)).toEqual({ status: 'saved' });
    expect(addArticleNote('article', input)).toEqual({
      status: 'rejected',
      reason: 'duplicate',
    });
    expect(addArticleNote('article', { ...input, id: 'empty', quote: '' })).toEqual({
      status: 'rejected',
      reason: 'invalid',
    });
    expect(
      addArticleNote('article', {
        ...input,
        id: 'bad-block',
        block: { block: 0, start: 2, end: 1 },
      }),
    ).toEqual({ status: 'rejected', reason: 'invalid' });
    expect(addArticleNote('article', { ...input, id: 'long', quote: 'x'.repeat(3001) })).toEqual({
      status: 'rejected',
      reason: 'invalid',
    });
    expect(removeArticleNote('article', 'missing')).toEqual({ status: 'saved' });
    expect(notesForArticle('article').map((note) => note.id)).toEqual([input.id]);
  });
  it('rejects invalid notes before reading damaged storage', () => {
    const host = harness();
    host.records.set(SHARED_READING_STORAGE_KEY, '{broken');
    expect(addArticleNote('article', { id: '', quote: 'Quote', block: input.block })).toEqual({
      status: 'rejected',
      reason: 'invalid',
    });
    expect(
      addArticleNote('article', {
        ...input,
        quote: 'q'.repeat(READING_LIMITS.quote + 1),
      }),
    ).toEqual({ status: 'rejected', reason: 'invalid' });
    expect(
      addArticleNote('article', {
        ...input,
        block: { block: 0, start: 2, end: 1 },
      }),
    ).toEqual({ status: 'rejected', reason: 'invalid' });
    expect(host.records.get(SHARED_READING_STORAGE_KEY)).toBe('{broken');
  });
  it('rejects a quote beyond the reading limit while accepting a valid note', () => {
    harness();
    const oversized = 'x'.repeat(READING_LIMITS.quote + 1);
    expect(
      addArticleNote('article', {
        id: 'too-long',
        quote: oversized,
        block: { block: 0, start: 0, end: oversized.length },
      }),
    ).toEqual({ status: 'rejected', reason: 'invalid' });
    expect(addArticleNote('article', input)).toEqual({ status: 'saved' });
    expect(notesForArticle('article').map((note) => note.id)).toEqual([input.id]);
  });
  it('rereads current state for sequential edits and never resurrects removed notes', () => {
    harness();
    expect(addArticleNote('article', input)).toEqual({ status: 'saved' });
    expect(addArticleNote('article', { ...input, id: 'next-note' })).toEqual({ status: 'saved' });
    expect(removeArticleNote('article', input.id)).toEqual({ status: 'saved' });
    expect(removeArticleNote('article', input.id)).toEqual({ status: 'saved' });
    expect(notesForArticle('article').map((note) => note.id)).toEqual(['next-note']);
    expect(addArticleNote('__proto__', input)).toEqual({ status: 'rejected', reason: 'invalid' });
  });
  it('reports a blocked write and rejects overflow without changing the notebook', () => {
    const host = harness();
    host.deny();
    expect(addArticleNote('article', input)).toEqual({ status: 'failed' });
    expect(host.records.size).toBe(0);

    const model = new ReaderModel();
    model.open('article', 1);
    for (let i = 0; i < 128; i++) model.annotate(`note-${i}`, '', `Keep ${i}`);
    const full = harness(model.serialize());
    const before = full.records.get(SHARED_READING_STORAGE_KEY);
    expect(addArticleNote('article', input)).toEqual({ status: 'rejected', reason: 'capacity' });
    expect(full.records.get(SHARED_READING_STORAGE_KEY)).toBe(before);
    expect(notesForArticle('article')).toHaveLength(128);
  });
});
