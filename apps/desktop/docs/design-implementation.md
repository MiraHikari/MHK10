# Design language implementation

The implementation follows [design-language.md](design-language.md). Home is the
frontmost window when entering the site; directly addressed content routes retain
their requested content. New desktop sessions play the full startup animation on
the first visit, while returning visits and a suspended embedded session resume
their existing desktop. Welcome opens above Home on a first run. Explicit startup
preferences remain authoritative, and completed Welcome does not open again.

## Desktop grammar

- `gfx/registers.ts`, `gfx/timing.ts`, `src/lib/ui/canvas/layout.ts` and `src/lib/os/audio/soundscape.ts` own
  register, timing, dialog geometry and sound rules. `src/lib/ui/canvas/text-mode.ts` provides the
  shared L1 command control used by Diagnostics, Recovery and Defrag.
- Seven theme bundles own palette, wallpaper, sound scheme, pointer set and
  startup artwork. `/themes.css` is generated from that same table. Phosphor also
  quantizes Canvas and embedded HTML output.
- Diagnostics uses an L1 client. At 61% Recovery and Diagnostics gain text-mode
  outer chrome; at 86% the saver selection is locked to `P(DOOM).SCR`; the final
  authority decision replaces the desktop with an operable L0 console. Its Help,
  file export and story restart do not discard documents.
- The low-risk clock reads local time and drifts toward midnight as risk rises.
  The compact tray includes volume and contextual printer/modem indicators.
- Screen savers include Starfield, Mystify, Flying Windows, Pipes, Marquee and
  `P(DOOM).SCR`. Idle input includes embedded-page typing and scrolling. Wake input
  is consumed before applications receive it. Reduced motion reaches the desktop,
  applications, screen savers, effects, pointer animation and embedded content.
- Close/minimize outlines, delayed tooltips, Arrange/Line up Icons and New Folder
  complete the desktop details. Desktop folders and files reconcile with the local
  volume, retain visitor icon placement, use extension-aware icons and open through
  the same association resolver as My Computer and standalone application hosts.
- The adaptive logical desktop keeps integer physical scaling and the Classic
  640×360 grid. Taskbar labels, Quick Launch pins, clock formats, icon visibility,
  file extensions and image presentation remain visitor preferences.

## Applications

| Surface           | Implemented behavior                                                                                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Display           | Seven bundled themes, wallpaper, screen saver preview/wait/message, adapter information, Program Manager shell option                                                                         |
| Control Panel     | Catalog-driven folder for Display, Sounds, Mouse, Date/Time, System, Add/Remove Programs, Accessibility and Modems                                                                            |
| Media Player      | Generated PC-speaker scores, play/pause/stop/track/volume, tone-driven spectrum and empty CD drive                                                                                            |
| Defrag / ScanDisk | Deterministic allocation model, start/stop, risk disturbances and durable recovered Training Data fragments                                                                                   |
| PIXEL.EXE         | Pencil, fill, line, eraser, palette, undo, save/open/export, wallpaper and reversible AGI improvement                                                                                         |
| Solitaire         | Playable Klondike stock/tableau/foundations, legal moves, undo, win cascade and doom deal refusal                                                                                             |
| Program Manager   | Four browsable application groups and a return to the ordinary desktop                                                                                                                        |
| Dial-Up           | Cancellable handshake and owned modem sequence; opens the isolated Web 1.0 home page                                                                                                          |
| My Computer       | Hierarchical local and library volumes, rename/move/delete, Recycle Bin, import/export and Properties                                                                                         |
| Reader            | Microsoft Reader-style library, pagination, contents, find, bookmarks, highlights, notes, pixel/smooth text, theme, zoom, width, focus mode, reset view, notebook backup/import and citations |
| ACDSee            | English image browser with folders, thumbnails, transforms, slideshow and local image opening                                                                                                 |
| Device Manager    | Explorer-style technology tree, Find, Properties and removable detail panes                                                                                                                   |
| Chat              | Offline assistant plus a configurable OpenAI-compatible endpoint, model and memory-only key through Vercel AI SDK                                                                             |
| Character Map     | Actual checked-in bitmap glyphs and the single application home for font attribution                                                                                                          |
| Welcome           | Shared tips, functional application tour and startup preference                                                                                                                               |
| Sound Recorder    | Captures generated speaker events, waveform, replay and save/open/export with failed-save protection                                                                                          |
| Print Preview     | Real article/local-document pagination, ownership certificate, export and browser print adapter                                                                                               |

## Deduplication and voice

The obsolete unreachable BSOD sequence, repeated splash progress, fictionality
disclaimers, status-bar tutorials and the unused HTML assistant/watermark were
removed. Help has one data source. Desktop and standalone flashes share the same
one-bit Bayer mask. Text-mode commands share rendering and disabled/input rules.
Themes no longer maintain a separate CSS palette. Icon generation has one pinned
source map, native 16/32px output and checks for unintended duplicate artwork. The
duplicate MiraHikari Online surface is gone; `/network/` only redirects legacy
links. Welcome onboarding and Recovery permission review are separate tasks.

Personal content comes from the shared authored records in
`packages/site-core/content`.
Home introduces the site in first person; About owns full biography and project
notes, Skills owns the technology inventory, and Gallery owns the photo inventory.
Short teasers link to details instead of duplicating complete records. The source
audit and image provenance are in [portfolio-source.md](portfolio-source.md).

## Evidence

`npm run verify` is the integration gate: type diagnostics, lint, formatting,
architecture fixtures and graph, unit/Interface tests, static build, site links and
real desktop/mobile Chromium scenarios. Browser scenarios use real input and
logical Canvas coordinates. Screenshots are retained in Playwright reports and
local `artifacts/design-language/`, `artifacts/design-icons/` and
`artifacts/personal-content/` captures.

The implementation keeps the legacy storage/message keys and public routes. AI
requests leave the browser only after an explicit connection is enabled; the key
remains memory-only unless Remember is selected. Reader annotations are reading
state and never modify authored article content.
