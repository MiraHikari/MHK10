import { describe, expect, it } from 'vite-plus/test';
import {
  buildSyncPlan,
  decodeXmlEntities,
  encodeKey,
  formatBytes,
  getContentType,
  findThumbnailDeletions,
  isThumbnailKey,
  parseListObjectsV2,
  runWithPool,
} from './sync-images.mjs';

describe('getContentType', () => {
  it('按扩展名映射常见图片类型', () => {
    expect(getContentType('a/b/c.webp')).toBe('image/webp');
    expect(getContentType('x/photo.jpg')).toBe('image/jpeg');
    expect(getContentType('x/photo.jpeg')).toBe('image/jpeg');
    expect(getContentType('x/pic.png')).toBe('image/png');
    expect(getContentType('x/pic.avif')).toBe('image/avif');
  });

  it('扩展名大小写不敏感', () => {
    expect(getContentType('x/PHOTO.JPG')).toBe('image/jpeg');
    expect(getContentType('x/PIC.WebP')).toBe('image/webp');
  });

  it('未知扩展名回退到 octet-stream', () => {
    expect(getContentType('x/file.bin')).toBe('application/octet-stream');
    expect(getContentType('x/noext')).toBe('application/octet-stream');
  });
});

describe('encodeKey', () => {
  it('保留路径分隔符，逐段编码', () => {
    expect(encodeKey('images/gallery/a b.webp')).toBe('images/gallery/a%20b.webp');
    expect(encodeKey('images/gallery/西湖&船.webp')).toBe(
      'images/gallery/%E8%A5%BF%E6%B9%96%26%E8%88%B9.webp',
    );
  });

  it('普通路径不变', () => {
    expect(encodeKey('images/projects/daka.webp')).toBe('images/projects/daka.webp');
  });
});

describe('thumbnail cleanup', () => {
  it('只匹配 images 下一级目录中的 thumbs 对象', () => {
    expect(isThumbnailKey('images/gallery/thumbs/photo.webp')).toBe(true);
    expect(isThumbnailKey('images/projects/photo.webp')).toBe(false);
    expect(isThumbnailKey('images/gallery/thumbs/nested/photo.webp')).toBe(true);
  });

  it('从远端对象索引生成缩略图删除清单', () => {
    const deletions = findThumbnailDeletions(
      new Map([
        ['images/gallery/thumbs/a.webp', 10],
        ['images/gallery/a-display.webp', 20],
        ['images/projects/thumbs/b.webp', 30],
      ]),
    );
    expect(deletions).toEqual([
      { key: 'images/gallery/thumbs/a.webp', size: 10 },
      { key: 'images/projects/thumbs/b.webp', size: 30 },
    ]);
  });
});

describe('decodeXmlEntities', () => {
  it('解码常见 XML 实体', () => {
    expect(decodeXmlEntities('a&amp;b&lt;c&gt;d&quot;e&apos;f')).toBe(`a&b<c>d"e'f`);
  });
});

describe('formatBytes', () => {
  it('按量级格式化', () => {
    expect(formatBytes(500)).toBe('500B');
    expect(formatBytes(2048)).toBe('2.0KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.00MB');
  });
});

describe('parseListObjectsV2', () => {
  it('解析 Contents 的 key 与 size', () => {
    const xml = `<?xml version="1.0"?>
      <ListBucketResult>
        <IsTruncated>false</IsTruncated>
        <Contents><Key>images/a.webp</Key><Size>123</Size></Contents>
        <Contents><Key>images/b &amp; c.jpg</Key><Size>4567</Size></Contents>
      </ListBucketResult>`;
    const { objects, nextContinuationToken } = parseListObjectsV2(xml);
    expect(objects.get('images/a.webp')).toBe(123);
    expect(objects.get('images/b & c.jpg')).toBe(4567);
    expect(nextContinuationToken).toBeNull();
  });

  it('IsTruncated 为 true 时返回分页 token', () => {
    const xml = `
      <ListBucketResult>
        <IsTruncated>true</IsTruncated>
        <NextContinuationToken>abc&amp;def</NextContinuationToken>
        <Contents><Key>images/a.webp</Key><Size>1</Size></Contents>
      </ListBucketResult>`;
    const { nextContinuationToken } = parseListObjectsV2(xml);
    expect(nextContinuationToken).toBe('abc&def');
  });

  it('IsTruncated 为 false 时忽略 token 字段', () => {
    const xml = `
      <ListBucketResult>
        <IsTruncated>false</IsTruncated>
        <NextContinuationToken>should-ignore</NextContinuationToken>
      </ListBucketResult>`;
    expect(parseListObjectsV2(xml).nextContinuationToken).toBeNull();
  });

  it('空结果返回空 Map', () => {
    const xml = '<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>';
    const { objects } = parseListObjectsV2(xml);
    expect(objects.size).toBe(0);
  });
});

describe('buildSyncPlan', () => {
  const local = [
    { key: 'images/same.webp', size: 100 },
    { key: 'images/changed.webp', size: 200 },
    { key: 'images/new.webp', size: 300 },
  ];
  const remote = new Map([
    ['images/same.webp', 100],
    ['images/changed.webp', 999],
    ['images/orphan.webp', 50],
  ]);

  it('按远端状态分为新增/更新/跳过', () => {
    const plan = buildSyncPlan(local, remote);
    expect(plan.adds.map((i) => i.key)).toEqual(['images/new.webp']);
    expect(plan.updates.map((i) => i.key)).toEqual(['images/changed.webp']);
    expect(plan.skips.map((i) => i.key)).toEqual(['images/same.webp']);
    expect(plan.deletions).toEqual([]);
    expect(plan.uploadBytes).toBe(500);
  });

  it('force 时所有已存在文件都视为更新', () => {
    const plan = buildSyncPlan(local, remote, { force: true });
    expect(plan.adds.map((i) => i.key)).toEqual(['images/new.webp']);
    expect(plan.updates.map((i) => i.key)).toEqual(['images/same.webp', 'images/changed.webp']);
    expect(plan.skips).toEqual([]);
  });

  it('includeDeletions 时计算远端孤儿对象', () => {
    const plan = buildSyncPlan(local, remote, { includeDeletions: true });
    expect(plan.deletions).toEqual([{ key: 'images/orphan.webp', size: 50 }]);
  });
});

describe('runWithPool', () => {
  it('并发数不超过上限且全部执行', async () => {
    let active = 0;
    let maxActive = 0;
    const done = [];
    const items = Array.from({ length: 20 }, (_, i) => i);

    const errors = await runWithPool(items, 4, async (item) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      done.push(item);
    });

    expect(errors).toEqual([]);
    expect(done.sort((a, b) => a - b)).toEqual(items);
    expect(maxActive).toBeLessThanOrEqual(4);
  });

  it('单个失败不中断整批，错误被收集', async () => {
    const items = [1, 2, 3, 4];
    const done = [];

    const errors = await runWithPool(items, 2, async (item) => {
      if (item === 2) throw new Error('boom');
      done.push(item);
    });

    expect(done.sort()).toEqual([1, 3, 4]);
    expect(errors).toHaveLength(1);
    expect(errors[0].item).toBe(2);
    expect(errors[0].error.message).toBe('boom');
  });

  it('空列表直接返回', async () => {
    expect(await runWithPool([], 4, async () => {})).toEqual([]);
  });
});
