# Hybrid MHK10

Rendering choices follow the [rendering mode standard](rendering-mode-standard.md):
bounded system tools stay Canvas-first, while semantic or searchable content
uses HTML and may be embedded in the same shell. Shared keyboard behavior is
documented in [keyboard shortcuts](keyboard-shortcuts.md).

The 640×360 canvas remains the operating system. `src/lib/os/desktop/shell.ts` and `src/lib/os/windows/wm.ts` own
boot, desktop, Start, window chrome, drag/resize, taskbar, modal input, themes and
the P(doom) story. Personal pages are real HTML clients inside those windows.

## Rendering and input

1. The original desktop canvas draws the system and canvas applications.
2. `src/lib/os/windows/html-windows.ts` positions same-origin page iframes in logical client bounds.
   SVG rectangle subtraction removes regions covered by higher windows, menus,
   tooltips or the taskbar. Minimized, fully obscured and blocked frames are inert.
3. `src/lib/ui/browser/pointer-layer.ts` draws one transparent pointer canvas above both layers.
   Native iframe cursors are hidden, so the pointer cannot be cut off by an iframe.
4. The monitor scales all layers together. Geometry FX use the same time/hash
   inputs. Whole-screen corruption phases temporarily use the original renderer.

Every personal route also contains server-rendered content, metadata and a
canonical URL. Its embedded mode displays only the client, avoiding nested
desktops. Deep links remain restricted to registered same-origin applications.

## Fusion embed

The portfolio site at www.example.com frames this desktop full-screen as its
Win95 display mode. The `shell` query parameter selects the embedded form:

- Embedded without `shell=full`: single-window form (`is-embedded`) for deep
  links into one application; `src/lib/os/host/desktop.ts` mounts the native
  host only in this state.
- Embedded with `shell=full`: the complete desktop (`hybrid-mode`). When the
  page is really framed, `src/lib/os/host/embed-host.ts` mounts on top of the
  shell and marks `<html data-embed-full>`; the Start menu then offers the
  Classic Site hand-off.
- Opened directly, even with `shell=full`: full desktop, but no embed host —
  there is no parent to negotiate with.

Applications opened from the canvas build their URLs through
`src/lib/os/host/desktop-entry.ts`, which strips the `shell` parameter, so
inner frames never recurse into another desktop.

The embed host speaks a minimal postMessage protocol under the namespace
`mhk-fusion`:

| Direction     | Message           | Effect                                                                         |
| ------------- | ----------------- | ------------------------------------------------------------------------------ |
| here → parent | `startup`         | the authenticated document is running its POST/splash; reveal the real startup |
| here → parent | `ready`           | the requested content is ready; the parent may navigate and move focus         |
| here → parent | `request-classic` | visitor chose the classic site from Start                                      |
| parent → here | `suspend`         | park the shell (audio, frame loop and startup) while hidden                    |
| parent → here | `resume`          | restore the shell                                                              |

`startup` is sent only while the lifecycle phase is `boot` or `splash`. The
parent therefore reuses the desktop's own startup animation as the Win95
loading state instead of drawing a second mock boot screen. An already-warmed
desktop returns `ready` directly, so the parent can navigate to the current
destination without briefly revealing a stale window.

A message is honored only after namespace/version, session and request order
validation, with an exact configured parent origin and the actual parent
window. `PUBLIC_PARENT_ORIGINS` accepts comma or space separated origins; a
blank list falls back to `PUBLIC_PARENT_ORIGIN`, then the production general
origin. Local fusion development sets `PUBLIC_PARENT_ORIGIN=http://localhost:4321`
on desktop while general uses `PUBLIC_DESK_URL=http://localhost:4322`.

Visit statistics come from the self-hosted Open Kounter (`src/lib/kounter.ts`);
counters render into `[data-kounter-status]` surfaces such as the System
Properties footer. The shared `kounter-model.ts` owns the default base and URL
normalization; `PUBLIC_KOUNTER_URL` can override it. Requests are GET-only,
localhost sessions stay read-only, and only the top-level presentation owns
visit counting. Fusion/browser acceptance builds point the service at the local
unroutable port 9. The visitor-facing disclosure lives in the privacy article.

## Content

- `src/data/profile.ts`: concise personal data supplied by the site author.
- `src/data/gallery.ts`, `public/gallery/`: supplied system visual studies.
- `src/content/posts/`: Chinese Markdown articles; `content.config.ts` validates metadata.
- `src/lib/apps/profile/ProfileView.astro`: System Properties and contact tabs.
- `src/lib/apps/skills/SkillsView.astro`: Device Manager and installed-project details.
- `src/lib/os/host/html-apps.ts`: personal window defaults.

All system UI is English. Chinese article text uses a separate native 12px pixel
grid. Fusion Pixel is bundled locally under SIL OFL 1.1; see `cjk-pixel-font.md`
for the fixed release, license and coverage checks. The English canvas UI uses checked-in bitmap
glyphs generated from the original fonts; see `fonts/ATTRIBUTION.md`.

## Mobile controls

Fit preserves the complete desktop. Zoom switches to 100% or 200% logical
pixels; Pan hands touch gestures to the scrollable monitor viewport. Turn Pan off
to interact again. Maximize expands the active window. The touch key strip wraps
into a compact two-row grid with short labels (Open, Close, Max, Menu) so every
control stays reachable without horizontal clipping. The keyboard panel supports
composition/IME for canvas apps; native HTML fields use the browser keyboard.

## Verification

```sh
npm test
npm run check
npm run lint
npm run build
npm run verify:site
python scripts/generate-bitmap-font.py --check
```

Behavior tests cover pointer ownership, resize anchors/limits, menu traversal,
Run command validation, rectangle occlusion, editor state and glyph rasters.
The in-app browser now provides a working production-preview connection.
Browser evidence and the precise manual checks for this iteration are recorded
in [browser acceptance](browser-acceptance.md); physical-device acceptance is separate.
