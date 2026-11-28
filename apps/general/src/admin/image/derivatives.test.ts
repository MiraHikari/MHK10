import { describe, expect, it } from 'vite-plus/test';
import { containSize, DISPLAY_LONG_EDGE } from '@/admin/image/derivatives';

describe('containSize', () => {
  it('当长边已小于等于限制时保持原尺寸', () => {
    expect(containSize(800, 600, DISPLAY_LONG_EDGE)).toEqual({ width: 800, height: 600 });
    expect(containSize(1600, 900, DISPLAY_LONG_EDGE)).toEqual({ width: 1600, height: 900 });
  });

  it('以宽边为长边进行等比缩放', () => {
    const result = containSize(4000, 2000, DISPLAY_LONG_EDGE);

    expect(result.width).toBe(DISPLAY_LONG_EDGE);
    expect(result.height).toBe(Math.round((2000 / 4000) * DISPLAY_LONG_EDGE));
  });

  it('以高边为长边进行等比缩放', () => {
    const result = containSize(2000, 4000, DISPLAY_LONG_EDGE);

    expect(result.height).toBe(DISPLAY_LONG_EDGE);
    expect(result.width).toBe(Math.round((2000 / 4000) * DISPLAY_LONG_EDGE));
  });

  it('正方形图片缩放时长边等于限制', () => {
    const result = containSize(3000, 3000, DISPLAY_LONG_EDGE);

    expect(result.width).toBe(DISPLAY_LONG_EDGE);
    expect(result.height).toBe(DISPLAY_LONG_EDGE);
  });

  it('结果使用 Math.round 取整', () => {
    // 1000x333 已小于 1920，不放大
    expect(containSize(1000, 333, DISPLAY_LONG_EDGE)).toEqual({ width: 1000, height: 333 });

    // 3000x1000 缩放到长边 1920：比例为 0.64，高度为 640
    expect(containSize(3000, 1000, DISPLAY_LONG_EDGE)).toEqual({ width: 1920, height: 640 });
  });
});
