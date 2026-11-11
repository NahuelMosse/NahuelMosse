<!-- Catalog of profile README elements. Every entry below is a candidate; pick the ones that stay. -->

# Profile README catalog

Graphic candidates for the profile, rendered with real data in the portfolio palette (ink `#0c0c0b`, bone `#ede4d0`, red `#d2231b`) and its fonts (Boska, General Sans, Courier Prime). Each entry gives its source, whether it is self-hosted or external, the setup it needs and how often it updates.

*Self-hosted:* the file lives in this repo, so no outside service can break it. *External:* someone else's server serves it on every view. *Live:* the `Catalog widgets` workflow redraws it daily with the Actions `GITHUB_TOKEN`. *Static:* rebuilt by hand with `scripts/catalog/build_noir.py` or `build_local.mjs`.

---

## Identity

### 01 · Typing terminal hero
Self-made SVG (`build_local.mjs`) · self-hosted · setup: none · static

<img src="assets/catalog/local/hero-typing.svg" alt="Animated terminal typing Nahuel's roles" width="100%">

### 02 · Animated signature
Self-made SVG, Boska outlines drawn stroke by stroke, then inked (`build_noir.py`) · self-hosted · setup: none · static

<img src="assets/catalog/local/signature.svg" alt="Nawi, signed" width="420">

### 03 · Poster banner
The PR #1 banner: cover illustration, NAWI and the promise line (`scripts/build_art.py`) · self-hosted · setup: none · static

<img src="assets/banner.svg" alt="NAWI poster banner" width="100%">

