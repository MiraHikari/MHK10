import { describe, expect, it } from 'vite-plus/test';
import {
  articleDocument,
  certificateDocument,
  createPrintLayout,
  printPages,
  PRINT_PAPER,
} from './print-model';
import { printLines } from '../../ui/text/print-layout';

describe('print documents', () => {
  it('prints article content and link destinations without publishing frontmatter', () => {
    expect(
      articleDocument(
        'post',
        '---\ntitle: A real article\npublished: 2026-10-06\n---\n\n## Hello\nRead [more](/blog/).',
      ),
    ).toEqual({
      id: 'post',
      title: 'A real article',
      content: 'A real article\n\nHello\nRead more (/blog/).',
    });
  });
  it('keeps every code point and explicit blank line across narrow pages', () => {
    expect(printPages('你好世界\n\nabcdef', 2, 2, (value) => Array.from(value).length)).toEqual([
      ['你好', '世界'],
      ['', 'ab'],
      ['cd', 'ef'],
    ]);
    expect(printPages('', 20, 20, (value) => value.length)).toEqual([['']]);
  });

  it('prints embedded photo descriptions and captions instead of HTML implementation attributes', () => {
    const document = articleDocument(
      'photo',
      '---\ntitle: 杭州 &amp; AdventureX\n---\n\n<figure class="photo"><a href="/acdee/"><img src="/photo.webp" alt="三个人在杭州" /></a><figcaption>出发前。</figcaption></figure>\n\n这是原文。',
    );
    expect(document.title).toBe('杭州 & AdventureX');
    expect(document.content).toContain('三个人在杭州');
    expect(document.content).toContain('出发前。');
    expect(document.content).toContain('这是原文。');
    expect(document.content).not.toMatch(/<figure|<img|src=|class=|photo\.webp/);
  });
  it('certifies current ownership instead of inventing a completed ending', () => {
    const document = certificateDocument(
      'HUMAN + AGI',
      'Two signatures; human stop remains active',
      'Coexistence protocol',
    );
    expect(document.content).toContain('REGISTERED OWNER: HUMAN + AGI');
    expect(document.content).toContain('Two signatures; human stop remains active');
    expect(document.content).toContain('STATUS: Coexistence protocol');
  });

  it('keeps ordinary Latin words together and avoids stranded Chinese punctuation', () => {
    const measure = (value: string) =>
      Array.from(value).reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 2 : 1), 0);
    const lines = printLines('MiraHikari writes 中文，标点（正常）。', 12, measure);
    expect(lines[0]).toBe('MiraHikari');
    expect(lines[1].startsWith('writes ')).toBe(true);
    expect(lines.every((line) => measure(line) <= 12)).toBe(true);
    expect(lines.every((line) => !/^[，。）？！、]/.test(line) && !/[（《「]$/.test(line))).toBe(
      true,
    );
  });

  it('never separates combining marks or an emoji family during emergency wrapping', () => {
    const family = '👩‍👩‍👧‍👦';
    const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });
    const measure = (value: string) => Array.from(graphemes.segment(value)).length;
    expect(printLines(`Ae\u0301${family}B`, 1, measure)).toEqual(['A', 'e\u0301', family, 'B']);
  });

  it('fixes page breaks to paper dimensions and leaves header/footer space on every page', () => {
    const content = Array.from({ length: 120 }, (_, index) => `第 ${index + 1} 行 / MHK10`).join(
      '\n',
    );
    const layout = createPrintLayout(content, (value) => Array.from(value).length * 12);
    expect(layout).toMatchObject(PRINT_PAPER);
    expect(layout.pages).toHaveLength(4);
    expect(layout.pages.flat()).toEqual(content.split('\n'));
    for (const page of layout.pages) {
      const end = layout.margin + layout.headerHeight + page.length * layout.lineHeight;
      expect(end).toBeLessThanOrEqual(layout.height - layout.margin - layout.footerHeight);
    }
  });
});
