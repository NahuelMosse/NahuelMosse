"""Builds the README's static art in assets/ (banner, identification sheet, chapter plates, case files
and employer blocks), following the portfolio's components, plus fonts/courier-prime.woff2, the
subset the daily heatmap embeds.

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
import re
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




def uri(im, quality=74):
    out = io.BytesIO()
    im.convert("RGB").save(out, "WEBP", quality=quality, method=6)
    return "data:image/webp;base64," + base64.b64encode(out.getvalue()).decode()


def scaled(im, width, height):
    """The image resized to width x height, never above its own size."""
    if im.width <= width:
        return im
    return im.resize((round(width), round(height)), Image.LANCZOS)


def fade(uid, x, y, w, h, fx, fy, inner):
    """inner with its edges faded out, fx of the width on each side and fy of the height, like the site's masks."""
    def grad(gid, horizontal, f):
        end = 'x2="1" y2="0"' if horizontal else 'x2="0" y2="1"'
        return (f'<linearGradient id="{gid}" x1="0" y1="0" {end}><stop offset="0" stop-color="#000"/>'
                f'<stop offset="{f}" stop-color="#fff"/><stop offset="{1 - f}" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>')
    rect = f'x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}"'
    defs = (f'<defs>{grad(uid + "h", True, fx)}{grad(uid + "v", False, fy)}'
            f'<mask id="{uid}mh" maskUnits="userSpaceOnUse" {rect}><rect {rect} fill="url(#{uid}h)"/></mask>'
            f'<mask id="{uid}mv" maskUnits="userSpaceOnUse" {rect}><rect {rect} fill="url(#{uid}v)"/></mask></defs>')
    return f'{defs}<g mask="url(#{uid}mh)"><g mask="url(#{uid}mv)">{inner}</g></g>'


def star(x, y, size, fill):
    pts = [(50, 0), (62, 38), (100, 50), (62, 62), (50, 100), (38, 62), (0, 50), (38, 38)]
    return f'<polygon points="{" ".join(f"{x + size * a / 100:.1f},{y + size * b / 100:.1f}" for a, b in pts)}" fill="{fill}"/>'


def chapter_detail(f, x, y, numeral, note, anchor="start", size=15):
    """The fine line over a chapter word: numeral, a hairline, a catalog note and a four-point star."""
    gap, rule, st = 16, 64, 16
    n_w = f["label"].width(numeral, size, 0.08)
    t_w = f["label"].width(note.upper(), size, 0.08)
    total = n_w + gap + rule + gap + t_w + gap + st
    cx = x - total if anchor == "end" else x
    mid = y - size * 0.32
    out = [f["label"].path(numeral, size, cx, y, BONE_70, tracking=0.08)]
    cx += n_w + gap
    out.append(f'<line x1="{cx:.1f}" y1="{mid:.1f}" x2="{cx + rule:.1f}" y2="{mid:.1f}" stroke="{BONE_70}"/>')
    cx += rule + gap
    out.append(f["label"].path(note.upper(), size, cx, y, BONE_70, tracking=0.08))
    cx += t_w + gap
    out.append(star(cx, mid - st / 2, st, BONE))
    return "".join(out)


# The project cases, as features/portfolio/presentation/projects.tsx renders them: the scene illustration
# (ill-scene-<name>-16x9) cropped around its drawn device, with the real lead piece, or the kit's documents, in its screen.
SCENE_SIZE = (1672, 941)
SCENE_SCREENS = {  # scene-screens.ts, percent of the image: left, top, width, height
    "kit": (36.78, 34.43, 45.45, 43.36),
    "grit": (71.29, 8.61, 20.51, 79.06),
    "triaje": (47.61, 36.45, 49.04, 44.21),
    "cebador": (48.09, 47.29, 49.04, 39.96),
    "club": (44.68, 9.03, 20.22, 74.81),
}
MARGIN = {"phone": (0.45, 0.15), "wide": (0.1, 0.08)}  # project-scene.tsx, 16:9
STAGE_FADE = 0.18  # --stage-fade
SITE_SCREEN_WIDTH = 806  # a wide device's screen on a 1440px viewport (56vw), the size the kit documents are set for

