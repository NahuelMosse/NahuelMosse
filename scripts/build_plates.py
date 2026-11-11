"""Builds the README's static plates in the portfolio's fonts: the at-a-glance tiles, the chapter headers, the career
timeline and the working-hours overlap card. Words in Boska and General Sans are drawn as outlines (their license does not
allow committing the font files); Courier Prime is embedded from fonts/. Runs locally with the portfolio checkout next to
this repo:

    python scripts/build_plates.py --portfolio ../Portfolio-d
"""
import argparse
import base64
import json
import math
import sys
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_art import BONE, INK, RED, Face, esc  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "static"
DIM = "#8a8273"
LINE = "#2a2824"
PANEL = "#141311"
CP = base64.b64encode((ROOT / "fonts" / "courier-prime-subset.woff2").read_bytes()).decode()
STYLE = f"""@font-face{{font-family:CP;src:url(data:font/woff2;base64,{CP}) format("woff2")}}text{{font-family:CP,"Courier New",monospace}}
@keyframes in{{from{{opacity:0}}to{{opacity:1}}}}.f{{animation:in .8s ease-out both}}
@keyframes up{{from{{opacity:0;transform:translateY(10px)}}to{{opacity:1;transform:none}}}}.u{{animation:up .8s cubic-bezier(.16,1,.3,1) both}}
@keyframes grow{{from{{transform:scaleX(0)}}to{{transform:scaleX(1)}}}}.g{{transform-box:fill-box;transform-origin:left;animation:grow 1.1s cubic-bezier(.16,1,.3,1) both}}
@keyframes draw{{to{{stroke-dashoffset:0}}}}.d{{stroke-dasharray:1;stroke-dashoffset:1;animation:draw 2.4s cubic-bezier(.65,0,.35,1) both}}
@keyframes ink{{from{{fill-opacity:0}}to{{fill-opacity:1}}}}
@media (prefers-reduced-motion:reduce){{*{{animation:none!important}}.d{{stroke-dashoffset:0}}}}"""


def svg(name, w, h, label, body, border=False):
    frame = f'<rect x=".5" y=".5" width="{w - 1}" height="{h - 1}" fill="none" stroke="{LINE}"/>' if border else ""
    (OUT / name).write_text(f"""<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="{esc(label)}">
<title>{esc(label)}</title><style>{STYLE}</style><rect width="{w}" height="{h}" fill="{INK}"/>{frame}
{body}</svg>
""", encoding="utf8", newline="\n")


def label(x, y, text, fill=DIM, size=12, spacing=2.4, anchor="start", extra=""):
    return f'<text x="{x}" y="{y}" fill="{fill}" font-size="{size}" letter-spacing="{spacing}" text-anchor="{anchor}"{extra}>{esc(text)}</text>'


def thread(x0, x1, y, amp=6, cls="d", delay=0.0, width=2):
    pts, n = [], 24
    for i in range(n + 1):
        t = i / n
        pts.append(f"{x0 + (x1 - x0) * t:.1f} {y + amp * math.sin(t * 6.283 * 1.5):.1f}")
    return (f'<path d="M{" L".join(pts)}" pathLength="1" fill="none" stroke="{RED}" stroke-width="{width}" stroke-linecap="round" '
            f'class="{cls}" style="animation-delay:{delay}s"/>')


def timeline(f, d):
    d_ = f["display"]
    nodes = [
        ("11/2022", "Jüsto", "Senior Full Stack", "work"),
        ("06/2023", "Frávega", "Senior Full Stack", "work"),
        ("2025", "Associate Degree", "Analista en Informática · UM", "study"),
        ("01/2026", "Visma", "Technical Lead", "work"),
        ("08/2026", "Grupo ST", "Technical Lead", "work"),
        ("09/2026", "Smart W.", "AI Enablement Lead", "work"),
        ("NOW · 4TH YEAR", "Computer Eng.", "Ingeniería en Informática", "study"),
    ]
    W, H, x0, x1, y = 1100, 320, 120, 980, 170
    step = (x1 - x0) / (len(nodes) - 1)
    body = label(70, 44, "KOVIX CONSULTING · TECHNICAL LEAD · CLIENT ENGAGEMENTS AND STUDIES", BONE, 13, 3)
    body += f'<rect x="70" y="58" width="60" height="3" fill="{RED}" class="g"/>'
    body += f'<line x1="{x0}" y1="{y}" x2="{x1}" y2="{y}" stroke="{RED}" stroke-width="3" pathLength="1" class="d"/>'
    for i, (when, name, role, kind) in enumerate(nodes):
        cx = x0 + i * step
        delay = 0.5 + i * 0.25
        up = i % 2 == 0
        color = RED if kind == "work" else BONE
        dot = (f'<circle cx="{cx:.1f}" cy="{y}" r="11" fill="{INK}" stroke="{color}" stroke-width="3"/>'
               f'<circle cx="{cx:.1f}" cy="{y}" r="4" fill="{color}"/>')
        ty = y - 40 if up else y + 60
        txt = (label(cx, ty - 34 if up else ty - 4, when, color, 12, 2, "middle")
               + d_.path(name, 26, cx, ty if up else ty + 28, BONE, anchor="middle")
               + label(cx, (ty + 22) if up else (ty + 50), role, DIM, 11, 1, "middle"))
        stem = f'<line x1="{cx:.1f}" y1="{y + (-12 if up else 12)}" x2="{cx:.1f}" y2="{y + (-24 if up else 24)}" stroke="{LINE}"/>'
        body += f'<g class="u" style="animation-delay:{delay:.2f}s">{stem}{dot}{txt}</g>'
    body += (f'<g class="f" style="animation-delay:2.4s"><circle cx="760" cy="{H - 26}" r="5" fill="{RED}"/>{label(772, H - 22, "ENGAGEMENT", DIM, 11)}'
             f'<circle cx="900" cy="{H - 26}" r="5" fill="{BONE}"/>{label(912, H - 22, "STUDIES", DIM, 11)}</g>')
    svg("career-timeline.svg", W, H, "Career timeline: " + "; ".join(f"{a} {b} {c}" for a, b, c, _ in nodes), body)


