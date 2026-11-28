import { describe, expect, it } from 'vite-plus/test';
import { bootAscii, bootInfoLines, bootSequence, createBootInfo } from './boot-info';

describe('browser-reported boot information', () => {
  it('reports actual supplied browser fields without claiming unknown memory or hardware', () => {
    const info = createBootInfo({
      userAgent: 'Mozilla/5.0 Chrome/141.0.0.0 Safari/537.36',
      platform: 'Win32',
      language: 'zh-CN',
      hardwareConcurrency: 16,
      innerWidth: 1536,
      innerHeight: 864,
      devicePixelRatio: 1.25,
    });
    expect(info.browser).toBe('Chrome 141.0.0.0 (UA)');
    expect(info.platform).toBe('Win32 (navigator)');
    expect(info.processors).toBe('16 logical (reported)');
    expect(info.viewport).toBe('1536 x 864 CSS px / DPR 1.25');
    expect(info.language).toBe('zh-CN');
    expect(bootInfoLines(info).join('\n')).not.toMatch(/486|640K|RAM|memory/i);
  });

  it('prefers reported client hints and filters GREASE brands', () => {
    const info = createBootInfo({
      userAgent: 'Chrome/140.0.0.0',
      platform: 'Win32',
      userAgentData: {
        brands: [
          { brand: 'Not_A Brand', version: '99' },
          { brand: 'Chromium', version: '140' },
          { brand: 'Microsoft Edge', version: '141' },
        ],
        platform: 'Windows',
      },
    });
    expect(info.browser).toBe('Microsoft Edge 141 (UA-CH)');
    expect(info.platform).toBe('Windows (UA-CH)');
  });

  it.each([
    [
      'Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.56',
      'Microsoft Edge 130.0.2849.56 (UA)',
    ],
    [
      'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CriOS/139.0.7258.76 Mobile/15E148 Safari/604.1',
      'Chrome iOS 139.0.7258.76 (UA)',
    ],
    [
      'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15',
      'Safari 18.1 (UA)',
    ],
    ['Mozilla/5.0 Gecko/20100101 Firefox/143.0', 'Firefox 143.0 (UA)'],
    ['Private Browser', 'Not identified; see UA below'],
  ])('handles complex user agent %s', (userAgent, browser) => {
    expect(createBootInfo({ userAgent }).browser).toBe(browser);
  });

  it('marks unavailable, malformed or privacy-reduced values without guessing', () => {
    const info = createBootInfo({
      userAgentData: { brands: [null, 1, { brand: 'Not/A)Brand', version: '8' }] },
      hardwareConcurrency: -2,
      innerWidth: Infinity,
      innerHeight: 900,
      devicePixelRatio: NaN,
    });
    expect(info.browser).toBe('Not reported');
    expect(info.platform).toBe('Not reported');
    expect(info.language).toBe('Not reported');
    expect(info.processors).toBe('Not reported');
    expect(info.viewport).toBe('Not reported / DPR unavailable');
    expect(createBootInfo({ hardwareConcurrency: 3.5 }).processors).toBe('Not reported');
  });

  it('bounds long and non-ASCII data to eight safe DOS rows at any supported width', () => {
    const info = createBootInfo({
      userAgent: 'Mozilla\n\u001b[31m 中文 ' + 'x'.repeat(900),
      platform: '\tPlatform\r\nname',
      language: 'zh-CN\u0000',
    });
    for (const width of [8, 32, 75, 200]) {
      const lines = bootInfoLines(info, width);
      expect(lines.length).toBeLessThanOrEqual(8);
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(Math.min(75, width));
        expect(line).toMatch(/^[\x20-\x7e]*$/);
      }
    }
    expect(bootAscii('a\nb\tc\u0000d 中文')).toBe('a b c d');
    expect(bootAscii('abcdef', 3)).toBe('abc');
  });

  it('stages the observed checks without reporting percentages', () => {
    expect(bootSequence(0)).toEqual({ checks: 0, stage: 'DISPLAY BRIDGE', complete: false });
    expect(bootSequence(0.7)).toEqual({ checks: 2, stage: 'LOCAL VOLUME', complete: false });
    expect(bootSequence(1.24)).toEqual({ checks: 4, stage: undefined, complete: false });
    expect(bootSequence(1.43)).toEqual({ checks: 4, stage: undefined, complete: true });
    expect(bootSequence(-1)).toEqual(bootSequence(0));
  });
});
