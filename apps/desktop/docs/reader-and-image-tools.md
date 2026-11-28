# Reading, image tools and the personal archive

These capabilities extend the existing Reader, ACDSee and Properties windows.
They use the same hybrid controls, system palette and client lifetimes. Public
pages, visitor documents and original image files keep their existing identities.

## Reader

Reader defaults to comfortable width when no saved preference exists. On a roomy
workspace (≥900×600 logical pixels) its window opens at 640×400; the classic
640×360 screen keeps the 520×300 catalog default. Shared preferences and notebook
records survive presentation switches. General notes
carry verified block anchors; desktop selections use complete-document UTF-16
offsets. Invalid anchors fall back to quote lookup. Editing one highlight keeps
all other notes, including text-only, cross-block and stale notes; a full
notebook rejects a new annotation without eviction. Closing or navigating the
HTML window flushes accepted reading changes before releasing its resources.

ReadingSurface combines scroll events into one location update per animation
frame. Chapter identities are indexed when a book opens; their positions are
measured again only after layout, size, image or font changes. Location updates
refresh page, progress and remaining time without rebuilding Jump To or the
notebook. Reader flushes the final pending location before a command, save,
close or presentation handoff. ReaderSession reconciles durable commands and
storage notifications; scrolling does not repeatedly reconcile the notebook.

The window uses one menu row and one toolbar, grouped into navigation,
annotations and reading view. Existing palette icons retain 16-pixel geometry;
labels collapse in narrow or short clients while every command remains visible
with an accessible name and tooltip. The disabled treatment uses a pixel mask,
not blended colours. Both the 532-pixel normal client and the 274×155 minimum
client keep their page controls inside the window without scrolling the toolbar.

Contents and Notebook report their open state and toggle their own panel. The
panel also has a close button. Closing it restores reading focus when needed;
entering Focus from the toolbar moves focus into the reading area before hiding
the tools, so Escape can always return. Toolbar arrows and Home/End move between
available controls through the shared hybrid enhancement without turning pages.

`Jump To` is available from the toolbar, menu and `Ctrl+K` while a book is open.
It searches chapter names, bookmarks, note text and a small set of existing
reading commands. Up/Down selects a result, Enter activates it and Escape returns
focus to the opening control. Other open dialogs and editable inputs retain
their keyboard input. An empty library does not offer book navigation.

Targets have stable discriminated identities. `src/lib/apps/reader/reader-navigation-model.ts`
owns matching and selection; `src/lib/apps/reader/reader-navigation.ts` owns the dialog, keyboard,
focus and resource cleanup. The Reader session supplies current destinations and
executes its existing chapter, bookmark, note and command operations. A result is
checked against current content before use. Chapter navigation commits a valid
fragment; precise text and page navigation clear a stale fragment so saved
position can be restored after reload.

Body statistics are calculated when content is indexed, not on every scroll.
The estimate assumes 200 other words or 400 CJK characters per minute. Remaining
time is proportional to reading position. The `Est.` label and Book Properties
state these assumptions; images and elapsed activity are not measured. No new
activity tracking or storage schema is introduced.

The Library separates category `公告` (Announcements) from the article shelf.
Announcement rows keep search, recently opened records and reading progress,
while sorting and the covers/list layout apply only to the shelf.

The filesystem Library and Print Preview use generated article identities,
titles and byte sizes. Selecting a publication for a text operation loads its
complete Markdown body on demand. Native file reads, copying, folder copying
and pasting share the filesystem's text loader; a failed load produces a typed
failure and never creates an empty visitor copy. A copied publication keeps
ordinary complete text in My Documents and backups. Reset rejects an older
pending copy rather than recreating it after the reset.

Start > Find searches both document names and text. A nonempty document query
loads any publication bodies it needs, shows Searching until the complete
snapshot is available, and retains the query on failure for Retry. Empty lists
and program queries do not load article bodies. New input, scope changes and
closing the Find session discard older query completions; visitor-only searches
remain synchronous.

Print Preview reports loading and failure, keeps Print and Export unavailable
until the chosen body is ready, and offers Retry. Selecting another document or
closing the session ignores the older load's completion. Once ready, the same
body supplies the preview, printed pages and exported text.

