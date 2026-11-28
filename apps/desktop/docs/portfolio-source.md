# Desktop publication content and image sources

The desktop reads its personal records and articles from the workspace's single
authored source, `packages/site-core/content`. Generated projections and bundled
display copies are derived from it; no command reads another checkout.

The tracked records are **template (demo) content**. A site author replaces them
through the gitignored local overrides documented in
[content sources](../../../packages/site-core/content/README.md).

## Personal records

`packages/site-core/content/profile.json` owns the shared profile facts: skills
and categories, learning subjects, honors, experiences, education, milestones,
principles, certificates, languages, friend links and gallery items. Names,
contact addresses, awards, dates, qualifications, gallery membership and image
identities are authored once.

Desktop-only style, labels, ordering, featured selections and editorial voice
live in `apps/desktop/src/data/portfolio-presentation.json` and the desktop
adapters; the loader rejects any attempt to override a shared fact or reference
an unknown record.

`packages/site-core/content/projects/*.md` contains the project records.
`projects.generated.json` is a browser-safe projection generated from those
Markdown files; About owns the complete project notes, Home links to selected
projects, and Skills does not repeat them.

## Articles

`packages/site-core/content/blog/*.{md,mdx}` owns the prose. `npm run
content:align` projects the shared MDX into the desktop's Reader-facing Markdown,
replacing only explicitly authorized view markup and edition metadata. The
generated desktop edition may change viewer instructions and revision metadata,
never the shared facts.

- The travelogue article keeps its authored alt text, captions, dimensions,
  dates and canonical source paths; camera originals stay in object storage. The
  desktop edition may update obsolete image-viewer instructions to describe
  ACDSee.
- The colophon article presents the shared site colophon in both applications;
  its authored narrative and metadata come from site-core.
- The technical article is authored in site-core and readable in both
  applications.
- The privacy article is reachable and indexable, but the two presentations use
  their documented legal adapters. The general site keeps it unlisted; the
  desktop lists it as an Announcement in Reader and RSS.
- An obsolete short route may remain as an immediate `noindex` redirect with a
  canonical link, absent from the sitemap, RSS and Reader library.

`docs/portfolio-articles.json` is a frozen provenance manifest: it records the
import-time narrative, photo properties and source hashes.
`src/data/portfolio-articles.test.ts` checks the preserved narrative, photo
records, source-media hashes and catalog uniqueness. It is a provenance
manifest, not a second hand-maintained catalog.

`src/data/article-library.generated.json` records each listed desktop article's
stable slug, title and UTF-8 byte size. The content alignment command derives it
from the same projected Markdown, including the authored desktop privacy
adapter. The filesystem mounts those facts without eagerly bundling article
bodies. Its injected text loader imports only a selected body when Reader's
native file channel, Notepad, a copy operation or Print Preview needs it.
Copies materialize complete text into ordinary visitor records; no lazy source
reference is saved in a visitor file or backup.

## Shared picture browser

`src/data/media.ts` derives the picture set from the gallery, project, honor,
profile and article records. Article photographs may reuse existing gallery
images. `src/data/article-photos.json` is generated from the shared MDX photo
properties; it is not a second hand-maintained catalog.

All personal images and article photographs enter `/acdsee/` through a validated
media ID. ACDSee owns viewing, sorting, file properties, zoom/pan,
rotation/flips, slideshow, original download, printing and session-local file
opening. Rotation and flipping change the view and may be applied to an
explicitly exported PNG copy. Brightness, contrast and saturation share the same
pure processing rules in the preview and export. The original files remain
unchanged. Local file URLs, observers, listeners and slideshow timers are
released with the client.

Authored display images and avatars use their full-colour source by default.
The desktop image-style preference can opt into the existing 16-colour previews;
ACDSee also offers an explicit session pixel-preview option. `PortfolioImage`
and `image-presentation` share the image source switching. The page-level
gallery does not maintain a competing viewer.

The desktop bundle keeps display WebP files and local-only VGA previews under
`public/images/`. Large camera originals are not tracked. Object storage is
canonical for them at `images/…`; `src/data/media.ts` resolves each
`downloadSrc`/`full` path through `PUBLIC_IMAGE_BASE_URL`, while the display
WebP stays local for offline rendering and the ACDSee image surface prefers it
through `srcset`. Import-time dimensions, formats and byte sizes for the
object-storage-only originals remain in `src/data/media-originals.json`, so
ACDSee properties and size sorting stay accurate without a network request.
`src/data/media-files.json` records the local tracked files. One command writes
both metadata files and the previews:
`python apps/desktop/scripts/generate-portfolio-previews.py` (Pillow required);
use `--metadata-only` when previews are already current. It derives the original
set from the authored `downloadSrc`/`full` paths, inspects bundled files in
`public/portfolio`, and inspects the gitignored `apps/general/public/images`
mirror. Without the mirror (a fresh clone or CI), it keeps the tracked original
metadata and prints an explicit skip instead of erasing it.

`src/data/images.ts` maps authored `/images/…` identities to the desktop's
`/images/…` tree. An optional `PUBLIC_IMAGE_BASE_URL` selects the canonical
CDN path; local `/images/…` paths resolve back to the same `/images/…`
object key before adding the base. VGA previews stay on this origin. Visitor
binaries in IndexedDB are a separate store and are not part of this resolver.
In production, ACDSee's "Save original…" link reads the object-storage original;
pixel adjustments and adjusted-copy export use the same-origin display copy.
Without a CDN base the display image still renders offline; the original link
points at the local path, so full-resolution download requires either
`PUBLIC_IMAGE_BASE_URL` or a manually hydrated, uncommitted copy from
`apps/general/public/images/` to the matching `public/images/` path.

## Generation and freshness

`npm run content:check` validates the shared projections, the tracked desktop
display copies and the source-less checkout case. `npm run content:align`
regenerates them from the authored sources and requires
`apps/general/public/images/` (the gitignored image mirror) for any new or
changed display copy. It validates every authored picture path, including the
object-storage-only camera originals, but copies only local WebP files. The
desktop display copies are tracked, so CI can verify their manifest hashes
without the image mirror; when the mirror copy is present, the generator also
compares the bytes. An extra file under `public/images/gallery/` or the
retired `public/gallery/` fails the check rather than silently shipping an
unowned image.

`apps/general/public/images/` remains the local sync source and is not
committed. Object keys stay `images/…`; the desktop's `/images/…` display
tree is a generated mirror. `src/data/media-metadata.test.ts` enforces that every
authored original has metadata in exactly one of the two files, that the
object-storage-only keys stay out of local metadata, and that
`media-files.json` matches the bundled image files exactly. Publication previews
are checked against the authored records, and the general admin writes only the
shared authored paths in `packages/site-core/content`.

## Interface and evidence

Application controls use one language; authored personal text, article prose and
photo captions retain their own. Personal pages adopt the shared hybrid Toolbar,
Button, Select and Tabs components. ACDSee additionally uses MenuBar, StatusBar,
Dialog and Tree. CJK content uses the native MHK CJK font, separately from the
MSS control metrics.

Browser coverage is in `apps/desktop/tests/e2e/personal-content.spec.ts` and
`articles-images.spec.ts`. Fusion coverage is in `tests/fusion/switch.spec.ts`.
Rendered desktop, mobile and narrow client captures remain QA evidence, not
application assets.
