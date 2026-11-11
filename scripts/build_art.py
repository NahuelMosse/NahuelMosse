"""Builds the README's banner (assets/static/banner.dark.svg and banner.light.svg, one per GitHub theme), set in the
portfolio's fonts. Needs the portfolio checkout for its fonts and art, so it runs locally, not in the daily workflow:

    python scripts/build_art.py --portfolio ../Portfolio-d

The fonts are Indian Type Foundry (Fontshare) and SIL OFL fonts that are not committed here; every word is drawn as outlines,
and the drawings are embedded, since an SVG shown through <img> cannot load anything external.
"""

import argparse
import base64
import io
import json
import math
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
STATIC = ASSETS / "static"

# design/tokens.css: one red as the only accent over ink and bone.
INK = "#0c0c0b"
BONE = "#ede4d0"
RED = "#d2231b"

# The GitHub pages the README sits on, and the type colors of each theme.
THEMES = {
    "dark": dict(bg="#0d1117", fg=BONE, dim="#9a9283", red=RED),
    "light": dict(bg="#ffffff", fg=INK, dim="#6b655a", red="#c41f17"),
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


def svg(w, h, label, body):
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-label="{esc(label)}">
  <title>{esc(label)}</title>
  <style>@keyframes draw{{to{{stroke-dashoffset:0}}}}.d{{stroke-dasharray:1;stroke-dashoffset:1;animation:draw 2.6s cubic-bezier(.65,0,.35,1) .3s both}}
  @keyframes up{{from{{opacity:0;transform:translateY(12px)}}to{{opacity:1;transform:none}}}}.u{{animation:up .9s cubic-bezier(.16,1,.3,1) both}}
  @media (prefers-reduced-motion:reduce){{*{{animation:none!important}}.d{{stroke-dashoffset:0}}}}</style>
  {body}
</svg>
"""


def banner(f, d, cv, portfolio, T, art):
    """Typographic cold open on a transparent ground: NAWI, the promise and the role, a red thread drawn under the mark
    that ends in a wax seal; in the dark theme the sealed file from the portfolio sits at the right, faded out at every
    edge so the band has no border."""
    W, H = 1200, 360
    i = d["identity"]
    body = []
    if art:
        im = Image.open(portfolio / "public" / "film" / "pf-file-sealed-16x9.webp").convert("RGB")
        aw, ah = 640, 360
        body.append(f'<radialGradient id="fade" cx=".5" cy=".5" r=".5"><stop offset=".45" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>'
                    f'<mask id="m" maskUnits="userSpaceOnUse" x="{W - aw}" y="0" width="{aw}" height="{ah}"><rect x="{W - aw}" y="0" width="{aw}" height="{ah}" fill="url(#fade)"/></mask>'
                    f'<g mask="url(#m)">{image(uri(cover(im, aw, ah, (0.55, 0.6))), W - aw, 0, aw, ah)}</g>')
    size = 230
    base = 40 + size * 0.72
    body.append(f'<g class="u">{f["display"].path(i["mark"], size, 36, base, T["fg"], tracking=-0.02)}</g>')
    mark_w = f["display"].width(i["mark"], size, -0.02)
    # the thread runs from under the mark to a seal at its end
    y = base + 26
    pts = " ".join(f"L{36 + (mark_w + 60) * k / 30:.1f} {y + 5 * math.sin(k / 30 * 9.42):.1f}" for k in range(1, 31))
    sx = 36 + mark_w + 60
    body.append(f'<path d="M36 {y} {pts}" pathLength="1" fill="none" stroke="{T["red"]}" stroke-width="2.5" stroke-linecap="round" class="d"/>'
                f'<circle cx="{sx:.1f}" cy="{y:.1f}" r="7" fill="{T["red"]}" class="u" style="animation-delay:2.4s"/>')
    ty = y + 44
    for line in f["text"].wrap(i["promise"], 24, 640):
        body.append(f'<g class="u" style="animation-delay:.5s">{f["text"].path(line, 24, 38, ty, T["fg"])}</g>')
        ty += 32
    role = cv["currentRole"].replace(" at ", " · ").upper()
    body.append(f'<g class="u" style="animation-delay:.8s">{f["label"].path(role, 15, 38, ty + 10, T["red"], tracking=0.16)}</g>')
    alt = f"{i['mark']}. {i['professionalName']}, {i['base']}. {i['promise']} {cv['currentRole']}."
    return svg(W, H, alt, "\n  ".join(body))


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
    for theme, T in THEMES.items():
        (STATIC / f"banner.{theme}.svg").write_text(banner(f, d, cv, portfolio, T, art=theme == "dark"), encoding="utf-8", newline="\n")
    print("banners:", ", ".join(f"{p.name} {p.stat().st_size // 1024} KB" for p in sorted(STATIC.glob("banner.*.svg"))))


if __name__ == "__main__":
    main()
