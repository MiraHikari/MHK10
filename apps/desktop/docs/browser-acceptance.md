# Browser acceptance

Run `npm run verify` against the production build on Node 24. For focused iteration after building, use `npm run test:e2e`. The test configuration uses Chromium with desktop and mobile viewports and independent local storage.

The automated scenarios cover MHK10/MiraHikari branding, boot, personal iframe content, article links, minimize/maximize/close, themes across reloads, help and touch controls. Standalone Notepad scenarios cover text entry, Save As, cancellation, replacement confirmation, export and guarded navigation. Interface tests supplement these paths with exact same-frame input/close, storage failures, reset races and resource release.

`browser-sessions.spec.ts` also exercises the public Reader and ACDSee mount/dispose Interfaces against the built Astro markup. It bundles the actual clients in memory and controls native observer/image completion to test initialization failure, late callbacks, duplicate mounts, pointer capture and timer cleanup. Replacement sessions remain usable through real input; the fixture does not expose or mutate application state. These scenarios run alongside the production-route tests on both configured Chromium viewports.

Failure traces and screenshots are written to `test-results/`; the HTML report is in `playwright-report/`. These are generated evidence, not checked-in fixtures. Visual inspection screenshots from a successful implementation run may be kept in `artifacts/qa/` and are not a substitute for rerunning the checks.

Keep physical-device acceptance distinct from emulation: real mobile IME, browser chrome, audio permissions and fullscreen behavior require an actual device. No physical-device pass is implied by the automated suite.

`assistant.spec.ts` checks local guide questions, real clipboard copying,
transcript saves/downloads, Chinese requests, cancelled confirmation and an
accepted application launch. It also opens Chat through the paperclip in the
desktop and uses the native Keyboard panel on both Chromium viewports.
`ai-sdk.spec.ts` verifies destination consent, connection testing, local guide
questions while online, SDK streaming, an authentication failure and retry using
a controlled local HTTP/CORS/SSE service. Credentials from a real provider are
not required for these acceptance scenarios.

## Preserve existing effects when improving an interface

UI changes must retain the established rendering and interaction behavior. Check
the affected paths through real input, including transitions between modes; a
static screenshot of the new controls does not establish that earlier effects
still work.

| Existing behavior                                                                            | Regression surface                                                                                            |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Auto desktop reflow, marquee selection, manual icon positions and arrangement across reloads | `adaptive-desktop.spec.ts`, `desktop-ux.spec.ts`, icon-layout and selection Interface tests                   |
| Classic logical pixels, mobile scaling, cursor alignment and HTML client geometry            | `adaptive-desktop.spec.ts`, `desktop-design.spec.ts`, viewport and window geometry Interface tests            |
| Open/close/minimize outlines follow their live icon or taskbar source                        | `window-motion.spec.ts`, window-motion and WM Interface tests                                                 |
| Reader page restoration, text selection, notes, keyboard navigation and focused reading      | `reader.spec.ts`, `reader-navigation.spec.ts`, `reader-toolbar.spec.ts`                                       |
| Original images, transforms, transparency, optional pixel presentation and cancelled exports | `image-geometry.spec.ts`, `image-tools.spec.ts`, image-processing Interface tests                             |
| Compact tools, reachable menus, status feedback and focus after changing panes               | `hybrid-controls.spec.ts`, `device-manager.spec.ts`, minimum-client Reader/ACDSee scenarios                   |
| Legacy visitor data, pending saves, remounts and late callbacks                              | `documents.spec.ts`, `filesystem-desktop.spec.ts`, `browser-sessions.spec.ts` and persistence Interface tests |

The shared Canvas palette, thresholded text, dithering and integer coordinates
remain part of acceptance. Review changes against the last accepted behavior,
retain named rendered evidence, and fix any regression before integration.
