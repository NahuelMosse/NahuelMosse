"""Builds the README's banner (assets/static/banner.svg), set in the portfolio's fonts, and the image bands of the repo
cards (assets/cards/). Needs the portfolio checkout for its fonts and art, so it runs locally, not in the daily workflow:

    python scripts/build_art.py --portfolio ../Portfolio-d

The fonts are Indian Type Foundry (Fontshare) and SIL OFL fonts that are not committed here; every word is drawn as outlines,
and the drawings are embedded, since an SVG shown through <img> cannot load anything external.
"""

import argparse
import base64
import io
import json
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
STATIC = ASSETS / "static"
CARDS_DIR = ASSETS / "cards"

# design/tokens.css: one red as the only accent over ink and bone, and each product's and employer's own color.
INK = "#0c0c0b"
BONE = "#ede4d0"
RED = "#d2231b"
BONE_70 = "#ede4d0b3"
BONE_35 = "#ede4d059"
SPOT = {
    "kit": "#b3261e", "grit": "#1f55d6", "triaje": "#36d1a8", "cebador": "#f0a8ac", "club": "#cdeb3a", "sonria": "#6a4bd8",
    "miga": "#e8a33d", "fravega": "#b8188a", "grupo-st": "#004f87", "justo": "#00a37c", "smart-warehousing": "#f7901e",
    "visma": "#7f56fa",
}

# The image band of each featured repo card (data/repos.json): the project's scene from the portfolio, or for a dev-kit
# tool its real page in a red duotone, so the three tools read apart and stay on the palette.
CARDS = {
    "club": dict(scene="ill-scene-club-16x9.webp", focus=(0.5, 0.45)),
    "cebador": dict(scene="ill-scene-cebador-16x9.webp", focus=(0.6, 0.45)),
    "portfolio": dict(scene="ill-cover-16x9.webp", focus=(0.5, 0.25)),
    "motion-audit": dict(page="kit-skill-motion-audit.webp"),
    "http-attack": dict(page="kit-skill-http-attack.webp"),
    "migrations-safe": dict(page="kit-skill-migrations-safe.webp"),
}


def mix(a, b, t):
    pa = [int(a[i:i + 2], 16) for i in (1, 3, 5)]
    pb = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x + (y - x) * t):02x}" for x, y in zip(pa, pb))


def esc(s):
    return str(s).replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")


class Face:
    """A font that lays out a line with HarfBuzz and returns it as one SVG path."""

    def __init__(self, path: Path):
        tt = TTFont(path)
        tt.flavor = None
        raw = io.BytesIO()
        tt.save(raw)
        self.hb = hb.Font(hb.Face(raw.getvalue()))
        self.upm = tt["head"].unitsPerEm
        self.glyphs = tt.getGlyphSet()
        self.order = tt.getGlyphOrder()

    def _shape(self, text):
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(self.hb, buf, {"kern": True, "liga": True})
        return list(zip(buf.glyph_infos, buf.glyph_positions))

    def width(self, text, size, tracking=0.0):
        run = self._shape(text)
        return sum(p.x_advance for _, p in run) * size / self.upm + tracking * size * max(len(run) - 1, 0)

    def path(self, text, size, x, y, fill, tracking=0.0, anchor="start", extra=""):
        run = self._shape(text)
        s = size / self.upm
        w = self.width(text, size, tracking)
        cx = x - {"start": 0, "middle": w / 2, "end": w}[anchor]
        pen = SVGPathPen(self.glyphs, ntos=lambda v: f"{v:.1f}".rstrip("0").rstrip("."))
        for info, pos in run:
            self.glyphs[self.order[info.codepoint]].draw(TransformPen(pen, (s, 0, 0, -s, cx + pos.x_offset * s, y - pos.y_offset * s)))
            cx += pos.x_advance * s + tracking * size
        return f'<path d="{pen.getCommands()}" fill="{fill}"{extra}/>'

    def wrap(self, text, size, max_width, tracking=0.0):
        lines, line = [], ""
        for word in text.split():
            trial = f"{line} {word}".strip()
            if line and self.width(trial, size, tracking) > max_width:
                lines.append(line)
                line = word
            else:
                line = trial
        return lines + [line]