PROJECTS = [
    dict(num="01", name="The card is the specification", scene="kit", device="wide", spot=RED,
         stack=["Node.js", "Playwright", "Claude Code"],
         documents=[
             ("A real card: the requirement frozen, one spec per sentence",
              ["PF-1 · S19 · “los primeros 5 segundos son los mas importantes”", "PF-1 · S27 · “para TPM mucho que se usar IA”", "status: proposed"]),
             ("Its tagged tests, one per spec",
              ["@PF-1-S19 by second 5 the name, the offer and a door are in view",
               "@PF-1-S27 the TPM offer and its door name how he delivers with AI",
               "@PF-1-ASM-17 a failed video keeps its poster"]),
         ]),
    dict(num="02", name="Grit", scene="grit", device="phone", spot="#1f55d6", stack=["Flutter", "Riverpod", "SQLite"], piece="grit-hoy.webp"),
    dict(num="03", name="Guardia", scene="triaje", device="wide", spot="#36d1a8", stack=["Browser game", "itch.io"], piece="triaje-title.webp"),
    dict(num="04", name="Cebador", scene="cebador", device="wide", spot="#f0a8ac", stack=["Landing site", "Motion", "GitHub Pages"], piece="cebador-1280-poster.webp"),
    dict(num="05", name="ClubNahuelMosse", scene="club", device="phone", spot="#cdeb3a", stack=["Flutter", "REST API"], piece="club-login.webp"),
]


def name_tokens(name):
    """The words of a title in capitals; a camel-case name breaks only between its words, never inside one."""
    tokens = []
    for i, word in enumerate(name.split()):
        for j, part in enumerate(re.split(r"(?<=[a-z])(?=[A-Z])", word)):
            tokens.append((" " if i and not j else "", part.upper()))
    return tokens


def title_lines(face, name, size, max_width):
    lines, line = [], ""
    for sep, part in name_tokens(name):
        trial = (line + sep + part) if line else part
        if line and face.width(trial, size) > max_width:
            lines.append(line)
            line = part
        else:
            line = trial
    return lines + [line]


def screen_documents(f, p, x, y, w, h):
    k = w / SITE_SCREEN_WIDTH
    size, pad, gap = 17 * k, 24 * k, 24 * k
    lead = size * 1.4
    out, cy = [], y + pad
    for caption, lines in p["documents"]:
        for line in f["label"].wrap(caption, size, w - 2 * pad):
            cy += lead
            out.append(f["label"].path(line, size, x + pad, cy - lead * 0.28, p["spot"]))
        cy += 4 * k
        for text in lines:
            top = cy
            for line in f["label"].wrap(text, size, w - 2 * pad - 10 * k):
                cy += lead
                out.append(f["label"].path(line, size, x + pad + 10 * k, cy - lead * 0.28, BONE))
            out.append(f'<rect x="{x + pad:.1f}" y="{top + 2 * k:.1f}" width="{2 * k:.2f}" height="{cy - top - 2 * k:.1f}" fill="{p["spot"]}"/>')
        cy += gap
    return "".join(out)


