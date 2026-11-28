import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import {
  IMAGE_SUFFIXES,
  PREVIEW_SECTIONS,
  collectAuthoredOriginals,
  compareStrings,
  displayCopyPath,
  mediaBytesProblem,
  mediaInfoProblems,
  previewCap,
  publishedPath,
  splitAuthoredOriginals,
} from './media-policy.mjs';
import { readLocalProfile } from '../../../scripts/content-source.mjs';

/**
 * Freshness gate for the desktop media projections. It mirrors the generator
 * policy in `generate-portfolio-previews.py`: WebP originals are bundled,
 * every other authored original is R2-only, and previews are derived from the
 * display WebPs. Run after `align-personal-content.mjs` so metadata, bundled
 * copies and previews are checked against the authored profile in one place.
 */
const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(desktopRoot, '../..');
const publicRoot = join(desktopRoot, 'public');
const imagesRoot = join(publicRoot, 'images');
const previewRoot = join(imagesRoot, 'previews');
const legacyGalleryRoot = join(publicRoot, 'gallery');
// Camera originals stay outside Git; content generation needs this local mirror.
const mirrorRoot = join(workspaceRoot, 'apps/general/public/images');
// Git does not preserve mtimes. Preview ordering is only meaningful during
// local authoring, when the R2 mirror exists; a fresh checkout writes derived
// files in arbitrary order.
const mirrorPresent = existsSync(mirrorRoot);
// Filesystem timestamp granularity and checkout ordering can put a derived
// file a few milliseconds before its source; a real edit is far larger.
const previewMtimeToleranceMs = 2_000;
const dataRoot = join(desktopRoot, 'src/data');

const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const under = (root, file) => {
  const target = resolve(root, `.${file}`);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error(`Media path escapes its root: ${file}`);
  }
  return target;
};

function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

const problems = [];
const fail = (message) => problems.push(message);

function compareKeys(label, actual, expected) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  for (const key of expected) if (!actualSet.has(key)) fail(`${label}: missing entry ${key}`);
  for (const key of actual) if (!expectedSet.has(key)) fail(`${label}: unexpected entry ${key}`);
}

function checkStructure(label, key, info) {
  const issues = mediaInfoProblems(label, key, info);
  for (const issue of issues) fail(issue);
  return issues.length === 0;
}

function checkBytes(label, key, info, actualBytes) {
  const issue = mediaBytesProblem(label, key, info, actualBytes);
  if (issue) fail(issue);
}

const profile =
  readLocalProfile() ?? json(join(workspaceRoot, 'packages/site-core/content/profile.json'));
const photos = json(join(dataRoot, 'article-photos.json'));
const localFiles = json(join(dataRoot, 'media-files.json'));
const originalFiles = json(join(dataRoot, 'media-originals.json'));

if (!Array.isArray(profile.galleryItems) || !Array.isArray(profile.honors)) {
  throw new Error('profile.json must contain galleryItems and honors arrays.');
}
if (!Array.isArray(photos)) throw new Error('article-photos.json must be an array.');

const authoredOriginals = collectAuthoredOriginals(profile, photos);
const { bundledOriginals, r2Only } = splitAuthoredOriginals(authoredOriginals);
const r2Keys = new Set(r2Only);

// Metadata must describe exactly the files that are in the checkout plus the
// authored R2 originals, with no key appearing in both files.
compareKeys('media-originals.json', Object.keys(originalFiles).sort(compareStrings), r2Only);
const expectedLocal = [
  ...filesUnder(imagesRoot).map((file) => publishedPath(publicRoot, file)),
  ...filesUnder(legacyGalleryRoot).map((file) => publishedPath(publicRoot, file)),
]
  .filter((path) => IMAGE_SUFFIXES.has(extname(path).toLowerCase()) && !r2Keys.has(path))
  .sort(compareStrings);
