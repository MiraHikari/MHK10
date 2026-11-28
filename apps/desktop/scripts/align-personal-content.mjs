import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
} from 'node:fs';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import { format } from 'vite-plus/fmt';
import { formatOptions } from '../../../scripts/format-policy.mjs';
import {
  hasLocalContent,
  readDesktopLocalPresentation,
  readLocalProfile,
  readLocalPublication,
} from '../../../scripts/content-source.mjs';
import {
  createImageResolver,
  isCanonicalImagePath,
  DESKTOP_IMAGE_PREFIX,
  DESKTOP_PREVIEW_PREFIX,
} from '../../../packages/site-core/src/media/image-path.ts';
import { desktopPublicationMetadata } from '../../../packages/site-core/src/content-model/article.ts';
import { collectAuthoredOriginals, isBundledOriginal } from './media-policy.mjs';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(desktopRoot, '../..');
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const escape = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

/** The shared Markdown is authored; desktop HTML and the browser-safe facts are projections. */
export function publicationDocument(raw) {
  const normalized = raw.replaceAll('\r\n', '\n');
  const match = /^---\n([\s\S]*?)\n---\n/.exec(normalized);
  if (!match) throw new Error('A publication document is missing frontmatter.');
  const data = parse(match[1]);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Publication frontmatter must be an object.');
  }
  return { data, body: normalized.slice(match[0].length) };
}

export function projectFacts(raw, id) {
  const { data, body } = publicationDocument(raw);
  if (typeof data.title !== 'string' || typeof data.description !== 'string') {
    throw new Error(`Project ${id} needs a title and description.`);
  }
  return {
    ...data,
    // The Markdown filename is the stable project identity; frontmatter cannot replace it.
    id,
    active: data.active !== false,
    // Preserve complete editorial notes in authored Markdown. Cards display the bullet facts.
    highlights: [...body.matchAll(/^- (.+)$/gm)].map((match) => match[1]),
  };
}

/** Parse only the publication's supported picture props, never execute authored JSX. */
export function articlePhotos(raw) {
  return [...raw.matchAll(/<PhotoFigure\s+([\s\S]*?)\/>/g)].map((match) => {
    const photo = Object.fromEntries(
      [...match[1].matchAll(/(\w+)=(?:"([^"\n]*)"|\{(\d+)\})/g)].map((prop) => [
        prop[1],
        prop[2] ?? prop[3],
      ]),
    );
    for (const field of ['src', 'alt', 'caption', 'width', 'height']) {
      if (!photo[field]) throw new Error(`Publication picture is missing ${field}.`);
    }
    return photo;
  });
}

/**
 * Validate an authored `/images/...` path before it reaches a URL or a copy.
 * Camera originals resolve to R2 in production, so they are validated even
 * when their bytes are not bundled.
 */
export function publicationAssetPath(path) {
  if (!isCanonicalImagePath(path)) {
    throw new Error(`Invalid authored publication asset: ${path}`);
  }
  return path;
}

const resolver = createImageResolver({
  localPrefix: DESKTOP_IMAGE_PREFIX,
  previewPrefix: DESKTOP_PREVIEW_PREFIX,
});
const localAsset = (path) => resolver.local(path);
const pixelAsset = (path) => resolver.preview(path);
const pictureId = (path) =>
  localAsset(path)
    .replace(/^\/images\//, '')
    .replace(/\.[^.]+$/, '')
    .replaceAll('/', '--');

/** Translate only view markup and explicitly authored desktop revision metadata. */
export function desktopArticle(raw, presentation) {
  const { data, body } = publicationDocument(raw);
  const metadata = desktopPublicationMetadata(data, presentation.metadata, localAsset);
  let output = body.replace(/^import .+;\s*$/gm, '');
  output = output.replace(
    /<EditorialNote\b([^>]*)>([\s\S]*?)<\/EditorialNote>/g,
    (_match, attributes, content) => {
      const label = /\blabel="([^"]*)"/.exec(attributes)?.[1] ?? 'NOTE';
      const note =
        label === 'ALBUM' && presentation.viewerNote ? presentation.viewerNote : content.trim();
      return `> **${label}**\n>\n${note
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')}`;
    },
  );
  output = output
    .replace(/<PhotoSet cols=\{(\d+)\}>/g, '<div class="photo-set" data-columns="$1">')
    .replaceAll('</PhotoSet>', '</div>');
  output = output.replace(/<PhotoFigure\s+[\s\S]*?\/>/g, (figure) => {
    const photo = articlePhotos(figure)[0];
    const src = localAsset(photo.src);
    // Article images keep the optimized display asset; the full camera original
    // stays behind the ACDSee media ID instead of loading in every article.
    return `<figure class="photo-figure"><a href="/acdsee/?media=${pictureId(photo.src)}" data-app-link="acdsee"><img src="${escape(src)}" data-original-src="${escape(src)}" data-pixel-src="${escape(pixelAsset(photo.src))}" style="image-rendering:auto" alt="${escape(photo.alt)}" width="${photo.width}" height="${photo.height}" loading="lazy" decoding="async" /></a><figcaption>${escape(photo.caption)}${photo.date ? `<time>${escape(photo.date)}</time>` : ''}</figcaption></figure>`;
  });
  if (/<(?:PhotoFigure|PhotoSet|EditorialNote)\b/.test(output)) {
    throw new Error('An unsupported publication component remains in desktop output.');
  }
  return `---\n${stringify(metadata, { lineWidth: 0 })}---\n\n${output.trim()}\n`;
}

