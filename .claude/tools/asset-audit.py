#!/usr/bin/env python3
"""asset-audit.py: measures the set of images a page uses, before the page uses it. It changes no file.

  audit <img|dir> [<img|dir> ...] [--percentile 25] [--out assets-out]
        Per file: sharpness (variance of the Laplacian on a 1200 px downscale) and warmth (mean R minus mean B).
        The sharpness floor is SHARP_FACTOR times that percentile of the set (default the 25th), so it follows the set and
        never flags a uniformly soft one. A file under the floor, and a set whose warmth spreads over WARMTH_SPREAD_MAX,
        are listed as flags.
        report: <out>/report.json, audit.files (sharpness, warmth, flags) and audit.set (sharp_floor, warmth_min, warmth_max,
        warmth_spread, flags).
Needs only PIL. Exit 0 done, 2 could not run (PIL missing, a path that does not exist, bad arguments).
"""
import argparse
import json
import sys
from pathlib import Path

try:
    from PIL import Image, ImageFilter, ImageStat
except ImportError:
    print('asset-audit: could not run: PIL (Pillow) is not installed', file=sys.stderr)
    sys.exit(2)

AUDIT_WIDTH = 1200
SHARP_FACTOR = 0.5
WARMTH_SPREAD_MAX = 25
IMAGE_EXT = {'.png', '.jpg', '.jpeg', '.webp', '.avif', '.tif', '.tiff'}


def fail(msg):
    print(f'asset-audit: {msg}', file=sys.stderr)
    sys.exit(2)


def merge_report(out, key, data):
    f = out / 'report.json'
    rep = json.loads(f.read_text()) if f.exists() else {}
    rep[key] = data
    f.write_text(json.dumps(rep, indent=1))


def load(path):
    try:
        return Image.open(path).convert('RGB')
    except OSError as e:
        fail(f'{path}: {e}')


def sharpness(img):
    # Laplacian through PIL: scale 8 and offset 128 keep +-1020 inside a byte, the variance is scaled back.
    g = img.convert('L')
    if g.width > AUDIT_WIDTH:
        g = g.resize((AUDIT_WIDTH, max(1, round(g.height * AUDIT_WIDTH / g.width))), Image.LANCZOS)
    lap = g.filter(ImageFilter.Kernel((3, 3), [0, 1, 0, 1, -4, 1, 0, 1, 0], scale=8, offset=128))
    return round(ImageStat.Stat(lap).var[0] * 64, 1)


def warmth(img):
    r, _, b = ImageStat.Stat(img.convert('RGB')).mean
    return round(r - b, 1)


def percentile(values, q):
    v = sorted(values)
    k = (len(v) - 1) * q / 100
    lo = int(k)
    return v[lo] + (v[min(lo + 1, len(v) - 1)] - v[lo]) * (k - lo)


def cmd_audit(a, out):
    files = []
    for item in a.images:
        path = Path(item)
        if path.is_dir():
            files += sorted(f for f in path.iterdir() if f.suffix.lower() in IMAGE_EXT)
        elif path.exists():
            files.append(path)
        else:
            fail(f'{item}: not found')
    if not files:
        fail('audit: no images')
    rows = []
    for f in files:
        img = load(f)
        rows.append({'file': f.name, 'sharpness': sharpness(img), 'warmth': warmth(img), 'flags': []})
    floor = round(percentile([r['sharpness'] for r in rows], a.percentile) * SHARP_FACTOR, 1)
    for r in rows:
        if r['sharpness'] < floor:
            r['flags'].append(f'soft: sharpness {r["sharpness"]} under {floor}')
    warm = [r['warmth'] for r in rows]
    spread = round(max(warm) - min(warm), 1)
    flags = [f'warmth spreads {spread} (max {WARMTH_SPREAD_MAX}): the set does not read as one light'] if spread > WARMTH_SPREAD_MAX else []
    out.mkdir(parents=True, exist_ok=True)
    merge_report(out, 'audit', {'files': rows, 'set': {'sharp_floor': floor, 'warmth_min': min(warm), 'warmth_max': max(warm), 'warmth_spread': spread, 'flags': flags}})
    for r in rows:
        print(f'{r["file"]}: sharpness {r["sharpness"]} · warmth {r["warmth"]}' + (' · FAIL ' + '; '.join(r['flags']) if r['flags'] else ''))
    print(f'set: {len(rows)} files · sharpness floor {floor} · warmth spread {spread}' + (' · FAIL ' + flags[0] if flags else ''))


def main():
    ap = argparse.ArgumentParser(prog='asset-audit.py', description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('audit')
    p.add_argument('images', nargs='+')
    p.add_argument('--percentile', type=float, default=25)
    p.add_argument('--out', default='assets-out', help='output folder (default assets-out)')
    try:
        a = ap.parse_args()
    except SystemExit as e:
        sys.exit(e.code if e.code in (0, None) else 2)
    cmd_audit(a, Path(a.out))


if __name__ == '__main__':
    # The report lines carry `·`; a Windows console codepage would mangle it for whoever parses the output.
    sys.stdout.reconfigure(encoding='utf-8')
    main()