def glance(f):
    d = f["display"]
    tiles = [("NOW", "Tech Lead", "Kovix Consulting"), ("NEXT", "TPM", "Technical Project Manager"), ("SINCE", "4+ yrs", "11/2022 · 5 clients"),
             ("ENGLISH", "C2", "EF SET Proficient"), ("BASE", "UTC–3", "Buenos Aires, AR")]
    W, H, tw = 1100, 190, 202
    body = ""
    for i, (k, v, sub) in enumerate(tiles):
        x = 20 + i * (tw + 12)
        body += (f'<g class="u" style="animation-delay:{i * 0.12:.2f}s"><rect x="{x}" y="20" width="{tw}" height="150" fill="{PANEL}" stroke="{LINE}"/>'
                 f'<rect x="{x}" y="20" width="{tw}" height="4" fill="{RED if i % 2 == 0 else BONE}"/>'
                 + label(x + 18, 54, k, RED if i % 2 == 0 else DIM, 12, 3) + d.path(v, 38, x + 16, 112, BONE)
                 + label(x + 18, 146, sub, DIM, 11, 0.5) + "</g>")
    svg("glance.svg", W, H, "At a glance: " + "; ".join(f"{k} {v}, {s}" for k, v, s in tiles), body)


def header(f, n, word, detail):
    d = f["display"]
    W, H = 1100, 150
    w = d.width(word, 84)
    body = (label(24, 40, f"{n:02d}  ──  {detail}  ✦", RED, 16, 3)
            + f'<g class="u">{d.path(word, 84, 20, 124, BONE)}</g>'
            + thread(40 + w, W - 30, 100, amp=5, delay=0.4))
    svg(f"header-{word.lower()}.svg", W, H, f"{n:02d} {word}. {detail}", body)


def timezone(f):
    W, H, x0, x1 = 1100, 300, 240, 960
    hx = lambda h: x0 + (x1 - x0) * h / 24  # noqa: E731
    cities = [("Buenos Aires", "UTC−3", 9, 18, True), ("San Francisco", "UTC−8", 14, 23, False), ("New York", "UTC−5", 11, 20, False),
              ("London", "UTC+0", 6, 15, False), ("Madrid · Berlin", "UTC+1", 5, 14, False)]
    body = label(20, 34, "WORKING HOURS OVERLAP · IN BUENOS AIRES TIME · STANDARD TIME", BONE, 13, 3)
    for h in range(0, 25, 3):
        body += f'<line x1="{hx(h):.1f}" y1="56" x2="{hx(h):.1f}" y2="{H - 30}" stroke="{LINE}"/>' + label(hx(h), H - 12, f"{h:02d}", DIM, 11, 0, "middle")
    for i, (city, tz, a, b, home) in enumerate(cities):
        y = 70 + i * 40
        ov = max(0, min(b, 18) - max(a, 9))
        body += (f'<g class="u" style="animation-delay:{i * 0.12:.2f}s">' + label(20, y + 18, city, BONE if home else DIM, 14, 0.5) + label(180, y + 18, tz, DIM, 11, 1)
                 + f'<rect x="{hx(a):.1f}" y="{y}" width="{hx(b) - hx(a):.1f}" height="24" fill="{RED if home else "#3a3732"}" class="g" style="animation-delay:{0.2 + i * 0.12:.2f}s"/>'
                 + ("" if home else f'<rect x="{hx(max(a, 9)):.1f}" y="{y}" width="{max(0, hx(min(b, 18)) - hx(max(a, 9))):.1f}" height="24" fill="none" stroke="{RED}" stroke-width="2"/>'
                    + label(hx(b) + 10, y + 17, f"{ov} h overlap", BONE, 12, 0.5))
                 + "</g>")
    svg("timezone.svg", W, H, "Working hours overlap with Buenos Aires: " + ", ".join(f"{c} {max(0, min(b, 18) - max(a, 9))} h" for c, _, a, b, h in cities if not h), body)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--portfolio", type=Path, default=ROOT.parent / "Portfolio-d")
    portfolio = ap.parse_args().portfolio
    fonts = portfolio / "public" / "fonts"
    f = {"display": Face(fonts / "boska-700.woff2"), "text": Face(fonts / "general-sans-500.woff2")}
    OUT.mkdir(parents=True, exist_ok=True)
    data = json.loads((ROOT / "data" / "portfolio.json").read_text(encoding="utf8"))
    glance(f)
    timeline(f, data)
    timezone(f)
    for n, word, detail in [(1, "PROJECTS", "WHAT I BUILD"), (2, "RECORD", "KOVIX CONSULTING"), (3, "STACK", "WHAT I BUILD WITH"), (4, "ACTIVITY", "LIVE FROM GITHUB")]:
        header(f, n, word, detail)
    print("built:", ", ".join(sorted(p.name for p in OUT.iterdir() if p.suffix == ".svg")))


if __name__ == "__main__":
    main()
