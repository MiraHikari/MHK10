import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { format } from 'vite-plus/fmt';
import { formatOptions } from '../../../../scripts/format-policy.mjs';
import shared from '@mhk/site-core/content-model/profile-data';
import projectSource from '@mhk/site-core/content/projects.generated.json';
import {
  portfolio,
  portfolioPhotos,
  portfolioAsset,
  portfolioPreview,
  profile as desktopProfile,
  projects,
} from './profile';
import { gallery } from './gallery';
import {
  alignPersonalContent,
  articlePhotos,
  desktopArticle,
  originalAssetCopies,
  projectFacts,
  publicationAssetPath,
  publicationDocument,
  validateArticlePresentation,
} from '../../scripts/align-personal-content.mjs';

const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

function publicationFixture() {
  const root = mkdtempSync(join(tmpdir(), 'mhk-publication-'));
  const generalRoot = join(root, 'general');
  const desktopRoot = join(root, 'desktop');
  mkdirSync(join(generalRoot, 'public', 'images', 'gallery'), { recursive: true });
  mkdirSync(join(desktopRoot, 'public', 'images', 'gallery'), { recursive: true });
  return { root, generalRoot, desktopRoot };
}

describe('shared publication content', () => {
  it('reads all factual profile records from the shared authored source', () => {
    expect(portfolio.education).toBe(shared.education);
    expect(portfolio.certificates).toBe(shared.certificates);
    expect(portfolio.gallery).toBe(shared.galleryItems);
    expect(portfolio.friendLinks).toBe(shared.friendLinks);
    expect(portfolio.profile).toBe(shared.profile);
    expect(portfolio.profile.name).toBe(shared.profile.name);
    expect(portfolio.profile.summary).toBe(shared.profile.summary);
    expect(portfolio.profile.detail).toBe(shared.profile.detail);
    expect(desktopProfile.introduction).toBe(shared.profile.introduction);
    expect(portfolio.experiences[0].summary).not.toBe(shared.experiences[0].summary);
    for (const skill of shared.skills) {
      const displayed = portfolio.skills.find((item) => item.name === skill.name);
      expect(displayed).toEqual({ ...skill, category: displayed?.category });
    }
    expect(shared).toHaveProperty('birthday');
    expect(shared).toHaveProperty('beian');
    expect(shared).toHaveProperty('honorTierMeta');
  });

  it('loads project facts once while retaining the desktop summaries', () => {
    expect(projects).toHaveLength(projectSource.filter((item) => item.active).length);
    for (const project of projects) {
      const source = projectSource.find((item) => item.id === project.id)!;
      expect(project.title).toBe(source.title);
      expect(project.date).toBe(source.date);
      expect(project.tags).toBe(source.tags);
      expect(project.highlights).toBe(source.highlights);
      expect(project.href).toBe(source.link);
      expect(project.summary).toBeTruthy();
    }
  });

  it('keeps presentation maps keyed to shared identities and facts single-sourced', () => {
    expect(portfolio.aboutJourney.map((item) => item.year)).toEqual(
      shared.aboutJourney.map((item) => item.year),
    );
    expect(portfolio.experiences.map((item) => item.name)).toEqual(
      shared.experiences.map((item) => item.name),
    );
    expect(portfolio.honors.map((item) => item.title)).toEqual(
      shared.honors.map((item) => item.title),
    );
    expect(portfolio.skills).toHaveLength(shared.skills.length);
    expect(new Set(portfolio.skills.map((item) => item.name)).size).toBe(shared.skills.length);
    const galleryPaths = new Set(shared.galleryItems.map((item) => item.imageSrc));
    for (const path of portfolio.featuredPhotoPaths) expect(galleryPaths.has(path)).toBe(true);
    expect(portfolioPhotos).toHaveLength(portfolio.featuredPhotoPaths.length);
  });

  it('derives gallery membership and image identities only from the shared profile', () => {
    expect(gallery).toHaveLength(shared.galleryItems.length);
    for (const photo of shared.galleryItems) {
      const id = photo.imageSrc.split('/').at(-1)!.replace('-display.webp', '');
      const item = gallery.find((entry) => entry.id === id);
      expect(item).toBeDefined();
      expect(item!.display).toBe(portfolioAsset(photo.imageSrc));
      expect(item!.original).toBe(portfolioAsset(photo.downloadSrc ?? photo.imageSrc));
      expect(item!.src).toBe(portfolioAsset(photo.imageSrc));
      expect(item!.preview).toBe(portfolioPreview(photo.imageSrc));
    }
  });

  it('keeps projections and both bundled asset trees fresh from this workspace', async () => {
    expect(await alignPersonalContent()).toEqual([]);
  });

  it('preserves project editorial fields and reflects active policy in its projection', () => {
    const raw =
      '---\ntitle: Example\ndescription: Editorial copy\nactive: false\ncustom: Admin extension\n---\n\nAuthored paragraph.\n\n- Observable fact\n';
    expect(projectFacts(raw, 'example')).toEqual({
      id: 'example',
      title: 'Example',
      description: 'Editorial copy',
      active: false,
      custom: 'Admin extension',
      highlights: ['Observable fact'],
    });
  });

  it('keeps the authored filename as the project identity', () => {
    const raw = '---\nid: impostor\ntitle: Example\ndescription: Editorial copy\n---\n\n- Fact\n';
    expect(projectFacts(raw, 'actual-project')).toMatchObject({
      id: 'actual-project',
      title: 'Example',
    });
  });

  it('rejects desktop article presentation that overrides shared publication facts', () => {
    expect(() =>
      validateArticlePresentation('example', {
        viewerNote: 'Desktop instructions',
        metadata: { title: 'A different title' },
      }),
    ).toThrow('overrides shared facts: title');
    expect(() => validateArticlePresentation('example', { viewerNote: '', metadata: {} })).toThrow(
      'needs a viewer note',
    );
  });

  it('rejects presentation slugs that could escape the article trees', () => {
    for (const slug of ['../secret', 'Blog/Post', '', 'a b']) {
      expect(() => validateArticlePresentation(slug, { viewerNote: 'note', metadata: {} })).toThrow(
        'Invalid desktop article slug',
      );
    }
  });

  it('retains all travelogue captions and routes each picture original through the viewer', () => {
    const raw = readFileSync(
      new URL(
        '../../../../packages/site-core/content/blog/advx-2026-hangzhou.mdx',
        import.meta.url,
      ),
      'utf8',
    );
    const photos = articlePhotos(raw);
    expect(photos).toHaveLength(44);
    const output = desktopArticle(raw, { viewerNote: 'Desktop instructions', metadata: {} });
    expect(output).toContain('Desktop instructions');
    expect(output).toContain('data-app-link="acdsee"');
    for (const photo of photos) {
      // The article keeps the optimized display asset; the camera original is
      // reached through the ACDSee media ID, not loaded into every article.
      expect(output).toContain(`data-original-src="${photo.src}"`);
      expect(output).toContain(`width="${photo.width}" height="${photo.height}"`);
    }
    expect(output).not.toContain('<PhotoFigure');
    expect(output).not.toContain('import PhotoFigure');
  });
  it('projects every shared publication with identical authored facts and narrative', async () => {
    // Sources resolve through the shared local-first content mechanism so the
    // projection comparison matches whatever the aligner used (owner override
    // or tracked template).
    const { readDesktopPresentation, localPublicationSlugs, SHARED_CONTENT_ROOT } =
      await import('../../../../scripts/content-source.mjs');
    const presentations = readDesktopPresentation('article-presentation') as Record<
      string,
      { metadata: Record<string, unknown>; viewerNote?: string }
    >;
    const blogNames = readdirSync(SHARED_CONTENT_ROOT + '/blog').filter((name) =>
      /\.mdx?$/.test(name),
    );
    const overridden = new Set(localPublicationSlugs('blog'));
    const slugs = [
      ...new Set([...blogNames.map((name) => name.replace(/\.mdx?$/, '')), ...overridden]),
    ].filter((slug) => slug !== 'privacy');
    const { readSharedArticle } = await import('../../scripts/align-personal-content.mjs').then(
      (module) => module,
    );
    for (const slug of slugs) {
      const raw = readSharedArticle(SHARED_CONTENT_ROOT, slug);
      const source = publicationDocument(raw);
      const view = presentations[slug] ?? { metadata: {} };
      const published = readFileSync(
        new URL(`../content/posts/${slug}.md`, import.meta.url),
        'utf8',
      );
      const projected = publicationDocument(published);
      const expected = await format(`src/content/posts/${slug}.md`, desktopArticle(raw, view), {
        ...formatOptions,
        endOfLine: 'lf',
      });
      expect(expected.errors).toEqual([]);
      expect(projected.body.trim(), slug).toBe(publicationDocument(expected.code).body.trim());
      for (const field of [
        'title',
        'description',
        'author',
        'related',
        'series',
        'seriesOrder',
        'tags',
        'category',
        'draft',
        'listed',
        'featured',
        'comments',
        'aiModel',
        'heroAlt',
      ])
        expect(projected.data[field], `${slug}: ${field}`).toEqual(source.data[field]);
      expect(projected.data.published, `${slug}: publication date`).toEqual(
        source.data.publishDate,
      );
      for (const field of ['aiLevel', 'version', 'updates', 'sourceArchive'])
        expect(projected.data[field], `${slug}: ${field}`).toEqual(
          view.metadata[field] ?? source.data[field],
        );
      expect(projected.data.updated, `${slug}: updated date`).toEqual(
        view.metadata.updated ?? source.data.updatedDate,
      );
      expect(projected.data.heroImage).toBe(source.data.heroImage);
    }
  });
  it('keeps CREDIT NOTE and RULE narrative instead of replacing them with viewing instructions', () => {
    const raw =
      '---\ntitle: Notes\ndescription: Notes\npublishDate: 2026-10-01\n---\n\n<EditorialNote label="CREDIT">Source credit.</EditorialNote>\n\n<EditorialNote label="NOTE">My note.</EditorialNote>\n\n<EditorialNote label="RULE">My rule.</EditorialNote>\n\n<EditorialNote label="ALBUM">Old viewer.</EditorialNote>\n';
    const output = desktopArticle(raw, { viewerNote: 'New viewer.', metadata: {} });
    for (const text of [
      '**CREDIT**',
      'Source credit.',
      '**NOTE**',
      'My note.',
      '**RULE**',
      'My rule.',
    ])
      expect(output).toContain(text);
    expect(output).toContain('**ALBUM**');
    expect(output).toContain('New viewer.');
    expect(output).not.toContain('Old viewer.');
    const colophon = readFileSync(new URL('../content/posts/colophon.md', import.meta.url), 'utf8');
    expect(colophon).toContain('这个博客的第一篇文章');
    expect(colophon).toContain('整站的视觉与交互语言来自朋友');
    const technical = readFileSync(
      new URL('../../../../packages/site-core/content/blog/mhk10-technical.md', import.meta.url),
      'utf8',
    );
    expect(technical).toContain('## 桌面就是一个文件夹');
    expect(technical).toContain('2026-10-10');
  });

  it('rejects authored asset paths that escape the publication tree', () => {
    expect(publicationAssetPath('/images/gallery/photo.webp')).toBe('/images/gallery/photo.webp');
    for (const path of [
      '/images/../secret.jpg',
      'images/gallery/photo.webp',
      '/images/gallery/photo.webp?x',
      '/images/camera/../../secret.jpg',
    ]) {
      expect(() => publicationAssetPath(path)).toThrow('Invalid authored publication asset');
    }
    expect(() =>
      originalAssetCopies(['/images/../secret.jpg'], 'D:/general', 'D:/desktop'),
    ).toThrow('Invalid authored publication asset');
  });

  it('accepts a source-less checkout only when the bundled copy matches the recorded hash', () => {
    const { root, generalRoot, desktopRoot } = publicationFixture();
    try {
      const bytes = Buffer.from('publication image bytes');
      const target = join(desktopRoot, 'public', 'images', 'gallery', 'photo.webp');
      writeFileSync(target, bytes);
      const recorded = new Map([['/images/gallery/photo.webp', sha256(bytes)]]);
      expect(
        originalAssetCopies(['/images/gallery/photo.webp'], generalRoot, desktopRoot, { recorded }),
      ).toEqual([
        {
          source: null,
          target,
          path: '/images/gallery/photo.webp',
          sha256: sha256(bytes),
        },
      ]);
      expect(() =>
        originalAssetCopies(['/images/gallery/photo.webp'], generalRoot, desktopRoot, {
          recorded,
          requireOriginals: true,
        }),
      ).toThrow('Missing owner publication original');
      expect(() =>
        originalAssetCopies(['/images/gallery/photo.webp'], generalRoot, desktopRoot),
      ).toThrow('no recorded hash');
      expect(() =>
        originalAssetCopies(['/images/gallery/photo.webp'], generalRoot, desktopRoot, {
          recorded: new Map([['/images/gallery/photo.webp', sha256('other')]]),
        }),
      ).toThrow('does not match its recorded hash');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('hashes the owner original when present and fails when both copies are absent', () => {
    const { root, generalRoot, desktopRoot } = publicationFixture();
    try {
      const source = join(generalRoot, 'public', 'images', 'gallery', 'photo.webp');
      const bytes = Buffer.from('owner original');
      writeFileSync(source, bytes);
      expect(
        originalAssetCopies(['/images/gallery/photo.webp'], generalRoot, desktopRoot)[0],
      ).toEqual({
        source,
        target: join(desktopRoot, 'public', 'images', 'gallery', 'photo.webp'),
        path: '/images/gallery/photo.webp',
        sha256: sha256(bytes),
      });
      expect(() =>
        originalAssetCopies(['/images/gallery/missing.webp'], generalRoot, desktopRoot),
      ).toThrow('neither the owner original');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
