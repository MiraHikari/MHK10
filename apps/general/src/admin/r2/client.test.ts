import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { encodeKey, parseListObjectsV2, getStoredCredentials } from '@/admin/r2/client';
import { STORAGE_KEYS } from '@/lib/storage/keys';
const r2 = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('aws4fetch', () => ({
  AwsClient: class {
    fetch = r2.fetch;
  },
}));
import { putObjectsWithRollback } from './client';

describe('concurrent image uploads', () => {
  const credentials = {
    endpoint: 'https://test.r2.cloudflarestorage.com/bucket',
    accessKeyId: 'test',
    secretAccessKey: 'test',
  };
  const upload = (key: string) => ({ key, body: new Blob(['image']), contentType: 'image/webp' });
  it('atomically rejects a conflicting object without deleting another upload', async () => {
    r2.fetch.mockReset().mockResolvedValue(new Response('', { status: 412 }));
    await expect(
      putObjectsWithRollback(credentials, [upload('images/gallery/photo.webp')]),
    ).rejects.toMatchObject({ status: 412 });
    expect(r2.fetch).toHaveBeenCalledTimes(1);
    expect(r2.fetch.mock.calls[0][1]).toMatchObject({
      method: 'PUT',
      headers: { 'If-None-Match': '*' },
    });
  });
  it('compensates only writes this batch created before failure', async () => {
    r2.fetch
      .mockReset()
      .mockResolvedValueOnce(new Response(''))
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(new Response(''));
    await expect(
      putObjectsWithRollback(credentials, [
        upload('images/gallery/original.webp'),
        upload('images/gallery/display.webp'),
      ]),
    ).rejects.toMatchObject({ status: 500 });
    expect(r2.fetch.mock.calls.map(([, init]) => init.method)).toEqual(['PUT', 'PUT', 'DELETE']);
    expect(r2.fetch.mock.calls[2][0]).toContain('/images/gallery/original.webp');
  });
  it('rejects duplicate or unsafe upload paths before contacting R2', async () => {
    r2.fetch.mockReset();
    await expect(
      putObjectsWithRollback(credentials, [
        upload('images/gallery/a.webp'),
        upload('images/gallery/a.webp'),
      ]),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      putObjectsWithRollback(credentials, [upload('images/gallery/a.webp'), upload('private/x')]),
    ).rejects.toMatchObject({ status: 400 });
    expect(r2.fetch).not.toHaveBeenCalled();
  });
});

afterEach(() => vi.unstubAllGlobals());

it('clears a damaged stored endpoint without breaking admin initialization', () => {
  const storage = new Map<string, string>([
    [
      STORAGE_KEYS.adminR2,
      JSON.stringify({ endpoint: 'not a URL', accessKeyId: 'test', secretAccessKey: 'test' }),
    ],
  ]);
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => storage.delete(key),
    },
  });
  expect(getStoredCredentials()).toBeNull();
  expect(storage.has(STORAGE_KEYS.adminR2)).toBe(false);
});

describe('parseListObjectsV2', () => {
  it('解析单页结果', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>my-bucket</Name>
  <KeyCount>2</KeyCount>
  <Contents>
    <Key>images/gallery/a.webp</Key>
  </Contents>
  <Contents>
    <Key>images/honors/b.jpg</Key>
  </Contents>
</ListBucketResult>`;

    expect(parseListObjectsV2(xml)).toEqual({
      keys: ['images/gallery/a.webp', 'images/honors/b.jpg'],
    });
  });

  it('提取 NextContinuationToken 并解码 XML 实体', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult>
  <Contents><Key>images/a.webp</Key></Contents>
  <NextContinuationToken>token&amp;123</NextContinuationToken>
</ListBucketResult>`;

    expect(parseListObjectsV2(xml)).toEqual({
      keys: ['images/a.webp'],
      nextCursor: 'token&123',
    });
  });

  it('处理空结果', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult>
  <KeyCount>0</KeyCount>
</ListBucketResult>`;

    expect(parseListObjectsV2(xml)).toEqual({ keys: [] });
  });

  it('解码 key 中的 &amp; 实体', () => {
    const xml = `<ListBucketResult><Contents><Key>images/gallery/foo &amp; bar.webp</Key></Contents></ListBucketResult>`;

    expect(parseListObjectsV2(xml)).toEqual({
      keys: ['images/gallery/foo & bar.webp'],
    });
  });
});

describe('encodeKey', () => {
  it('普通路径保持不变', () => {
    expect(encodeKey('images/gallery/test.webp')).toBe('images/gallery/test.webp');
  });

  it('对段内特殊字符进行编码并保留斜杠', () => {
    expect(encodeKey('images/gallery/hello world.webp')).toBe('images/gallery/hello%20world.webp');
    expect(encodeKey('images/gallery/测试.webp')).toBe('images/gallery/%E6%B5%8B%E8%AF%95.webp');
  });

  it('对 & 编码', () => {
    expect(encodeKey('images/gallery/a&b.webp')).toBe('images/gallery/a%26b.webp');
  });
});
