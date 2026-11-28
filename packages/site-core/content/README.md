# Authored publication content

This directory owns the shared publication records that both presentations read
from the same npm workspace: the general site and the MHK10 desktop.

> The records tracked here are **template (demo) content** so a fresh clone
> builds and tests out of the box. A site author replaces them at build time
> through the gitignored `content/local` overrides described at the end of this
> document.

## What is shared

| Source          | General view                                      | Desktop view                                                          |
| --------------- | ------------------------------------------------- | --------------------------------------------------------------------- |
| `profile.json`  | `apps/general/src/data/profile.ts`                | `apps/desktop/src/data/profile.ts` plus `portfolio-presentation.json` |
| `projects/*.md` | Astro `projects` collection                       | `projects.generated.json` plus desktop project prose                  |
| `blog/*.mdx`    | Astro `blog` collection and exact source endpoint | Generated Reader Markdown                                             |

`profile.json` carries the general-facing administrator extensions, birthday,
registration details, category identifiers, ordering and editorial text.
Desktop presentation files contain only their different prose, label choices,
category projection, curated ordering, featured selections and viewer revision.
Names, contacts, awards, dates, skills, pictures, project links, tags and
project highlights are authored **once**. Do not copy these facts into a
presentation file.

Desktop presentation maps are keyed by shared identities (project ID, skill
name, journey year, experience/award/principle title). An unknown key, a
duplicate skill placement or a presentation override of a shared fact fails the
desktop build instead of drifting silently. Gallery membership and image
identities come only from `galleryItems`; the desktop gallery has no local-only
pictures. The shared `profile` object owns the hero line, summary, introduction
and detail used by both presentations; presentation files do not override
profile copy.

## Editing and alignment

Edit the Markdown/MDX and `profile.json`, then run `npm run content:align` from
the workspace root. The generator:

- derives browser-safe project facts, every shared article and photo records;
- validates every authored picture path, including originals that live only in
  object storage;
- checks and copies local display copies into the desktop public tree;
- writes the generated projections consumed by both apps.

`npm run content:check` runs the same generator without `--write`, so it fails
instead of writing when a projection or bundled copy is stale.
`apps/desktop/src/data/personal-facts.test.ts` checks freshness through the same
entry point.

Never hand-edit generated files such as `projects.generated.json`,
`article-library.generated.json`, `app-catalog.generated.ts` or the image
manifests. Regenerate them from the authored sources.

## Images

General public assets own the original bytes under
`apps/general/public/images/`. Object storage is canonical for camera originals
at `images/<folder>/...`; the desktop tracks byte-identical display copies at
`/images/` and its VGA previews under `/images/previews/`. Large
`.jpg`/`.png` camera originals are not tracked: desktop records keep their
canonical `/images/...` path and resolve it through `PUBLIC_IMAGE_BASE_URL` in
production. The generated asset manifest hashes every bundled copy.

`content:check` also runs in a fresh clone or CI where the untracked general
originals are absent: an absent original is accepted only when the tracked
`/images/` copy matches its hash in
`apps/desktop/docs/personal-assets.generated.json`. A missing pair or an
unrecorded or mismatched copy fails clearly. `content:align --write` still
requires the originals to refresh the bundled display copies. Metadata for
object-storage-only originals stays in
`apps/desktop/src/data/media-originals.json` so ACDSee properties remain
accurate without network access.

After replacing or adding an original, regenerate previews and both metadata
files with `python apps/desktop/scripts/generate-portfolio-previews.py`, or use
`--metadata-only` when previews are already current. The command inspects the
gitignored mirror for object-storage-only originals; without the mirror it keeps
the tracked metadata and reports the skip.
`apps/desktop/src/data/media-metadata.test.ts` enforces that every authored
original appears in exactly one metadata file. The general font-subsetting
script also scans this directory so new authored characters are covered.

The general `/admin` writes these authored paths in GitHub. Generated
projections and desktop presentation files are outside its write allowlist.
Object keys stay `images/<folder>/...` independently of monorepo Git paths.
Saving a shared project or profile affects both builds; commit the regenerated
projections, or run `npm run content:align` in the deployment pipeline, before
building.

## Local overrides

The tracked sources are template (demo) data. A site author keeps their real
authored records in **gitignored** `local/` siblings, which every consumer
resolves through `scripts/content-source.mjs`:

| Template (tracked)                                  | Local override (gitignored)                               |
| --------------------------------------------------- | --------------------------------------------------------- |
| `packages/site-core/content/profile.json`           | `packages/site-core/content/local/profile.json`           |
| `packages/site-core/content/projects/*.md`          | `packages/site-core/content/local/projects/*.md`          |
| `packages/site-core/content/blog/*.{md,mdx}`        | `packages/site-core/content/local/blog/*.{md,mdx}`        |
| `apps/desktop/src/data/portfolio-presentation.json` | `apps/desktop/src/data/local/portfolio-presentation.json` |
| `apps/desktop/src/data/article-presentation.json`   | `apps/desktop/src/data/local/article-presentation.json`   |

Rules:

- **Overrides replace whole records; there is no merge.** A local
  `profile.json` replaces the entire template profile; a local
  `projects/<slug>.md` or `blog/<slug>.mdx` replaces that one file by slug, for
  the same slugs as the tracked template. A partially merged biography is worse
  than a missing one. Local presentation JSONs likewise replace their whole
  tracked counterpart.
- The overrides are gitignored (`packages/site-core/content/local/` and
  `apps/desktop/src/data/local/`) and are never published or committed.
- Both `npm run content:align` and `npm run content:check` resolve sources
  through the same mechanism: with overrides present they read the local records
  and validate the resulting projections exactly like template runs.
  `content:align` still requires the local image mirror to refresh bundled
  display copies.
- Types still come from the tracked template, so a local file that drifts from
  the expected shape fails the type check instead of drifting silently.

Contributors should only edit the tracked template records; do not commit
personal data into them. Adapt the repository for your own site through these
overrides.
