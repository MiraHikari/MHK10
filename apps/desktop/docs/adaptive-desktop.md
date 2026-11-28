# Adaptive logical desktop

MHK10 can use additional monitor space without stretching the 640×360 picture.
The desktop allocates a larger logical raster; fonts, icons, bevels, title bars
and the 16-colour palette retain their original pixel sizes. Windows and native
HTML clients receive the new work area through the same geometry pipeline.

## Resolution policy

Display → Settings → Monitor offers **Automatic work area** and **Classic
640 x 360**. The preference is an additive field in `doom95.desktop.v1`.
Old preferences default to Auto; file storage, startup history and other desktop
preferences keep their existing keys and values.

Auto uses the available monitor viewport, excluding the bezel controls. It
first reserves a readable pixel scale, approximately 1–2 CSS pixels per logical
pixel, preferring integer physical-device-pixel multiples. It then rounds the
logical width down to 16 pixels and the height down to 8 pixels. The minimum is
640×360 and the allocation limit is 1280×720.

A larger logical raster is only allocated when the viewport can hold a whole
2× desktop. Below that, the 640×360 surface simply scales up: a 1024×768
browser shows the classic raster at roughly 1.6× rather than a 1024×720
workspace at 1×, where the 11px UI would be unreadable. Window sizes under
1024 CSS pixels keep the older adaptive behaviour.

For a device pixel ratio of 1, examples of **available viewport space** are:

| Viewport  | Logical desktop | Pixel scale |
| --------- | --------------- | ----------- |
| 1024×768  | 640×360         | 1.6         |
| 1280×800  | 640×400         | 2           |
| 1600×900  | 800×448         | 2           |
| 1920×1080 | 960×536         | 2           |
| 2560×1440 | 1280×720        | 2           |

Window dimensions and available viewport dimensions differ because the bezel
uses space. For example, a 1600×1000 browser window currently supplies a
1600×963 viewport and produces an 800×480 logical desktop.

The desktop aspect ratio may change. Pixels stay square: changing available
height adds logical rows instead of stretching the existing rows. At scale
thresholds, logical dimensions can change discontinuously; this is deliberate
integer-pixel behaviour, not a smooth font-size animation. Classic remains
available when stable historical coordinates are more useful.

Very large displays reuse the bounded raster at a larger integer scale. The
allocation ceiling keeps a frame below one megapixel, at most four times the
classic pixel count. Fractional display-density settings use a rational CSS
scale when that aligns with whole device pixels. If a narrow viewport cannot
fit a readable whole-pixel multiple, the existing Fit presentation is used.
The monitor origin is also snapped to the device grid so centering does not
introduce an avoidable half-pixel offset.

Coarse-pointer viewports below 1024 CSS pixels retain the 640×360 raster.
Fit, 100%, 200% and Pan remain available. This avoids adding tiny desktop
controls to phone screens; the phone can show the whole desktop or expose a
readable portion without changing document coordinates.

## One geometry pipeline

- `gfx/display-metrics.ts` defines logical dimensions, CSS dimensions, scale and
  the work area. The taskbar remains 22 logical pixels high.
- `src/lib/os/host/viewport.ts` is the pure selection policy. It receives measurements and
  preferences, never browser globals.
- `src/lib/os/host/monitor.ts` measures the viewport and publishes complete metrics. The
  shell changes the backing store and work area together. The existing `W` and
  `H` graphics exports are live compatibility views of those metrics.
- `src/lib/os/host/screen.ts` reads current backing-store dimensions for every pointer event.
  HTML overlay clipping, iframe pointer translation and the software cursor
  use those same dimensions.
- The taskbar layout receives the current width and bottom edge. Its actual
  task-button rectangles remain the minimize/restore animation anchors.
- Wallpaper, saver and effect surfaces use the current raster. Cached effect
  snapshots resize with it. Source-art coordinates inside a wallpaper remain
  source-art coordinates; they are not viewport limits.

The standalone `/apps/…/` hosts retain their application-sized canvases. Their
input adapter also reads current backing dimensions, so adding or removing a
status bar cannot leave stale pointer scaling.

## Reflow and lifetime rules

A resize does not create new application sessions or remount native clients.
Normal windows retain their sizes where possible and are moved fully into the
new work area. Oversized windows and saved restore rectangles are bounded by
the new area. Maximized windows adopt its complete bounds. Docking a resizable
window to the left or right edge uses half of the current work area and its
full height, in integer logical pixels. The window list shown while Ctrl+Tab
is held is also placed inside that work area. Focus, task order, documents and
file revisions do not change.

Window outlines and in-progress placement are settled during a resolution
change. Pointer coordinates captured for the old projection are cancelled;
already accepted text and keyboard commands are retained. A release after the
resize cannot click a control in the new layout. This differs from a complete
blur cancellation, which intentionally clears keyboard input too.

HTML clients keep their own status bars. The shell does not add a second
dummy status bar, and it exposes clients only after a window transition ends.
The native-client close message remains constrained to the sending registered
window and its validated origin.

## Validation

Pure and interface tests cover scale selection, bounds, maximum allocation,
fractional device ratios, pointer-only cancellation, live pointer coordinates,
HTML clipping outside the former 640×360 boundary, cursor-raster resizing and
maximized/restore geometry.

`tests/e2e/adaptive-desktop.spec.ts` uses real viewport changes and normal input
to exercise enlarged desktops, HTML/cursor alignment, resizing during a drag,
text saving, Classic/Auto selection and phone zoom/pan. It never changes private
application state to produce a scenario. Other desktop scenarios read current
canvas dimensions for taskbar and maximized-window coordinates.

Focused commands:

```sh
npm test -- src/lib/os/host/viewport.test.ts src/lib/os/windows/wm.test.ts src/lib/ui/canvas/input.test.ts src/lib/os/host/screen.test.ts src/lib/os/windows/html-windows.test.ts src/lib/ui/browser/pointer-layer.test.ts
npm run test:e2e -- tests/e2e/adaptive-desktop.spec.ts tests/e2e/window-motion.spec.ts tests/e2e/selection.spec.ts
```

Rendered resize evidence is recorded under `artifacts/adaptive-desktop/`; the
final integration still runs the repository's complete `npm run verify` gate.