compareKeys('media-files.json', Object.keys(localFiles).sort(compareStrings), expectedLocal);
for (const key of bundledOriginals) {
  if (!Object.hasOwn(localFiles, key)) fail(`media-files.json: missing bundled original ${key}`);
}
for (const key of r2Only) {
  if (Object.hasOwn(localFiles, key)) fail(`media-files.json: R2-only original is bundled: ${key}`);
}

for (const [key, info] of Object.entries(localFiles)) {
  const structured = checkStructure('media-files.json', key, info);
  const file = under(publicRoot, key);
  if (!existsSync(file)) {
    fail(`media-files.json: ${key} has no bundled file`);
    continue;
  }
  if (structured) checkBytes('media-files.json', key, info, statSync(file).size);
}

// Structural metadata is always verifiable; only the byte comparison needs
// the gitignored R2 mirror.
const malformedOriginals = new Set();
for (const [key, info] of Object.entries(originalFiles)) {
  if (!checkStructure('media-originals.json', key, info)) malformedOriginals.add(key);
}
if (mirrorPresent) {
  for (const [key, info] of Object.entries(originalFiles)) {
    if (malformedOriginals.has(key)) continue;
    const source = under(mirrorRoot, key.replace(/^\/images/, ''));
    if (!existsSync(source)) {
      fail(`media-originals.json: ${key} is missing from the R2 mirror at ${source}`);
      continue;
    }
    checkBytes('media-originals.json', key, info, statSync(source).size);
  }
} else {
  console.log(
    `R2 mirror absent at ${mirrorRoot}; skipped original byte checks and preview mtime checks.`,
  );
}

const previewFiles = filesUnder(previewRoot);
for (const file of previewFiles) {
  const published = publishedPath(publicRoot, file);
  if (!file.toLowerCase().endsWith('.png')) {
    fail(`${published}: unexpected non-PNG preview`);
    continue;
  }
  const rel = relative(previewRoot, file);
  const display = join(imagesRoot, rel.replace(/\.png$/i, '.webp'));
  if (!existsSync(display)) {
    fail(`${published}: preview is orphaned (missing ${publishedPath(publicRoot, display)})`);
    continue;
  }
  if (
    mirrorPresent &&
    statSync(file).mtimeMs + previewMtimeToleranceMs < statSync(display).mtimeMs
  ) {
    fail(`${published}: preview is older than its display WebP; regenerate previews`);
  }
  const section = rel.split(sep)[0];
  const { width: maxWidth, height: maxHeight } = previewCap(section);
  const { width, height } = PNG.sync.read(readFileSync(file));
  if (width < 1 || height < 1 || width > maxWidth || height > maxHeight) {
    fail(
      `${published}: preview is ${width}x${height}; the generator caps ${section} previews at ${maxWidth}x${maxHeight}`,
    );
  }
}

// The generator still expects a preview for every WebP that is not itself a
// display copy. Missing previews would otherwise pass the orphan scan.
for (const section of PREVIEW_SECTIONS) {
  const sectionRoot = join(imagesRoot, section);
  for (const file of filesUnder(sectionRoot)) {
    if (!file.toLowerCase().endsWith('.webp')) continue;
    if (existsSync(displayCopyPath(file))) continue;
    const preview = join(
      previewRoot,
      section,
      relative(sectionRoot, file).replace(/\.webp$/i, '.png'),
    );
    if (!existsSync(preview)) {
      fail(
        `${publishedPath(publicRoot, file)}: missing preview ${publishedPath(publicRoot, preview)}`,
      );
    }
  }
}

if (problems.length) {
  for (const problem of problems) console.error(problem);
  console.error(`Media freshness check failed with ${problems.length} problem(s).`);
  process.exitCode = 1;
} else {
  console.log(
    `Verified ${Object.keys(localFiles).length} bundled files, ${r2Only.length} R2 originals and ${previewFiles.length} previews; media metadata is fresh.`,
  );
}
