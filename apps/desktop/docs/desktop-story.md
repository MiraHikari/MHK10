# Desktop, local files and the office assistant

The desktop builds on its 640×360 canvas foundation with integer geometry,
bitmap fonts, a 16-colour palette, bevels, menus and managed windows. Personal
pages remain HTML clients inside those windows; direct routes still provide
indexable content. Current resource ownership is documented in
[architecture](architecture.md) and [Canvas runtime](canvas-runtime.md).

## Try it

- Drag on empty desktop space to select an area. Ctrl-click adds or removes
  icons; drag a selected group to move it together. Escape cancels an unfinished
  gesture. Ctrl+A selects all desktop icons. Ctrl+Tab cycles open applications;
  taskbar buttons keep their opening order. Ctrl+Esc opens Start; F10 activates
  the focused application's menu bar.
- Right-click the desktop or taskbar for window arrangements. Right-click a task
  button or a title bar, click the title icon, or press Alt+Space for the system
  menu. Move/Size accepts arrows, Shift for one-pixel steps, Enter to commit and
  Escape to restore the original bounds. Shift+F10 opens a context menu.
- Open the desktop's My Documents icon, then My Documents in My Computer. Create
  a text file, edit it in Notepad, save with Ctrl+S, and rename it in Explorer.
  File > Save As chooses a writable folder and asks before replacing a same-name
  file. Explorer supports nested folders, F2 rename, Delete, F5 refresh,
  Backspace to go up, Copy/Cut/Paste and moving files between directories. Drag
  files between Explorer windows, desktop folders and Recycle Bin; the desktop
  uses the same file service. Deleted files go to Recycle Bin, and Restore
  resolves name conflicts without replacing another document.
- File > Export My Documents downloads a JSON backup including referenced image
  and audio data. File > Import My Documents selects that backup and asks before
  replacing the visitor volume. Export current work first; failed validation or
  saving leaves the existing volume intact.
- Double-click Recovery. Properties describes the current ownership request;
  Event Log records choices; Setup offers the optional optimization installer.
  Opening the console or reading the site does not advance the story. Inspect
  request, Run in train.exe, or a P(doom) increase starts the investigation.
- Audit the request or explicitly install the optimization. The review offers
  human recovery, a joint protocol, or full delegation. Each ending requires a
  separate confirmation. Replaying the story keeps visitor documents intact.
- Click the paperclip or Start > Programs > Chat. Ask in English or Chinese,
  or use the local Projects, Skills, Reading, Files, Story and Help buttons.
  `open blog` or `打开计算器` proposes an app launch with confirmation. Scroll
  arrows and the scrollbar reveal older replies. Edit copies a reply or the
  transcript; File saves it locally, saves it with another name or exports a
  complete text download.
- Open DOS / Signal Monitor from Programs. HELP lists read-only diagnostic
  commands; Monitor switches between Phosphor and Neon graphics. The visual
  metrics are explicitly simulated, while permission state comes from your
  choices. The terminal never executes host commands.
- Display Properties > Background offers Solid colour, Blueprint and Neon skyline
  wallpapers. Gallery has Contact sheet / Details and Classic / DOS / Neon board
  presentations, a filmstrip and original-size zoom. Device Manager provides
  Properties / Terminal / Pixel project cards. Articles offer Paper / Phosphor
  reading. These display choices also work independently of the story.

## Startup and presentation return

Startup defaults to the first visit; Display Properties > Settings > Startup can
play it every session or skip it. POST presents browser-reported facts and the
current display, input, local-volume and story checks, not download progress.
The MiraHikari Signal Editions sleeve and disk share POST's registration marks.
A single slanted beam exposes the print. A 16-colour proof strip on the sleeve
chases across once at the classic pace, then settles before the diagonal wipe
reveals the configured desktop. Phosphor uses a monochrome green ramp. Direct
links open the requested window without flashing Home.
System or desktop reduced motion removes the visual wait, not initialization.
The native **Skip startup** button, Escape and the screen click all bypass the
sequence; key or pointer input is released before the desktop receives it.
Welcome completion separately controls the introduction behind Home.

Returning from General to an existing embedded desktop resumes its windows and
transition instead of creating another session. Hidden desktops pause input,
audio and frames. See [the two-presentation lifecycle](dual-presentation.md).

## Optional AI connection

Start > Settings > AI Connection, or Chat > File > Connection, configures an
OpenAI-compatible API base URL and model. Offline remains the default. Enabling
an online connection asks for confirmation and sends no message by itself. The
earlier full-URL relay remains a separate Legacy relay mode.

After enabling, Test connection checks the confirmed endpoint and model using a
fixed diagnostic. Unsaved settings must be enabled first; Stop test and Work
Offline cancel it. Failed or stopped online questions can be resent through
Chat > Edit > Retry online question. The desktop guide buttons still work locally.

Keys stay in memory unless the visitor explicitly selects Remember key. Only
public profile context and the current connection's online conversation are sent;
visitor files and story state stay local. Replies remain plain text. Stop,
closing Chat, or changing the connection cancels pending work and rejects late
callbacks. See [AI connection](ai-connection.md) for transport, consent, key
storage and failure behavior.

## Persistence and recovery

- `doom95.files.v1`: the visitor file volume, nested folder locations,
  generated transcripts/logs, desktop shortcuts and recycled files. Earlier flat
  saves remain readable without discarding text.
- `doom95.story.v1`: validated, replayable explicit choices.
- `doom95.ai.connection.v1`: connection settings and an API key only after an
  explicit Remember key choice; it is excluded from document backups and fusion.
- `doom95.assets.v1`: visitor image/audio contents in IndexedDB.
- `doom95.desktop.v1`: startup, taskbar, display and other desktop preferences.
- `doom95.desktop-icons.v1`: icon positions and arrangement.
- The old `doom95.diary.v1` diary is migrated by the file service.
- `doom95.wallpaper.v1` and `doom95.wallpaper.pixel.v1`: wallpaper selection
  and the optional pixel image.
- `doom95.reader.v2`: Reader notebook and reading preferences; shared reading
  data crosses presentations through the [fusion contract](dual-presentation.md).

Manual icon positions and arrangement are restored from desktop storage and
reconciled with the current work area. Custom directories nest inside writable
locations; the publication library remains read-only. Copying a publication
loads its actual text before a visitor copy is saved. File selection can be
cancelled, and accepted transfers finish before a requested desktop close.

Documents save explicitly and on editor close. Unsaved edits that conflict with
an externally updated or deleted document are kept in the editor; use Save As
to preserve them separately. Corrupt stored file data is retained in the backup
export until a deliberate reset. If storage is unavailable, utilities state
that their copies are session-only. Document backups include referenced binaries
and preserve recovery information; read-only publications, credentials, reading
notebooks and story checkpoints have separate owners.

Fictional ownership changes affect story presentation, not the real filesystem
or published personal content. Ending the story never disables the website,
documents or Recovery Console. Story replay and document reset are separate.

## Verification

Run `npm run verify` from the repository root for the full gate. Focused
unit/Interface tests and Chromium scenarios cover startup defaults, read-only
publication loading, folder and drag transfers, backup/import cancellation,
storage corruption, save failures, story endings, window/menu keyboard ownership
and late callbacks. See [browser acceptance](browser-acceptance.md) for current
test surfaces and evidence requirements.
