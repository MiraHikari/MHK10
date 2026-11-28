"""Regenerate the deployed HarmonyOS font from characters used in src/.

Requires fonttools with WOFF2 support:
    python -m pip install fonttools brotli
"""

from __future__ import annotations

import re
import tempfile
from pathlib import Path

try:
    from fontTools import subset
    from fontTools.merge import Merger
    from fontTools.ttLib import TTFont
except ImportError as error:
    raise SystemExit(
        "Font subsetting requires `python -m pip install fonttools brotli`."
    ) from error


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "tools" / "fonts" / "harmonyos-source"
SOURCE_CSS = SOURCE_DIR / "harmonyos-source.css"
OUTPUT_DIR = ROOT / "src" / "assets" / "fonts"
OUTPUT_FONT = OUTPUT_DIR / "HarmonyOS_Regular.site.woff2"
TEXT_SUFFIXES = {".astro", ".css", ".json", ".md", ".mdx", ".ts", ".tsx", ".txt"}


def parse_unicode_ranges(raw: str) -> list[tuple[int, int]]:
    ranges: list[tuple[int, int]] = []
    for token in raw.split(","):
        value = token.strip().lower().removeprefix("u+")
        if "?" in value:
            prefix = value.replace("?", "")
            ranges.append(
                (int(prefix + "0" * value.count("?"), 16), int(prefix + "f" * value.count("?"), 16))
            )
        elif "-" in value:
            start, end = value.split("-", 1)
            ranges.append((int(start, 16), int(end, 16)))
        else:
            point = int(value, 16)
            ranges.append((point, point))
    return ranges


def source_faces() -> list[tuple[Path, list[tuple[int, int]]]]:
    css = SOURCE_CSS.read_text(encoding="utf-8")
    faces: list[tuple[Path, list[tuple[int, int]]]] = []
    for block in re.findall(r"@font-face\s*\{.*?\}", css, flags=re.DOTALL):
        filename = re.search(r"HarmonyOS_Regular\.([^.']+)\.woff2", block)
        unicode_range = re.search(r"unicode-range:\s*([^;]+);", block)
        if not filename or not unicode_range:
            continue
        faces.append(
            (
                SOURCE_DIR / f"HarmonyOS_Regular.{filename.group(1)}.woff2",
                parse_unicode_ranges(unicode_range.group(1)),
            )
        )
    return faces


def site_codepoints() -> set[int]:
    codepoints = set(range(0x20, 0x100))
    for text_root in (ROOT / "src", ROOT.parents[1] / "packages" / "site-core" / "content"):
        for path in text_root.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
                continue
            try:
                codepoints.update(map(ord, path.read_text(encoding="utf-8")))
            except UnicodeDecodeError:
                continue
    return codepoints


def subset_face(source: Path, codepoints: set[int], destination: Path) -> None:
    try:
        font = TTFont(source)
    except ImportError as error:
        raise SystemExit(
            "WOFF2 decoding requires Brotli: `python -m pip install brotli`."
        ) from error

    font.flavor = None
    options = subset.Options()
    options.layout_features = ["*"]
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6]
    options.name_legacy = True
    options.name_languages = ["*"]
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=codepoints)
    subsetter.subset(font)
    font.save(destination)


def main() -> None:
    faces = source_faces()
    requested = site_codepoints()
    original_bytes = sum(path.stat().st_size for path, _ in faces)

    with tempfile.TemporaryDirectory(prefix="harmonyos-subset-") as temp_dir:
        subset_files: list[str] = []
        temp_root = Path(temp_dir)
        for index, (source, ranges) in enumerate(faces):
            face_points = {
                point
                for point in requested
                if any(start <= point <= end for start, end in ranges)
            }
            if not face_points:
                continue
            destination = temp_root / f"face-{index:02d}.ttf"
            subset_face(source, face_points, destination)
            subset_files.append(str(destination))

        if not subset_files:
            raise SystemExit("No HarmonyOS glyphs matched the current site sources.")

        merged = Merger().merge(subset_files)
        merged.flavor = "woff2"
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        merged.save(OUTPUT_FONT)

    subset_bytes = OUTPUT_FONT.stat().st_size
    reduction = 100 * (1 - subset_bytes / original_bytes)
    print(f"Source shards: {len(faces)} ({original_bytes:,} bytes)")
    print(f"Site codepoints scanned: {len(requested):,}")
    print(f"Deployed subset: 1 ({subset_bytes:,} bytes, {reduction:.1f}% smaller)")


if __name__ == "__main__":
    main()
