import { describe, expect, it } from 'vite-plus/test';
import { BLOG_CONTENT_DIR, PROFILE_JSON_PATH, PROJECTS_CONTENT_DIR, r2KeyPrefix } from './config';

describe('workspace publication paths', () => {
  it('edits the same authored files read by both builds', () => {
    expect(PROFILE_JSON_PATH).toBe('packages/site-core/content/profile.json');
    expect(PROJECTS_CONTENT_DIR).toBe('packages/site-core/content/projects');
    expect(BLOG_CONTENT_DIR).toBe('packages/site-core/content/blog');
  });

  it('preserves canonical R2 object keys independently of Git checkout paths', () => {
    expect(r2KeyPrefix('gallery')).toBe('images/gallery');
    expect(r2KeyPrefix('honors')).toBe('images/honors');
    expect(r2KeyPrefix('projects')).toBe('images/projects');
  });
});
