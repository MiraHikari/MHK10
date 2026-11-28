# Pixel UI font attribution

The deterministic 11px glyph data in `src/lib/gfx/bitmap-font.ts` is an adaptation
of **MS Sans Serif** and **MS Sans Serif Bold**, created by **lou** on FontStruct.
Both original fonts are licensed under **Creative Commons Attribution-ShareAlike
3.0 Unported (CC BY-SA 3.0)**. The generated bitmap adaptation is distributed
under that same license. This attribution does not change the license of the
application's other code or assets.

- Regular source: https://fontstruct.com/fontstructions/show/1384746
- Bold source: https://fontstruct.com/fontstructions/show/1384862
- License: https://creativecommons.org/licenses/by-sa/3.0/
- Legal code: https://creativecommons.org/licenses/by-sa/3.0/legalcode

The source archives' original license and readme notices are preserved in this
directory as `regular-license.txt`, `regular-readme.txt`, `bold-license.txt`, and
`bold-readme.txt`. The npm package `98.css` provides these fonts; its MIT license
does **not** replace the separate font licenses.

## Adaptation and reproduction

`scripts/generate-bitmap-font.py` reads the TrueType outlines bundled in
`node_modules/98.css/fonts/src/`, scales them to their documented native size of
11px, and tests each pixel centre with FontTools `PointInsidePen`. It stores
1-bit glyph rows and rounded integer advances. There is no browser font hinting,
antialiasing, or kerning in that generation step. The outlines were not edited.
The bold font omits some punctuation, for which the regular companion is used.
Characters absent from both fonts continue to use browser rendering.

Requirements: Python with `fonttools`; `pillow` for the optional proof image.

```sh
python scripts/generate-bitmap-font.py
python scripts/generate-bitmap-font.py --check --preview artifacts/font-preview.png
```

Source SHA-256 checksums used for this adaptation:

| Source | SHA-256 |
| --- | --- |
| MS Sans Serif.ttf | `d4a95d0594b3eca2b87a6db0c867f49717ca6f0b2bcf003e77cc3294be8922da` |
| MS Sans Serif Bold.ttf | `ca0eec0f2b98f2863129f66828c391e8647c5f6e0daffb0e38af24f0a1b7a075` |

When redistributing these font assets or adaptations, retain attribution and the
license notice, identify changes, and distribute font adaptations under the same
license. The original archive readmes also request retaining their accompanying
archive files when redistributing the original font binaries.
