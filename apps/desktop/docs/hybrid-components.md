# Shared hybrid controls

Native clients use `src/components/hybrid/` and `src/lib/ui/browser/hybrid-ui.ts` for the
same Win95 control vocabulary as Canvas applications. This is also used by the
standalone application host; a second set of menu and dialog styles was removed.

| Component   | Interface and behavior                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Toolbar`   | `label`, optional `id`/`class`, slotted controls; integer spacing                                                                          |
| `Button`    | Native button semantics, disabled/pressed/focus states, forwarded attributes                                                               |
| `Select`    | Native option data plus a visible Win95 combobox/listbox adapter                                                                           |
| `MenuBar`   | F10 entry, English menus, arrow/Home/End traversal, access keys, Escape and outside-click dismissal                                        |
| `Tabs`      | Tablist semantics and keyboard activation; content owns its selected panel                                                                 |
| `StatusBar` | State text using the system font and sunken border                                                                                         |
| `Panel`     | Shared field/viewport frame                                                                                                                |
| `Dialog`    | Labelled system dialog, title bar and content slot                                                                                         |
| `Tree`      | Tree container, selection styling and flat-tree navigation; hierarchical adapters own Left/Right and can opt out of the generic controller |
| `Range`     | Integer-sized track and thumb, native pointer and keyboard value input                                                                     |
| `TextField` | Labelled input/textarea using the shared field border and font contract                                                                    |

`mountHybridUi()` enhances controls in a document or application root. It is
idempotent and releases listeners, observers, popups and label associations on
disposal. Dynamically created Save As forms use the same adapter. The native
select remains only as the form/data control; users interact with a styled popup.
Option changes, resets, disabled/hidden controls and DOM replacement stay in sync.

Button and link toolbars can opt into `data-hybrid-toolbar`. They share one Tab
stop; Left/Right and Home/End move focus without activating a command. Disabled,
hidden and responsive CSS-hidden controls are skipped. Inputs, native selects
and enhanced comboboxes retain their own keyboard behavior. Pointer focus updates
the Tab stop, and disposal restores the authored `tabindex` attributes. Keep the
toolbar's navigation keys out of application-level reading or drawing shortcuts.
Menu popups fit the current viewport and scroll without shrinking their rows.
Canvas and native menu commands expose `checked`, `radio`, `default` and an
optional `mnemonic` separately from their labels. Check marks and radio dots use
the reserved gutter; the default command uses bold text. Native menus expose
`menuitem`, `menuitemcheckbox` and `menuitemradio` roles and refresh state from the
application session. Repeated access keys cycle enabled matches and wait for
Enter. F10 selects the application bar; Ctrl+Escape opens Start.

Window caption buttons keep the same 16 by 14 pixel slots through state changes.
A maximized window displays the overlapping-window Restore glyph and returns to
the Maximize glyph when normal bounds are restored.

Palette custom properties are generated from `gfx/palette.ts`, and control
dimensions from `src/lib/ui/canvas/layout.ts`. English interface text uses MS Sans Serif at its
native UI size. Chinese content uses locally bundled `MHK CJK` at native 12px
steps; `MHK CJK UI` preserves that grid in mixed control labels. Source and
verification instructions are in [cjk-pixel-font.md](cjk-pixel-font.md).

Menu labels, buttons, settings, status messages and navigation are English.
Authored Chinese text, project names and image descriptions remain content.
Images are original by default; `pixelImages` is an explicit preference. The
shared image-presentation adapter updates eligible images without changing their
original links or source records.

Home, Properties, Device Manager, Articles, Gallery and ACDSee use these controls.
Controls are also shared by standalone application menus, confirmation dialogs
and Save As. `tests/e2e/hybrid-controls.spec.ts` covers real forms and keyboard
interaction, including option reordering, reset, hiding and remounting.
`tests/e2e/system-fidelity.spec.ts` also records caption pixels, menu marks,
duplicate access keys and the distinction between Start and application menus.