Discussion opens a themed window instead of placing the Giscus frame directly
in the article. The window composes the shared hybrid Dialog, Toolbar and
StatusBar controls. Its widget skin is generated from the same palette tokens
as the active desktop scheme and the current Paper, Sepia, Night or Contrast
reading theme, so the frame keeps the 16-colour language. Text colours fall back
to readable colours in that palette when a theme combination lacks contrast.
Changing themes updates the existing widget and preserves its draft.

The compact toolbar keeps Close reachable while the discussion scrolls. GitHub
remains available during slow or failed loads; Privacy opens separately so it
does not replace the page containing a draft. Closing keeps the frame and unsent
text for this page's lifetime. Reload and Retry request confirmation once a
frame has shown content, including after an API error. Errors preserve that
content; an initial credential failure retries signed out at most once.

The message boundary validates both the origin and source window, then parses
unknown messages in the pure comments model. Only positive finite heights and
links to this repository's numbered discussions are accepted. Size-only notices
cannot turn an empty discussion into an existing one. Long threads retain
native scrolling beyond the bounded iframe height. Disposal releases the frame,
its listeners and timer, theme observers and temporary host styles.

## ACDSee

Toolbar groups distinguish image selection, view geometry and file actions.
The minimum client retains a scrollable tool area, a visible status bar and an
empty-results recovery action. Tools scroll within their own row in short
windows so they cannot push the image area or status bar out of the client.
Opening an image from the thumbnail list moves
focus into the viewer; returning to the list restores the current thumbnail.

Adjustments provides brightness, contrast and saturation, with Vivid and
Grayscale presets and Reset. Compare original temporarily bypasses colour
adjustments while preserving the view's geometry. Changing images resets edits
in the current session; source records and original files are never rewritten.

Published R2 originals remain available through their original links. Pixel
adjustments and PNG export use the same-origin `/images/` display copy or a
visitor's local image; they do not depend on R2 canvas CORS permissions. A source
that cannot supply readable pixels reports an export error without changing
the original. Reduced motion combines the host's setting with the browser
preference, including inside an embedded window.

Export PNG copy applies the actual rotation, source-axis flips and colour
adjustments, including alpha. Preview and export share the pure pixel and
geometry operations in `src/lib/apps/acdsee/image-processing-model.ts`. Optional VGA presentation
uses the canonical palette and does not reduce the exported copy to 16 colours.

The browser encoding Adapter reads at most 32 MB of source data and accepts
decoded images up to 64 million pixels. Output fits 8 million pixels and a
4096-pixel longest edge; the completion message reports the actual size and
whether it was scaled. Cancelling, changing the image or edits, or closing the
client invalidates pending work. Late decode/encode results cannot start a
download or overwrite a replacement session. Temporary bitmaps, streams,
canvases, object URLs and timers have an owner and release path.

## MiraHikari's Properties

General offers three editorial paths through existing projects and the
AdventureX article. These summaries use the established profile, journey and
project records. They reveal the exact project and transfer keyboard focus to
the archive; they do not create a competing project page.

Projects supports multi-word text search, a technology filter and curated,
newest or name order. Matching preserves a selected record when possible and
selects the first result otherwise. Empty results remain clearable. Explicit
project deep links reveal their target and native history restores it. The DOM
Adapter reads metadata from the same server-rendered project records used by
the fallback page; `src/lib/apps/profile/project-browser-model.ts` owns filtering and selection.

The normal window uses independent list/detail scrolling. Very short clients
use one document scroller so filters and records remain reachable at the
desktop's minimum window size. Contact includes a static downloadable vCard and
a copy-address control with a selectable-text fallback. vCard text is escaped
and folded without splitting UTF-8 characters; only existing public fields are
included.

## Acceptance

The new flows are covered by `reader-navigation.spec.ts`, `image-tools.spec.ts`
and `personal-guide.spec.ts`. `reader-toolbar.spec.ts`, `device-manager.spec.ts`
and `hybrid-controls.spec.ts` cover compact clients, keyboard ownership, panel
focus and bounded menus. Browser session tests exercise failed setup,
replacement mounts and late clipboard/image callbacks through the public mount
Interfaces. Image tool tests import a known transparent PNG through the file
control, operate real controls, download the result and inspect its decoded
pixels. These checks run alongside the existing route, document, keyboard and
content tests in `npm run verify`; rendered captures remain in QA output.
`reading-surface.spec.ts` additionally checks frame-coalesced scroll, cached
chapter geometry, final-location flush and cancelled frames. Filesystem and
Print Preview Interface tests cover deferred text, failed loads, retry, reset
conflicts and older selections.