def uri(im, quality=74):
    out = io.BytesIO()
    if im.mode not in ("RGB", "L", "RGBA"):
        im = im.convert("RGB")
    im.save(out, "WEBP", quality=quality, method=6)
    return "data:image/webp;base64," + base64.b64encode(out.getvalue()).decode()


def fit(im, width):
    """The image at most `width` pixels wide, kept to its ratio."""
    if im.width <= width:
        return im
    return im.resize((round(width), round(im.height * width / im.width)), Image.LANCZOS)


def cover(im, w, h, focus=(0.5, 0.5), scale=1.25):
    """object-fit: cover into w x h at `focus`, at `scale` times the plate's pixels."""
    k = max(w / im.width, h / im.height)
    cw, ch = w / k, h / k
    x0 = (im.width - cw) * focus[0]
    y0 = (im.height - ch) * focus[1]
    crop = im.crop((round(x0), round(y0), round(x0 + cw), round(y0 + ch)))
    return crop.resize((round(min(crop.width, w * scale)), round(min(crop.height, h * scale))), Image.LANCZOS)


def image(src, x, y, w, h, extra=""):
    return f'<image href="{src}" x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" preserveAspectRatio="none"{extra}/>'


def fade(uid, x, y, w, h, fx, fy, inner, bottom_only=False):
    """inner with its edges faded out: fx of the width at each side and fy of the height, as the site's masks do."""
    def grad(gid, horizontal, f, start=True):
        end = 'x2="1" y2="0"' if horizontal else 'x2="0" y2="1"'
        first = '<stop offset="0" stop-color="#000"/>' if start else '<stop offset="0" stop-color="#fff"/>'
        return (f'<linearGradient id="{gid}" x1="0" y1="0" {end}>{first}<stop offset="{f}" stop-color="#fff"/>'
                f'<stop offset="{1 - f}" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>')
    rect = f'x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}"'
    defs = (f'<defs>{grad(uid + "h", True, fx)}{grad(uid + "v", False, fy, not bottom_only)}'
            f'<mask id="{uid}mh" maskUnits="userSpaceOnUse" {rect}><rect {rect} fill="url(#{uid}h)"/></mask>'
            f'<mask id="{uid}mv" maskUnits="userSpaceOnUse" {rect}><rect {rect} fill="url(#{uid}v)"/></mask></defs>')
    return f'{defs}<g mask="url(#{uid}mh)"><g mask="url(#{uid}mv)">{inner}</g></g>'


GRAIN = """<filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" seed="7"/>
      <feColorMatrix values="0 0 0 0 0.93  0 0 0 0 0.89  0 0 0 0 0.82  0 0 0 0.09 0"/>
    </filter>"""


def svg(w, h, label, body):
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-label="{esc(label)}">
  <title>{esc(label)}</title>
  <defs>{GRAIN}</defs>
  {body}
  <rect width="{w}" height="{h}" filter="url(#grain)"/>
