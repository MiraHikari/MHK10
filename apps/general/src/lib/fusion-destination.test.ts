import { describe, expect, it } from 'vite-plus/test';
import { sectionTargetFromDestination } from './fusion-destination';

describe('section targets', () => {
  it('keeps raw authored IDs across the presentation boundary', () => {
    expect(sectionTargetFromDestination({ kind: 'project', id: 'my-app' })).toEqual({
      sectionId: 'projects',
      itemId: 'my-app',
    });
    expect(sectionTargetFromDestination({ kind: 'skills', id: 'C++' })).toEqual({
      sectionId: 'skills',
      itemId: 'C++',
    });
    expect(sectionTargetFromDestination({ kind: 'gallery', id: '/images/gallery/x.webp' })).toEqual(
      { sectionId: 'gallery', itemId: '/images/gallery/x.webp' },
    );
  });

  it('leaves blog tags and whole-section destinations to their own navigation', () => {
    expect(sectionTargetFromDestination({ kind: 'tag', id: '设计' })).toBeNull();
    expect(sectionTargetFromDestination({ kind: 'friends' })).toBeNull();
    expect(sectionTargetFromDestination(null)).toBeNull();
  });
});
