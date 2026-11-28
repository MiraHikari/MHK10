import { APP_CATALOG, type CatalogApp } from './app-catalog';
import { mediaCatalog, mediaFileInfo } from './media';
import { redirectedArticleFileId } from './article-redirects';
import { localImageSrc } from './images';
import articleMetadata from './article-library.generated.json';

type LibraryId = `library:${string}`;
interface LibraryFile {
  id: LibraryId;
  name: string;
  content: string;
  folder: LibraryId;
  source: 'personal';
  deleted: false;
  readonly: true;
  kind: 'text' | 'image' | 'shortcut';
  mime?: string;
  size?: number;
  assetId?: string;
  target?: { appId: string; fileId?: string };
}
const folders: { id: LibraryId; name: string; parent?: LibraryId; readonly: true }[] = [
  { id: 'library:root', name: 'Library', readonly: true },
  { id: 'library:articles', name: 'Articles', parent: 'library:root', readonly: true },
  { id: 'library:pictures', name: 'Pictures', parent: 'library:root', readonly: true },
  { id: 'library:programs', name: 'Programs', parent: 'library:root', readonly: true },
];
const files: LibraryFile[] = [];
const routes = new Map<string, { application: string; href: string }>();
const assets = new Map<string, string>();
const documents = import.meta.glob<string>('../content/posts/*.md', {
  query: '?raw',
  import: 'default',
});
export const publicArticles = articleMetadata;
/** The generated catalog owns identities; body modules load only for a selected article. */
export function readPublicArticle(slug: string): Promise<string | undefined> {
  if (!publicArticles.some((article) => article.slug === slug)) return Promise.resolve(undefined);
  return documents[`../content/posts/${slug}.md`]?.() ?? Promise.resolve(undefined);
}
for (const { slug, bytes } of publicArticles) {
  const id: LibraryId = `library:article:${slug}`;
  files.push({
    id,
    name: `${slug}.md`,
    folder: 'library:articles',
    source: 'personal',
    content: '',
    deleted: false,
    readonly: true,
    kind: 'text',
    mime: 'text/markdown',
    size: bytes,
  });
  routes.set(id, { application: 'blog', href: `/blog/${encodeURIComponent(slug)}/` });
}
for (const media of mediaCatalog) {
  const id: LibraryId = `library:image:${media.id}`,
    assetId = `library-asset:${media.id}`;
  // Native file services retain a trusted same-origin asset even when HTML
  // pictures use the CDN. The mounted filename and metadata describe that file.
  const path = localImageSrc(media.display);
  if (!path.startsWith('/') || path.startsWith('//')) continue;
  const info = mediaFileInfo(path);
  if (!info) throw new Error(`Missing publication picture metadata: ${path}`);
  const format = info.format.toLowerCase();
  const mime =
    format === 'svg'
      ? 'image/svg+xml'
      : format === 'jpg' || format === 'jpeg'
        ? 'image/jpeg'
        : `image/${format}`;
  files.push({
    id,
    name: decodeURIComponent(path.split('/').at(-1)!),
    folder: 'library:pictures',
    source: 'personal',
    content: '',
    deleted: false,
    readonly: true,
    kind: 'image',
    mime,
    size: info.bytes,
    assetId,
  });
  assets.set(assetId, path);
  routes.set(id, { application: 'acdsee', href: `/acdsee/?media=${encodeURIComponent(media.id)}` });
}
for (const app of APP_CATALOG as readonly CatalogApp[]) {
  if (app.kind !== 'canvas' && app.kind !== 'html') continue;
  files.push({
    id: `library:app:${app.id}`,
    name: `${app.name.replace(/[<>:"/\\|?*]/g, '-')}.lnk`,
    folder: 'library:programs',
    source: 'personal',
    content: '',
    deleted: false,
    readonly: true,
    kind: 'shortcut',
    target: { appId: app.id },
  });
}
/** Trusted bundled records are mounted read-only and never copied into the visitor snapshot. */
export const publicLibrary = {
  folders,
  files,
  readText: (id: string) =>
    id.startsWith('library:article:')
      ? readPublicArticle(id.slice('library:article:'.length))
      : Promise.resolve(undefined),
};
export const publicFileTarget = (id: string) => routes.get(redirectedArticleFileId(id) ?? id);
export const publicAssetPath = (id: string) => assets.get(id);