def case(f, p):
    W, H = 1200, 520
    box_x0, box_w, box_h = 476, 676, 440
    left, top, bw, bh = SCENE_SCREENS[p["scene"]]
    mx, my = MARGIN[p["device"]]
    l, r = max(0, left - mx * bw), min(100, left + bw * (1 + mx))
    t, b = max(0, top - my * bh), min(100, top + bh * (1 + my))
    sw_px, sh_px = SCENE_SIZE
    win = (l * sw_px / 100, t * sh_px / 100, r * sw_px / 100, b * sh_px / 100)
    ww, wh = win[2] - win[0], win[3] - win[1]
    k = min(box_w / ww, box_h / wh)
    dw, dh = ww * k, wh * k
    ax, ay = box_x0 + box_w - dw, (H - dh) / 2
    art = Image.open(ART / f"ill-scene-{p['scene']}-16x9.webp").crop(tuple(round(v) for v in win))
    art_uri = uri(scaled(art, dw * 1.25, dh * 1.25))

    sx = ax + (left - l) / 100 * sw_px * k
    sy = ay + (top - t) / 100 * sh_px * k
    sw = bw / 100 * sw_px * k
    sh = bh / 100 * sh_px * k
    if "piece" in p:
        # object-fit: cover, object-position: top
        piece = Image.open(ART / "pieces" / p["piece"])
        cover = max(sw / piece.width, sh / piece.height)
        pw, ph = piece.width * cover, piece.height * cover
        piece_uri = uri(scaled(piece, pw * 2, ph * 2), 82)
        screen = (f'<clipPath id="screen"><rect x="{sx:.1f}" y="{sy:.1f}" width="{sw:.1f}" height="{sh:.1f}"/></clipPath>'
                  f'<image href="{piece_uri}" x="{sx + (sw - pw) / 2:.1f}" y="{sy:.1f}" width="{pw:.1f}" height="{ph:.1f}" clip-path="url(#screen)" preserveAspectRatio="none"/>')
    else:
        screen = screen_documents(f, p, sx, sy, sw, sh)

    # The text column: the numeral in the spot, a hairline and the catalog label; the title in capitals; the stack underlined in the spot.
    tx, col = 48, 384
    longest = max(f["display"].width(part, 1, -0.02) for _, part in name_tokens(p["name"]))
    size = min(60, col / longest)
    lines = title_lines(f["display"], p["name"], size, col)
    lead = size * 1.05
    stack_size = 15
    stack_rows, row, row_w = [], [], 0
    for item in p["stack"]:
        iw = f["label"].width(item.upper(), stack_size, 0.08)
        if row and row_w + 18 + iw > col:
            stack_rows.append(row)
            row, row_w = [], 0
        row_w += iw + (18 if row else 0)
        row.append((item.upper(), iw))
    stack_rows.append(row)
    block = 48 + 28 + len(lines) * lead + 20 + len(stack_rows) * 34
    y = (H - block) / 2 + 48
    nw = f["display"].width(p["num"], 64, -0.02)
    parts = [
        f["display"].path(p["num"], 64, tx, y, p["spot"], tracking=-0.02),
        f'<line x1="{tx + nw + 16:.1f}" y1="{y - 22:.1f}" x2="{tx + nw + 80:.1f}" y2="{y - 22:.1f}" stroke="{BONE_70}"/>',
        f["label"].path("CASE FILE", 15, tx + nw + 96, y - 17, BONE, tracking=0.08),
    ]
    y += 28
    for line in lines:
        y += lead
        parts.append(f["display"].path(line, size, tx, y - lead * 0.12, BONE, tracking=-0.02))
    y += 20
    for row in stack_rows:
        cx = tx
        y += 34
        for text, iw in row:
            parts.append(f["label"].path(text, stack_size, cx, y - 10, BONE, tracking=0.08))
            parts.append(f'<rect x="{cx:.1f}" y="{y - 2:.1f}" width="{iw:.1f}" height="1" fill="{p["spot"]}"/>')
            cx += iw + 18

    art_img = f'<image href="{art_uri}" x="{ax:.1f}" y="{ay:.1f}" width="{dw:.1f}" height="{dh:.1f}" preserveAspectRatio="none"/>'
    body = f"""<defs>{GRAIN}</defs>
  <rect width="{W}" height="{H}" fill="{INK}"/>
  {fade("art", ax, ay, dw, dh, STAGE_FADE, STAGE_FADE, art_img)}
  <rect x="{sx + 1:.1f}" y="{sy + 1:.1f}" width="{sw:.1f}" height="{sh:.1f}" fill="{p["spot"]}"/>
  <rect x="{sx - 1:.1f}" y="{sy - 1:.1f}" width="{sw:.1f}" height="{sh:.1f}" fill="{INK}" fill-opacity="0.85"/>
  <rect x="{sx:.1f}" y="{sy:.1f}" width="{sw:.1f}" height="{sh:.1f}" fill="{INK}"/>
  {screen}
  {"".join(parts)}
  <rect width="{W}" height="{H}" filter="url(#grain)"/>"""
    return svg(W, H, f"Case file {p['num']}: {p['name']}. {', '.join(p['stack'])}.", body)


