#!/usr/bin/env python3
"""image-view.py: a copy of an image that Read can take, for an image too large to read whole. It changes no file.

  image-view.py <img> [--max 1568] [--crop X,Y,W,H] [--out .validation/view]
        Without --crop: the whole image scaled down so its long side is at most --max px (composition, direction).
        With --crop: that region at full resolution, then scaled down only if it is still over --max (detail: a face,
        a hand, a contact with the floor). Pixels are of the original image.
        Prints the path written: <out>/<name>[.<x>-<y>-<w>-<h>].png.
Needs only PIL. Exit 0 done, 2 could not run (PIL missing, a path that does not exist, a crop outside the image, bad arguments).
"""
import argparse
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print('image-view: could not run: PIL (Pillow) is not installed', file=sys.stderr)
    sys.exit(2)


def fail(msg):
    print(f'image-view: could not run: {msg}', file=sys.stderr)
    sys.exit(2)


def parse_crop(text, width, height):
    try:
        x, y, w, h = (int(v) for v in text.split(','))
    except ValueError:
        fail(f'--crop {text} is not X,Y,W,H in pixels')
    if w <= 0 or h <= 0 or x < 0 or y < 0 or x + w > width or y + h > height:
        fail(f'--crop {text} falls outside the image ({width} x {height})')
    return x, y, w, h


def main():
    ap = argparse.ArgumentParser(prog='image-view.py', description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('image')
    ap.add_argument('--max', type=int, default=1568)
    ap.add_argument('--crop')
    ap.add_argument('--out', default='.validation/view')
    args = ap.parse_args()
    source = Path(args.image)
    if not source.is_file():
        fail(f'{source} does not exist')
    if args.max < 64:
        fail('--max is at least 64 px')
    image = Image.open(source)
    name = source.stem
    if args.crop:
        x, y, w, h = parse_crop(args.crop, image.width, image.height)
        image = image.crop((x, y, x + w, y + h))
        name = f'{name}.{x}-{y}-{w}-{h}'
    scale = args.max / max(image.width, image.height)
    if scale < 1:
        image = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.LANCZOS)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    target = out / f'{name}.png'
    image.save(target)
    print(f'{target} ({image.width} x {image.height})')


if __name__ == '__main__':
    main()