### 04 · readme-kit hero card
[Sagargupta16/readme-kit-action](https://github.com/Sagargupta16/readme-kit-action) · self-hosted · setup: `GITHUB_TOKEN` · regenerated when `catalog/profile.yml` changes · only the accent is themable

<img src="assets/catalog/kit/hero.svg" alt="readme-kit hero card" width="100%">

### 05 · Capsule-render header wave
[kyechan99/capsule-render](https://github.com/kyechan99/capsule-render) · external (vercel.app) · setup: none · live

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0c0c0b,100:d2231b&height=170&section=header&text=NAWI&fontColor=ede4d0&fontSize=64&fontAlign=50&fontAlignY=38&desc=Technical%20Lead%20%C2%B7%20Kovix%20Consulting&descAlign=50&descAlignY=60&animation=fadeIn" alt="Capsule header" width="100%">

### 06 · At a glance, as tiles
Self-made SVG (`build_noir.py`) · self-hosted · setup: none · static

<img src="assets/catalog/local/glance.svg" alt="At a glance: Tech Lead at Kovix, next TPM, 4+ years, English C2, UTC−3 Buenos Aires" width="100%">

---

## Links and contact

### 07 · Noir badges
[shields.io](https://shields.io) · external · setup: none · live

<p>
<a href="https://nawi.dev"><img src="https://img.shields.io/badge/portfolio-nawi.dev-d2231b?style=for-the-badge&labelColor=0c0c0b" alt="Portfolio"></a>
<a href="https://linkedin.com/in/nahuelmosse"><img src="https://img.shields.io/badge/linkedin-nahuelmosse-ede4d0?style=for-the-badge&logo=linkedin&logoColor=ede4d0&labelColor=0c0c0b&color=3a3732" alt="LinkedIn"></a>
<a href="mailto:nahuelgamail@gmail.com"><img src="https://img.shields.io/badge/email-write%20me-ede4d0?style=for-the-badge&logo=gmail&logoColor=ede4d0&labelColor=0c0c0b&color=3a3732" alt="Email"></a>
</p>

### 08 · readme-kit buttons
readme-kit-action · self-hosted · setup: `GITHUB_TOKEN`

<a href="https://nawi.dev"><img src="assets/catalog/kit/button-portfolio.svg" alt="Portfolio" height="44"></a>
<a href="https://linkedin.com/in/nahuelmosse"><img src="assets/catalog/kit/button-linkedin.svg" alt="LinkedIn" height="44"></a>
<a href="mailto:nahuelgamail@gmail.com"><img src="assets/catalog/kit/button-email.svg" alt="Email" height="44"></a>

### 09 · Contact form button
Native issue form (`.github/ISSUE_TEMPLATE/say-hi.yml`) behind a noir badge · setup: none · the form works once merged to `master`

<a href="https://github.com/NahuelMosse/NahuelMosse/issues/new?template=say-hi.yml"><img src="https://img.shields.io/badge/recruiters-leave%20a%20note-d2231b?style=for-the-badge&labelColor=0c0c0b" alt="Leave a note"></a>

---

## Section design

### 10 · Chapter headers
Self-made SVG, the portfolio's chapter style: red numeral line, Boska word, red thread (`build_noir.py`) · self-hosted · setup: none · static

<img src="assets/catalog/local/header-projects.svg" alt="01 Projects" width="100%">
<img src="assets/catalog/local/header-record.svg" alt="02 Record" width="100%">
<img src="assets/catalog/local/header-stack.svg" alt="03 Stack" width="100%">
<img src="assets/catalog/local/header-activity.svg" alt="04 Activity" width="100%">

### 11 · Red-thread divider
Self-made SVG, animated thread with a knot (`build_noir.py`) · self-hosted · setup: none · static

<img src="assets/catalog/local/divider.svg" alt="" width="100%">

---

## Contributions

### 12 · Contribution snake (noir)
[Platane/snk](https://github.com/Platane/snk) · self-hosted · setup: `GITHUB_TOKEN` · live

<img src="assets/catalog/gen/snake-noir.svg" alt="Snake eating the contribution graph" width="100%">

### 13 · 3D contribution skyline (noir)
[yoshi389111/github-profile-3d-contrib](https://github.com/yoshi389111/github-profile-3d-contrib) with `catalog/3d-noir.json` · self-hosted · setup: `GITHUB_TOKEN` · live

<img src="assets/catalog/gen/3d/profile-3d-noir.svg" alt="3D isometric contribution skyline" width="100%">

### 14 · Contribution heatmap in red
Self-made (`stats.mjs`), log-scaled red cells that fade in week by week · self-hosted · setup: `GITHUB_TOKEN` · live

<img src="assets/catalog/gen/heatmap.svg" alt="Contribution heatmap" width="100%">

### 15 · Weekly activity
Self-made (`stats.mjs`), 52-week area chart with the line drawn in and the peak marked · self-hosted · setup: `GITHUB_TOKEN` · live

<img src="assets/catalog/gen/weekly.svg" alt="Weekly contributions" width="100%">

### 16 · Commit clock
Self-made (`stats.mjs`), commits by hour in Buenos Aires time across public repos · self-hosted · setup: `GITHUB_TOKEN` · live

<img src="assets/catalog/gen/commit-clock.svg" alt="Commit clock" width="460">

---

## Stats

### 17 · Stats card
Self-made (`stats.mjs`) · self-hosted · setup: `GITHUB_TOKEN` · live

### 18 · Streak with flame
Self-made (`stats.mjs`) · self-hosted · setup: `GITHUB_TOKEN` · live

<table><tr>
<td><img src="assets/catalog/gen/stats.svg" alt="GitHub stats" width="400"><br><sub>17</sub></td>
<td><img src="assets/catalog/gen/streak.svg" alt="Contribution streak" width="400"><br><sub>18</sub></td>
</tr></table>

### 19 · Top languages, bar
Self-made (`stats.mjs`) · self-hosted · setup: `GITHUB_TOKEN` · live

### 20 · Language donut
Self-made (`stats.mjs`) · self-hosted · setup: `GITHUB_TOKEN` · live

<table><tr>
<td><img src="assets/catalog/gen/languages.svg" alt="Top languages" width="400"><br><sub>19</sub></td>
<td><img src="assets/catalog/gen/donut.svg" alt="Language donut" width="400"><br><sub>20</sub></td>
</tr></table>

### 21 · Language pie (native Mermaid)
Native Mermaid with live data from `stats.mjs` · setup: `GITHUB_TOKEN` · live

<!-- live:langs-pie -->
```mermaid
%%{init: {"theme":"base","themeVariables":{"pie1":"#d2231b","pie2":"#ede4d0","pie3":"#b8ad97","pie4":"#8a8273","pie5":"#5c564b","pie6":"#3a3732","pieStrokeColor":"#0c0c0b","pieOuterStrokeColor":"#0c0c0b","pieTitleTextColor":"#8a8273","pieSectionTextColor":"#0c0c0b","pieLegendTextColor":"#8a8273"}}}%%
pie showData title Bytes of code by language, public repos
  "JavaScript" : 37.4
  "Dart" : 19.5
  "TypeScript" : 12.9
  "HTML" : 10.9
  "Python" : 10.9
  "CSS" : 5.0
```
<!-- /live:langs-pie -->

### 22 · Contribution radar
Self-made (`stats.mjs`), commits, PRs, reviews, issues and new repos on a log scale · self-hosted · setup: `GITHUB_TOKEN` · live

<img src="assets/catalog/gen/radar.svg" alt="Contribution radar" width="460">

### 23 · Milestone badges
Self-made (`stats.mjs`), live counts in hexagon badges. GitHub's own achievements have no API, so these use real figures instead · self-hosted · setup: `GITHUB_TOKEN` · live

<img src="assets/catalog/gen/milestones.svg" alt="Milestones" width="100%">

---

## Stack

### 24 · Stack icons
Self-made SVG from [Simple Icons](https://simpleicons.org) paths (`build_local.mjs`) · self-hosted · setup: none · static

<img src="assets/catalog/local/stack-icons.svg" alt="Stack icons" width="100%">

---

## Work

### 25 · Animated device mockups
Real screens from the portfolio in a bone device frame with a red tab, crossfading (`build_noir.py`, animated WebP) · self-hosted · setup: none · static · **the Grit, Club, Cebador and Triaje screens show those products' own Spanish UI; only the dev-kit pages are in English**

<table><tr>
<td width="25%"><img src="assets/catalog/local/mockup-grit.webp" alt="Grit screens" width="200"></td>
<td width="25%"><img src="assets/catalog/local/mockup-club.webp" alt="ClubNahuelMosse screens" width="200"></td>
<td width="50%"><img src="assets/catalog/local/mockup-cebador.webp" alt="Cebador pages" width="400"><br><img src="assets/catalog/local/mockup-triaje.webp" alt="Triaje screens" width="400"></td>
</tr><tr>
<td colspan="3"><img src="assets/catalog/local/mockup-kit.webp" alt="The dev-kit tools' pages" width="400"></td>
</tr></table>

### 26 · Animated project preview
Animated WebP cut from the portfolio's Cebador video (`ffmpeg`) · self-hosted · setup: none · static · **the site's copy is Spanish**

<a href="https://nahuelmosse.github.io/cebador-landing/"><img src="assets/catalog/local/cebador.webp" alt="Cebador landing, scrolling" width="60%"></a>

### 27 · Project grid with thumbnails
HTML table with the PR #1 thumbnails · self-hosted · setup: none · static · **the app screens are in Spanish**

<table>
  <tr>
    <td width="33%" valign="top"><img src="assets/thumbs/grit.webp" alt="" width="240"><br><b>Grit</b></td>
    <td width="33%" valign="top"><img src="assets/thumbs/club.webp" alt="" width="240"><br><b><a href="https://github.com/NahuelMosse/ClubNahuelMosse">ClubNahuelMosse</a></b></td>
    <td width="33%" valign="top"><img src="assets/thumbs/guardia.webp" alt="" width="240"><br><b><a href="https://nahuelmosse.itch.io/triaje">Triaje</a></b></td>
  </tr>
</table>

### 28 · Noir repo cards
Self-made (`stats.mjs`), live stars, language and last push; descriptions from the English overrides in `catalog/profile.yml` · self-hosted · setup: `GITHUB_TOKEN` · live

<table><tr>
<td><a href="https://github.com/NahuelMosse/ClubNahuelMosse"><img src="assets/catalog/gen/repo-ClubNahuelMosse.svg" alt="ClubNahuelMosse" width="400"></a></td>
<td><a href="https://github.com/NahuelMosse/cebador-landing"><img src="assets/catalog/gen/repo-cebador-landing.svg" alt="cebador-landing" width="400"></a></td>
</tr><tr>
<td><a href="https://github.com/NahuelMosse/motion-audit"><img src="assets/catalog/gen/repo-motion-audit.svg" alt="motion-audit" width="400"></a></td>
<td><a href="https://github.com/NahuelMosse/http-attack"><img src="assets/catalog/gen/repo-http-attack.svg" alt="http-attack" width="400"></a></td>
</tr><tr>
<td><a href="https://github.com/NahuelMosse/migrations-safe"><img src="assets/catalog/gen/repo-migrations-safe.svg" alt="migrations-safe" width="400"></a></td>
<td><a href="https://github.com/NahuelMosse/Portfolio"><img src="assets/catalog/gen/repo-Portfolio.svg" alt="Portfolio" width="400"></a></td>
</tr></table>

### 29 · npm downloads for the dev-kit tools
Self-made (`stats.mjs`) from the npm registry and downloads API · self-hosted · setup: none · live

<img src="assets/catalog/gen/npm.svg" alt="npm downloads" width="100%">

### 30 · Currently building
Self-made (`stats.mjs`): the most recently pushed public repo with an English description in `catalog/profile.yml`, and its latest pull-request activity; raw PR titles are never shown · self-hosted · setup: `GITHUB_TOKEN` · live

<img src="assets/catalog/gen/building.svg" alt="Currently building" width="100%">

---

## Career

### 31 · Impact in big numbers
Self-made SVG, Boska numerals from the CV's results (`build_noir.py`) · self-hosted · setup: none · static

<img src="assets/catalog/local/impact.svg" alt="Impact numbers" width="100%">

### 32 · Career timeline, graphic
Self-made SVG: Kovix engagements in red, studies in bone, the thread drawn in (`build_noir.py`) · self-hosted · setup: none · static

<img src="assets/catalog/local/career-timeline.svg" alt="Career timeline" width="100%">

### 33 · readme-kit timeline card
readme-kit-action · self-hosted · setup: `GITHUB_TOKEN` · only the accent is themable

<img src="assets/catalog/kit/timeline.svg" alt="readme-kit timeline" width="100%">

### 34 · Career timeline (native Mermaid)
Native Mermaid `timeline` · setup: none · edited by hand

```mermaid
%%{init: {"theme":"base","themeVariables":{"cScale0":"#d2231b","cScaleLabel0":"#ede4d0","cScale1":"#3a3732","cScaleLabel1":"#ede4d0","cScale2":"#d2231b","cScaleLabel2":"#ede4d0","cScale3":"#3a3732","cScaleLabel3":"#ede4d0","cScale4":"#d2231b","cScaleLabel4":"#ede4d0","titleColor":"#ede4d0","textColor":"#ede4d0"}}}%%
timeline
    title Kovix Consulting engagements
    2022 : Jüsto · Senior Full Stack
    2023 : Frávega · Senior Full Stack
    2025 : Associate Degree in CS (Analista en Informática) · UM
    2026 : Visma · Technical Lead
         : Grupo ST · Technical Lead
         : Smart Warehousing · AI Enablement Lead
```

### 35 · Studies and certifications
Self-made SVG cards with the university and institute logos; each degree shows its English name over the legal Spanish title (`build_noir.py`) · self-hosted · setup: none · static

<img src="assets/catalog/local/education.svg" alt="Studies and certifications" width="100%">

### 36 · Working-hours overlap
Self-made SVG: Buenos Aires hours against US and European hubs, in standard time (`build_noir.py`) · self-hosted · setup: none · static

<img src="assets/catalog/local/timezone.svg" alt="Working hours overlap" width="100%">

---

## Footer

### 37 · Animated footer
Self-made SVG: red thread, signature drawn in, contact line (`build_noir.py`) · self-hosted · setup: none · static

<img src="assets/catalog/local/footer.svg" alt="Nawi. nawi.dev, Buenos Aires" width="100%">

---

## Round 3 candidates

Built to fill gaps in the PR #1 composition; not in that README yet.

### 38 · Selected impact by engagement
Self-made SVG: per role, a red bar shrinks from the before value to the result, or grows to it (`build_noir.py`) · self-hosted · setup: none · static

<img src="assets/catalog/local/impact-by-role.svg" alt="Selected impact by engagement" width="100%">

### 39 · Project spotlight
Animated WebP: the project's name, line and stack beside its real screens crossfading in the bone phone frame with a red tab (`build_noir.py`) · self-hosted · setup: none · static · **Grit's screens show the app's own Spanish UI**

<img src="assets/catalog/local/spotlight-grit.webp" alt="Project spotlight: Grit, a local-first training app for Android and iOS" width="100%">

### 40 · Open to TPM roles
Self-made SVG call to action: red panel, pulsing status dot, the TPM offer line; the whole card links to a prefilled email (`build_noir.py`) · self-hosted · setup: none · static

<a href="mailto:nahuelgamail@gmail.com?subject=Technical%20Project%20Manager%20role%20%C2%B7%20Nahuel%20Mosse"><img src="assets/catalog/local/cta-tpm.svg" alt="Open to Technical Project Manager roles" width="100%"></a>

### 41 · How I deliver
Self-made SVG: the TPM offer's four steps (spec, agents, tests, review) on a red thread (`build_noir.py`) · self-hosted · setup: none · static

<img src="assets/catalog/local/process.svg" alt="How I deliver: spec, agents, tests, review" width="100%">

### 42 · Closing contact card
Self-made SVG: Boska line over the three channels as tiles; links to the portfolio (`build_noir.py`) · self-hosted · setup: none · static

<a href="https://nawi.dev"><img src="assets/catalog/local/contact.svg" alt="Contact: nawi.dev, LinkedIn, email" width="100%"></a>

<sub>Courier Prime is used under the SIL Open Font License (`fonts/OFL-CourierPrime.txt`). Boska and General Sans appear only as outlines.</sub>