/**
 * Bundled assets stay at each application's public URL; the general mirror owns their bytes.
 * A source-less checkout (CI or a fresh clone without the R2 originals) can only verify the
 * tracked desktop copies against the recorded manifest. Write mode must have the mirror.
 * Camera originals are intentionally excluded: R2 owns them and the desktop records their
 * canonical /images/... paths for PUBLIC_IMAGE_BASE_URL.
 */
export function originalAssetCopies(
  paths,
  generalRoot,
  targetRoot,
  { requireOriginals = false, recorded = new Map() } = {},
) {
  return [...new Set(paths.filter(Boolean))]
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .map((path) => {
      publicationAssetPath(path);
      const source = resolve(generalRoot, `public${path}`);
      const target = resolve(targetRoot, `public${localAsset(path)}`);
      if (
        !source.startsWith(`${resolve(generalRoot, 'public', 'images')}${sep}`) ||
        !target.startsWith(`${resolve(targetRoot, 'public', 'images')}${sep}`)
      ) {
        throw new Error('Publication asset escaped its source or destination.');
      }
      const published = localAsset(path);
      if (existsSync(source)) {
        return { source, target, path: published, sha256: hash(readFileSync(source)) };
      }
      if (requireOriginals) {
        throw new Error(`Missing owner publication original for ${path}: ${source}`);
      }
      if (!existsSync(target)) {
        throw new Error(
          `Missing publication asset ${path}: neither the owner original (${source}) nor the bundled copy (${target}) exists.`,
        );
      }
      const recordedHash = recorded.get(published);
      if (!recordedHash) {
        throw new Error(
          `Missing owner publication original for ${path}; the bundled copy has no recorded hash to verify against.`,
        );
      }
      if (hash(readFileSync(target)) !== recordedHash) {
        throw new Error(
          `Bundled publication copy for ${path} does not match its recorded hash and the owner original is unavailable.`,
        );
      }
      return { source: null, target, path: published, sha256: recordedHash };
    });
}

function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function pruneEmptyDirectories(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) pruneEmptyDirectories(resolve(directory, entry.name));
  }
  if (readdirSync(directory).length === 0) rmdirSync(directory);
}

/** Desktop editions may revise viewing instructions and edition metadata, not shared facts. */
const desktopArticleMetadataKeys = new Set([
  'updated',
  'aiLevel',
  'version',
  'updates',
  'sourceArchive',
]);

function sharedArticlePath(sharedRoot, slug) {
  for (const extension of ['mdx', 'md']) {
    const path = resolve(sharedRoot, 'blog', `${slug}.${extension}`);
    if (existsSync(path)) return path;
  }
  throw new Error(`Desktop article presentation names a missing shared article: ${slug}`);
}

/** Authored article source: the local override wins when one exists. */
export function readSharedArticle(sharedRoot, slug) {
  if (hasLocalContent()) {
    const local = readLocalPublication('blog', slug);
    if (local !== null) return local;
  }
  return readFileSync(sharedArticlePath(sharedRoot, slug), 'utf8');
}

