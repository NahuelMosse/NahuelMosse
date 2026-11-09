"""Builds the README's static art: assets/banner.svg, assets/id-sheet.svg, assets/case-0N.svg and
assets/doors.svg, plus fonts/courier-prime.woff2, the subset the daily heatmap embeds.

Run from the repo root:  python scripts/build_art.py --fonts ../Portfolio/public/fonts

Boska and General Sans are Indian Type Foundry fonts under the Fontshare license, which does not
allow sharing the font files, so they are not in this repo and every word set in them is drawn as
outlines. Courier Prime is under the SIL OFL (fonts/OFL.txt), so its subset is committed.
The illustrations are read from assets/art/ and embedded, since an SVG shown through <img> cannot
load anything external.
"""

import argparse
import base64
import io
from pathlib import Path

import uharfbuzz as hb
from fontTools import subset
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
ART = ASSETS / "art"

# design/tokens.css of the portfolio: one red as the only accent, over ink and bone.
INK = "#0c0c0b"
BONE = "#ede4d0"
RED = "#d2231b"
BONE_70 = "#ede4d0b3"
BONE_35 = "#ede4d059"
BONE_12 = "#ede4d01f"
INK_60 = "#0c0c0b99"

TRACKING = 0.16  # --label-tracking
EASE = "cubic-bezier(0.16, 1, 0.3, 1)"  # --ease-out


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
        s = size / self.upm
        return sum(p.x_advance for _, p in run) * s + tracking * size * max(len(run) - 1, 0)

    def path(self, text, size, x, y, fill, tracking=0.0, anchor="start", extra=""):
        run = self._shape(text)
        s = size / self.upm
        w = self.width(text, size, tracking)
        cx = x - {"start": 0, "middle": w / 2, "end": w}[anchor]
        pen = SVGPathPen(self.glyphs, ntos=lambda v: f"{v:.1f}".rstrip("0").rstrip("."))
        for info, pos in run:
            name = self.order[info.codepoint]
            self.glyphs[name].draw(TransformPen(pen, (s, 0, 0, -s, cx + pos.x_offset * s, y - pos.y_offset * s)))
            cx += pos.x_advance * s + tracking * size
        return f'<path d="{pen.getCommands()}" fill="{fill}"{extra}/>'

    def wrap(self, text, size, max_width):
        lines, line = [], ""
        for word in text.split():
            trial = f"{line} {word}".strip()
            if line and self.width(trial, size) > max_width:
                lines.append(line)
                line = word
            else:
                line = trial
        return lines + [line]


def embed(name, width, quality=74):
    im = Image.open(ART / name).convert("RGB")
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    out = io.BytesIO()
    im.save(out, "WEBP", quality=quality, method=6)
    return "data:image/webp;base64," + base64.b64encode(out.getvalue()).decode()


GRAIN = """<filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" seed="7"/>
      <feColorMatrix values="0 0 0 0 0.93  0 0 0 0 0.89  0 0 0 0 0.82  0 0 0 0.11 0"/>
    </filter>"""

MOTION = f"""
    .thread {{ stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw 2.8s {EASE} .3s forwards; }}
    @keyframes draw {{ to {{ stroke-dashoffset: 0; }} }}
    @media (prefers-reduced-motion: reduce) {{ .thread {{ animation: none; stroke-dashoffset: 0; }} }}"""


def svg(w, h, label, body, style=""):
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-label="{label}">
  <title>{label}</title>
  <style>{style}
  </style>
  {body}
