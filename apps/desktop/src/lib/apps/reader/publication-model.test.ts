import { describe, expect, it } from 'vite-plus/test';
import { parseReaderPublication, readerCitation } from './publication-model';

describe('Reader publication facts', () => {
  const record = { id: 'article', title: 'Title', body: 'Narrative', published: '2026-10-10' };
  it('preserves shared author, related articles and series in the reader boundary', () => {
    const parsed = parseReaderPublication({
      ...record,
      author: 'Guest Author',
      related: ['colophon'],
      series: 'Notes',
      seriesOrder: 2,
    });
    expect(parsed).toMatchObject({
      author: 'Guest Author',
      related: ['colophon'],
      series: 'Notes',
      seriesOrder: 2,
    });
    expect(readerCitation(parsed!, 'https://site.example/blog/article/', 'MiraHikari')).toBe(
      'Title — Guest Author. https://site.example/blog/article/',
    );
  });
  it('uses the shared profile fallback for old publications and ignores malformed optional facts', () => {
    const parsed = parseReaderPublication({
      ...record,
      author: '',
      related: 'colophon',
      seriesOrder: Infinity,
    });
    expect(parsed).not.toHaveProperty('author');
    expect(parsed).not.toHaveProperty('related');
    expect(readerCitation(parsed!, '/blog/article/', 'MiraHikari')).toBe(
      'Title — MiraHikari. /blog/article/',
    );
    expect(parseReaderPublication([])).toBeNull();
    expect(parseReaderPublication({ ...record, id: '__proto__' })).toBeNull();
  });
});
