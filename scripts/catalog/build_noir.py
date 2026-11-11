"""Builds the catalog's static noir art in the portfolio's fonts: the signature, career timeline, impact numbers, at-a-glance
tiles, education cards, recommendation cards, section headers, red-thread divider, footer, time-zone overlap card and the
animated device mockups of each project. Words in Boska and General Sans are drawn as outlines (their license does not allow
committing the font files); Courier Prime is embedded from fonts/. Runs locally with the portfolio checkout next to this repo:

    python scripts/catalog/build_noir.py --portfolio ../Portfolio-d
"""
import argparse
import base64
import io
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from build_art import BONE, INK, RED, Face, esc, fit, uri  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "assets" / "catalog" / "local"
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
""", encoding="utf8")


def label(x, y, text, fill=DIM, size=12, spacing=2.4, anchor="start", extra=""):
    return f'<text x="{x}" y="{y}" fill="{fill}" font-size="{size}" letter-spacing="{spacing}" text-anchor="{anchor}"{extra}>{esc(text)}</text>'


def thread(x0, x1, y, amp=6, cls="d", delay=0.0, width=2):
    pts, n = [], 24
    for i in range(n + 1):
        t = i / n
        pts.append(f"{x0 + (x1 - x0) * t:.1f} {y + amp * math.sin(t * 6.283 * 1.5):.1f}")
    return (f'<path d="M{" L".join(pts)}" pathLength="1" fill="none" stroke="{RED}" stroke-width="{width}" stroke-linecap="round" '
            f'class="{cls}" style="animation-delay:{delay}s"/>')


def signature(f):
    d = f["display"]
    word = d.path("Nawi", 150, 40, 170, "none")
    path = word.replace('fill="none"', f'fill="{BONE}" fill-opacity="0" stroke="{BONE}" stroke-width="1.6" pathLength="1" class="d" '
                                         'style="animation:draw 2.6s cubic-bezier(.65,0,.35,1) both,ink 1s ease-out 2.2s both"')
    body = path + thread(44, 400, 200, amp=4, delay=1.6, width=3) + f'<circle cx="400" cy="200" r="5" fill="{RED}" class="f" style="animation-delay:3.4s"/>'
    svg("signature.svg", 460, 240, "Nawi, signed", body)


def timeline(f, d):
    d_ = f["display"]
    nodes = [
        ("11/2022", "Jüsto", "Senior Full Stack", "work"),
        ("06/2023", "Frávega", "Senior Full Stack", "work"),
        ("2025", "Analista", "en Informática · UM", "study"),
        ("01/2026", "Visma", "Technical Lead", "work"),
        ("08/2026", "Grupo ST", "Technical Lead", "work"),
        ("09/2026", "Smart W.", "AI Enablement Lead", "work"),
        ("NOW", "Ingeniería", "4th year · UM", "study"),
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


def impact(f):
    d = f["display"]
    tiles = [("1 wk", "VISMA", "Onboarding stage: 2 months → 1 week", "Azure OpenAI integration"),
             ("–90%", "FRÁVEGA", "Average receiving time", "7 h 48 min → 46 min"),
             ("40k", "FRÁVEGA", "Requests a day, sellers BFF", "Processes simplified by 80%"),
             ("40M", "JÜSTO", "Operations over 10+ releases", "50% less preparation time")]
    W, H, tw = 1100, 300, 250
    body = label(20, 40, "IMPACT · NUMBERS FROM THE CV", BONE, 14, 3)
    for i, (big, where, l1, l2) in enumerate(tiles):
        x = 20 + i * (tw + 16)
        body += (f'<g class="u" style="animation-delay:{0.15 + i * 0.18:.2f}s"><rect x="{x}" y="64" width="{tw}" height="210" fill="{PANEL}" stroke="{LINE}"/>'
                 + label(x + 22, 96, where, RED, 12, 3)
                 + d.path(big, 76, x + 20, 186, BONE)
                 + f'<rect x="{x + 22}" y="204" width="{tw - 44}" height="3" fill="{RED}" class="g" style="animation-delay:{0.6 + i * 0.18:.2f}s"/>'
                 + label(x + 22, 234, l1, BONE, 12, 0.2) + label(x + 22, 254, l2, DIM, 12, 0.2) + "</g>")
    svg("impact.svg", W, H, "Impact: " + "; ".join(f"{a} {b}: {c} {e}" for a, b, c, e in tiles), body)


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


def education(f, portfolio):
    d = f["display"]
    logos = {"um": portfolio / "public" / "logo-UM.webp", "liceo": portfolio / "public" / "logo-liceo-cultural-britanico.webp"}
    cards = [("um", "Analista en Informática", "Universidad de Morón", "2025 · GRADUATED"),
             ("um", "Ingeniería en Informática", "Universidad de Morón", "4TH YEAR · IN PROGRESS"),
             (None, "EF SET C2", "English, Proficient", "CERTIFICATE"),
             ("liceo", "English Level 8", "Liceo Cultural Británico", "CERTIFICATE"),
             (None, "Software Architecture", "Applied · Platzi", "COURSE")]
    W, H, tw = 1100, 250, 202
    body = label(20, 34, "STUDIES AND CERTIFICATIONS", BONE, 13, 3)
    for i, (logo, title, org, tag) in enumerate(cards):
        x = 20 + i * (tw + 12)
        mark = ""
        if logo and logos[logo].exists():
            im = fit(Image.open(logos[logo]).convert("RGBA"), 96)
            mark = f'<image href="{uri(im, 82)}" x="{x + 18}" y="64" width="44" height="{44 * im.height / im.width:.1f}"/>'
        else:
            mark = f'<rect x="{x + 18}" y="64" width="44" height="44" fill="none" stroke="{RED}" stroke-width="2"/>' + label(x + 40, 92, title.split()[-1][:3].upper(), RED, 12, 1, "middle")
        lines = f["text"].wrap(title, 19, tw - 36)
        tl = "".join(f["text"].path(t, 19, x + 18, 140 + j * 24, BONE) for j, t in enumerate(lines[:2]))
        body += (f'<g class="u" style="animation-delay:{i * 0.12:.2f}s"><rect x="{x}" y="48" width="{tw}" height="184" fill="{PANEL}" stroke="{LINE}"/>{mark}'
                 + tl + label(x + 18, 196, org, DIM, 11, 0.5) + label(x + 18, 218, tag, RED if "PROGRESS" in tag else DIM, 10, 2) + "</g>")
    svg("education.svg", W, H, "Studies and certifications: " + "; ".join(f"{t}, {o}, {g}" for _, t, o, g in cards), body)


def recommendations(f):
    t = f["text"]
    recs = [("Braian Lo Surdo", "Técnico en Programación Informática",
             "Highlights speed, efficiency, a collaborative spirit, enthusiasm and warmth in teamwork."),
            ("Enzo Codini", "Full Stack Developer",
             "Highlights the technical and human contribution in complex projects, the willingness and quality of the work; calls Nahuel a reference for the team.")]
    W, H = 1100, 270
    body = label(20, 34, "RECOMMENDED ON LINKEDIN · SUMMARIES FROM THE CV", BONE, 13, 3)
    for i, (name, role, text) in enumerate(recs):
        x = 20 + i * 540
        lines = t.wrap(text, 18, 470)
        body += (f'<g class="u" style="animation-delay:{i * 0.2:.1f}s"><rect x="{x}" y="50" width="520" height="200" fill="{PANEL}" stroke="{LINE}"/>'
                 + f["display"].path("“", 80, x + 22, 128, RED)
                 + "".join(t.path(l, 18, x + 70, 96 + j * 26, BONE) for j, l in enumerate(lines[:4]))
                 + f'<rect x="{x + 70}" y="{196}" width="40" height="2" fill="{RED}"/>'
                 + label(x + 70, 222, name.upper(), BONE, 12, 2.4) + label(x + 70, 240, role, DIM, 11, 0.5) + "</g>")
    svg("recommendations.svg", W, H, "LinkedIn recommendations: " + "; ".join(f"{n}, {r}: {x}" for n, r, x in recs), body)


def header(f, n, word, detail):
    d = f["display"]
    W, H = 1100, 150
    w = d.width(word, 84)
    body = (label(24, 40, f"{n:02d}  ──  {detail}  ✦", RED, 16, 3)
            + f'<g class="u">{d.path(word, 84, 20, 124, BONE)}</g>'
            + thread(40 + w, W - 30, 100, amp=5, delay=0.4))
    svg(f"header-{word.lower()}.svg", W, H, f"{n:02d} {word}. {detail}", body)


def divider():
    W, H = 1100, 60
    body = thread(30, 520, 30, amp=6) + f'<circle cx="550" cy="30" r="7" fill="none" stroke="{RED}" stroke-width="2.5" class="f" style="animation-delay:1.2s"/>' + thread(580, 1070, 30, amp=6, delay=0.6)
    svg("divider.svg", W, H, "", body)


def footer(f):
    d = f["display"]
    W, H = 1100, 200
    word = d.path("Nawi", 64, 470, 110, "none").replace('fill="none"', f'fill="{BONE}" fill-opacity="0" stroke="{BONE}" stroke-width="1" pathLength="1" class="d" '
                                                     'style="animation:draw 2.4s cubic-bezier(.65,0,.35,1) .6s both,ink 1s ease-out 2.6s both"')
    body = (thread(30, 440, 90, amp=5) + word + thread(640, 1070, 90, amp=5, delay=0.4)
            + label(550, 156, "NAWI.DEV  ·  BUENOS AIRES  ·  UTC−3  ·  NAHUELGAMAIL@GMAIL.COM", DIM, 12, 3, "middle", ' class="f" style="animation-delay:2.8s"'))
    svg("footer.svg", W, H, "Nawi. nawi.dev, Buenos Aires", body)


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


TAB_FONT = None


def device_frames(portfolio):
    """Animated WebP of each project's real screens in a bone device frame with a red tab, crossfading."""
    global TAB_FONT
    from fontTools.ttLib import TTFont
    from PIL import ImageFont
    tt = TTFont(portfolio / "public" / "fonts" / "courier-prime-400.woff2")
    tt.flavor = None
    raw = io.BytesIO()
    tt.save(raw)
    raw.seek(0)
    TAB_FONT = ImageFont.truetype(raw, 20)
    pieces = portfolio / "public" / "film" / "pieces"
    sets = {
        "grit": ("phone", ["grit-hoy", "grit-serie", "grit-descanso", "grit-completado"]),
        "club": ("phone", ["club-login", "club-sedes", "club-horarios", "club-listo"]),
        "triaje": ("browser", ["triaje-title", "triaje-page", "triaje-play-2"]),
        "kit": ("browser", ["kit-skill-motion-audit", "kit-skill-http-attack", "kit-skill-migrations-safe"]),
        "cebador": ("browser", ["cebador-1280-poster", "cebador-s2-1280", "cebador-s3-1280"]),
    }
    ink, bone, red = (12, 12, 11), (237, 228, 208), (210, 35, 27)
    for key, (kind, names) in sets.items():
        if kind == "phone":
            W, H, sx, sy, sw, sh, pad = 360, 680, 30, 70, 300, 580, 12
        else:
            W, H, sx, sy, sw, sh, pad = 720, 470, 24, 70, 672, 378, 10
        base = Image.new("RGB", (W, H), ink)
        dr = ImageDraw.Draw(base)
        dr.rounded_rectangle((sx - pad, sy - pad - (22 if kind == "browser" else 0), sx + sw + pad, sy + sh + pad), radius=28 if kind == "phone" else 6, fill=bone)
        if kind == "browser":
            for j in range(3):
                dr.ellipse((sx + 4 + j * 16, sy - 26, sx + 14 + j * 16, sy - 16), fill=(58, 55, 50))
        dr.rectangle((sx - pad, 14, sx - pad + 150, 46), fill=red)
        dr.text((sx - pad + 14, 19), key.upper(), fill=bone, font=TAB_FONT)
        shots = []
        for n in names:
            p = pieces / f"{n}.webp"
            if not p.exists():
                continue
            im = Image.open(p).convert("RGB")
            k = max(sw / im.width, sh / im.height)
            im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS).crop((0, 0, sw, sh))
            shots.append(im)
        if not shots:
            continue
        frames, durations = [], []
        for i, s in enumerate(shots):
            nxt = shots[(i + 1) % len(shots)]
            hold = base.copy(); hold.paste(s, (sx, sy)); frames.append(hold); durations.append(1800)
            for t in (0.25, 0.5, 0.75):
                fr = base.copy(); fr.paste(Image.blend(s, nxt, t), (sx, sy)); frames.append(fr); durations.append(90)
        frames[0].save(OUT / f"mockup-{key}.webp", save_all=True, append_images=frames[1:], duration=durations, loop=0, quality=72, method=6)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--portfolio", type=Path, default=ROOT.parent / "Portfolio-d")
    portfolio = ap.parse_args().portfolio
    fonts = portfolio / "public" / "fonts"
    f = {"display": Face(fonts / "boska-700.woff2"), "text": Face(fonts / "general-sans-500.woff2")}
    OUT.mkdir(parents=True, exist_ok=True)
    data = json.loads((ROOT / "data" / "portfolio.json").read_text(encoding="utf8"))
    signature(f)
    timeline(f, data)
    impact(f)
    glance(f)
    education(f, portfolio)
    recommendations(f)
    for n, word, detail in [(1, "PROJECTS", "5 CASE FILES"), (2, "RECORD", "KOVIX CONSULTING"), (3, "STACK", "WHAT I BUILD WITH"), (4, "ACTIVITY", "LIVE FROM GITHUB")]:
        header(f, n, word, detail)
    divider()
    footer(f)
    timezone(f)
    device_frames(portfolio)
    print("built:", ", ".join(sorted(p.name for p in OUT.iterdir())))


if __name__ == "__main__":
    main()
