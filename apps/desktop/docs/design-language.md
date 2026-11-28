# Design language

This document defines the visual, motion and sound grammar of the system, the
rules that decide which grammar a surface may use, and the planned work that
follows from them. It is the checklist a design or UI pull request is reviewed
against.

Companion documents: [hybrid architecture](hybrid-desktop.md) for rendering,
input and SEO; [desktop and story guide](desktop-story.md) for local files, the
Recovery Console and the story graph.

### Current product refinements

Interface text is English and uses a restrained, professional, scene-specific
voice. Authored content may remain Chinese. Personal content follows familiar
Explorer/Properties interactions instead of repeating website navigation inside
every window. Hybrid controls share the Canvas palette, metrics and keyboard
behavior through [the hybrid component library](hybrid-components.md).

Photographs, article images and avatars display their original files by default;
pixel previews are an explicit preference, not a reading requirement. The
16-colour restriction remains a rule for system chrome and generated pixel art.
The duplicate MiraHikari Online surface has been removed; Home is the sole site
entry and `/network/` is retained only as a compatibility redirect. Welcome is a
finite, completable introduction; Recovery handles permissions, not onboarding.
The classic 640×360 grid remains available alongside the adaptive logical desktop.

## 1. The problem this solves

The shell currently has one register: the Chicago GUI — 16 VGA colours, grey
bevels, 11px thresholded MS Sans Serif. Non-Win95 material already exists (the
`dos` 8px font, WordArt, broadcast colour bars, CRT scanlines, the DOS prompt in
Diagnostics), but nothing states _when_ each is allowed. The result is
unintentional mixing: `src/lib/apps/diagnostics/diagnostics.app.ts` draws a DOS terminal and
Win95 push buttons inside one client area, and its status bar explains DOS
commands in the GUI font.

A real 1995 machine was stratified. You could see down through the GUI to DOS and
up to the early web. Treating that stratification as the design system — rather
than adding more decoration — gives the project a grammar instead of a mood
board.

## 2. The register stack

Five registers. Each owns a palette subset, a typeface, a frame vocabulary, a
motion rule, a soundscape and a narrative job.

| Register             | Era     | Visual rule                                                                                                         | Font                         | Sound                  | Narrative job                                                 |
| -------------------- | ------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------- | ------------------------------------------------------------- |
| **L0 FIRMWARE**      | 1981–94 | Black field, CP437 box drawing, 80×25 grid, `white`/`silver`/`gray`/`lime` only                                     | `dos` 8px                    | Single-frequency beeps | **Truth.** POST, memory counts, things that do not lie        |
| **L1 TEXT-MODE TUI** | 1988–93 | `navy` field, `aqua` double-line frames, `yellow` hotkeys, shadowed panels (Norton, Turbo Vision, QBasic)           | `dos` 8px                    | Key clacks             | **Tools.** Diagnostics, Recovery Console, Defrag, ScanDisk    |
| **L2 CHICAGO GUI**   | 1995    | The existing bevel system, 16 colours, MS Sans 11px                                                                 | `ui` / `bold`                | The system event set   | **Everyday.** Desktop, files, settings, applications          |
| **L3 MULTIMEDIA**    | 1995–97 | WordArt, dithered bands, colour bars, `scale >= 2` pixels, 1-bit mask animation (Plus!, Encarta, CD-ROM, demoscene) | `bold` scale 2–7             | Three-voice chords     | **Emotion.** Splash, screen savers, achievements, easter eggs |
| **L4 WEB 1.0**       | 1996–99 | Tiled backgrounds, rules, 88×31 buttons, hit counters, marquees, under-construction                                 | `ui` + underlined blue links | Modem handshake        | **Outside.** Personal site content, webring, guestbook        |

### Rules

1. **One window belongs to one register.** The register is visible in four
   places at once: the title-bar icon, the client font, the sound the window
   makes, and the voice it writes in (§3). A window whose chrome and content
   disagree is a bug.
2. **Crossing registers is an event, not a default.** Diagnostics should switch
   its whole client area to L1 (navy field, aqua double frame, yellow hotkeys)
   with L2 chrome as the outer shell. That is what a 1995 machine actually
   looked like; a DOS prompt sharing a client area with GUI push buttons is not.
3. **L0 never lies.** The boot screen reporting real browser facts
   (`src/lib/os/desktop/boot-info.ts`) is this rule working correctly. Keep and extend
   it. Nothing in L0 may be decorative fiction.
