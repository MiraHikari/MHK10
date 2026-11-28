# Canvas runtime and application sessions

Each canvas has one `CanvasSurfaceRuntime`. The desktop and standalone host create
it before acquiring browser listeners, register its cleanup immediately and pass
its capabilities explicitly to their adapters. A second mount of the same canvas
is rejected. Separate canvases can coexist in one JavaScript environment.

## Ownership

| Owner           | State and release                                                                                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renderer        | Fixed target, display metrics, raster patterns, sprites and wallpaper. Offscreen callbacks receive a child renderer; failures release it without changing the parent target. |
| ThemeController | Immutable theme snapshots belonging to one renderer. Changing one surface does not change another.                                                                           |
| FontRasterizer  | Lazy measurement surface, glyph widths, calibrated metrics, revision and raster cache. Hosts remove font listeners before releasing the rasterizer.                          |
| InputController | Raw event queue, pointer history, host routing, captures and frame consumption. Keyboard focus and pointer routing are independent.                                          |
| AppSession      | Private application state, scoped input, WidgetScope, pending saves and the close protocol. Equal widget IDs in different sessions have independent focus and drag state.    |
| FrameEffects    | Surface snapshots, effect impulses and WordArt cache.                                                                                                                        |
| AudioRuntime    | Lazy audio device, output, volume, mute, active voices and recorder subscriptions. Closing one runtime releases only its resources.                                          |

Immutable artwork and glyph definitions can be shared. Importing a graphics or
input module does not allocate browser resources. A renderer, input controller,
widget scope or static raster cache is not recreated for each frame.

## Application Interface

`AppServices` provides durable capabilities such as documents, files, story,
settings, audio, window commands and the host clock. FileSystem and Story publish
explicit operation types; their transaction implementations remain concentrated.

Text clipboard, native file selection and file-audio playback are injected by the
desktop and standalone hosts. Selection has selected/cancelled/failed outcomes
and an explicit cancellation operation. AppSession releases its acquired pickers
and audio after disposal or failed creation, even when initialization stops early.
Wallpaper persistence belongs to the host settings adapter.

The host sends an `AppFrameRequest` with time and a readonly window projection.
AppSession constructs `AppFrame`, supplying its renderer, scoped input, widget
scope and effects. The application sees only window identity, client bounds,
focus and menu state. It cannot access writable WindowManager state or the raw
input queue. Key sets are stable readonly views; event arrays and their records
are immutable snapshots. Consumption uses explicit commands. Pointer suspension
affects only that application's scope.

WidgetScope composes its text-field and menu Modules once per session. Text fields
own Unicode editing, focus, horizontal scroll and caret timing; menus own popup
geometry, row input and stable command selection. Disposal prevents retained
controls from restarting input state. Drawing transformations restore their
target state even when drawing throws.

`defineCanvasApp` returns registration metadata and `createSession`. Authoring
`create`, `draw`, `dispose` and private state are not exposed on registry entries.
Tests use the same session entrance and pure model Interfaces as production.

Applications may opt into static rendering with `needsFrame(state, services)`.
Omitting it retains continuous frames for animated applications. `invalidate()`
wakes a static session after an asynchronous state change; accepted input gets
one settling frame so immediate-mode labels show their final values. Pending saves
and close requests continue to receive frames. Minimized clients receive accepted
input before closing, while inactive static clients do not force a desktop paint.
Both canvas hosts also paint for geometry, focus, pointer and palette changes.

Hosts start font preparation alongside their listener and composition work, then
wait at the first drawing boundary. Font preparation keeps its existing deadline;
normal boot and splash timing remain owned by DesktopLifecycle.
New desktop sessions play the complete startup on the first visit; returning
sessions go straight to the desktop. Explicit stored always/never choices remain
available; an existing embedded session resumes instead of starting a new boot
when presentations switch.

Closing follows accepted input, pending saving, close approval and final removal,
in that order. Repeated requests share an operation. A refusal or persistence
failure preserves the live session. `dispose` only releases resources and is
idempotent; it never stands in for save approval.

## Desktop composition

WindowSessions owns paired windows and application sessions, dynamic definitions,
messages, per-instance HTML addresses, rollback and closure. HTML frames carry
both the window instance ID and stable application ID so local file access keeps
source/origin/application validation across distinct file windows. WindowManager
owns geometry, focus, layering and animation behind commands and immutable snapshots.
Drawing and hit testing use the same window layout projection.

DesktopWorkspace owns entries, selection, icon layout, paging, transfers from the
desktop and compatible layout storage. DesktopChrome owns Start/context menus,
task overflow, hover state and transient occlusion. DesktopLifecycle owns the
startup, desktop and shutdown phases, story appearance and screen saver wake
transactions. Shell supplies dependencies and schedules their work. Run, Find and
Rename create fresh state through the application session protocol.

## Browser applications

ReaderSession owns reading state, delayed persistence and import generations.
ReadingSurface owns DOM text indexing, native ranges, selection, highlights,
search and measured pagination. Its Interface returns positions and selections,
never a Range. Resize and font/image completion enter the same reflow path.

ACDSee uses ImageSurface for loading, viewport geometry and pointer capture;
LocalImages for cumulative file decoding, bitmaps and object URLs; and ImageExport
for request cancellation, invalidation and download lifetime. Accepted changes
invalidate export explicitly. Late completion cannot revive a disposed owner.

Computer and ImageBrowser publish immutable detached state and records; caller
changes cannot alter another session. The browser combobox Module owns native
select enhancement, popup keyboard and pointer interaction, and restoration.
Body-level popups inherit their initiating control's palette. The hybrid root
retains scope and interactivity policy and owns its MutationObserver.

## Verification

The implementation is checked through production AppSessions, pure models,
instance-based raster and browser adapters, and real Chromium input. Coverage
includes failed creation, save refusal, reset conflicts, late imports/exports,
font completion, nested offscreen failures, equal control IDs, two simultaneous
surfaces and repeated disposal/remounting. Final integration results and visual
and performance evidence follow the current [browser acceptance guide](browser-acceptance.md).