</svg>
"""


def banner(f, d, cv, portfolio):
    """The cold open (hero-poster.tsx) cut to a band: the cover drawing, NAWI across it, the promise and the role now."""
    W, H = 1200, 400
    i = d["identity"]
    art = Image.open(portfolio / "public" / "film" / "ill-cover-16x9.webp")
    body = [f'<rect width="{W}" height="{H}" fill="{INK}"/>',
            fade("cover", 0, 0, W, H, 0.05, 0.1, image(uri(cover(art, W, H, (0.5, 0.18))), 0, 0, W, H)),
            f'<linearGradient id="side" x1="0" y1="0" x2="1" y2="0"><stop offset="0.45" stop-color="{INK}" stop-opacity="0"/>'
            f'<stop offset="0.75" stop-color="{INK}" stop-opacity="0.88"/></linearGradient><rect width="{W}" height="{H}" fill="url(#side)"/>']
    size = 250
    body.append(f'<g style="mix-blend-mode:screen">{f["display"].path(i["mark"], size, W - 40, 40 + size * 0.7, BONE, tracking=-0.02, anchor="end")}</g>')
    lines = f["text"].wrap(i["promise"], 26, 520)
    y = 40 + size * 0.7 + 52
    for line in lines:
        body.append(f["text"].path(line, 26, W - 44, y, BONE, anchor="end"))
        y += 34
    # a local ink scrim under the role line, so the red reads where it crosses the chair
    role = cv["currentRole"].replace(" at ", " · ").upper()
    role_w = f["label"].width(role, 15, 0.16)
    body.append(f'<linearGradient id="role" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{INK}" stop-opacity="0"/>'
                f'<stop offset="0.25" stop-color="{INK}" stop-opacity="0.92"/></linearGradient>'
                f'<rect x="{W - 44 - role_w - 140:.1f}" y="{y - 8:.1f}" width="{role_w + 184:.1f}" height="34" fill="url(#role)"/>')
    body.append(f["label"].path(role, 15, W - 44, y + 14, RED, tracking=0.16, anchor="end"))
    alt = f"{i['mark']}. {i['professionalName']}, {i['base']}. {i['promise']} {cv['currentRole']}."
    return svg(W, H, alt, "\n  ".join(body))


def card_image(portfolio, key):
    """An 880 x 336 band (2x the card's 440 x 168): a scene cropped to cover, or a page inverted into a dark duotone, its
    white paper turned to ink, its lines to red and its text to bone."""
    W, H = 880, 336
    t = CARDS[key]
    if "scene" in t:
        return cover(Image.open(portfolio / "public" / "film" / t["scene"]).convert("RGB"), W, H, t["focus"], scale=1)
    page = cover(Image.open(portfolio / "public" / "film" / "pieces" / t["page"]).convert("L"), W, H, (0.5, 0.0), scale=1)
    lut = []
    for c in range(3):
        a, b, e = int(INK[1 + 2 * c:3 + 2 * c], 16), int(RED[1 + 2 * c:3 + 2 * c], 16), int(BONE[1 + 2 * c:3 + 2 * c], 16)
        lut += [round(a + (b - a) * (255 - v) / 128) if v > 127 else round(b + (e - b) * (127 - v) / 127) for v in range(256)]
    return Image.merge("RGB", [page.point(lut[i * 256:(i + 1) * 256]) for i in range(3)])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--portfolio", type=Path, default=ROOT.parent / "Portfolio-d")
    portfolio = ap.parse_args().portfolio
    fonts = portfolio / "public" / "fonts"
    f = {
        "display": Face(fonts / "boska-700.woff2"),
        "text": Face(fonts / "general-sans-400.woff2"),
        "label": Face(fonts / "courier-prime-400.woff2"),
    }
    d = json.loads((ROOT / "data" / "portfolio.json").read_text(encoding="utf-8"))
    cv = json.loads((ROOT / "data" / "cv.json").read_text(encoding="utf-8"))
    STATIC.mkdir(parents=True, exist_ok=True)
    (STATIC / "banner.svg").write_text(banner(f, d, cv, portfolio), encoding="utf-8", newline="\n")
    CARDS_DIR.mkdir(parents=True, exist_ok=True)
    for key in CARDS:
        card_image(portfolio, key).save(CARDS_DIR / f"{key}.webp", "WEBP", quality=72, method=6)
    print("banner.svg:", (STATIC / "banner.svg").stat().st_size // 1024, "KB;", len(CARDS), "card images")


if __name__ == "__main__":
    main()