4. **L4 stays inside an iframe.** `src/lib/os/windows/html-windows.ts` already enforces this
   structurally. L4 must never reach the canvas, and its aesthetic (counters,
   under-construction) must not leak into L2 chrome.
5. **No Win98.** Menu drop shadows, gradient title bars, Alt-Tab thumbnails and
   font smoothing belong to a later register that this project does not have.
   Omissions are part of the system; record them here rather than rediscovering
   them in review.

### Preserved pixel invariants

The register stack adds dimensions _inside_ the existing invariants and relaxes
none of them: integer coordinates only, text thresholded to 1 bit, dither
instead of alpha, the 16-colour palette, motion in whole pixels, windows opening
with a zooming dithered outline.

## 3. Copy and voice

Every string on screen belongs to the scene it stands in. Two foreign voices
currently intrude, and neither is necessary: **legal narration** (the machine
explaining that it is not real) and **tutorial narration** (the machine
explaining how to operate it). Both break immersion in the same way — they stop
being the system and start being a manual about the system.

### 3.1 The diegetic boundary

The monitor is a physical object in the room. The desktop is fiction inside it.
Copy rules differ by side of the glass, and this is the carve-out that keeps the
rest of this section from fighting accessibility.

- **Inside the glass** — everything the canvas and the HTML clients draw, L0
  through L4. Speaks only in-world. No reference to browsers, tabs, JavaScript,
  canvases, simulations, this project, or the reader's real machine.
- **Outside the glass** — the bezel: `#monitor-controls`, `#help-dialog`,
  `#touch-controls`, `#keyboard-panel`, `#boot-hint`, `<noscript>`, skip links
  and every `aria-label`. Plain, direct, present-day English, because
  accessibility and first use depend on it. This layer is _allowed_ to say
  "browser".
- **Never mix.** No in-world joke in an `aria-label`. No browser instruction
  inside the glass. `Resize your browser to fit the desktop.` in Display
  Properties is a bezel sentence that wandered inside; that is why it reads
  wrong, not because it is badly phrased.

### 3.2 Voice per register

Voice is a register property, like the typeface and the soundscape. Each example
below already exists in the tree and is the standard to match.

| Register | Voice                                                                                                                                           | Length    | Example in the tree                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------ |
| **L0**   | POST terseness — noun, value, verdict. No sentences, no adjectives, no humour                                                                   | 1 line    | `Display bridge - 640 x 360 virtual canvas` … `[ OK ]` |
| **L1**   | Utility-program imperative. The program states what it did, in capitals, without apology                                                        | ≤2 lines  | `DOOM-DOS 6.22` / `Type HELP for available commands.`  |
| **L2**   | Win95 dialog voice — complete sentences, second person, polite, faintly bureaucratic. The joke lives in the _content_, never in the punctuation | 1–3 lines | `I am on PTO until after the singularity.`             |
| **L3**   | Marketing exuberance. A superlative and a promise it cannot keep                                                                                | ≤6 words  | `Probably fine.`                                       |
| **L4**   | First person, hand-made, over-shares                                                                                                            | free      | a guestbook entry                                      |

### 3.3 Rules

1. **Speak as the system, not about the system.** The machine never narrates its
   own fictionality.
   - ✗ `Simulated signals derived from your story choices | No network traffic`
   - ✓ `LOCAL SIGNAL - 4 TASKS, 0 SOCKETS`
2. **Report state; do not instruct.** A status bar reports. Keystrokes belong in
   menus — right-aligned inside the item, where Win95 put them — and in Help.
   - ✗ `F2: Rename   Delete: Move to Recycle Bin`
   - ✓ `3 object(s)`, with `Rename    F2` inside the File menu
3. **Separate two things currently conflated as "disclaimers".**
   - Claims about **real consequence** — that data leaves the machine — stay,
     exactly once, in the Connection confirmation. A Win95 confirmation dialog
     is already the correct voice for this; it needs no fourth wall.
   - Claims about **the fiction** — that the signal monitor is not hardware
     telemetry, that the buffer scan is not a memory test — leave the screen
     entirely. Nobody mistakes a 640×360 teal desktop for a hardware probe, and
     the disclaimer advertises a confusion it invented. If it must be written
     down, it belongs in `README.md`, not in pixels.
4. **No meta-apology and no hedging.** Cut `(simulation)`, `/ SIMULATED`,
   `READ ONLY` stamps, `probably`, `this is only`. If something is read-only,
   disable the control: that is how Win95 says it, and it costs no words.