export function validateArticlePresentation(slug, view) {
  // Presentation keys become both source and output paths; never resolve outside the blog tree.
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`Invalid desktop article slug: ${slug}`);
  }
  if (
    !view ||
    (view.viewerNote !== undefined &&
      (typeof view.viewerNote !== 'string' || !view.viewerNote.trim()))
  ) {
    throw new Error(`Desktop article presentation for ${slug} needs a viewer note.`);
  }
  if (!view.metadata || typeof view.metadata !== 'object' || Array.isArray(view.metadata)) {
    throw new Error(`Desktop article presentation for ${slug} needs a metadata object.`);
  }
  const unsupported = Object.keys(view.metadata).filter(
    (key) => !desktopArticleMetadataKeys.has(key),
  );
  if (unsupported.length) {
    throw new Error(
      `Desktop article presentation for ${slug} overrides shared facts: ${unsupported.join(', ')}`,
    );
  }
}

export async function alignPersonalContent({ root = workspaceRoot, check = true } = {}) {
  const sharedRoot = resolve(root, 'packages/site-core/content');
  const generalRoot = resolve(root, 'apps/general');
  const targetRoot = resolve(root, 'apps/desktop');
  // A local real-content override (gitignored content/local/) replaces the
  // whole profile record; without it the tracked template is the source.
  const profile = readLocalProfile() ?? json(resolve(sharedRoot, 'profile.json'));
  const readSharedProject = (file, id) => {
    const local = hasLocalContent() ? readLocalPublication('projects', id) : null;
    return local ?? readFileSync(resolve(sharedRoot, 'projects', file), 'utf8');
  };
  const changes = [];
  const update = async (path, content) => {
    const result = await format(path, content, formatOptions);
    if (result.errors.length) throw new Error(`Could not format publication output: ${path}`);
    content = result.code;
    if (existsSync(path) && readFileSync(path, 'utf8') === content) return content;
    changes.push(path);
    if (!check) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }
    return content;
  };
  const projects = readdirSync(resolve(sharedRoot, 'projects'))
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => projectFacts(readSharedProject(file, file.slice(0, -3)), file.slice(0, -3)))
    .sort(
      (left, right) =>
        (left.order ?? 0) - (right.order ?? 0) ||
        (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    );
  const presentation =
    (hasLocalContent() ? readDesktopLocalPresentation('article-presentation') : null) ??
    json(resolve(targetRoot, 'src/data/article-presentation.json'));
  const photos = [];
  const articleOutputs = [];
  const sharedArticles = readdirSync(resolve(sharedRoot, 'blog'))
    .filter((file) => /\.mdx?$/.test(file))
    .sort();
  const slugs = sharedArticles.map((file) => file.replace(/\.mdx?$/, ''));
  for (const slug of Object.keys(presentation)) {
    if (!slugs.includes(slug))
      throw new Error(`Desktop article presentation names a missing shared article: ${slug}`);
  }
  for (const slug of slugs) {
    // Privacy describes different storage/integrations and keeps its documented
    // desktop legal Adapter. Every other publication shares its authored identity.
    if (slug === 'privacy') continue;
    const view = presentation[slug] ?? { metadata: {} };
    validateArticlePresentation(slug, view);
    const raw = readSharedArticle(sharedRoot, slug);
    const pictures = articlePhotos(raw);
    photos.push(...pictures);
    articleOutputs.push({
      path: resolve(targetRoot, 'src/content/posts', `${slug}.md`),
      content: desktopArticle(raw, view),
    });
  }
  const heroAssets = readdirSync(resolve(sharedRoot, 'blog'))
    .filter((file) => /\.mdx?$/.test(file))
    .map(
      (file) =>
        publicationDocument(readSharedArticle(sharedRoot, file.replace(/\.mdx?$/, ''))).data
          .heroImage,
    )
    .filter(Boolean);
  const displayAssets = [
    profile.profile.avatar,
    ...profile.galleryItems.map((item) => item.imageSrc),
    ...profile.honors.map((item) => item.imageSrc),
    ...projects.map((item) => item.image),
    ...photos.map((photo) => photo.src),
    ...heroAssets,
  ].filter(Boolean);
  // R2 owns camera originals; the desktop bundles only local .webp copies.
  const originalAssets = collectAuthoredOriginals(profile, photos);
  // R2 owns camera originals. Validate every authored path, but only bundle the
  // local display WebP copies and the small WebP originals that already ship.
  for (const path of new Set([...displayAssets, ...originalAssets])) publicationAssetPath(path);
  const manifestPath = resolve(targetRoot, 'docs/personal-assets.generated.json');
  const recordedEntries = existsSync(manifestPath) ? json(manifestPath) : [];
  if (!Array.isArray(recordedEntries)) {
    throw new Error('The recorded publication asset manifest must be an array.');
  }
  const recorded = new Map(recordedEntries.map((entry) => [entry.path, entry.sha256]));
  // Validate every bundled asset before writing so write mode cannot leave half a projection behind.
  const assets = originalAssetCopies(
    [...new Set([...displayAssets, ...originalAssets.filter(isBundledOriginal)])],
    generalRoot,
    targetRoot,
    { requireOriginals: !check, recorded },
  );
  const publicRoot = resolve(targetRoot, 'public');
  const galleryIdentities = new Set(profile.galleryItems.map((item) => item.imageSrc));
  const portfolioPresentation = hasLocalContent()
    ? readDesktopLocalPresentation('portfolio-presentation')
    : null;
  const presentationRecord =
    portfolioPresentation ?? json(resolve(targetRoot, 'src/data/portfolio-presentation.json'));
  const unknownFeatured = presentationRecord.featuredPhotoPaths.filter(
    (path) => !galleryIdentities.has(path),
  );
  if (unknownFeatured.length) {
    throw new Error(
      `Desktop featured pictures are not shared gallery items: ${unknownFeatured.join(', ')}`,
    );
  }
  const expectedGallery = new Set(
    assets.map((asset) => asset.path).filter((path) => path.startsWith('/images/gallery/')),
  );
  const galleryRoot = resolve(publicRoot, 'images/gallery');
  const publishedPath = (file) => `/${relative(publicRoot, file).split(sep).join('/')}`;
  const galleryExtras = filesUnder(galleryRoot)
    .map(publishedPath)
    .filter((path) => !expectedGallery.has(path));
  for (const extra of galleryExtras) {
    const path = resolve(publicRoot, extra.slice(1));
    changes.push(path);
    if (!check) rmSync(path, { force: true });
  }
  if (!check) pruneEmptyDirectories(galleryRoot);
  // The pixel-study tree was desktop-only membership; gallery pictures now come only from profile.json.
  const localGallery = resolve(publicRoot, 'gallery');
  if (existsSync(localGallery) && readdirSync(localGallery).length) {
    throw new Error(
      'Desktop public/gallery contains pictures outside the shared profile; author them in profile.json or remove them.',
    );
  }

  await update(resolve(sharedRoot, 'projects.generated.json'), serialize(projects));
  const libraryArticles = [];
  for (const article of [
    ...articleOutputs,
    {
      path: resolve(targetRoot, 'src/content/posts/privacy.md'),
      content: readFileSync(resolve(targetRoot, 'src/content/posts/privacy.md'), 'utf8'),
    },
  ]) {
    const content =
      basename(article.path) === 'privacy.md'
        ? article.content
        : await update(article.path, article.content);
    const { data } = publicationDocument(content);
    if (data.draft === true || data.listed === false) continue;
    libraryArticles.push({
      slug: relative(resolve(targetRoot, 'src/content/posts'), article.path).replace(/\.md$/, ''),
      title: data.title,
      bytes: Buffer.byteLength(content, 'utf8'),
    });
  }
  libraryArticles.sort((left, right) =>
    left.slug < right.slug ? -1 : left.slug > right.slug ? 1 : 0,
  );
  await update(
    resolve(targetRoot, 'src/data/article-library.generated.json'),
    serialize(libraryArticles),
  );
  await update(
    resolve(targetRoot, 'src/data/article-photos.json'),
    serialize(
      photos.map((photo) => ({ ...photo, full: photo.full ?? photo.src, date: photo.date ?? '' })),
    ),
  );
  for (const { source, target, sha256 } of assets) {
    // A source-less checkout was already verified against the recorded manifest.
    if (!source) continue;
    if (existsSync(target) && hash(readFileSync(target)) === sha256) continue;
    changes.push(target);
    if (!check) {
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
    }
  }
  await update(manifestPath, serialize(assets.map(({ path, sha256 }) => ({ path, sha256 }))));
  return changes;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const write = process.argv.includes('--write');
  const changes = await alignPersonalContent({ check: !write });
  if (changes.length) {
    console.log(
      `${write ? 'Generated' : 'Publication drift in'} ${changes.length} files:\n${changes.join('\n')}`,
    );
    if (!write) process.exitCode = 1;
  } else console.log('Shared publication projections and bundled display copies are fresh.');
}
