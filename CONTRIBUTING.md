# Contributing to MHK10

Thanks for your interest in improving MHK10. This repository contains two
complementary presentations of one authored-content source: the classic site
(`apps/general`) and the MHK10 canvas desktop (`apps/desktop`), which share a
fusion protocol and authored content through `packages/site-core`.

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

- Node 24 and npm 11, with the single root `package-lock.json`.
- A clean clone builds and tests offline against the tracked template content.

```sh
npm ci
npx playwright install chromium
```

## Development and testing

Run from the repository root:

| Command                      | Purpose                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `npm run dev`                | Both apps: general at <http://127.0.0.1:4321>, desktop at <http://127.0.0.1:4322>           |
| `npm test -- <path>`         | Focused Vitest run, e.g. `npm test -- packages/site-core/src/fusion/protocol-model.test.ts` |
| `npm run test:e2e -- <path>` | Desktop Chromium scenario in `apps/desktop/tests/e2e/`                                      |
| `npm run test:e2e:fusion`    | Cross-app two-origin fusion scenarios in `tests/fusion/`                                    |
| `npm run verify`             | Full quality gate (see below)                                                               |

`npm run verify` runs type diagnostics, lint, format check, architecture
checks for every workspace, `content:check`, Vitest, both builds,
generated-site validation for both apps, the desktop Chromium suite and the
cross-app fusion suite. Re-run only the affected checks while iterating; run
the full gate before you consider work finished.

## Code standards

- Tests are colocated with the code as `*.test.ts`. Test observable outcomes
  through the same Interface used by callers, including save failures, late
  callbacks, reset conflicts and remounts.
- Parse external input from `unknown`; prefer discriminated results over
  exceptions for expected failures. New unbounded `any` is prohibited.
- Every listener, observer, timer and owned DOM node needs cleanup, including
  on partial initialization failures. Dispose only releases resources and must
  be idempotent.
- Pure domain modules must not import DOM or drawing code or read browser
  globals; browser composition roots own concrete adapters.
- Graphics must not import OS or application implementations; applications
  must not import Shell.
- Formatting: two-space indent, single quotes, semicolons, LF line endings.
  Format exactly what you changed with `npm run format -- <paths>`; keep
  mechanical formatting separate from behavior changes.
- Commands use stable identifiers separate from labels. Window views are
  read-only. Closing must accept pending input and save state before refusing.

## Architecture rules

- Desktop canvas applications export typed `defineCanvasApp` definitions
  conforming to `app-contracts`; the registry discovers them. HTML
  applications use catalog metadata only.
- Never hand-edit generated files: `projects.generated.json`,
  `app-catalog.generated.ts`, `article-library.generated.json`, image
  manifests, favicon outputs and other `*.generated.*` artifacts. Regenerate
  them from authored sources instead.
- After changing a desktop `*.registration.ts` sidecar, run
  `npm run generate:app-catalog`. Registration sidecars are zero-import data.
- Domain logic accepts dependencies; it must not read browser globals.
  Composition roots own concrete adapters.
- Do not add root-level `src/`, `docs/` or `astro.config.*`; both applications
  are Astro apps inside `apps/`.

## Content contributions

Authored content lives in `packages/site-core/content` (`profile.json`,
`projects/*.md`, `blog/*.mdx`) and is shared by both presentations.

- Edit those sources, then run `npm run content:align` to regenerate
  projections and the tracked desktop display copies, and commit them.
  `npm run content:check` fails when projections drift.
- Never edit generated projections directly; they are overwritten on the next
  alignment run.
- The tracked records are template/demo content. Do not commit personal data
  into them. See
  [packages/site-core/content/README.md](packages/site-core/content/README.md)
  for the source layout and the `content/local` override mechanism.
- Camera originals are not tracked. R2 (or your own object store) is canonical
  for them; the desktop resolves them through `PUBLIC_IMAGE_BASE_URL`.
  `content:align` can refresh bundled display copies only when the local image
  mirror exists.

## Adapting the repository for your own site

The demo content is meant to be replaced, not edited in place. Put your own
records in the gitignored local overrides:

- `packages/site-core/content/local/profile.json`
- `packages/site-core/content/local/projects/*.md`
- `packages/site-core/content/local/blog/*.{md,mdx}`
- `apps/desktop/src/data/local/portfolio-presentation.json`
- `apps/desktop/src/data/local/article-presentation.json`

Overrides replace whole records; there is no merge. Keep the tracked template
files in their demo state so `content:check` and the browser suites remain
reproducible.

## Commits

Make small imperative commits by behavior, one concern each. Stage exactly the
paths you own and preserve unrelated concurrent changes. Include validation
performed and remaining limitations in the change summary. Visual changes
require actual rendered screenshots or recordings; CI trace/screenshot output
is evidence, not a substitute for tests.

Do not use `git stash`, `git checkout .`, `git restore .` or
`git reset --hard` on someone else's uncommitted work.

## Licensing

By contributing, you agree that your code contributions are licensed under the
GPL-3.0-or-later ([LICENSE](LICENSE)) and your content contributions under
CC BY-NC-SA 4.0 ([LICENSE-CONTENT](LICENSE-CONTENT)).
