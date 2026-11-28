# Project structure and implementation patterns

This is the placement and ownership guide for MHK10. The [architecture](architecture.md)
defines dependency direction and the [glossary](../GLOSSARY.md) defines product terms.
The directory layout follows [Astro's project structure](https://docs.astro.build/en/basics/project-structure/).

## Put behavior with its owner

| Location                                       | Owns                                                       | Keep elsewhere                                |
| ---------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------- |
| `src/pages/`                                   | Public routes, static metadata, route composition          | Stateful application rules                    |
| `src/layouts/`, `src/components/`              | Document structure and reusable HTML controls              | File, story and window policies               |
| `src/styles/`                                  | Styles consuming the shared visual tokens                  | A second palette or interaction state machine |
| `src/content/`, `src/data/`                    | Authored content and build-safe facts                      | Browser globals and runtime imports           |
| `src/lib/apps/<feature>/`                      | Application sessions, models, dedicated views/styles/tests | Shell access and global application state     |
| `src/lib/os/host/`                             | Host composition, contracts and surface runtime            | Application-specific policies                 |
| `src/lib/os/desktop/`, `windows/`              | Desktop owners and window commands                         | Mutable state exposed to applications         |
| `src/lib/os/files/`, `story/`, `ai/`, `audio/` | File transactions and each domain's adapters               | Application views                             |
| `src/lib/gfx/`, `src/lib/ui/`                  | Raster rendering, widgets and reusable geometry            | OS or application implementations in graphics |
| `scripts/`                                     | Reproducible generation and verification                   | Product behavior needed in the browser        |
| `tests/e2e/`                                   | Real Chromium scenarios and test helpers                   | Direct mutation of private product state      |
| `docs/adr/`                                    | Retained architecture decisions                            | Competing copies of current standards         |

Use descriptive kebab-case TypeScript names. Keep `*.test.ts` beside the Module
whose Interface it exercises. Add a directory when a cohesive feature needs one;
do not introduce folders, barrels or forwarding functions just to shorten files.
Tracked text uses LF through `.gitattributes`, matching the formatter and generated
snapshots even when a contributor's global Git settings enable Windows CRLF.

Public pages remain in `src/pages/`; feature-specific pages compose the Astro views
under `apps/reader/`, `acdsee/`, `profile/`, `home/`, `gallery/`, `skills/` and
`network/`. Reader retains its `blog` catalog ID. The seven Settings applets share
`apps/settings/system-settings.app.ts`. Reusable browser controls stay in
`ui/browser/`, Canvas input/editing/menus/widgets in `ui/canvas/`, and shared
document, Markdown and printing layout in `ui/text/`.

Every `src/lib/**/*-model.ts` is pure by convention. The architecture gate applies
to new models automatically, including nested folders. A model accepts time,
storage and other varying inputs through its Interface and returns observable
results; browser composition supplies concrete Adapters. Established domain names
such as `os/files/documents.ts`, `os/desktop/desktop-selection.ts`,
`ui/canvas/layout.ts` and `ui/text/print-layout.ts` retain the same protection in
`scripts/architecture/rules.mjs`; exact domain paths follow their feature owners.

## Register once, derive the rest

Canvas applications author `<id>.registration.ts` beside their implementation.
A sidecar exports literal registration facts without imports, including type-only
imports, and without browser globals. Run `npm run generate:app-catalog` after
editing one. Add the ID to the curated order in `src/data/app-catalog.ts`; an
implementation uses a `*.app.ts` entry point, exports a typed `defineCanvasApp`
definition and is discovered recursively and synchronously. Only `**/*.app.ts`
files enter the registry; models, tests and sidecars do not. Sidecar generation is
also recursive, rejects invalid or duplicate registrations and sorts by ID;
`CATALOG_ORDER` retains the product order.

HTML applications use `NON_CANVAS_APPS` in the catalog and a real Astro route.
Runtime projections use `APP_CATALOG` ordering. Both modes derive routes, icons,
menus and file associations from these facts, keeping stable command IDs separate
from labels. Do not add placeholder Canvas methods to an HTML application.

Choose rendering through [the rendering mode standard](rendering-mode-standard.md).
Keep public routes independently useful. Retired article slugs and publication
file IDs share `src/data/article-redirects.ts`; compatibility does not put retired
content back into the publication library. Existing visitor files and legacy
`doom95` storage/message identifiers remain valid.

## Share interaction rules, geometry and lifetime

- `os/desktop/desktop-icon-layout.ts` owns icon slots, reserved regions, reflow and restored
  positions. Selection reconciles through this Interface. Shell composition
  supplies the current work area and reservations for initialization, paging and
  resize. Drawing, hit testing and drop targeting use the same geometry.
  Automatic/default and name-sorted layouts remain adaptive; only genuinely
  moved icons acquire manual positions. Marquee selection never persists a
  layout. The version-1 icon record accepts an optional arrangement marker;
  complete legacy automatic grids recover reflow, while off-grid and partial
  manual positions remain compatible. The desktop launcher retains a source identity
  for launched windows and refreshes their close-animation bounds after reflow.
- `gfx/palette.ts` owns theme colors. HTML consumes `themeProperties` through
  `/themes.css`; selected controls use `accent` and `accent-text`, corresponding
  to Canvas `sel` and `selText`. Title-bar colors retain their separate meaning.
- `mountHybridUi` owns reusable DOM control enhancement. Keyboard and pointer
  handling share visibility, disabled-state and mount-scope rules. Individual
  applications own what a command does, not a second generic control system.
- `createLifetime` owns listeners and cleanup; `claimSurface` owns one active
  application mount per root. Register cleanup immediately after acquisition.
  On initialization failure, release the same resources as ordinary disposal.
  Cancel timers, disconnect observers, release captures and revoke owned URLs.
  Late asynchronous results must not revive a disposed session.
- Application close requests consume accepted input and pending saving before
  refusal is checked. Final `dispose` only releases resources and is idempotent;
  an old disposer must not release a newer mount of the same root.

These patterns are small Interfaces with shared rules. Introduce a new Adapter
only for a real variation point. Prefer removing duplicate decisions over adding
another configurable layer. English controls and authored content declare their
own language; local file content may have an unknown language.

## Authored files, generated files and evidence

| Authored source                                                               | Derived output                                       | Reproduction                                                 |
| ----------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| `src/lib/apps/**/*.registration.ts`                                           | `src/data/app-catalog.generated.ts`                  | `npm run generate:app-catalog`                               |
| Pinned `public/icons/react95/` images and `scripts/react95-icons.mjs` mapping | App icon SVGs and `src/lib/gfx/react95-icon-data.ts` | `node scripts/sync-react95-icons.mjs`                        |
| MS Sans inputs documented in `docs/fonts/ATTRIBUTION.md`                      | Generated bitmap font data                           | `python scripts/generate-bitmap-font.py --check`             |
| Pinned Fusion Pixel release in `docs/cjk-pixel-font.md`                       | Bundled CJK font                                     | Extract the documented release member and verify its SHA-256 |
| Brand generator inputs                                                        | Brand artwork                                        | `node scripts/generate-brand.mjs`                            |
| Application source                                                            | `dist/`, `.astro/`                                   | `npm run build`                                              |

Regenerate checked-in assets from their authored sources. Do not edit a generated
snapshot to hide drift. Compatibility icon-generator commands delegate to the
canonical generator. Font changes require their additional coverage check.
Publication pictures use `src/data/images.ts`: canonical `/images/…` paths in
authored records resolve to `/images/…`, with optional `PUBLIC_IMAGE_BASE_URL`.
See [portfolio content](portfolio-source.md).

`artifacts/`, `test-results/`, `playwright-report/`, `.tmp/`, `.cache/`, `coverage/`
and build output are ignored evidence or scratch space. `source-repo/` is an
excluded reference. Keep runtime source, archival decisions and generated QA
output separate; retain evidence without committing reports or local caches.

## Change and verify

1. Find the Module that owns the rule and document its Interface when the rule
   crosses callers. Parse external values from `unknown`; use discriminated
   results for cancellation, failure and success.
2. Exercise observable behavior through the same Interface used by callers.
   Cover meaningful failure, reset and lifetime cases. Browser tests use real
   input and logical Canvas coordinates.
3. Format exact changed paths with `npm run format -- <paths>`. Keep broad
   mechanical formatting in its own commit. Existing formatting exceptions may
   only shrink; no new exceptions or increased baselines.
4. Run affected checks while iterating, then `npm run verify` after integration.
   Visual changes require actual rendered captures in addition to assertions.
5. Commit exact owned paths by behavior. New dependencies need a concrete use,
   a reproducible lockfile and compatibility checks; use Node 24, npm 11 and the
   sole `package-lock.json`. Merge verified commits into `main`.

The executable standards include model purity, sidecar isolation, dependency
direction, runtime-cycle detection, generated-catalog freshness and application
registry agreement. A passing gate does not replace review of ownership or
real browser behavior.
