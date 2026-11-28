# MHK10 desktop

MHK10 is an interactive Win95-style personal desktop: a 640×360 canvas system
with windows, games, a story and managed HTML clients for readable personal
pages, pictures and articles. It is the `@mhk/desktop` application in the
[MHK10 monorepo](https://github.com/MiraHikari/MHK10).

It is the complementary creative presentation of the site in
[`apps/general`](../general/README.md). The general site is the site itself —
mobile-first, fully server-rendered and admin-enabled. The desktop is
recommended to desktop-class visitors from the general site's hero and loads
only when they accept; phones get a quiet switch hint, deep links stay general,
and both presentations can switch to each other. The two-presentation contract
is documented in [dual presentation](docs/dual-presentation.md); the embed
protocol is in [hybrid desktop](docs/hybrid-desktop.md).

## Workspace

Shared authored facts live in `packages/site-core/content`; the fusion
protocol, reading model and storage interfaces live in
`packages/site-core/src/fusion` and are imported as `@mhk/site-core/fusion/*`.

Run commands from the repository root:

```sh
npm ci
npx playwright install chromium

npm run dev:desktop      # desktop at http://127.0.0.1:4322
npm run dev              # general :4321 + desktop :4322
npm run build:desktop    # static build → apps/desktop/dist
npm run preview          # serve both completed builds (:4321 / :4322)
npm run verify           # full workspace gate
```

Focused desktop checks can also run through the workspace:

```sh
npm run check --workspace @mhk/desktop
npm test --workspace @mhk/desktop
npm run test:e2e --workspace @mhk/desktop -- tests/e2e/<scenario>.spec.ts
```

`npm run verify` runs diagnostics, lint, formatting, architecture rules, content
freshness, Vitest, both builds, desktop site validation and real Chromium
scenarios. Playwright serves its private `.verify/` desktop build on port 4423,
keeping the development server and deployable `dist` output separate.

## Tech stack

- **Astro 7** static output for the shell and per-route HTML; **React 19** for
  interactive surfaces.
- **TypeScript** (`--strict`); a 640×360 integer canvas runtime with
  device-pixel-ratio scaling.
- **Vite+** (`vp`) and npm workspaces for tasks and packages.
- **Vitest** for pure-domain and Interface tests; **Playwright** for the
  desktop Chromium suite and the two-origin fusion suite.
- A shared hybrid layer: the same authored facts, reading model and storage
  interfaces as the general site.

## Use the desktop

- Double-click an icon, or use Start / Find / Run. Drag windows, resize their
  edges, minimize and maximize. F10 activates the focused application's menu
  bar; Ctrl+Esc opens Start; Ctrl+F4 closes the current window; Alt+Space opens
  its system menu.
- Read the profile, projects, gallery and Markdown articles in Reader. Choose
  pixel or smooth text, paper/sepia/night/contrast themes, fixed zoom, line
  spacing, reading width, pages or scroll, focus mode, find, bookmarks,
  highlights, notes, notebook backup/import and portable citations.
- Use Reader's `Ctrl+K` Jump To to find chapters, bookmarks, notes and reading
  tools. Reading estimates use the current body text and position.
- Adjust brightness, contrast and saturation in ACDSee, compare original
  colours, and export a PNG copy with the current rotation and flips. Save
  original reads the camera original through `PUBLIC_IMAGE_BASE_URL`; the local
  display copy keeps the viewer renderable offline.
- Explore work guides in Properties, filter projects by text or technology,
  sort the archive and download a contact card. Native links and the complete
  profile also work without scripts.
- Browse Desktop, My Documents and the read-only publication library. File
  extensions select Notepad, Reader, ACDSee, Pixel, Sound Recorder or Media
  Player; the Recycle Bin, import/export and Save As use the same volume.
- Write in Notepad. Save to My Documents, choose Save As, restore deleted
  files, or export the current document and backups. Save failures keep edits
  open. Old browser files remain compatible.
- Play Minesweeper, chat with the offline assistant, investigate training, and
  choose the story's ending. Replaying the story does not reset your documents.
  Chat can also use a visitor-configured OpenAI-compatible endpoint.
- On touch devices use Fit/100%/200% zoom, Pan, window controls, right click and
  the IME text panel. Native HTML fields use the device keyboard.

The mixed desktop is at `/`, the canvas-only desktop at `/lab/`, and
independently usable applications at `/apps/*`. Legacy `doom95` storage and
message identifiers remain unchanged for compatibility with existing visitor
data.

## Directory structure

- `src/lib/apps/` — desktop applications; each Canvas app exports a typed
  `defineCanvasApp` definition plus a zero-import `*.registration.ts` sidecar.
- `src/lib/os/` — shell, host and embed composition roots.
- `src/lib/` — pure domain modules (story, file system, reading, images, risk).
- `src/components/` — hybrid controls, windows and HTML application surfaces.
- `src/content/posts/` — generated Reader Markdown for the shared articles.
- `src/data/` — presentation JSONs, generated catalog and media manifests.
- `scripts/` — content alignment, catalog generation, font and asset tooling.
- `public/images/` — tracked display WebP copies and local VGA previews.

## Content

The desktop does not own a second copy of the site's facts. Shared sources:

- `packages/site-core/content/profile.json` — identity, skills, honors, gallery
  metadata and friend links
- `packages/site-core/content/projects/*.md` — project records
- `packages/site-core/content/blog/*.mdx` — published articles

Desktop-only presentation choices (prose, labels, category projection, curated
ordering, featured selections) live in
`apps/desktop/src/data/portfolio-presentation.json`. Projections such as
`projects.generated.json`, `src/content/posts/*.md`, `article-photos.json` and
`docs/personal-assets.generated.json` are generated. The tracked `/images/`
tree contains display WebP copies and local VGA previews; large camera
originals stay in object storage and resolve through `PUBLIC_IMAGE_BASE_URL`.
Display copies can be refreshed only when the gitignored local mirror at
`apps/general/public/images/` is present. Do not edit generated files by hand.

```sh
npm run content:check   # fail on drift
npm run content:align   # regenerate projections and tracked display copies
```

The tracked records are template/demo data. To use your own, place whole-record
overrides in the gitignored `packages/site-core/content/local/` and
`apps/desktop/src/data/local/` directories; both presentations resolve them
through the same content source. There is no deep merge. See
[content sources](../../packages/site-core/content/README.md).

## Images in a fork

Authored pictures use `/images/...` identities. `src/data/images.ts` maps them
to `/images/...` display copies and resolves object-storage originals through
`PUBLIC_IMAGE_BASE_URL`. Without a CDN base the display copies still render
offline; full-resolution downloads need either the base or a manually hydrated
local copy.

- Put display derivatives in `public/images/` and keep large originals in
  your object store.
- Regenerate previews and both metadata files with
  `python apps/desktop/scripts/generate-portfolio-previews.py`
  (`--metadata-only` when previews are current); Pillow is required.
- `src/data/media-originals.json` records originals that live only in object
  storage; `src/data/media-files.json` records local tracked files.

Details: [publication content and image provenance](docs/portfolio-source.md).

## Deployment

The desktop is a static Astro build: `npm run build:desktop` writes
`apps/desktop/dist`. There is no Astro adapter or hosting manifest; serve that
directory from any static host or CDN at your chosen origin.

Environment variables are documented in `apps/desktop/.env.example`:

- `PUBLIC_SITE_ORIGIN` — canonical desktop origin for sitemap and metadata
- `PUBLIC_IMAGE_BASE_URL` — shared image CDN base
- `PUBLIC_KOUNTER_URL` — optional visit-counter override
- `PUBLIC_PARENT_ORIGIN` / `PUBLIC_PARENT_ORIGINS` — exact trusted embed
  parents (comma or space separated; `PUBLIC_PARENT_ORIGINS` is preferred)
- `PUBLIC_GENERAL_URL` — general site destination for independently opened
  desktop pages and the Classic Site hand-off
- `PUBLIC_GISCUS_*` — optional comment configuration

When mounted by the general site, the desktop is loaded with `?shell=full`. The
embed host validates the namespace, session, request order, exact origin and
the actual parent/child window before accepting messages.

## Documentation

Start with [project structure and implementation patterns](docs/project-structure.md)
and the [desktop documentation index](docs/README.md). Architecture, Canvas
runtime, rendering modes, story, Reader, fonts and ADRs are linked from there.

## Sources and licenses

- The desktop and fictional story originated in
  [I'm Upping My P(doom) · DOOM OS 95](https://github.com/amemiya02/pdoom-video-win95).
  Song lyrics are by osmarks, after an opening verse and chorus by MusicPerson;
  the Claude-Pop version is by deckard (@slimer48484). No audio from the song is
  included.
- Icons come from
  [React95/icons](https://github.com/React95/React95/tree/master/packages/icons).
  [Source records and transformations](public/icons/react95/README.md) and the
  original license are preserved. The upstream license distinguishes its MIT
  code from Microsoft-owned Windows images; the image collection is not
  relabeled as MIT.
- MS Sans Serif / Bold by lou and the bitmap adaptation are CC BY-SA 3.0;
  [font attribution](docs/fonts/ATTRIBUTION.md) also covers generated brand
  artwork. Press Start 2P uses SIL OFL. The 98.css code uses MIT, separately
  from font licenses. [Chinese font delivery](docs/cjk-pixel-font.md) documents
  the locally bundled Fusion Pixel font, its OFL license and reproducible
  coverage checks.