</svg>
"""


def banner(f):
    W, H = 1200, 560
    art = embed("ill-cover-16x9.webp", 1000)
    nawi = f["display"].path("NAWI", 300, W - 48, 372, BONE, anchor="end", tracking=-0.01)
    promise = f["text"].wrap("I design, build and lead digital products, and I put AI to work for them.", 30, 560)
    promise_paths = "\n    ".join(
        f["medium"].path(line, 30, W - 48, 420 + i * 40, BONE, anchor="end") for i, line in enumerate(promise)
    )
    body = f"""<defs>
    {GRAIN}
    <linearGradient id="fade" x1="0" x2="1">
      <stop offset="0.4" stop-color="#fff"/>
      <stop offset="0.78" stop-color="#000"/>
    </linearGradient>
    <mask id="art"><rect width="{W}" height="{H}" fill="url(#fade)"/></mask>
  </defs>
  <rect width="{W}" height="{H}" fill="{INK}"/>
  <image href="{art}" x="-90" y="0" width="1000" height="563" mask="url(#art)" preserveAspectRatio="xMidYMid slice"/>
  <path class="thread" pathLength="1" d="M 0 548 C 300 556, 560 520, 676 492 C 760 540, 1000 556, 1200 552" fill="none" stroke="{RED}" stroke-width="3"/>
  {f["label"].path("NAHUEL MOSSE", 15, 48, 56, BONE_70, tracking=TRACKING)}
  {f["label"].path("BUENOS AIRES", 15, W - 48, 56, BONE_70, tracking=TRACKING, anchor="end")}
  {nawi}
  {promise_paths}
  {f["label"].path("TECHNICAL LEAD · KOVIX CONSULTING", 15, W - 48, 420 + len(promise) * 40 + 12, RED, tracking=TRACKING, anchor="end")}
  <rect width="{W}" height="{H}" filter="url(#grain)"/>"""
    return svg(W, H, "Nawi. Nahuel Mosse, Technical Lead at Kovix Consulting, Buenos Aires. I design, build and lead digital products, and I put AI to work for them.", body, MOTION)


ID_ROWS = [
    ("NAME", "Nahuel Mosse"),
    ("ALIAS", "Nawi"),
    ("ROLE", "Technical Lead · Kovix Consulting"),
    ("ASSIGNED TO", "Smart Warehousing · Grupo ST · Visma"),
    ("BASE", "Buenos Aires"),
    ("KNOWN FOR", "Designing, building and leading digital products"),
    ("WORKS WITH", "Node.js · NestJS · TypeScript · React · Next.js · PostgreSQL · Playwright · Claude Code"),
    ("STUDIES", "Analista en Informática · Universidad de Morón · 2025"),
    ("", "Ingeniería en Informática · 4th year · Universidad de Morón"),
    ("ENGLISH", "EF SET C2 Proficient"),
]


def id_sheet(f):
    W, H = 1200, 580
    photo = embed("pf-id-front.webp", 400, 80)
    # A paper sheet with torn top and bottom edges, laid on the ink.
    sx, sy, sw, sh = 32, 40, W - 64, H - 80
    top = [(0, 1.5), (4, 0), (9, 1.2), (15, 0.2), (22, 1.4), (30, 0), (38, 1.1), (47, 0.1), (55, 1.3), (64, 0), (73, 1.2), (82, 0.2), (91, 1.3), (100, 0.3)]
    bottom = [(100, 98.5), (94, 100), (86, 98.8), (77, 99.9), (68, 98.7), (59, 100), (50, 98.9), (41, 99.8), (32, 98.6), (23, 100), (14, 98.8), (6, 99.9), (0, 98.7)]
    pts = " ".join(f"{sx + sw * px / 100:.1f},{sy + sh * py / 100:.1f}" for px, py in top + bottom)

    px, py, pw, ph = sx + 48, sy + 92, 240, 300
    rows = []
    kx, vx, y = px + pw + 56, px + pw + 56 + 170, sy + 112
    for k, v in ID_ROWS:
        if k:
            rows.append(f["label"].path(k, 13, kx, y, INK_60, tracking=TRACKING))
        for line in f["text"].wrap(v, 19, sx + sw - 48 - vx):
            rows.append(f["text"].path(line, 19, vx, y, INK))
            y += 34
    rule_y = sy + 70
    body = f"""<defs>
    {GRAIN}
    <clipPath id="photo"><rect x="{px}" y="{py}" width="{pw}" height="{ph}"/></clipPath>
  </defs>
  <rect width="{W}" height="{H}" fill="{INK}"/>
  <polygon points="{pts}" fill="{BONE}"/>
  {f["label"].path("IDENTIFICATION SHEET", 14, sx + 48, sy + 50, INK, tracking=TRACKING)}
  {f["label"].path("FILE · NAWI", 14, sx + sw - 48, sy + 50, RED, tracking=TRACKING, anchor="end")}
  <line x1="{sx + 48}" y1="{rule_y}" x2="{sx + sw - 48}" y2="{rule_y}" stroke="{INK}" stroke-width="1.5"/>
  <image href="{photo}" x="{px}" y="{py}" width="{pw}" height="{ph}" clip-path="url(#photo)" preserveAspectRatio="xMidYMid slice"/>
  <rect x="{px}" y="{py}" width="{pw}" height="{ph}" fill="none" stroke="{INK}" stroke-width="1.5"/>
  <rect x="{px}" y="{py + ph + 14}" width="{pw}" height="34" fill="{RED}"/>
  {f["label"].path("NAHUEL MOSSE", 14, px + pw / 2, py + ph + 36, BONE, tracking=TRACKING, anchor="middle")}
  <path class="thread" pathLength="1" d="M {px + pw - 8} {sy + 4} L {px + pw - 8} {py}" stroke="{RED}" stroke-width="2.5" fill="none"/>
  <circle cx="{px + pw - 8}" cy="{py}" r="5" fill="{RED}"/>
  {"".join(rows)}
  <rect width="{W}" height="{H}" filter="url(#grain)"/>"""
    return svg(W, H, "Identification sheet. " + ". ".join(f"{k.title() or 'Also'}: {v}" for k, v in ID_ROWS), body, MOTION)


CASES = [
    ("01", "The card is the specification", "DEV KIT", "ill-kit-16x9.webp", ["Node.js", "Playwright", "Claude Code"]),
    ("02", "Grit", "TRAINING APP", "ill-grit-16x9.webp", ["Flutter", "Riverpod", "SQLite"]),
    ("03", "Guardia", "BROWSER GAME", "ill-triaje-16x9.webp", ["Browser game", "itch.io"]),
    ("04", "Cebador", "BRAND SITE", "ill-cebador-16x9.webp", ["Landing site", "Motion", "GitHub Pages"]),
    ("05", "ClubNahuelMosse", "BOOKING APP", "ill-club-16x9.webp", ["Flutter", "REST API"]),
]


def case(f, num, title, kind, art_name, stack):
    W, H = 1200, 440
    art = embed(art_name, 800)
    aw = 782
    ax = W - aw
    title_size = 52
    lines = f["display"].wrap(title, title_size, 400)
    ty = 210 if len(lines) > 1 else 238
    title_paths = "".join(f["display"].path(line, title_size, 48, ty + i * 54, BONE) for i, line in enumerate(lines))
    stack_line = "  ·  ".join(s.upper() for s in stack)
    body = f"""<defs>
    {GRAIN}
    <linearGradient id="fade" x1="0" x2="1">
      <stop offset="0" stop-color="#000"/>
      <stop offset="0.3" stop-color="#fff"/>
    </linearGradient>
    <mask id="art"><rect x="{ax}" width="{aw}" height="{H}" fill="url(#fade)"/></mask>
  </defs>
  <rect width="{W}" height="{H}" fill="{INK}"/>
  <image href="{art}" x="{ax}" y="0" width="{aw}" height="{H}" mask="url(#art)" preserveAspectRatio="xMidYMid slice"/>
  {f["label"].path(f"CASE FILE · {kind}", 14, 48, 64, BONE_70, tracking=TRACKING)}
  {f["display"].path(num, 96, 48, 158, RED)}
  {title_paths}
  <line x1="48" y1="{H - 86}" x2="420" y2="{H - 86}" stroke="{BONE_35}"/>
  {f["label"].path(stack_line, 12, 48, H - 56, BONE_70, tracking=0.08)}
  <path class="thread" pathLength="1" d="M 0 {H - 1.5} L {W} {H - 1.5}" stroke="{RED}" stroke-width="3" fill="none"/>
  <rect width="{W}" height="{H}" filter="url(#grain)"/>"""
    return svg(W, H, f"Case {num}: {title}. {', '.join(stack)}.", body, MOTION)


def doors(f):
    W, H = 1200, 420
    art = embed("ill-offer-16x9.webp", 800)
    aw = 746
    ax = (W - aw) / 2
    body = f"""<defs>
    {GRAIN}
    <radialGradient id="fade" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0.7" stop-color="#fff"/>
      <stop offset="1" stop-color="#000"/>
    </radialGradient>
    <mask id="art"><rect x="{ax}" width="{aw}" height="{H}" fill="url(#fade)"/></mask>
  </defs>
  <rect width="{W}" height="{H}" fill="{INK}"/>
  <image href="{art}" x="{ax}" y="0" width="{aw}" height="{H}" mask="url(#art)" preserveAspectRatio="xMidYMid slice"/>
  {f["label"].path("TWO DOORS", 14, 48, 64, BONE_70, tracking=TRACKING)}
  {f["display"].path("Freelance", 46, 48, H - 72, BONE)}
  {f["label"].path("DOOR 01", 13, 48, H - 120, RED, tracking=TRACKING)}
  {f["display"].path("Technical", 46, W - 48, H - 126, BONE, anchor="end")}
  {f["display"].path("Project Manager", 46, W - 48, H - 72, BONE, anchor="end")}
  {f["label"].path("DOOR 02", 13, W - 48, H - 174, RED, tracking=TRACKING, anchor="end")}
  <rect width="{W}" height="{H}" filter="url(#grain)"/>"""
    return svg(W, H, "Two doors: Freelance and Technical Project Manager.", body)


def courier_subset(fonts: Path):
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["kern"]
    opts.name_IDs = ["*"]
    font = TTFont(fonts / "courier-prime-400.woff2")
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=list(range(0x20, 0x7F)) + [0xB7, 0x2013, 0x2014, 0x2192])
    sub.subset(font)
    font.flavor = "woff2"
    (ROOT / "fonts").mkdir(exist_ok=True)
    font.save(ROOT / "fonts" / "courier-prime.woff2")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fonts", type=Path, default=ROOT.parent / "Portfolio" / "public" / "fonts")
    fonts = ap.parse_args().fonts
    f = {
        "display": Face(fonts / "boska-700.woff2"),
        "text": Face(fonts / "general-sans-400.woff2"),
        "medium": Face(fonts / "general-sans-500.woff2"),
        "label": Face(fonts / "courier-prime-400.woff2"),
    }
    out = {"banner.svg": banner(f), "id-sheet.svg": id_sheet(f), "doors.svg": doors(f)}
    for c in CASES:
        out[f"case-{c[0]}.svg"] = case(f, *c)
    for name, text in out.items():
        (ASSETS / name).write_text(text, encoding="utf-8")
        print(f"{name}: {len(text.encode()) // 1024} KB")
    courier_subset(fonts)
    print("fonts/courier-prime.woff2:", (ROOT / "fonts" / "courier-prime.woff2").stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
