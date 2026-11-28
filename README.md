# MHK10

[![Verify](https://github.com/MiraHikari/MHK10/actions/workflows/verify.yml/badge.svg)](https://github.com/MiraHikari/MHK10/actions/workflows/verify.yml)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg)](LICENSE)
[![Content: CC BY-NC-SA 4.0](https://img.shields.io/badge/content-CC%20BY--NC--SA%204.0-lightgrey.svg)](LICENSE-CONTENT)
[![Node 24](https://img.shields.io/badge/node-24.x-339933.svg)](.node-version)

MHK10 is an open-source monorepo for a personal website. It ships **two
complementary presentations of one authored-content source**: a classic,
mobile-first Astro site, and a 640×360 canvas desktop that reimagines the same
profile, projects, photographs and articles as a fictional operating system.

Both presentations read the same facts from a shared core, keep their own
layouts and interactions, and can hand a visitor from one to the other. Every
visit starts on the classic site; the desktop is recommended, never entered
silently.

The repository ships **template (demo) content** so it builds and passes tests
out of the box. Replace it with your own material through the local-override
mechanism described below.

## The two presentations

| Presentation | Package        | What it is                                                                                           |
| ------------ | -------------- | ---------------------------------------------------------------------------------------------------- |
| **General**  | `@mhk/general` | The site: a static Astro build with a single React island, fullpage section navigation and `/admin`. |
| **Desktop**  | `@mhk/desktop` | MHK10: a Win95-style canvas desktop with draggable windows, applications, a story and a Reader.      |

They share authored facts, article sources and reading data through
`packages/site-core`, but keep separate layouts, fonts, interactions and build
outputs. The general site owns the switch:

- `PUBLIC_DESK_URL` is the kill switch. When unset, the desktop is bypassed and
  every visit stays classic.
- On a desktop-class viewport the hero offers a dismissible desktop
  recommendation; only accepting it loads the desktop and remembers the choice.
  Phones, coarse-pointer and Save-Data/2G visitors get a one-line hint instead.
- A stored preference follows the visitor to every route, including direct
  article and section links. Visitors can switch back at any time through the
  edge toggle, the command palette (`mode-win95` / `mode-classic`), the desktop
  Start menu or an explicit `?view=` query.

The general site's HTML is always complete and readable without JavaScript; the
desktop is progressively embedded on top.

## Feature highlights

**General site**

- Fullpage section navigation with scroll-snapped sections and animated
  transitions; graceful static fallback.
- Blog and project collections with MDX, RSS/Atom, a Markdown source endpoint,
  `llms.txt`, sitemap and rich SEO/JSON-LD output.
- A browser-only `/admin` editor that writes the shared content back to a
  GitHub repository through a personal access token.
- Optional object-storage image pipeline with generated display derivatives.
- Light/dark theming, a command palette, reduced-motion support and a
  no-JavaScript reading path.

**MHK10 desktop**

- A 640×360 logical canvas with windows, menus, drag/resize/minimize and
  keyboard control, scaled to any viewport.
- A read-only publication library plus Notepad, ACDSee-style image tools,
  Minesweeper, a sound recorder, a media player and more.
- Reader with marks, bookmarks, notes, highlights, find, themes, zoom and
  portable citations.
- A branching story, an offline assistant and an optional OpenAI-compatible
  chat endpoint.
- A managed HTML runtime for accessible pages that cannot live on the canvas.
- A postMessage fusion protocol so the site can host the desktop full-screen
  with exact-origin and window-identity validation.

## Tech stack

- **Astro 7** static output, no Astro adapter; **React 19** islands.
- **TypeScript** (`--strict`), **Tailwind CSS 4**, **MDX**.
- **motion** for choreography, **ogl** for WebGL effects.
- **Vite+** (`vp`) as task/test runner; npm workspaces for the monorepo.
- **Vitest** for unit/Interface tests, **Playwright** for Chromium and
  cross-origin fusion scenarios.
- Optional **Cloudflare R2** (or any S3-compatible store) for images, plus
  GitHub for authoring.

## Quick start

Requirements: **Node 24** and **npm 11**. The workspace has one
`package-lock.json`.

```sh
npm ci
npx playwright install chromium
npm run dev
```

- General site: <http://127.0.0.1:4321>
- MHK10 desktop: <http://127.0.0.1:4322>

Both servers run with example defaults, so the apps work offline with the
tracked template content. Run `npm run build` for static output and
`npm run preview` to serve the completed builds.

## Repository layout

| Path                 | Package          | Role                                                                      |
| -------------------- | ---------------- | ------------------------------------------------------------------------- |
| `apps/general`       | `@mhk/general`   | Classic fullpage site, `/admin`, image pipeline and display-mode host     |
| `apps/desktop`       | `@mhk/desktop`   | MHK10 canvas desktop, story, Reader, file system and desktop applications |
| `packages/site-core` | `@mhk/site-core` | Fusion protocol, reading model, publication schema and authored content   |
| `scripts`            | workspace root   | Dev/preview drivers, formatting and verification                          |
| `tests/fusion`       | workspace root   | Two-origin Playwright scenarios for the embedded desktop                  |

Inside an app, `src/` holds pages, components, domain modules and composition
roots; application-specific generators live in that app's `scripts/`. Every
app keeps its own `docs/` tree with architecture and design notes.

## Commands

Run from the repository root.

| Command                        | Result                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `npm run dev`                  | Both apps: general at <http://127.0.0.1:4321>, desktop at <http://127.0.0.1:4322> |
| `npm run dev:general`          | General only, port 4321                                                           |
| `npm run dev:desktop`          | Desktop only, port 4322                                                           |
| `npm run build`                | Static builds in `apps/general/dist` and `apps/desktop/dist`                      |
| `npm run build:general`        | General build only                                                                |
| `npm run build:desktop`        | Desktop build only                                                                |
| `npm run preview`              | Serve both completed builds on ports 4321 and 4322                                |
| `npm run check`                | Astro and TypeScript diagnostics for every workspace                              |
| `npm run lint`                 | Workspace lint                                                                    |
| `npm test`                     | Vitest across desktop, general and site-core                                      |
| `npm run test:e2e`             | Desktop Chromium scenarios (`apps/desktop/tests/e2e`)                             |
| `npm run test:e2e:fusion`      | Both origins served together; device defaults, switching and reading sync         |
| `npm run content:check`        | Fail when generated projections or bundled display copies drift                   |
| `npm run content:align`        | Regenerate projections and tracked desktop display copies                         |
| `npm run generate:app-catalog` | Regenerate the desktop application catalog after editing registration sidecars    |
| `npm run format -- <paths>`    | Check/format selected files; without paths, the whole workspace                   |
| `npm run verify`               | Full quality gate                                                                 |

Focused iteration:

```sh
npm test -- packages/site-core/src/fusion/protocol-model.test.ts
npm run test:e2e -- apps/desktop/tests/e2e/<scenario>.spec.ts
npm run test:e2e:fusion
```

`npm run verify` runs diagnostics, lint, formatting, architecture checks,
`content:check`, Vitest, both builds, generated-site validation, the desktop
Chromium suite and the cross-app fusion suite. Browser configurations build
into private `.verify/` outputs so the deployable `apps/*/dist` trees and
development ports stay untouched.

## Content and local overrides

Authored facts live once in `packages/site-core/content`:

- `profile.json` — identity, skills, honors, gallery metadata and friend links.
- `projects/*.md` — project records.
- `blog/*.mdx` — articles.

Desktop-only presentation choices (prose, labels, category projection, curated
ordering, featured selections) live in
`apps/desktop/src/data/portfolio-presentation.json`. Everything generated —
`projects.generated.json`, `article-library.generated.json`,
`app-catalog.generated.ts`, image manifests and `/images/` display copies —
derives from those sources. Never hand-edit generated files.

To run your own site without forking the demo data, put **gitignored local
overrides** beside the templates. Overrides replace whole records; there is no
deep merge.

| Template (tracked)                                  | Local override (gitignored)                               |
| --------------------------------------------------- | --------------------------------------------------------- |
| `packages/site-core/content/profile.json`           | `packages/site-core/content/local/profile.json`           |
| `packages/site-core/content/projects/*.md`          | `packages/site-core/content/local/projects/*.md`          |
| `packages/site-core/content/blog/*.{md,mdx}`        | `packages/site-core/content/local/blog/*.{md,mdx}`        |
| `apps/desktop/src/data/portfolio-presentation.json` | `apps/desktop/src/data/local/portfolio-presentation.json` |
| `apps/desktop/src/data/article-presentation.json`   | `apps/desktop/src/data/local/article-presentation.json`   |

After changing shared content, run `npm run content:align` and commit the
regenerated projections, or run it in your deployment pipeline before building.
Full details: [packages/site-core/content/README.md](packages/site-core/content/README.md).

## Environment variables

Both apps are static builds configured at build time. Real values belong in
each app's `.env` (gitignored) or in your hosting provider's environment
settings. Every variable is optional; the repository defaults to `example.com`
placeholders so a fresh clone builds.

| App     | Variables                                                                                                                                                                                                      |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| General | `PUBLIC_SITE_ORIGIN`, `PUBLIC_IMAGE_BASE_URL`, `PUBLIC_DESK_URL`, `PUBLIC_KOUNTER_URL`, `PUBLIC_GISCUS_*`; `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` for the local image sync and admin upload |
| Desktop | `PUBLIC_SITE_ORIGIN`, `PUBLIC_IMAGE_BASE_URL`, `PUBLIC_KOUNTER_URL`, `PUBLIC_GISCUS_*`, `PUBLIC_PARENT_ORIGIN` / `PUBLIC_PARENT_ORIGINS`, `PUBLIC_GENERAL_URL`                                                 |

`PUBLIC_SITE_ORIGIN` must be each presentation's real origin for canonical
URLs, the sitemap and RSS. `PUBLIC_PARENT_ORIGIN(S)` and `PUBLIC_GENERAL_URL`
must be exact origins; the fusion protocol rejects wildcards. See each app's
`.env.example` for the annotated list.

## Deploying to any static host

Both applications build to plain static files. There is no Astro adapter or
hosting manifest in this repository, so you can serve the outputs from any
static host or CDN — Nginx, S3 + CloudFront, Cloudflare Pages, Netlify, Vercel,
GitHub Pages, or your own server.

1. Build with Node 24 and npm 11:
   ```sh
   npm ci
   npm run content:align   # only when shared content changed
   npm run build
   ```
2. Publish `apps/general/dist` to your site origin and `apps/desktop/dist` to
   the desktop origin (or the same origin under a path).
3. Set the environment variables above in each hosting project, then rebuild.
   They are baked into the static output.
4. Verify `robots.txt`, `sitemap-index.xml`, `llms.txt`, `rss.xml` and
   `atom.xml` in the general output, and open the desktop directly before
   embedding it.

If you embed the desktop, allow the site origin in the desktop's
`PUBLIC_PARENT_ORIGINS` and the desktop origin in the site's CSP `frame-src`.
HTML should be served with short cache and revalidation; hashed assets under
`_astro/` can be cached for a long time. Never treat a 200 HTML fallback as a
successful image or script. The full guide is in
[apps/general/docs/deployment.md](apps/general/docs/deployment.md).

## Documentation

- [General application guide](apps/general/README.md)
- [Desktop application guide](apps/desktop/README.md)
- [General documentation index](apps/general/docs/README.md)
- [Desktop documentation index](apps/desktop/docs/README.md)
- [Architecture: general](apps/general/docs/architecture.md) ·
  [desktop](apps/desktop/docs/architecture.md)
- [Dual presentation](apps/desktop/docs/dual-presentation.md) ·
  [hybrid desktop](apps/desktop/docs/hybrid-desktop.md)
- [Content sources and overrides](packages/site-core/content/README.md)
- [Deployment](apps/general/docs/deployment.md) ·
  [image pipeline](apps/general/docs/r2-images.md) ·
  [admin guide](apps/general/docs/admin-guide.md)

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup,
code standards, testing and content workflow, and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community expectations. Keep
mechanical formatting separate from behavior changes, and run
`npm run verify` before opening a pull request.

## Security

Please report vulnerabilities privately rather than in a public issue. See
[SECURITY.md](SECURITY.md) for scope, the reporting channel and response
expectations.

## License

- **Code** is licensed under the GNU General Public License v3.0 or later — see
  [LICENSE](LICENSE).
- **Authored content** (profile copy, articles, photography, project
  descriptions, desktop story text and bundled display images under
  `apps/desktop/public/images/`) is licensed under Creative Commons
  Attribution-NonCommercial-ShareAlike 4.0 International — see
  [LICENSE-CONTENT](LICENSE-CONTENT).
- **Bundled fonts** under `apps/desktop/public/fonts/` keep their own SIL Open
  Font License terms; see the
  [font attribution](apps/desktop/docs/fonts/ATTRIBUTION.md).

The template content shipped in this repository is demo material. Replace it
with your own before publishing a real site.

## Credits

- The desktop and its fictional story began with
  [I'm Upping My P(doom) · DOOM OS 95](https://github.com/amemiya02/pdoom-video-win95).
  Song lyrics are by osmarks, after an opening verse and chorus by
  MusicPerson; the Claude-Pop version is by deckard (@slimer48484). No audio
  from the song is included.
- The general site's visual and interaction design derives from
  [Baesory](https://gbclstudio.cn/).
- Desktop icons come from
  [React95/icons](https://github.com/React95/React95/tree/master/packages/icons).
  Source records, transformations and the original license are preserved under
  `apps/desktop/public/icons/react95/`; the upstream license distinguishes MIT
  code from Microsoft-owned Windows images, and the image collection is not
  relabeled as MIT.
- MS Sans Serif / Bold by lou and the bitmap adaptation are CC BY-SA 3.0;
  [font attribution](apps/desktop/docs/fonts/ATTRIBUTION.md) also covers
  generated brand artwork. Press Start 2P uses SIL OFL, 98.css uses MIT, and
  the bundled Fusion Pixel font is SIL OFL with its license and coverage notes
  in [Chinese font delivery](apps/desktop/docs/cjk-pixel-font.md).
- General fonts: HarmonyOS Sans SC is locally subset, Space Grotesk and Dancing
  Script come from Google Fonts, and JetBrains Mono and Instrument Serif come
  from Fontsource. See [typography](apps/general/docs/typography.md).
- The demo background music (`apps/general/public/bgm.mp3`) is bundled only as
  sample material and is not covered by the repository licenses. Replace it
  with your own audio file when reusing this project.
