"""Make deterministic VGA previews and media metadata from authored sources.

The authored gallery/honor downloads and article `full` paths decide which
camera originals belong to R2. Bundled WebP files are inspected under
`public/images`; non-WebP originals are inspected in the gitignored
`apps/general/public/images` mirror and recorded separately so a metadata-only
run never loses their properties. A fresh clone without the mirror keeps the
tracked original metadata and reports the skip.
"""
import json
import re
import sys
from pathlib import Path
from xml.etree import ElementTree

from PIL import Image

# Authored camera originals include a 200 MP photograph. Metadata inspection
# reads headers only; it does not decode these originals into raster memory.
Image.MAX_IMAGE_PIXELS = None

desktop_root = Path(__file__).resolve().parents[1]
workspace_root = Path(__file__).resolve().parents[3]
root = desktop_root / 'public' / 'images'
public_root = desktop_root / 'public'
mirror_root = workspace_root / 'apps/general/public/images'
shared_content = workspace_root / 'packages/site-core/content'
data_root = desktop_root / 'src/data'
local_metadata_path = data_root / 'media-files.json'
original_metadata_path = data_root / 'media-originals.json'
article_photos_path = data_root / 'article-photos.json'

colours = [
    (0, 0, 0), (128, 0, 0), (0, 128, 0), (128, 128, 0),
    (0, 0, 128), (128, 0, 128), (0, 128, 128), (192, 192, 192),
    (128, 128, 128), (255, 0, 0), (0, 255, 0), (255, 255, 0),
    (0, 0, 255), (255, 0, 255), (0, 255, 255), (255, 255, 255),
]
IMAGE_SUFFIXES = {'.svg', '.webp', '.png', '.jpg', '.jpeg'}
PREVIEW_SECTIONS = ('profile', 'projects', 'honors', 'gallery', 'blog')
PREVIEW_CAPS = {'profile': (96, 96), 'default': (640, 480)}
IMAGES_PREFIX = '/images/'


def inspect_image(path):
    """Read dimensions and format from an existing picture."""
    if path.suffix.lower() == '.svg':
        document = ElementTree.parse(path).getroot()
        bounds = document.attrib.get('viewBox', '0 0 720 480').split()
        width = round(float(document.attrib.get('width', bounds[2]).removesuffix('px')))
        height = round(float(document.attrib.get('height', bounds[3]).removesuffix('px')))
        image_format = 'SVG'
    else:
        with Image.open(path) as picture:
            width, height = picture.size
            image_format = picture.format
    return {
        'width': width,
        'height': height,
        'bytes': path.stat().st_size,
        'format': image_format,
    }


def write_json(path, value):
    """Write stable LF JSON so repeated runs are byte-identical."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8', newline='\n') as file:
        file.write(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def local_key(canonical):
    return '/images/' + canonical[len(IMAGES_PREFIX):]


def mirror_path(canonical):
    if not isinstance(canonical, str) or not canonical.startswith(IMAGES_PREFIX):
        raise SystemExit(f'Invalid authored publication asset: {canonical!r}')
    relative = canonical[len(IMAGES_PREFIX):]
    if '..' in relative.split('/') or not re.fullmatch(r'[A-Za-z0-9_./-]+', relative):
        raise SystemExit(f'Invalid authored publication asset: {canonical!r}')
    return mirror_root / relative


def authored_originals():
    """Collect unique gallery/honor downloads and article camera originals."""
    profile = json.loads((shared_content / 'profile.json').read_text(encoding='utf-8'))
    photos = json.loads(article_photos_path.read_text(encoding='utf-8'))
    paths = set()
    for item in profile.get('galleryItems', []):
        if item.get('downloadSrc'):
            paths.add(item['downloadSrc'])
    for item in profile.get('honors', []):
        if item.get('downloadSrc'):
            paths.add(item['downloadSrc'])
    for photo in photos:
        if photo.get('full'):
            paths.add(photo['full'])
    return sorted(paths)


def files_under(directory):
    if not directory.exists():
        return []
    return sorted(path for path in directory.rglob('*') if path.is_file())


def main():
    authored = authored_originals()
    # The bundling policy is shared with align-personal-content.mjs: WebP files
    # stay local, other camera originals resolve to R2.
    r2_only = [local_key(path) for path in authored if not path.endswith('.webp')]
    r2_keys = set(r2_only)

    if '--metadata-only' not in sys.argv:
        palette = Image.new('P', (1, 1))
        palette.putpalette([component for colour in colours * 16 for component in colour])
        count = 0
        for section in PREVIEW_SECTIONS:
            destination = root / 'previews' / section
            destination.mkdir(parents=True, exist_ok=True)
            for source in sorted((root / section).rglob('*.webp')):
                if source.with_name(source.stem + '-display.webp').exists():
                    continue
                with Image.open(source) as original:
                    image = original.convert('RGB')
                    image.thumbnail(
                        PREVIEW_CAPS.get(section, PREVIEW_CAPS['default']),
                        Image.Resampling.LANCZOS,
                    )
                    preview = image.quantize(palette=palette, dither=Image.Dither.FLOYDSTEINBERG)
                    output = (destination / source.relative_to(root / section)).with_suffix('.png')
                    output.parent.mkdir(parents=True, exist_ok=True)
                    preview.save(output, optimize=True)
                    assert set(preview.convert('RGB').getdata()).issubset(set(colours))
                    count += 1
        print(f'Generated {count} previews using the 16-colour VGA palette.')

    # Bundled metadata describes only files present in the checkout. Hydrated
    # R2-only originals are ignored here even if someone copies them locally.
    local_metadata = {}
    for directory in (root, public_root / 'gallery'):
        for path in files_under(directory):
            if path.suffix.lower() not in IMAGE_SUFFIXES:
                continue
            key = '/' + path.relative_to(public_root).as_posix()
            if key in r2_keys:
                continue
            local_metadata[key] = inspect_image(path)

    existing_originals = {}
    if original_metadata_path.exists():
        existing_originals = json.loads(original_metadata_path.read_text(encoding='utf-8'))
        if not isinstance(existing_originals, dict):
            raise SystemExit(f'{original_metadata_path} must contain a JSON object.')
    if mirror_root.is_dir():
        original_metadata = {}
        missing = []
        for key in r2_only:
            canonical = IMAGES_PREFIX + key[len(IMAGES_PREFIX):]
            source = mirror_path(canonical)
            if source.is_file():
                original_metadata[key] = inspect_image(source)
            elif key in existing_originals:
                original_metadata[key] = existing_originals[key]
            else:
                missing.append(key)
        if missing:
            raise SystemExit(
                'Missing owner originals in the R2 mirror for: ' + ', '.join(missing)
            )
        write_json(original_metadata_path, original_metadata)
        write_json(local_metadata_path, local_metadata)
        print(
            f'Inspected {len(local_metadata)} bundled files and '
            f'{len(original_metadata)} R2-only originals.'
        )
    else:
        write_json(local_metadata_path, local_metadata)
        print(
            f'R2 mirror absent at {mirror_root}; kept the tracked '
            f'{len(existing_originals)} original metadata records. '
            'Run again with apps/general/public/images present to refresh them.'
        )
        print(f'Inspected {len(local_metadata)} bundled files.')


if __name__ == '__main__':
    main()
