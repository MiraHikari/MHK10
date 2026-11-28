# Keyboard shortcuts

MHK10 has one shortcut vocabulary for the Canvas desktop and embedded HTML
windows. The pure resolver in `src/lib/ui/browser/keyboard-shortcuts.ts` turns a
`KeyboardEvent`-shaped value into a stable command identifier; labels shown in
menus remain presentation data.

## Desktop commands

These commands are consumed by the shell or window manager when the desktop
canvas owns focus.

| Keys                          | Command                              | Result                                                                                                                                                                        |
| ----------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `F1`                          | `F1`                                 | Open Help (the shell handles this application key)                                                                                                                            |
| `Ctrl+Escape`                 | `StartMenu`                          | Toggle Start and dismiss the previous application menu                                                                                                                        |
| `F10`                         | `F10`                                | Select the focused application's menu bar; press Down/Up to open it, or F10 again to leave                                                                                    |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | `CycleWindow` / `CycleWindowReverse` | Move focus through open windows. While Ctrl or Meta stays down, the window list remains visible and releasing it does not move focus again. `Alt+Tab` stays with the browser. |
| `Alt+Space`                   | `SystemMenu`                         | Open the active window menu                                                                                                                                                   |
| `Shift+F10`                   | `ContextMenu`                        | Open the focused desktop or item menu                                                                                                                                         |
| `Ctrl+F4`, `Alt+F4`           | `CloseWindow`                        | Request close for the active window                                                                                                                                           |
| `Ctrl+F`                      | `Find`                               | Find in the focused application, including My Computer                                                                                                                        |
| `Ctrl+Arrow` / `Ctrl+Space`   | Arrow key / space                    | Extend or toggle desktop selection                                                                                                                                            |
| `F2`                          | `F2`                                 | Rename in applications that expose rename                                                                                                                                     |
| `F5`                          | `F5`                                 | Refresh in applications that expose refresh                                                                                                                                   |

The resolver also exposes editing commands for Canvas clients: `Ctrl+S`
(`Save`), `Ctrl+Shift+S` (`SaveAs`), `Ctrl+Z`/`Ctrl+Shift+Z`/`Ctrl+Y`
(`Undo`/`Redo`), `Ctrl+A` (`SelectAll`), `Ctrl+C`/`Ctrl+X`/`Ctrl+V`
(`Copy`/`Cut`/`Paste`) and `Ctrl+P` (`Print`). A client only acts on a command
it advertises in its menu; unsupported commands are harmless and are cleared
with the frame input.

`Meta` is accepted as the primary modifier for macOS keyboards. HTML menu bars
accept Alt plus a matching access key. Other Alt-modified text remains available
to the browser, and composing IME input is never consumed by the resolver.

Menu arrows, Home and End skip unavailable rows. A unique mnemonic activates its
command or opens its submenu. Repeated mnemonics cycle the matching enabled
rows; Enter activates the highlighted row. Application commands keep their
stable identifiers while check, radio and default marks remain presentation
state. Start submenus initially select their first available row.

## Focus and embedded pages

The canvas receives keyboard input only while it is the active element. A
focused HTML iframe receives the same shell window commands through
`htmlWindowShortcut`; F10 and document editing commands, including F2, F5 and
Ctrl+F, remain with the native HTML client. After a shell command, focus returns to the
focused HTML document when no menu is covering it. This preserves browser text
editing, selection and accessibility while keeping `Ctrl+Tab`, `Alt+Space` and
close behavior consistent across window types. `Alt+F4` closes the focused
window instead of the browser tab while the desktop canvas owns the key.

The legacy `doom95:start` message continues to represent Start across embedded
documents; it queues the `StartMenu` command in the host.

The host binds each same-origin document as soon as it is available; pending
images do not postpone window shortcuts. Replacing or disposing the document
releases its bindings, and the final load event does not register them twice.

When a shortcut is accepted, the host prevents the browser default and queues a
command token for one frame. Printable text is queued separately as `typed`.
Applications must consume accepted commands before checking close requests or
clearing input, so a save or edit command batched with a close cannot be lost.

## Reader and personal archive

While a book owns focus, `Ctrl+K` (`Meta+K` on macOS) opens Reader's Jump To.
Search uses chapter names, bookmarks, notes and existing reading commands.
Up/Down selects a result, Enter opens it and Escape restores the opening focus.
Other dialogs, composing IME input and editable fields retain their own keys.
`Ctrl+F`, F3/Shift+F3, F9 and the existing reading navigation remain available.

Reader, ACDSee and Device Manager opt into shared toolbar navigation: Left/Right
and Home/End move between available buttons and links without activating them.
Tab leaves the toolbar; inputs and combo boxes retain their native keys.
Reader's Contents/Notebook buttons toggle their panel. Its close button or Escape
returns focus to reading, and Focus reading moves focus before hiding the tools.

In Device Manager, Ctrl+F selects the current query. Enter or Down from Find
moves into the filtered tree; Enter expands or collapses a category. Filtering
from compact Details returns to the tree, with a Clear action for no results.

The Projects list in Properties uses Up/Down and Home/End within its current
filtered order. A guide link reveals its exact project and transfers focus to
that list, so keyboard browsing can continue. Search and technology controls
use the shared native/hybrid field behavior.

## Extension rules

Add a command only when it has an observable behavior and a menu entry. Keep
the token stable and distinct from its localized label. Add a pure resolver test
for modifier precedence, an application interface test for the resulting
behavior, and a Chromium scenario when focus or browser default behavior is
involved. Applications may assign F1 through F12 to commands; unknown keys
pass through to the owning client.