def chapter(f, numeral, note, word):
    """A chapter with no illustration of its own: the word flush left with its fine line above."""
    W, H = 1200, 230
    body = f"""<rect width="{W}" height="{H}" fill="{INK}"/>
  {chapter_detail(f, 48, 70, numeral, note)}
  {f["display"].path(word.upper(), 150, 44, 200, BONE, tracking=-0.02)}"""
    return svg(W, H, word, body)


# Ink rising from the bottom of a bright illustration, so the fine line over a chapter word stays legible.
SCRIM = ('<linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1"><stop offset="0.45" stop-color="#0c0c0b" stop-opacity="0"/>'
         '<stop offset="1" stop-color="#0c0c0b" stop-opacity="0.9"/></linearGradient><rect width="{W}" height="{H}" fill="url(#scrim)"/>')


def scene_plate(name, W, H, extra, label, scrim=False):
    """A full-bleed chapter illustration with its edges faded into the ink, as ChapterIllustration draws it."""
    im = Image.open(ART / name)
    ih = W * im.height / im.width
    iy = (H - ih) / 2
    art_uri = uri(scaled(im, W * 1.25, ih * 1.25))
    art_img = f'<image href="{art_uri}" x="0" y="{iy:.1f}" width="{W}" height="{ih:.1f}" preserveAspectRatio="none"/>'
    body = f"""<defs>{GRAIN}</defs>
  <rect width="{W}" height="{H}" fill="{INK}"/>
  {fade("art", 0, iy, W, ih, 0.07, 0.16, art_img)}
  {SCRIM.format(W=W, H=H) if scrim else ""}
  {extra}
  <rect width="{W}" height="{H}" filter="url(#grain)"/>"""
    return svg(W, H, label, body)


def experience_band(f):
    W, H = 1200, 514
    extra = (chapter_detail(f, W - 48, H - 168, "02", f"{len(EMPLOYERS)} employers", anchor="end")
             + f["display"].path("EXPERIENCE", 150, W - 56, H - 40, BONE, tracking=-0.02, anchor="end"))
    return scene_plate("ill-experience-21x9.webp", W, H, extra, "Experience", scrim=True)


# experience.tsx: one block per employer with the illustration of its system in use beside it, sides alternating.
EMPLOYERS = [
    ("smart-warehousing", "Smart Warehousing", "AI Engineering Enablement Lead / SDD Coach", "09/2026 – Present", True, None,
     "A set of warehouse teams adopting AI-assisted development."),
    ("grupo-st", "Grupo ST", "Technical Lead", "08/2026 – Present", True, None,
     "An AI-first delivery on a credit risk platform that manages documents and decisions."),
    ("visma", "Visma", "Technical Lead", "01/2026 – Present", True, "visma.webp",
     "A payroll onboarding product for a Nordic software company."),
    ("fravega", "Frávega", "Senior Full Stack Developer", "06/2023 – 01/2026", False, "fravega.webp",
     "The warehouse system of a large retailer's online orders."),
    ("justo", "Jüsto", "Senior Full Stack Developer", "11/2022 – 12/2023", False, "justo.webp",
     "A multi-warehouse system for an online supermarket."),
]


