import { describe, expect, it } from 'vite-plus/test';
import { createPixelDocument, parsePixelBitmap, type PixelSaveResult } from './pixel-model';

describe('PIXEL bitmap document', () => {
  it('draws continuous whole-pixel lines and keeps each gesture in one undo step', () => {
    const doc = createPixelDocument(8, 8);
    doc.begin();
    doc.draw('pencil', { x: 0, y: 0 }, { x: 3, y: 3 }, 9);
    doc.draw('pencil', { x: 3, y: 3 }, { x: 7, y: 7 }, 9);
    doc.end();
    expect(doc.get().pixels.filter((color) => color === 9)).toHaveLength(8);
    expect(doc.get().dirty).toBe(true);
    expect(doc.undo()).toBe(true);
    expect(doc.get().pixels.every((color) => color === 15)).toBe(true);
    expect(doc.get().dirty).toBe(false);
    expect(doc.undo()).toBe(false);
  });

  it('fills only connected pixels and erases at image edges', () => {
    const doc = createPixelDocument(5, 5);
    doc.draw('line', { x: 2, y: 0 }, { x: 2, y: 4 }, 0);
    doc.draw('fill', { x: 0, y: 0 }, { x: 0, y: 0 }, 12);
    expect(doc.get().pixels.filter((color) => color === 12)).toHaveLength(10);
    expect(doc.get().pixels.filter((color) => color === 15)).toHaveLength(10);
    doc.draw('eraser', { x: 0, y: 0 }, { x: 0, y: 0 }, 0);
    expect(doc.get().pixels.filter((color) => color === 12)).toHaveLength(6);
    expect(doc.get().pixels).toHaveLength(25);
  });

  it('rejects out-of-bounds drawing and keeps snapshots isolated', () => {
    const doc = createPixelDocument(3, 3);
    expect(doc.draw('line', { x: -1, y: 0 }, { x: 0, y: 0 }, 1)).toBe(false);
    expect(doc.draw('fill', { x: 0, y: 0 }, { x: 0, y: 0 }, 16)).toBe(false);
    doc.get().pixels[0] = 0;
    expect(doc.get().pixels[0]).toBe(15);
    expect(doc.get().dirty).toBe(false);
  });

  it('round trips the complete 16-colour image within the filesystem limit', () => {
    const doc = createPixelDocument();
    for (let color = 0; color < 16; color++)
      doc.draw('line', { x: color, y: 0 }, { x: color, y: 99 }, color);
    const encoded = doc.serialize();
    expect(encoded.length).toBeLessThanOrEqual(20000);
    const loaded = createPixelDocument();
    expect(loaded.load(encoded)).toBe(true);
    expect(loaded.get().pixels).toEqual(doc.get().pixels);
    expect(loaded.get().dirty).toBe(false);
    expect(
      parsePixelBitmap('{"format":"MHK10-PIXEL","version":1,"width":1,"height":1,"pixels":"z"}'),
    ).toBeNull();
    expect(
      parsePixelBitmap(
        '{"format":"MHK10-PIXEL","version":1,"width":100000,"height":1,"pixels":"0"}',
      ),
    ).toBeNull();
    expect(parsePixelBitmap('not an image')).toBeNull();
  });

  it('makes AGI improvement explicit, non-destructive and undoable', () => {
    const doc = createPixelDocument(5, 5);
    doc.draw('pencil', { x: 1, y: 1 }, { x: 1, y: 1 }, 9);
    const original = doc.serialize();
    doc.improve();
    expect(doc.get().pixels[6]).toBe(9);
    expect(doc.get().pixels[12]).toBe(8);
    expect(doc.get().notice).toContain('AGI.EXE');
    doc.undo();
    expect(doc.serialize()).toBe(original);
    doc.clear();
    expect(doc.get().pixels.every((pixel) => pixel === 15)).toBe(true);
    doc.undo();
    expect(doc.serialize()).toBe(original);
  });

  it.each<PixelSaveResult>([
    { status: 'cancelled' },
    { status: 'failed', error: 'Disk full.' },
    { status: 'saved', persisted: false },
  ])('retains unsaved pixels after unsuccessful save: $status', async (result) => {
    const doc = createPixelDocument(3, 3);
    doc.draw('pencil', { x: 1, y: 1 }, { x: 1, y: 1 }, 0);
    const image = doc.serialize();
    expect(await doc.save(async () => result)).toBe(false);
    expect(doc.get().dirty).toBe(true);
    expect(doc.serialize()).toBe(image);
    expect(doc.get().saving).toBe(false);
  });

  it('does not acknowledge newer edits when a delayed save finishes', async () => {
    const doc = createPixelDocument(3, 3);
    doc.draw('pencil', { x: 0, y: 0 }, { x: 0, y: 0 }, 1);
    let complete!: (result: PixelSaveResult) => void;
    const operation = doc.save(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    doc.draw('pencil', { x: 1, y: 1 }, { x: 1, y: 1 }, 2);
    complete({ status: 'saved', persisted: true });
    expect(await operation).toBe(false);
    expect(doc.get().dirty).toBe(true);
    expect(await doc.save(async () => ({ status: 'saved', persisted: true }))).toBe(true);
    expect(doc.get().dirty).toBe(false);
  });

  it('handles rejected saves and disposal before delayed callbacks', async () => {
    const doc = createPixelDocument(3, 3);
    doc.draw('pencil', { x: 0, y: 0 }, { x: 0, y: 0 }, 1);
    expect(
      await doc.save(async () => {
        throw new Error('Unavailable');
      }),
    ).toBe(false);
    expect(doc.get().dirty).toBe(true);
    let complete!: (result: PixelSaveResult) => void;
    const operation = doc.save(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    doc.dispose();
    doc.dispose();
    complete({ status: 'saved', persisted: true });
    expect(await operation).toBe(false);
    expect(doc.get().dirty).toBe(true);
  });
});