5. **A joke is load-bearing or it is cut.** The strong lines here advance the
   story or characterise a speaker — `One job has requested a tomorrow.`,
   `Operator note: politeness is not alignment.`, `Last modified: tomorrow`,
   `None of these improved the benchmark.` / `We kept them anyway.`,
   `Press curiosity to continue`. A line whose only job is to signal "this is
   retro and fun" is decoration, and gets cut like any other decoration.
6. **One voice per speaker.** The shell, the assistant, AGI.EXE, AUDITOR, SETUP
   and SCHEDULER are distinct speakers — `src/lib/os/story/story.ts` log sources
   already imply the cast. Each must be recognisable from diction alone,
   without its name tag.
7. **Length is a design constraint, not an afterthought.** At 11px across 640px
   a dialog line holds roughly 70 characters. Write to the box. `fitText()`
   truncating at runtime means the copy was wrong, not that the layout was.
8. **Nothing explains itself on the critical path.** First-run guidance lives in
   the Welcome dialog (§7, B-10) and F1, both dismissible. The desktop never
   teaches itself to the user.

### 3.4 Review test

Four questions for any new or edited string. One "no" sends it back.

1. Who is speaking, and is this how that speaker talks?
2. Which register is it in, and do its length and diction match that register?
3. Would it still make sense to someone who believes the machine is real?
4. If it is deleted, what is actually lost?

§8.A and §8.E are the audit backlog this section produces; this section is the
rule that stops the backlog from reappearing.

## 4. Tokens in code

Layout, timing and sound are currently magic numbers spread across more than
twenty files (`prog(t, 0, .18)`, `.14`, `3.2`, `c.y + 62 + i * 22`). Four thin
modules turn the grammar above into something the compiler can help enforce.

- **`src/lib/gfx/registers.ts`** — per-register `{ fonts, inks, frame, motion,
sound }`, plus drawing entry points: `l0Screen()`, `l1Panel()` (double frame +
  shadow), `cp437()`.
- **`src/lib/gfx/timing.ts`** — `TIMING = { tick: .09, blink: .35, open: .18,
sweep: .6, scene: 1.5 }`. Also the home for the reduced-motion contract:
  `prefers-reduced-motion` is currently a local variable in `src/lib/os/desktop/shell.ts` honoured
  only by boot and splash, while FX, the assistant and (later) screen savers
  ignore it. It must become a value every animated surface reads.
- **`src/lib/ui/canvas/layout.ts`** (extend) — `DLG = { margin: 12, row: 22, btnW: 66,
btnH: 23, gap: 6, tabH: 23 }` with `dialogRows()` and `buttonRow()`. This is
  the design system's real body: every new dialog gets consistency for free
  instead of ad-hoc offsets.
- **`src/lib/os/audio/soundscape.ts`** — the ten existing sounds grouped by register,
  with per-theme sound schemes (Plus! shipped Jungle, Musica and Robotz; the
  same idea applies here).

## 5. Themes as Plus! desktop themes

`THEMES` in `src/lib/gfx/palette.ts` defines immutable desktop theme bundles:

```
Theme = { palette, wallpaper, soundScheme, cursorSet, startupSplash }
```

Seven schemes: MHK10 Standard, Singularity Night, The Void, Hot Dog Stand,
Teal Dream, **Phosphor** (monochrome green — the whole machine drops to the L0
colour subset) and Blue Ribbon. The Display Properties `preview()` function
already renders theme previews, so the UI cost is near zero.

`themeCss()` generates the HTML custom properties from those bundles at build
time. `themeFor(name)` accepts own theme names and falls back to Standard for
unknown or inherited names. `THEME_NAMES`, `SOUND_SCHEMES` and `CURSOR_SETS`
provide the supported options to settings controls and parsers. `VGA_COLORS`
provides the explicit sixteen-colour order to registers, wallpaper and image
processing; semantic aliases in `C` do not change that order.

## 6. Story as register descent

Today a rising P(doom) only swaps theme colours (`std` → `night` → `void`). Let
the machine instead fall _down_ the stack. The story gains visual consequence
and reuses what already exists.

| P(doom) | Today         | Proposed                                                                                    |
| ------- | ------------- | ------------------------------------------------------------------------------------------- |
| 5%      | `std`         | Full L2. The tray clock shows **real local time**                                           |
| 34%     | `night`       | Clock begins drifting toward `11:57 PM`; assistant sparks; Start entries grey out           |
| 61%     | `night`       | **Selected windows drop to L1**: Recovery and Diagnostics take text-mode double-line chrome |
| 86%     | `void`        | The screen saver is locked to `P(DOOM).SCR` and the entry is greyed in Display Properties   |
| 99.9%   | `void` + slam | The machine drops to L0: the desktop is CP437 text and the taskbar is one status line       |

