# Chinese pixel font

MHK10 uses **Fusion Pixel Font**, the native **12px proportional Simplified
Chinese** face, for Chinese canvas glyphs, mixed-language printed pages and the
`.cjk-pixel` article style. The complete font is served from this repository;
font loading and production builds need no third-party CDN or font generation.

- Upstream: https://github.com/TakWolf/fusion-pixel-font
- Release: https://github.com/TakWolf/fusion-pixel-font/releases/tag/2026.09.25
- Release commit: `35b8aa0f69e477d415708692f4951e1ce5bc2e8e`
- Archive: `fusion-pixel-font-12px-proportional-otf.woff2-v2026.09.25.zip`
- Member: `fusion-pixel-12px-proportional-zh_hans.otf.woff2`
- Local asset: `public/fonts/fusion-pixel/fusion-pixel-12px-proportional-zh-hans.woff2`
- SHA-256: `0ebd99e6f1e9b650a793a3f759c1c3dfa99f0c5b6502e78569b48ddb43767e40`

The unmodified font is **SIL Open Font License 1.1** software. The release's own
`OFL.txt` and its Ark Pixel, Cubic 11 and Galmuri source notices are preserved
beside the font. The official release and license were retrieved and reviewed
on 2026-10-06. The former mutable Zpix CDN dependency is no longer used.

`src/styles/cjk-pixel.css` declares the shared family `MHK CJK`. Canvas body
text uses its native 12px size. Existing MS Sans 11px Latin glyph data is
unchanged; missing UI glyphs use the 12px face without synthetic bold or a
fractional font size. Advances and baselines are integer pixels. The renderer
thresholds raster output to one bit and uses nearest-neighbour scaling. Font
completion invalidates cached rasters through the host lifetime.

Article typography uses 24px text and a 36px line height. Original article text
is unchanged. Print Preview keeps one paper layout at every preview zoom and
sends the same line/page breaks to printing.

## Verification

The font can be reproduced by extracting the named member from the pinned
release and checking its SHA-256. No glyph data was regenerated. The separate
MS Sans adaptation check remains:

```sh
python scripts/generate-bitmap-font.py --check --preview artifacts/font-preview.png
npm test -- src/lib/gfx/text.test.ts src/lib/gfx/bitmap-font.test.ts src/lib/apps/print-preview/print-model.test.ts
```

Python is only needed for that development check, never a build or font load.
Chromium scenarios verify local font loading, Chinese/Latin layout, pagination
and print preview at desktop and mobile sizes.
