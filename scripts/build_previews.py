"""Builds the animated previews above the repo cards (assets/previews/<repo>.webp): about 8 s loops at 800 x 450, their
edges faded to transparent so they sit on either GitHub theme without a box, each under 2.5 MB for GitHub's image proxy.
Rebuilt by hand, not by the daily workflow:

    python scripts/build_previews.py --portfolio ../Portfolio-d --site http://localhost:<port>

--site is a `next start` of the portfolio checkout's build, for the portfolio's own preview. The footage:
- Portfolio: the site scrolled, recorded by scripts/record_previews.mjs.
- cebador-landing: the portfolio's recording of the live landing (public/film/pieces/cebador-1280.webm).
- ClubNahuelMosse: a Flutter app, so its real screens from the portfolio (public/film/pieces/club-*.webp) cross-fade in
  three phones.
Needs ffmpeg on the PATH and Pillow.
"""
import argparse
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "previews"
W, H, FPS = 800, 450, 12
LIMIT = 2_400_000


def edge_mask(fx=0.07, fy=0.1):
    """Opaque in the middle, fading to transparent at every edge."""
    def ramp(n, f):
        k = max(1, round(n * f))
        return [min(1.0, i / k, (n - 1 - i) / k) for i in range(n)]
    h = Image.new("L", (W, 1))
    h.putdata([round(255 * v) for v in ramp(W, fx)])
    v = Image.new("L", (1, H))
    v.putdata([round(255 * x) for x in ramp(H, fy)])
    return ImageChops.multiply(h.resize((W, H)), v.resize((W, H)))


def frames_from_video(src, start, seconds, speed=1.0):
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{start:.2f}", "-t", f"{seconds * speed:.2f}", "-i", str(src),
                        "-vf", f"setpts=PTS/{speed},fps={FPS},scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}",
                        str(Path(tmp) / "f%04d.png")], check=True)
        return [Image.open(p).convert("RGB") for p in sorted(Path(tmp).glob("f*.png"))]


def duration(src):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(src)],
                                capture_output=True, text=True, check=True).stdout)


def recorded(raw, key, seconds=None, speed=1.0, skip=0.0):
    """The end of a recording, where the action is (record_previews.mjs writes its length next to the video)."""
    src = raw / f"{key}.webm"
    action = json.loads((raw / f"{key}.json").read_text())["seconds"]
    start = duration(src) - action + skip
    return frames_from_video(src, start, seconds or (action - skip) / speed, speed)


def phones(portfolio, screens, seconds=8.0):
    """Three phones in a row, each cross-fading through the app's real screens, one screen apart and a beat apart."""
    shots = [Image.open(portfolio / "public" / "film" / "pieces" / f"{s}.webp").convert("RGB") for s in screens]
    sw, sh, pad, radius, gap = 168, 374, 8, 28, 44
    pw, ph = sw + 2 * pad, sh + 2 * pad
    shots = [s.resize((sw, sh), Image.LANCZOS) for s in shots]
    screen_mask = Image.new("L", (sw, sh), 0)
    ImageDraw.Draw(screen_mask).rounded_rectangle((0, 0, sw - 1, sh - 1), radius - pad, fill=255)
    x0 = (W - 3 * pw - 2 * gap) // 2
    y0 = (H - ph) // 2
    n, per, fade = len(shots), seconds / len(shots), 0.45
    frames = []
    for f in range(round(seconds * FPS)):
        t = f / FPS
        im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        for k in range(3):
            tk = (t + k * 0.35) % seconds
            i = int(tk // per)
            a = min(1.0, max(0.0, (tk - i * per - (per - fade)) / fade))
            screen = Image.blend(shots[(i + k) % n], shots[(i + k + 1) % n], a)
            x, y = x0 + k * (pw + gap), y0 + (0 if k == 1 else 14)
            body = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
            d = ImageDraw.Draw(body)
            d.rounded_rectangle((0, 0, pw - 1, ph - 1), radius, fill=(12, 12, 11, 255), outline=(70, 66, 60, 255), width=2)
            body.paste(screen, (pad, pad), screen_mask)
            im.alpha_composite(body, (x, y))
        frames.append(im)
    return frames


def save(key, frames, mask):
    out = []
    for f in frames:
        f = f.convert("RGBA")
        f.putalpha(ImageChops.multiply(f.getchannel("A"), mask))
        out.append(f)
    path = OUT / f"{key}.webp"
    for quality in (62, 52, 42, 34):
        out[0].save(path, save_all=True, append_images=out[1:], duration=round(1000 / FPS), loop=0, quality=quality,
                    method=6, alpha_quality=60)
        if path.stat().st_size <= LIMIT:
            break
    print(f"{path.name}: {len(out)} frames, {len(out) / FPS:.1f} s, {path.stat().st_size / 1e6:.2f} MB, quality {quality}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--portfolio", type=Path, default=ROOT.parent / "Portfolio-d")
    ap.add_argument("--site", help="a `next start` of the portfolio checkout, for the portfolio's preview")
    ap.add_argument("--raw", type=Path, help="reuse recordings already in this directory instead of recording")
    a = ap.parse_args()
    portfolio = a.portfolio.resolve()
    OUT.mkdir(parents=True, exist_ok=True)
    raw = a.raw
    tmp = None
    if raw is None:
        tmp = Path(tempfile.mkdtemp(prefix="previews-"))
        raw = tmp
        cmd = ["node", str(ROOT / "scripts" / "record_previews.mjs"), "--portfolio", str(portfolio), "--out", str(raw)]
        if a.site:
            cmd += ["--site", a.site]
        subprocess.run(cmd, check=True)
    soft, phone = edge_mask(), edge_mask(0.03, 0.03)
    try:
        if (raw / "portfolio.webm").exists():
            save("Portfolio", recorded(raw, "portfolio", seconds=9.0, speed=1.35), soft)
        cebador = portfolio / "public" / "film" / "pieces" / "cebador-1280.webm"
        # its first 12 s are the hero settling in; the scroll through the page starts after
        save("cebador-landing", frames_from_video(cebador, 12.5, 8.0, speed=2.0), soft)
        save("ClubNahuelMosse", phones(portfolio, ["club-login", "club-sedes", "club-horarios", "club-listo"]), phone)
    finally:
        if tmp:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