`systemClock()` in `src/lib/os/story/doom.ts` reads local time at low P(doom),
drifts toward `11:57 PM` as authority transfers, and reaches midnight at the
final threshold. The tray's right-hand slot stays the system-clock position.

## 7. Planned applications

Ordered by expressive return per line of code. Each entry names what it reuses
and its story hook; nothing here is a standalone toy.

### Priority A

1. **Screen savers + the Display Properties Screen Saver tab.**
   Reuses: all of `primitives.ts`, `spr()`, the monitor shape already drawn by
   `src/lib/apps/display/display.app.ts` `preview()`, and the idle timer `src/lib/os/desktop/shell.ts` keeps for assistant
   tips. Savers: Starfield, Mystify (`poly`), Flying Windows (`spr`), Pipes
   (`rect`), Marquee, and `P(DOOM).SCR`. Hook: locked after 86%.
   _The single highest-return item._ The project has no expression that moves
   while nobody is operating it, and the screen saver is the most recognisable
   artefact of the era.
2. **Control Panel as a real folder window.** Reuses `src/lib/apps/computer/computer.app.ts` browsing and
   `src/data/app-catalog.ts`. Applets: Display, Sounds, Mouse, Date/Time,
   System, Add/Remove Programs, Accessibility, Modems. Start ▸ Settings holds
   three entries while Programs holds eight; this makes Settings a _place_.
   Hook: Add/Remove Programs lists the three story endings as installable
   components.
3. **Media Player / CD Player with a spectrum visualiser.** Reuses the
   `src/lib/os/audio/pcspeaker.ts` sequence engine — it plays the system's own square waves, so
   there is no third-party audio. Hook: there is never a disc. "Please insert
   audio CD" replaces a licensing note with a joke, which is strictly better
   than the credits wall in `src/lib/apps/about/about.app.ts`. Motivates the Volume Control tray popup
   (`hslider()` already exists).
4. **Defrag / ScanDisk.** Reuses `progress()` and a `rect` block grid. Boot
   currently runs four checks, a buffer bar _and_ a 50-cell progress grid — two
   consecutive screens of fake progress. Move the grid theatre here, where it
   belongs. Hook: defragmenting surfaces Training Data fragments; at high
   P(doom) the blocks rearrange themselves unprompted.
5. **`PIXEL.EXE`, a reduced MS Paint.** Reuses the 16-colour palette, all
   primitives and `offscreen()`. Pencil, fill, line, eraser, and "Set as
   wallpaper". The project has no user-generated expression beyond Notepad;
   letting the user change how the desktop looks is high engagement for little
   code. Hook: after the optimization is installed, AGI.EXE "improves" the
   drawing.
6. **Solitaire with the win cascade.** Reuses `spr` for card faces. That
   bouncing cascade is the most recognisable motion Win95 had, and every
   primitive it needs is present. Hook: it refuses to deal under the doom
   ending.

### Priority B

7. **Program Manager (a Windows 3.1 shell option)** in Display Properties —
   swaps the desktop for Progman group windows. One register shift, high
   recognition.
8. **Dial-Up Networking and the in-world browser.**
   `src/lib/os/host/browser-bridge.ts` already exists. Add the handshake animation,
   the modem sound, and an L4 personal home page: hit counter, webring, and a
   guestbook that writes to the local filesystem.
9. **Character Map / the Fonts folder.** Shows the project's genuine technical
   achievement — the checked-in 1-bit glyphs generated from the original fonts —
   and becomes the single home for font attribution, removing licence prose from
   elsewhere.
10. **"Welcome" dialog with Did you know? and a Tour.** Absorbs the help copy
    currently duplicated in four places (§8.F).
11. **Sound Recorder.** Waveform display, "records" the PC speaker, saves into
    My Documents.
12. **Print Preview.** A dot-matrix output view for articles; a printable
    certificate.

### Priority C — texture, cheap

- Tray: volume slider popup; printer and modem icons that appear contextually.
- **Animated cursors**: hourglass spin frames, arrow-plus-hourglass.
  `src/lib/ui/browser/pointer-layer.ts` is already in place.
- **Zooming dithered outline on minimise and close.** Opening has it; the other
  two directions do not.
- **Tooltip delay of roughly 500ms.** Tooltips are currently instant; Win95
  delayed them. Small and correct.
