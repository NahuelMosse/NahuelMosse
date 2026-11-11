"""Builds the README's static plates, each once per GitHub theme (<name>.dark.svg, <name>.light.svg) on a transparent
ground: the chapter headers, with the word in Boska drawn as outlines (its license does not allow committing the font
file), and the link chips under the banner. Courier Prime is embedded from fonts/. Runs locally with the portfolio
checkout next to this repo:

    python scripts/build_plates.py --portfolio ../Portfolio-d
"""
import argparse
import base64
import json
import math
import sys
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_art import THEMES, Face, esc  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "static"
CP = base64.b64encode((ROOT / "fonts" / "courier-prime-subset.woff2").read_bytes()).decode()
STYLE = f"""@font-face{{font-family:CP;src:url(data:font/woff2;base64,{CP}) format("woff2")}}text{{font-family:CP,"Courier New",monospace}}
@keyframes up{{from{{opacity:0;transform:translateY(10px)}}to{{opacity:1;transform:none}}}}.u{{animation:up .8s cubic-bezier(.16,1,.3,1) both}}
@keyframes draw{{to{{stroke-dashoffset:0}}}}.d{{stroke-dasharray:1;stroke-dashoffset:1;animation:draw 2.4s cubic-bezier(.65,0,.35,1) both}}
@media (prefers-reduced-motion:reduce){{*{{animation:none!important}}.d{{stroke-dashoffset:0}}}}"""

CHAPTERS = [(1, "PROJECTS", "WHAT I BUILD"), (2, "NPM", "THE DEV-KIT TOOLS"), (3, "CONTRIBUTIONS", "LIVE FROM GITHUB")]


def write(name, w, h, label, draw):
    for theme, T in THEMES.items():
        (OUT / f"{name}.{theme}.svg").write_text(
            f"""<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="{esc(label)}">
<title>{esc(label)}</title><style>{STYLE}</style>
{draw(T)}</svg>
""", encoding="utf8", newline="\n")


def thread(T, x0, x1, y, amp=5, delay=0.4):
    pts = [f"{x0 + (x1 - x0) * i / 24:.1f} {y + amp * math.sin(i / 24 * 6.283 * 1.5):.1f}" for i in range(25)]
    return (f'<path d="M{" L".join(pts)}" pathLength="1" fill="none" stroke="{T["red"]}" stroke-width="2" stroke-linecap="round" '
            f'class="d" style="animation-delay:{delay}s"/>')


COL, PAD, GUT = 1012, 24, 24


def slot(n, k):
    """Image width, content width and content offset of the k-th of n images of a row with no gap between them
    (n = 4: 24.9 % each), so the row's outer edges meet the full-width plates at PAD and COL - PAD."""
    w = round(COL * 0.249)
    cw = (COL - 2 * PAD - (n - 1) * GUT) / n
    return w, cw, round(PAD + k * (cw + GUT) - ((COL - n * w) / 2 + k * w), 1)


def header(display, n, word, detail):
    W, H = COL, 138
    size = 77
    w = display.width(word, size)
    write(f"header-{word.lower()}", W, H, f"{n:02d} {word}. {detail}", lambda T: (
        f'<text x="{PAD}" y="34" fill="{T["red"]}" font-size="11" letter-spacing="2">{esc(f"{n:02d}  ──  {detail}  ✦")}</text>'
        f'<g class="u">{display.path(word, size, PAD - 2, 114, T["fg"])}</g>' + thread(T, PAD + w + 16, W - PAD, 92)))


def chip(name, k, key, value):
    """A link chip, the k-th of four: the channel in red small caps, its address in the theme's type, a red rule under both."""
    W, cw, x = slot(4, k)
    write(f"link-{name}", W, 48, f"{key}: {value}", lambda T: (
        f'<g transform="translate({x} 0)">'
        f'<text x="0" y="16" fill="{T["red"]}" font-size="11" letter-spacing="2">{esc(key.upper())}</text>'
        f'<text x="0" y="38" fill="{T["fg"]}" font-size="14">{esc(value)}</text>'
        f'<rect x="0" y="45" width="{cw}" height="2" fill="{T["red"]}" opacity=".5"/></g>'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--portfolio", type=Path, default=ROOT.parent / "Portfolio-d")
    fonts = ap.parse_args().portfolio / "public" / "fonts"
    display = Face(fonts / "boska-700.woff2")
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.svg"):
        if not old.name.startswith("banner."):
            old.unlink()
    for n, word, detail in CHAPTERS:
        header(display, n, word, detail)
    i = json.loads((ROOT / "data" / "portfolio.json").read_text(encoding="utf8"))["identity"]
    site = json.loads((ROOT / "data" / "portfolio.json").read_text(encoding="utf8"))["site"]["url"]
    chip("portfolio", 0, "Portfolio", site.split("//")[-1].rstrip("/"))
    chip("linkedin", 1, "LinkedIn", "in/" + i["linkedin"].rstrip("/").split("/")[-1])
    cv = json.loads((ROOT / "data" / "cv.json").read_text(encoding="utf8"))
    chip("email", 2, "Email", cv.get("email") or i["email"])
    print("built:", ", ".join(sorted(p.name for p in OUT.glob("*.svg"))))


if __name__ == "__main__":
    main()
