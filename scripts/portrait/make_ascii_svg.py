"""Turns the prepped portrait into assets/ascii-{dark,light}.svg, printed row by row once.

    python scripts/portrait/make_ascii_svg.py [prepped.png]

Each row is revealed by a SMIL clip wipe with a block cursor riding its edge; everything
freezes when the last row lands. SMIL runs inside <img>, which is all a GitHub README allows.
"""
import sys
from pathlib import Path
from xml.sax.saxutils import escape

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name(".cache") / "prepped.png"

RAMP = " .`:-=+*cs#%@"  # sparse -> dense
W, H = 370, 400
PAD_X, TOP = 14, 46
COLS = 80
CHAR_W = (W - 2 * PAD_X) / COLS
LINE_H = 8.2
ROWS = round(COLS * CHAR_W / LINE_H)
ROW_DELAY = 0.06
WIPE = 0.2
START = 0.25
MONO = 'ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, monospace'

THEMES = {
    "dark": {"bg": "#00170d", "rule": "#193429", "muted": "#968e82", "ink": "#dcc7a1", "invert": False, "gamma": 0.9},
    "light": {"bg": "#f2eee7", "rule": "#e2dbcd", "muted": "#6b6459", "ink": "#9e6033", "invert": True, "gamma": 1.25},
}

src = Image.open(SRC).convert("LA")
lum = np.asarray(src.getchannel("L").resize((COLS, ROWS), Image.BOX)).astype(np.float32) / 255.0
alpha = np.asarray(src.getchannel("A").resize((COLS, ROWS), Image.BOX)) > 110


def grid(invert: bool, gamma: float) -> np.ndarray:
    # On a dark panel a lit pixel should be dense ink; on a light panel, a dark pixel.
    # gamma > 1 pushes midtones toward sparse glyphs; < 1 toward dense.
    density = (1.0 - lum if invert else lum) ** gamma
    idx = np.clip((density * (len(RAMP) - 1)).round().astype(int), 0, len(RAMP) - 1)
    idx[~alpha] = 0
    return idx


def spans(row: np.ndarray) -> str:
    # Glyph shape alone is too subtle at 7px; ink opacity follows density so the face reads as tone.
    out, i, n = [], 0, len(row)
    while i < n:
        j = i
        while j < n and row[j] == row[i]:
            j += 1
        chunk = escape("".join(RAMP[k] for k in row[i:j]))
        out.append(chunk if row[i] == 0 else f'<tspan class="d{row[i]}">{chunk}</tspan>')
        i = j
    return "".join(out)


def render(t: dict) -> str:
    idx = grid(t["invert"], t["gamma"])
    levels = "\n    ".join(
        f".d{k} {{ fill-opacity: {0.34 + 0.66 * k / (len(RAMP) - 1):.2f}; }}" for k in range(1, len(RAMP))
    )
    clips, rows = [], []
    for i, row in enumerate(idx):
        nz = np.nonzero(row)[0]
        if not len(nz):
            continue
        row = row[: nz[-1] + 1]
        text = spans(row)
        y = TOP + LINE_H * (i + 1)
        width = len(row) * CHAR_W
        begin = f"{START + i * ROW_DELAY:.3f}s"
        clips.append(
            f'<clipPath id="r{i}"><rect x="{PAD_X}" y="{y - LINE_H:.1f}" width="0" height="{LINE_H + 1}">'
            f'<animate attributeName="width" from="0" to="{width:.1f}" begin="{begin}" dur="{WIPE}s" fill="freeze"/>'
            f"</rect></clipPath>"
        )
        rows.append(
            f'<text x="{PAD_X}" y="{y - 1.4:.1f}" textLength="{width:.1f}" lengthAdjust="spacing" '
            f'clip-path="url(#r{i})">{text}</text>'
            f'<rect class="cur" x="{PAD_X}" y="{y - LINE_H + 0.6:.1f}" width="{CHAR_W:.2f}" height="{LINE_H - 1:.1f}" opacity="0">'
            f'<animate attributeName="x" from="{PAD_X}" to="{PAD_X + width:.1f}" begin="{begin}" dur="{WIPE}s" fill="freeze"/>'
            f'<set attributeName="opacity" to="1" begin="{begin}" dur="{WIPE}s"/>'
            f"</rect>"
        )
    nl = "\n  "
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="ASCII portrait printed line by line">
  <title>ascii avatar</title>
  <style>
    text {{ font-family: {MONO}; font-size: {CHAR_W / 0.6:.2f}px; fill: {t["ink"]}; white-space: pre; }}
    .bar {{ font-size: 11px; fill: {t["muted"]}; }}
    .cur {{ fill: {t["ink"]}; }}
    {levels}
  </style>
  <defs>
  {nl.join(clips)}
  </defs>
  <rect x="0.5" y="0.5" width="{W - 1}" height="{H - 1}" rx="10" fill="{t["bg"]}" stroke="{t["rule"]}"/>
  <line x1="1" y1="34" x2="{W - 1}" y2="34" stroke="{t["rule"]}"/>
  <circle cx="20" cy="17.5" r="4.5" fill="{t["rule"]}"/><circle cx="36" cy="17.5" r="4.5" fill="{t["rule"]}"/><circle cx="52" cy="17.5" r="4.5" fill="{t["rule"]}"/>
  <text class="bar" x="{W / 2}" y="21.5" text-anchor="middle">~ $ ascii avatar.png</text>
  {nl.join(rows)}
</svg>
"""


for name, theme in THEMES.items():
    out = ROOT / "assets" / f"ascii-{name}.svg"
    out.write_text(render(theme), encoding="utf-8")
    print(f"{out.name}  {COLS}x{ROWS}")