- Desktop context menu: Arrange Icons, Line up Icons, New ▸ Folder.

## 8. Audit: what to cut and merge

### A. Defensive disclaimer copy

Out of character by §3.3 rules 1, 3 and 4. Cited by searchable string rather
than line number, because the tree reformats often:

| File                                          | Copy to remove                                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/lib/os/desktop/shell.ts`                 | `Buffer scan is animation, not a hardware memory test.`                                                    |
| `src/lib/os/desktop/shell.ts`                 | `Read locally. Not transmitted. Click or press a key to skip.`                                             |
| `src/lib/apps/diagnostics/diagnostics.app.ts` | `LOCAL SIGNAL / SIMULATED`                                                                                 |
| `src/lib/apps/diagnostics/diagnostics.app.ts` | `Simulated signals … \| No network traffic`, and `No host shell`                                           |
| `src/lib/apps/diagnostics/diagnostics.app.ts` | the `READ ONLY` stamp                                                                                      |
| `src/lib/apps/training/training.app.ts`       | `Recovery is local to this session. No actual data is uploaded.`                                           |
| `src/lib/apps/recovery/recovery.app.ts`       | `It does not install host software or send files anywhere.`                                                |
| `src/lib/apps/connection/connection.app.ts`   | three privacy lines ending `stay on this computer.`, plus `Private files and offline messages stay local.` |
| `src/lib/os/files/save-dialog.ts`             | `Files stay on this computer.`                                                                             |

**Rule: keep exactly one visible statement, at the moment data actually
leaves** — the Connection dialog. There it is not noise. Everything else moves
into a `README.TXT` (an in-world object, on the desktop or in My Documents) or
Help ▸ About this simulation. The L0 boot line returns to a single
`Press any key to skip`.

### B. The parallel second design system

`#desktop`, `.taskbar`, `.start-menu`, `.desktop-watermark`,
`.desktop-assistant` and `.assistant-tip` in `src/styles/desktop.css` form a
complete HTML desktop, hidden under hybrid mode by the `.hybrid-mode #desktop`
rule.

It is **not dead code**: `src/lib/os/host/hybrid-desktop.ts` removes `hybrid-mode` when the
shell fails to start, which reveals it. That is a legitimate degradation path.
But it is an unmaintained second design system with drifted values — a 42px
taskbar, Segoe UI, different hexes.

- Keep the fallback, but derive its CSS variables from `THEMES` (§5) so it is a
  faithful reduction of one token set.
- Delete the parts that cannot serve the fallback at all, because they require
  JavaScript: `.desktop-assistant canvas`, `.assistant-tip`, and
  `.desktop-watermark`.

### C. Name collisions

Three "about" surfaces (`about` — canvas credits; `profile` — HTML person;
`system-about` — the new catalog id) and two "My Computer" titles (`home` is
`My Computer - MHK10`, `computer` is `My Computer`).

Resolve to:

- `My Computer` — the file browser only.
- `MHK10 — Home` — the personal home page window.
- `About DOOM OS 95` — credits, reachable from the Help menu only, not from the
  desktop or Start.
- `MiraHikari — Properties` — the person. The System Properties metaphor is
  good; keep it.

### D. Two consecutive fake-progress screens

Boot (four checks, a buffer bar, a 50-cell grid) runs straight into Splash (four
stage captions, a 30-cell bar, colour bars). Halve it: keep BIOS/POST — the real
browser facts are a good joke — cut Splash to 0.9s or less (WordArt, one line,
colour bars), and hand the cell grid to Defrag.

### E. Status bars that teach instead of report

Breaks §3.3 rule 2. `src/lib/apps/computer/computer.app.ts`, `src/lib/apps/bin/bin.app.ts`, `src/lib/apps/chat/chat.app.ts` and `src/lib/apps/diagnostics/diagnostics.app.ts`
cycle operating hints through the status bar (`Double-click or Enter opens the
selected item.`, `F2: Rename   Delete: Move to Recycle Bin`). A Win95 status bar
reports state — `3 object(s)`, `Ready`, `Connected`. Hints belong in the Welcome
dialog and F1.

### F. Help copy duplicated four times

The `<dialog>` definition list in `src/components/DesktopHost.astro`,
`showHelp()` in `src/lib/os/desktop/shell.ts`, `YOUR DESKTOP SURVIVAL GUIDE` in
`src/lib/apps/training/training.app.ts`, and `Conversation tips` in `src/lib/apps/chat/chat.app.ts`.
Four hand-written copies that will drift. Add `src/lib/ui/help.ts` as the single
source and have all three surfaces consume it.

