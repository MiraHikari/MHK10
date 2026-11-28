import { expect, it } from 'vite-plus/test';
import { createFileSystem } from './filesystem';
import { createNativeFileServices } from './native-file-service';

it('reads the same local document and rejects stale writes across native clients', async () => {
  const files = createFileSystem(null);
  const document = files.createText('Book.txt', 'First').file!;
  const service = createNativeFileServices(
    files,
    async () => ({ status: 'cancelled' }),
    () => ({ accepted: false }),
  );
  const read = await service.read(document.id);
  expect(read.status).toBe('read');
  if (read.status !== 'read' || read.file.kind !== 'text') throw new Error('Expected a text file');
  expect(read.file.text).toBe('First');
  files.writeText(document.id, 'Other client');
  expect(await service.write(document.id, 'Stale', read.file.revision)).toMatchObject({
    status: 'failed',
  });
  expect(files.get(document.id)?.content).toBe('Other client');
});
it('keeps cancellation distinct and blocks missing or recycled documents', async () => {
  const files = createFileSystem(null);
  const service = createNativeFileServices(
    files,
    async () => ({ status: 'cancelled' }),
    () => ({ accepted: true }),
  );
  expect(await service.saveAs('Notes.txt', 'Note')).toEqual({ status: 'cancelled' });
  expect(await service.read('missing')).toMatchObject({ status: 'failed' });
  expect(await service.saveAs('Notes.txt', 'Note', 'missing')).toMatchObject({ status: 'failed' });
});
it('rejects asset loads that finish after the file is recycled or reset', async () => {
  for (const change of ['recycle', 'reset'] as const) {
    const stored = new Map<string, string>();
    const files = createFileSystem({
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => {
        stored.set(key, value);
      },
      removeItem: (key) => {
        stored.delete(key);
      },
    });
    const image = files.createBinary('Photo.png', {
      kind: 'image',
      mime: 'image/png',
      size: 5,
      assetId: 'photo',
      persisted: true,
    }).file!;
    const result = Promise.withResolvers<Blob>();
    const service = createNativeFileServices(
      files,
      async () => ({ status: 'cancelled' }),
      () => ({ accepted: true }),
      () => result.promise,
    );
    const read = service.read(image.id);
    if (change === 'recycle') files.remove(image.id);
    else expect(files.reset()).toMatchObject({ ok: true, persisted: true });
    result.resolve(new Blob(['photo'], { type: 'image/png' }));
    expect(await read).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('changed'),
    });
  }
});
it('reports asset backend failures without rejecting the service promise', async () => {
  const files = createFileSystem(null);
  const image = files.createBinary('Photo.png', {
    kind: 'image',
    mime: 'image/png',
    size: 5,
    assetId: 'photo',
    persisted: true,
  }).file!;
  const service = createNativeFileServices(
    files,
    async () => ({ status: 'cancelled' }),
    () => ({ accepted: true }),
    async () => {
      throw new Error('Storage failure');
    },
  );
  expect(await service.read(image.id)).toMatchObject({ status: 'failed' });
});
