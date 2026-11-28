import { describe, expect, it } from 'vite-plus/test';

import {
  clampOffset,
  mapOffsetsToRuns,
  MAX_HIGHLIGHT_LENGTH,
  resolveMarkerOffsets,
} from '@/lib/blog/highlight';

describe('mapOffsetsToRuns', () => {
  // 模拟「前(1) + ab(2) + 后后(2)」三个文本节点的绝对偏移序列。
  const nodes = [
    { start: 0, text: '前' },
    { start: 1, text: 'ab' },
    { start: 3, text: '后后' },
  ];

  it('映射单节点区间为一段', () => {
    expect(mapOffsetsToRuns(nodes, 1, 3)).toEqual([{ nodeIndex: 1, from: 0, to: 2 }]);
  });

  it('映射跨节点区间为每节点一段', () => {
    expect(mapOffsetsToRuns(nodes, 0, 5)).toEqual([
      { nodeIndex: 0, from: 0, to: 1 },
      { nodeIndex: 1, from: 0, to: 2 },
      { nodeIndex: 2, from: 0, to: 2 },
    ]);
  });

  it('裁剪首尾节点上的部分区间', () => {
    expect(mapOffsetsToRuns(nodes, 1, 4)).toEqual([
      { nodeIndex: 1, from: 0, to: 2 },
      { nodeIndex: 2, from: 0, to: 1 },
    ]);
  });

  it('对越界与空区间返回空数组', () => {
    expect(mapOffsetsToRuns(nodes, 9, 10)).toEqual([]);
    expect(mapOffsetsToRuns(nodes, 5, 5)).toEqual([]);
    expect(mapOffsetsToRuns(nodes, 2, 2)).toEqual([]);
  });
});

describe('resolveMarkerOffsets', () => {
  const blockText = '你好，世界 hello world';

  it('偏移与块文本精确匹配时原样保留', () => {
    expect(resolveMarkerOffsets(blockText, { p: 0, start: 3, end: 5, text: '世界' })).toEqual({
      start: 3,
      end: 5,
    });
  });

  it('容忍首尾空白差异（trim 对齐）', () => {
    expect(resolveMarkerOffsets('a b c', { p: 0, start: 1, end: 4, text: 'b' })).toEqual({
      start: 1,
      end: 4,
    });
  });

  it('内容偏移后回退 indexOf 重新定位', () => {
    const shifted = `前置${blockText}`;
    // 原偏移指向的位置不再是 marker.text，但文本仍在块内。
    expect(resolveMarkerOffsets(shifted, { p: 0, start: 2, end: 4, text: '世界' })).toEqual({
      start: 5,
      end: 7,
    });
  });

  it('文本已消失时返回 null（内容改版跳过）', () => {
    expect(
      resolveMarkerOffsets('完全不同的内容', { p: 0, start: 0, end: 2, text: '世界' }),
    ).toBeNull();
  });

  it('钳制越界偏移', () => {
    expect(resolveMarkerOffsets(blockText, { p: 0, start: 0, end: 999, text: blockText })).toEqual({
      start: 0,
      end: blockText.length,
    });
  });

  it('空文本与空区间返回 null', () => {
    expect(resolveMarkerOffsets(blockText, { p: 0, start: 0, end: 2, text: '' })).toBeNull();
    expect(resolveMarkerOffsets(blockText, { p: 0, start: 5, end: 5, text: '世界' })).toBeNull();
  });
});

describe('clampOffset', () => {
  it('把偏移钳制到 [0, length]', () => {
    expect(clampOffset(-3, 10)).toBe(0);
    expect(clampOffset(99, 10)).toBe(10);
    expect(clampOffset(5, 10)).toBe(5);
    expect(clampOffset(Number.NaN, 10)).toBe(0);
  });
});

describe('MAX_HIGHLIGHT_LENGTH', () => {
  it('单条高亮上限为 500 字符', () => {
    expect(MAX_HIGHLIGHT_LENGTH).toBe(500);
  });
});