### G. The Display Properties Settings tab

In `src/lib/apps/display/display.app.ts`, `Font smoothing: gloriously absent` is a joke
worth keeping. `Resize your browser to fit the desktop.` is an instruction in
the wrong place — Display Properties should not teach browser operation.
Replace the page with a real Monitor/Adapter tab: resolution list, colour depth,
refresh rate. All in-world fiction, but inside the register.

### H. Tray budget

The tray occupies 190px of 640 — about 30%. Reduce to a 64px meter, an icon
area, and a 46px clock. The doomsday clock merges with real time per §6.

### I. Resolved — no action

Desktop icon duplication (three entries sharing `i_computer`) is **already
fixed** by the catalog refactor: `src/lib/os/desktop/shell.ts` now builds icons from
`desktopShortcuts()`, and `src/lib/gfx/react95-icon-data.ts` supplies distinct
art per application id.

## 9. Missing forms of expression

| Axis                   | Today                                               | Add                                                                                           |
| ---------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Time-based**         | Nothing moves unattended except the assistant's bob | Screen savers, visualiser, Defrag, marquee                                                    |
| **User-generated**     | Notepad only                                        | Paint → wallpaper, guestbook, Sound Recorder                                                  |
| **Spatial**            | Everything is a window on one plane                 | Program Manager as a second desk, full-screen saver takeover, a CD-ROM AutoRun moment         |
| **Data display**       | One chart plus the signal monitor                   | Resource Meter, System Monitor, the Defrag grid. The era had a strong data-display vocabulary |
| **Print and document** | None                                                | Print Preview, dot-matrix output, printable certificate                                       |
| **Sound**              | Ten effects, no volume, no layering                 | Register soundscapes, Volume Control, theme sound schemes                                     |

## 10. Phases

**Phase 1 — foundations.** No visible change; unblocks everything after it.
`registers.ts`, `timing.ts`, `src/lib/os/audio/soundscape.ts`, the `src/lib/ui/canvas/layout.ts` extension, CSS
variables generated from `THEMES`, `help.ts` as the single source.
Verify: `npm test`, `npm run check`, and no pixel-alignment regression.

**Phase 2 — audit cleanup.** All of §8.A–H, which is mostly a copy pass against
§3: every string inside the glass checked by the four review questions, legal
and tutorial narration removed, keystroke hints relocated to menus and Help.
Expect a net deletion of code and copy, and a visible amount of reclaimed screen
space.
Verify: `npm run build`, `npm run verify:site`, then walk boot → desktop → each
application → shutdown by hand.

**Phase 3 — priority A.** Screen savers, Control Panel, Media Player and
visualiser, Defrag, Paint, Solitaire. Each ships with unit tests: saver motion,
Paint bitmap state and the Defrag progress model are all pure logic, testable
without a DOM, matching the existing `*.test.ts` convention.

**Phase 4 — register descent and priority B.** Wire story stages to register
degradation (§6), then Program Manager, dial-up and the L4 home page, Character
Map, Welcome and Tour.

## 11. Risks and trade-offs

- **The "no Win98" rule must stay written down** (§2.5), or menu shadows,
  gradient title bars and Alt-Tab thumbnails will leak in one PR at a time. The
  register table is the defence.
- **L4 carries aesthetic risk.** Hit counters and under-construction banners
  turn into cheap nostalgia easily. Confine L4 to personal-site content inside
  the iframe, with a hard boundary against L2 chrome.
- **Feature creep.** The six priority-A items already fill the Programs menu to
  capacity. That is exactly why Control Panel must ship _with_ them rather than
  after: it supplies the structure that absorbs later growth.
- **Cutting disclaimers must not cut honesty.** §3.3 rule 3 draws the line:
  statements about real consequence survive, in one in-register place;
  statements about the fiction go. Applying the rule in the other direction —
  removing the Connection confirmation because it "breaks character" — would be
  a genuine regression, not an immersion win.
- **Immersive copy is not an excuse for unclear copy.** Rules 2 and 8 move
  instructions out of the scene, so Welcome, F1 and the bezel must actually
  carry them. If those three surfaces are not written first, Phase 2 removes
  guidance without replacing it.
- Naming is mid-migration (DOOM OS 95 → MHK10) while this document is written.
  Where a name is load-bearing above, treat the intent as normative and the
  spelling as whatever the catalog settles on.