def employer(f, index, eid, name, title, period, current, logo, what):
    W, H = 1200, 420
    aw = H * 4 / 3
    art_right = index % 2 == 0
    ax = W - aw if art_right else 0
    tx = 48 if art_right else aw + 48
    col = W - aw - 96
    im = Image.open(ART / f"ill-exp-{eid}-4x3.webp")
    art_uri = uri(scaled(im, aw * 1.25, H * 1.25))
    what_lines = f["text"].wrap(what, 19, col)
    block = (72 if logo else 0) + 40 + 34 + 30 + 18 + len(what_lines) * 28
    y = (H - block) / 2
    parts = []
    if logo:
        out = io.BytesIO()
        Image.open(ASSETS / "logos" / logo).convert("RGBA").save(out, "WEBP", quality=90)
        logo_uri = "data:image/webp;base64," + base64.b64encode(out.getvalue()).decode()
        parts.append(f'<rect x="{tx}" y="{y:.1f}" width="56" height="56" rx="12" fill="{BONE}" stroke="{BONE_35}"/>'
                     f'<image href="{logo_uri}" x="{tx + 4}" y="{y + 4:.1f}" width="48" height="48" preserveAspectRatio="xMidYMid meet"/>')
        y += 72
    y += 40
    parts.append(f["display"].path(name, 40, tx, y, BONE))
    nw = f["display"].width(name, 40)
    tag = "CURRENT" if current else "PAST"
    tw = f["label"].width(tag, 14, 0.08)
    parts.append(f'<rect x="{tx + nw + 16:.1f}" y="{y - 24:.1f}" width="{tw + 16:.1f}" height="22" fill="{BONE}"/>')
    parts.append(f["label"].path(tag, 14, tx + nw + 24, y - 8, INK, tracking=0.08))
    y += 34
    parts.append(f["medium"].path(title, 19, tx, y, BONE))
    y += 30
    parts.append(f["label"].path(period.upper(), 14, tx, y, BONE_70, tracking=0.08))
    y += 18
    for line in what_lines:
        y += 28
        parts.append(f["text"].path(line, 19, tx, y, BONE))
    art_img = f'<image href="{art_uri}" x="{ax:.1f}" y="0" width="{aw:.1f}" height="{H}" preserveAspectRatio="none"/>'
    body = f"""<defs>{GRAIN}</defs>
  <rect width="{W}" height="{H}" fill="{INK}"/>
  {fade("art", ax, 0, aw, H, 0.16, 0.16, art_img)}
  {"".join(parts)}
  <rect width="{W}" height="{H}" filter="url(#grain)"/>"""
    return svg(W, H, f"{name}, {title}, {period}. {what}", body)


def offer(f):
    W, H = 1200, 675
    extra = (chapter_detail(f, 48, 64, "03", "Two doors")
             + f["display"].path("OFFER", 150, 44, 200, "none", tracking=-0.02, extra=f' stroke="{BONE}" stroke-width="1.5"')
             + f["label"].path("DOOR 01", 15, 48, H - 120, RED, tracking=TRACKING)
             + f["display"].path("Freelance", 50, 48, H - 64, BONE)
             + f["label"].path("DOOR 02", 15, W - 48, H - 176, RED, tracking=TRACKING, anchor="end")
             + f["display"].path("Technical", 50, W - 48, H - 120, BONE, anchor="end")
             + f["display"].path("Project Manager", 50, W - 48, H - 64, BONE, anchor="end"))
    return scene_plate("ill-offer-16x9.webp", W, H, extra, "Offer. Two doors: Freelance and Technical Project Manager.")


def contact(f):
    W, H = 1200, 675
    extra = (chapter_detail(f, 48, H - 190, "04", "Buenos Aires")
             + f["display"].path("LET’S TALK", 150, 44, H - 48, RED, tracking=-0.02))
    return scene_plate("ill-contact-16x9.webp", W, H, extra, "Let's talk")


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
    out = {
        "banner.svg": banner(f),
        "id-sheet.svg": id_sheet(f),
        "projects.svg": chapter(f, "01", f"{len(PROJECTS)} projects", "Projects"),
        "experience.svg": experience_band(f),
        "offer.svg": offer(f),
        "contact.svg": contact(f),
    }
    for p in PROJECTS:
        out[f"case-{p['num']}.svg"] = case(f, p)
    for i, e in enumerate(EMPLOYERS):
        out[f"exp-{e[0]}.svg"] = employer(f, i, *e)
    for name, text in out.items():
        (ASSETS / name).write_text(text, encoding="utf-8")
        print(f"{name}: {len(text.encode()) // 1024} KB")
    courier_subset(fonts)


if __name__ == "__main__":
    main()
