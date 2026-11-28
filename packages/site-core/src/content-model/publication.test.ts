import { describe, expect, it } from 'vite-plus/test';
import { readFileSync } from 'node:fs';
import type { ProjectRecord } from './projects';
import { desktopPublicationMetadata } from './article';

describe('authored publication projections', () => {
  it('keeps the generated projects within the shared record contract', () => {
    const projects: ProjectRecord[] = JSON.parse(
      readFileSync(new URL('../../content/projects.generated.json', import.meta.url), 'utf8'),
    );
    expect(projects.length).toBeGreaterThan(0);
    for (const project of projects) {
      expect(project.id).toBeTruthy();
      expect(typeof project.active).toBe('boolean');
      expect(project.tags.every((tag) => typeof tag === 'string')).toBe(true);
      expect(project.highlights.every((highlight) => typeof highlight === 'string')).toBe(true);
    }
  });
  it('preserves article metadata when adapting dates and presentation', () => {
    const authored = {
      title: 'Title',
      publishDate: '2026-10-01',
      updatedDate: '2026-10-02',
      author: 'MiraHikari',
      related: ['colophon'],
      series: 'Notes',
      seriesOrder: 2,
      heroImage: '/images/blog/a.webp',
    };
    expect(
      desktopPublicationMetadata(authored, { version: 'v2' }, (path) =>
        path.replace('/images/', '/static-images/'),
      ),
    ).toEqual({
      title: 'Title',
      published: '2026-10-01',
      updated: '2026-10-02',
      author: 'MiraHikari',
      related: ['colophon'],
      series: 'Notes',
      seriesOrder: 2,
      version: 'v2',
      heroImage: '/static-images/blog/a.webp',
    });
  });
});
