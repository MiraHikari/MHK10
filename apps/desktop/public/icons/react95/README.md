# React95 icon sources

These PNG files are selected from [React95/icons](https://github.com/React95/React95/tree/1b94d9f59b5bb556b42bd9c3019051ef93bbaf24/packages/icons), revision `1b94d9f59b5bb556b42bd9c3019051ef93bbaf24`. `source.json` records source file SHA-256 values.

The upstream LICENSE is preserved verbatim. It applies MIT terms to the React95 code and explicitly states that Windows and associated images remain Microsoft property and are excluded from those terms.

Run `node scripts/sync-react95-icons.mjs` to regenerate the checked-in assets. Generation reads these local PNGs, uses native 16/32-pixel variants when available, otherwise nearest-neighbour scaling, and maps opaque colours to the existing 16-colour VGA palette. The next-navigation arrow is a horizontal reflection of the upstream Back icon. The zoom controls use original MHK10 magnifier geometry with distinct plus and minus signs. Canvas sprites and SVG images are generated from the same transformed pixels. Pointer cursors and character illustrations retain the project artwork.
