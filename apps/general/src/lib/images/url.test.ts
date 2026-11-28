import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

async function loadModule() {
  return import('@/lib/images/url');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('resolveImageSrc', () => {
  it('未配置基座时原样返回站内路径', async () => {
    const { resolveImageSrc, IMAGE_BASE_URL } = await loadModule();
    expect(IMAGE_BASE_URL).toBe('');
    expect(resolveImageSrc('/images/gallery/a.webp')).toBe('/images/gallery/a.webp');
  });

  it('配置基座后拼接 /images/ 路径，并去除基座尾斜杠', async () => {
    vi.stubEnv('PUBLIC_IMAGE_BASE_URL', 'https://img.example.com/');
    const { resolveImageSrc, IMAGE_BASE_URL } = await loadModule();
    expect(IMAGE_BASE_URL).toBe('https://img.example.com');
    expect(resolveImageSrc('/images/gallery/a.webp')).toBe(
      'https://img.example.com/images/gallery/a.webp',
    );
  });

  it('非 /images/ 路径一律透传', async () => {
    vi.stubEnv('PUBLIC_IMAGE_BASE_URL', 'https://img.example.com');
    const { resolveImageSrc } = await loadModule();
    expect(resolveImageSrc('https://other.com/x.webp')).toBe('https://other.com/x.webp');
    expect(resolveImageSrc('/og-image.webp')).toBe('/og-image.webp');
    expect(resolveImageSrc('blob:https://example.com/y')).toBe('blob:https://example.com/y');
  });

  it('keeps query and hash suffixes while prefixing the resolved path', async () => {
    vi.stubEnv('PUBLIC_IMAGE_BASE_URL', 'https://img.example.com');
    const { resolveImageSrc } = await loadModule();
    expect(resolveImageSrc('/images/gallery/a.webp?x=1')).toBe(
      'https://img.example.com/images/gallery/a.webp?x=1',
    );
    expect(resolveImageSrc('/images/gallery/a.webp#frag')).toBe(
      'https://img.example.com/images/gallery/a.webp#frag',
    );
    expect(resolveImageSrc('/images//a.png')).toBe('https://img.example.com/images//a.png');
    expect(resolveImageSrc('/images/gallery/')).toBe('https://img.example.com/images/gallery/');
  });

  it('resolves every supported extension to the same canonical path', async () => {
    vi.stubEnv('PUBLIC_IMAGE_BASE_URL', 'https://img.example.com');
    const { resolveImageSrc } = await loadModule();
    expect(resolveImageSrc('/images/gallery/A.WEBP')).toBe(
      'https://img.example.com/images/gallery/A.WEBP',
    );
    expect(resolveImageSrc('/images/gallery/a.svg')).toBe(
      'https://img.example.com/images/gallery/a.svg',
    );
    expect(resolveImageSrc('/images/gallery/photo-display.webp')).toBe(
      'https://img.example.com/images/gallery/photo-display.webp',
    );
  });

  it('passes through protocol-relative, blob and data inputs', async () => {
    vi.stubEnv('PUBLIC_IMAGE_BASE_URL', 'https://img.example.com');
    const { resolveImageSrc } = await loadModule();
    expect(resolveImageSrc('//cdn.example/images/a.webp')).toBe('//cdn.example/images/a.webp');
    expect(resolveImageSrc('blob:https://example.com/y')).toBe('blob:https://example.com/y');
    expect(resolveImageSrc('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  });

  it('空输入返回空串', async () => {
    const { resolveImageSrc } = await loadModule();
    expect(resolveImageSrc(undefined)).toBe('');
    expect(resolveImageSrc(null)).toBe('');
    expect(resolveImageSrc('')).toBe('');
  });
});
