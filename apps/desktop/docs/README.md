# MHK10 documentation

MHK10 is the Win95 desktop presentation in the MHK10 monorepo
(`@mhk/desktop`). Start with the
[project structure and implementation patterns](project-structure.md),
[architecture](architecture.md) and
[domain vocabulary](../GLOSSARY.md). The current two-presentation contract is in
[dual presentation](dual-presentation.md), and the embed protocol and rendering
split are in [hybrid desktop](hybrid-desktop.md).

Run workspace commands from the repository root (`npm run dev:desktop`,
`npm run build:desktop`, `npm run verify`) or scope them with
`npm run <script> --workspace @mhk/desktop`.

| Need                                                            | Reference                                                                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Place code, register applications, manage generated files       | [Project structure](project-structure.md)                                                                           |
| Understand Interfaces, Adapters and resource ownership          | [Architecture](architecture.md)                                                                                     |
| Share content, reading data and switching with the general site | [Dual presentation](dual-presentation.md)                                                                           |
| Understand embedding, `?shell=full` and the fusion messages     | [Hybrid desktop](hybrid-desktop.md), [keyboard shortcuts](keyboard-shortcuts.md)                                    |
| Understand Canvas surfaces, scoped frames and lifetimes         | [Canvas runtime](canvas-runtime.md)                                                                                 |
| Choose Canvas or HTML                                           | [Rendering mode standard](rendering-mode-standard.md)                                                               |
| Use shared controls and visual tokens                           | [Hybrid components](hybrid-components.md), [design language](design-language.md)                                    |
| Work with viewport and integer geometry                         | [Adaptive desktop](adaptive-desktop.md)                                                                             |
| Understand stories, visitor files and resets                    | [Desktop and story operations](desktop-story.md)                                                                    |
| Design personal content as desktop applications                 | [Personal interface strategy](personal-interface-strategy.md)                                                       |
| Use the long-distance directory and safe eject                  | [Personal editions](personal-editions.md), [machine tape](machine-tape.md)                                          |
| Configure the assistant and OpenAI-compatible endpoints         | [AI connection](ai-connection.md)                                                                                   |
| Work with template content and image sources                    | [Publication content and image provenance](portfolio-source.md)                                                     |
| Verify production behavior and inspect captures                 | [Browser acceptance](browser-acceptance.md), [implementation coverage](design-implementation.md)                    |
| Reproduce fonts and retain attribution                          | [Font delivery](cjk-pixel-font.md), [font attribution](fonts/ATTRIBUTION.md)                                        |
| Understand retained design decisions                            | [Shared app sessions](adr/0001-shared-app-sessions.md), [generated catalog](adr/0002-generated-catalog-snapshot.md) |

See [Reader, image tools and the personal archive](reader-and-image-tools.md)
for the quick navigation, reading estimates, image copies and contact-card
workflows.

## How to read this tree

- Guides describe current contracts.
- ADRs record retained design decisions.
- Completed delivery plans are not kept here; their outcomes live in the code,
  tests and ADRs they produced.
- Generated reports belong in the ignored QA output directories, not this
  documentation tree.
- Shared authored content and its override mechanism are documented in
  [packages/site-core/content](../../../packages/site-core/content/README.md).
