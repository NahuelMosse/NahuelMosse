<!-- Catalog of profile README elements. Every entry below is a candidate; pick the ones that stay. -->

# Profile README catalog

Every element that can go on the profile, rendered with real data and, where the tool allows it, in the portfolio palette (ink `#0c0c0b`, bone `#ede4d0`, red `#d2231b`). Each entry says where it comes from, whether it is self-hosted, what setup it needs and how often it updates.

**Legend.** *Self-hosted:* the image lives in this repo, so no outside service can break it. *External:* the image is served by someone else's server on every view. *Setup:* none, `GITHUB_TOKEN` (the Actions token, already available), a PAT, or an outside account.

---

## Headers and identity

### 01 · Typing terminal hero
Self-made SVG (`scripts/catalog/build_local.mjs`) · self-hosted · setup: none · static, rebuilt by hand

<img src="assets/catalog/local/hero-typing.svg" alt="Animated terminal typing Nahuel's roles" width="100%">

### 02 · readme-kit hero card
[Sagargupta16/readme-kit-action](https://github.com/Sagargupta16/readme-kit-action) · self-hosted · setup: `GITHUB_TOKEN` · regenerated when `catalog/profile.yml` changes

<img src="assets/catalog/kit/hero.svg" alt="readme-kit hero card" width="100%">

### 03 · readme-typing-svg
[DenverCoder1/readme-typing-svg](https://github.com/DenverCoder1/readme-typing-svg) · external (demolab.com) · setup: none · live

<img src="https://readme-typing-svg.demolab.com?font=Courier+Prime&size=26&duration=2600&pause=900&color=D2231B&background=0C0C0B&vCenter=true&width=900&height=60&lines=Technical+Lead+at+Kovix+Consulting;Heading+into+Technical+Project+Management;Teams+that+ship+with+AI%2C+under+human+review" alt="Typing SVG">

### 04 · Capsule-render header and footer waves
[kyechan99/capsule-render](https://github.com/kyechan99/capsule-render) · external (vercel.app) · setup: none · live

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0c0c0b,100:d2231b&height=170&section=header&text=NAWI&fontColor=ede4d0&fontSize=64&fontAlign=50&fontAlignY=38&desc=Technical%20Lead%20%C2%B7%20Kovix%20Consulting&descAlign=50&descAlignY=60&animation=fadeIn" alt="Capsule header" width="100%">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:d2231b,100:0c0c0b&height=100&section=footer" alt="Capsule footer" width="100%">

### 05 · Neofetch card
Self-made SVG · self-hosted · setup: none · static, rebuilt by hand

<img src="assets/catalog/local/neofetch.svg" alt="Neofetch-style card" width="80%">

### 06 · About me as a code object
Native Markdown · setup: none · edited by hand

```ts
const nawi = {
  role: "Technical Lead · Kovix Consulting",
  next: "Technical Project Manager",
  clients: ["Smart Warehousing", "Grupo ST", "Visma"],
  base: "Buenos Aires, Argentina",
  languages: { es: "native", en: "C2 (EF SET)" },
  studies: ["Analista en Informática · UM · 2025", "Ingeniería en Informática · 4th year"],
  offDuty: ["CS2", "Rocket League", "chess", "Formula 1"],
};
```

### 07 · readme-kit terminal card
readme-kit-action · self-hosted · setup: `GITHUB_TOKEN` · regenerated when the profile changes

<img src="assets/catalog/kit/terminal.svg" alt="readme-kit terminal card" width="80%">

---

## Links and badges

### 08 · Shields badges
[shields.io](https://shields.io) · external · setup: none · live

<p>
<a href="https://nawi.dev"><img src="https://img.shields.io/badge/portfolio-nawi.dev-d2231b?style=for-the-badge&labelColor=0c0c0b" alt="Portfolio"></a>
<a href="https://linkedin.com/in/nahuelmosse"><img src="https://img.shields.io/badge/linkedin-nahuelmosse-ede4d0?style=for-the-badge&logo=linkedin&logoColor=ede4d0&labelColor=0c0c0b&color=3a3732" alt="LinkedIn"></a>
<a href="mailto:nahuelgamail@gmail.com"><img src="https://img.shields.io/badge/email-write%20me-ede4d0?style=for-the-badge&logo=gmail&logoColor=ede4d0&labelColor=0c0c0b&color=3a3732" alt="Email"></a>
<a href="cv/Nahuel-Mosse-CV.pdf"><img src="https://img.shields.io/badge/CV-PDF-d2231b?style=for-the-badge&labelColor=0c0c0b" alt="CV"></a>
</p>

### 09 · npm badges for the tools
shields.io + npm registry · external · setup: none · live

[![motion-audit](https://img.shields.io/npm/v/motion-audit?style=flat-square&label=motion-audit&labelColor=0c0c0b&color=d2231b)](https://github.com/NahuelMosse/motion-audit)
[![http-attack](https://img.shields.io/npm/v/http-attack?style=flat-square&label=http-attack&labelColor=0c0c0b&color=d2231b)](https://github.com/NahuelMosse/http-attack)
[![migrations-safe](https://img.shields.io/npm/v/migrations-safe?style=flat-square&label=migrations-safe&labelColor=0c0c0b&color=d2231b)](https://github.com/NahuelMosse/migrations-safe)
![downloads](https://img.shields.io/npm/dm/motion-audit?style=flat-square&label=motion-audit%20downloads&labelColor=0c0c0b&color=3a3732)

### 10 · readme-kit buttons
readme-kit-action · self-hosted · setup: `GITHUB_TOKEN`

<a href="https://nawi.dev"><img src="assets/catalog/kit/button-portfolio.svg" alt="Portfolio" height="44"></a>
<a href="https://linkedin.com/in/nahuelmosse"><img src="assets/catalog/kit/button-linkedin.svg" alt="LinkedIn" height="44"></a>
<a href="mailto:nahuelgamail@gmail.com"><img src="assets/catalog/kit/button-email.svg" alt="Email" height="44"></a>

### 11 · Profile view counter
[antonkomarev/github-profile-views-counter](https://github.com/antonkomarev/github-profile-views-counter) · external (komarev.com) · setup: none · counts every view

<img src="https://komarev.com/ghpvc/?username=NahuelMosse&color=d2231b&style=flat-square&label=profile+views&labelColor=0c0c0b" alt="Profile views">

### 12 · Contact through an issue form
Native issue form (`.github/ISSUE_TEMPLATE/say-hi.yml`) · setup: none · **works once merged to `master`** (GitHub reads templates from the default branch)

> [!TIP]
> Recruiter or collaborator? [Leave a note](https://github.com/NahuelMosse/NahuelMosse/issues/new?template=say-hi.yml): it takes a minute and I answer every one.

---

## Contributions

### 13 · Contribution snake
[Platane/snk](https://github.com/Platane/snk) · self-hosted via Actions · setup: `GITHUB_TOKEN` · daily

<img src="assets/catalog/gen/snake-noir.svg" alt="Snake eating the contribution graph" width="100%">

### 14 · Light/dark aware image (`<picture>`)
Native HTML · setup: none · shown here with the snake's GitHub light and dark palettes

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/catalog/gen/snake-dark.svg">
  <img src="assets/catalog/gen/snake-light.svg" alt="Snake, light or dark depending on GitHub's theme" width="100%">
</picture>

### 15 · Pac-Man and Breakout contribution graphs
[abozanona/pacman-contribution-graph](https://github.com/abozanona/pacman-contribution-graph) · self-hosted via Actions · setup: `GITHUB_TOKEN` · daily · colors not themable (GitHub dark palette)

<img src="assets/catalog/gen/arcade/pacman-contribution-graph-dark.svg" alt="Pac-Man eating the contribution graph" width="100%">
<img src="assets/catalog/gen/arcade/breakout-contribution-graph-dark.svg" alt="Breakout over the contribution graph" width="100%">

### 16 · 3D contribution skyline
[yoshi389111/github-profile-3d-contrib](https://github.com/yoshi389111/github-profile-3d-contrib) · self-hosted via Actions · setup: `GITHUB_TOKEN` · daily · noir palette from `catalog/3d-noir.json`

<img src="assets/catalog/gen/3d/profile-3d-noir.svg" alt="3D isometric contribution skyline in the noir palette" width="100%">

<details><summary>Built-in variants: night rainbow, gitblock</summary>

<img src="assets/catalog/gen/3d/profile-night-rainbow.svg" alt="3D skyline, night rainbow" width="100%">
<img src="assets/catalog/gen/3d/profile-gitblock.svg" alt="3D skyline, gitblock" width="100%">
</details>

### 17 · Isometric calendar (metrics)
[lowlighter/metrics](https://github.com/lowlighter/metrics) `isocalendar` · self-hosted via Actions · setup: `GITHUB_TOKEN` (a PAT adds private activity) · daily

<img src="assets/catalog/gen/metrics/metrics-isocalendar.svg" alt="Isometric commit calendar">

---

## Stats

### 18 · Stats, streak and top languages (self-made)
`scripts/catalog/stats.mjs` · self-hosted via Actions · setup: `GITHUB_TOKEN` · daily

<img src="assets/catalog/gen/stats.svg" alt="GitHub stats" width="49%"> <img src="assets/catalog/gen/languages.svg" alt="Top languages" width="49%">
<img src="assets/catalog/gen/streak.svg" alt="Contribution streak" width="49%">

### 19 · Profile summary cards
[vn7n24fzkq/github-profile-summary-cards](https://github.com/vn7n24fzkq/github-profile-summary-cards) · self-hosted via Actions · setup: `GITHUB_TOKEN` · daily · fixed themes (here `github_dark`)

<img src="assets/catalog/gen/summary/0-profile-details.svg" alt="Profile details" width="100%">
<img src="assets/catalog/gen/summary/1-repos-per-language.svg" alt="Repos per language" width="32%"> <img src="assets/catalog/gen/summary/2-most-commit-language.svg" alt="Most commit language" width="32%"> <img src="assets/catalog/gen/summary/3-stats.svg" alt="Stats" width="32%">
<img src="assets/catalog/gen/summary/4-productive-time.svg" alt="Productive time" width="49%">

### 20 · readme-kit stats strip
readme-kit-action · self-hosted · setup: `GITHUB_TOKEN`

<img src="assets/catalog/kit/stats.svg" alt="readme-kit stats" width="100%">

### 21 · Metrics plugins: habits, languages, achievements, notable, introduction
lowlighter/metrics · self-hosted via Actions · setup: `GITHUB_TOKEN` (a PAT unlocks private repos and more plugins) · daily

<img src="assets/catalog/gen/metrics/metrics-plugins.svg" alt="Metrics: habits, languages, achievements, notable contributions">

### 22 · Language pie (native Mermaid, live data)
Native Mermaid, data written by `stats.mjs` · setup: `GITHUB_TOKEN` · daily

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

### 23 · Hosted stat cards that are down today
github-readme-stats (`github-readme-stats.vercel.app`, HTTP 503), github-profile-trophy (HTTP 402) and github-readme-activity-graph (HTTP 402) are the classic hosted cards. Their public instances fail today, so they are not rendered here; entries 18–21 cover the same ground without a third party. Streak stats on demolab.com still answers:

<img src="https://streak-stats.demolab.com?user=NahuelMosse&background=0C0C0B&border=0C0C0B&stroke=2A2824&ring=D2231B&fire=D2231B&currStreakNum=EDE4D0&sideNums=EDE4D0&currStreakLabel=D2231B&sideLabels=8A8273&dates=8A8273&hide_border=true" alt="Hosted streak stats" width="49%">

---

## Stack

### 24 · Stack icons (self-made)
Self-made SVG from [Simple Icons](https://simpleicons.org) paths · self-hosted · setup: none · static

<img src="assets/catalog/local/stack-icons.svg" alt="Stack icons" width="100%">

### 25 · skillicons.dev
[tandpfun/skill-icons](https://github.com/tandpfun/skill-icons) · external · setup: none · colored brand icons, not themable

<img src="https://skillicons.dev/icons?i=nodejs,nestjs,ts,react,nextjs,angular,flutter,dart,postgres,prisma,redis,docker,kubernetes,terraform,azure,jest&perline=8&theme=dark" alt="Skill icons">

### 26 · Grouped stack as text
Native Markdown · setup: none

**Lead** Technical leadership · Planning · Mentoring · Scrum · Kanban &nbsp; **AI** Claude Code multi-agent · Spec-Driven Development · Azure OpenAI &nbsp; **Backend** Node.js · NestJS · TypeScript · PostgreSQL · Prisma · Redis · DDD &nbsp; **Frontend** React · Next.js · Angular · Tailwind CSS &nbsp; **Mobile** Flutter · Riverpod · SQLite &nbsp; **Cloud & QA** Azure · Kubernetes · Terraform · Docker · Playwright · Jest

---

## Work and career

### 27 · Animated project preview
Animated WebP cut from the portfolio's Cebador video (`ffmpeg`, 6 s, 640 px, 350 KB) · self-hosted · setup: none · static

<a href="https://nahuelmosse.github.io/cebador-landing/"><img src="assets/catalog/local/cebador.webp" alt="Cebador landing, scrolling" width="60%"></a>

### 28 · Project grid with thumbnails
Native HTML table (the current PR #1 layout) · self-hosted · setup: none

<table>
  <tr>
    <td width="33%" valign="top"><img src="assets/thumbs/grit.webp" alt="" width="240"><br><b>Grit</b><br><sub>Local-first training app, Flutter + Riverpod + SQLite.</sub></td>
    <td width="33%" valign="top"><img src="assets/thumbs/club.webp" alt="" width="240"><br><b><a href="https://github.com/NahuelMosse/ClubNahuelMosse">ClubNahuelMosse</a></b><br><sub>Flutter app + REST API for booking courts.</sub></td>
    <td width="33%" valign="top"><img src="assets/thumbs/guardia.webp" alt="" width="240"><br><b><a href="https://nahuelmosse.itch.io/triaje">Triaje</a></b><br><sub>Browser game about ER triage.</sub></td>
  </tr>
</table>

### 29 · Career timeline (native Mermaid)
Native Mermaid `timeline` · setup: none · edited by hand

```mermaid
%%{init: {"theme":"base","themeVariables":{"cScale0":"#d2231b","cScaleLabel0":"#ede4d0","cScale1":"#3a3732","cScaleLabel1":"#ede4d0","cScale2":"#d2231b","cScaleLabel2":"#ede4d0","cScale3":"#3a3732","cScaleLabel3":"#ede4d0","cScale4":"#d2231b","cScaleLabel4":"#ede4d0"}}}%%
timeline
    title Kovix Consulting engagements
    2022 : Jüsto · Senior Full Stack
    2023 : Frávega · Senior Full Stack
    2025 : Analista en Informática · UM
    2026 : Visma · Technical Lead
         : Grupo ST · Technical Lead
         : Smart Warehousing · AI Enablement Lead
```

### 30 · readme-kit timeline card
readme-kit-action · self-hosted · setup: `GITHUB_TOKEN`

<img src="assets/catalog/kit/timeline.svg" alt="readme-kit timeline" width="100%">

### 31 · Collapsible sections (`<details>`)
Native HTML · setup: none · keeps the page short and the depth one click away

<details><summary><b>Impact, with numbers</b></summary>

- **Visma:** Azure OpenAI integration cut one onboarding stage from 2 months to 1 week
- **Frávega:** average receiving time from 7 h 48 min to 46 min (about 90% less)
- **Frávega:** sellers BFF at 40,000 requests a day; business processes simplified by 80%
- **Jüsto:** 10+ releases, 50% less preparation time, 40 million operations
</details>

<details><summary><b>Experience</b></summary>

- **Technical Lead at Kovix Consulting**, engagements: Smart Warehousing (AI Engineering Enablement Lead / SDD Coach, 09/2026–present) · Grupo ST (Technical Lead, 08/2026–present) · Visma (Technical Lead, 01/2026–present)
- **Earlier engagements:** Frávega (Senior Full Stack Developer, 06/2023–01/2026) · Jüsto (Senior Full Stack Developer, 11/2022–12/2023)
</details>

### 32 · GitHub alerts as callouts
Native Markdown · setup: none

> [!NOTE]
> Open to Technical Lead and Technical Project Manager roles. Based in Buenos Aires.

> [!IMPORTANT]
> I lead teams that ship with AI under human review, and I still write code.

---

## Live activity

### 33 · Recently on GitHub (auto-updated list)
`stats.mjs` from the public events API · self-hosted · setup: `GITHUB_TOKEN` · daily

<!-- live:activity -->
- 2026-11-10 · Opened PR [#42](https://github.com/NahuelMosse/ClubNahuelMosse/pull/42) in [NahuelMosse/ClubNahuelMosse](https://github.com/NahuelMosse/ClubNahuelMosse): ENG-23 · los nombres del código y la configuración en inglés
- 2026-11-10 · Opened PR [#1](https://github.com/NahuelMosse/Portfolio/pull/1) in [NahuelMosse/Portfolio](https://github.com/NahuelMosse/Portfolio): PF-1 · Cinematic portfolio
- 2026-11-10 · Opened PR [#41](https://github.com/NahuelMosse/ClubNahuelMosse/pull/41) in [NahuelMosse/ClubNahuelMosse](https://github.com/NahuelMosse/ClubNahuelMosse): KIT-08: el repo usa el kit 6.45.3
- 2026-11-09 · Opened PR [#1](https://github.com/NahuelMosse/NahuelMosse/pull/1) in [NahuelMosse/NahuelMosse](https://github.com/NahuelMosse/NahuelMosse): Noir case-file profile README matching the portfolio
- 2026-11-08 · Opened PR [#3](https://github.com/NahuelMosse/moonlight-common-c/pull/3) in [NahuelMosse/moonlight-common-c](https://github.com/NahuelMosse/moonlight-common-c): Use kernel receive timestamps for video packets
- 2026-11-08 · Opened PR [#15](https://github.com/NahuelMosse/http-attack/pull/15) in [NahuelMosse/http-attack](https://github.com/NahuelMosse/http-attack): fix: reset the connection only when a cut body has not been written yet
<!-- /live:activity -->

### 34 · WakaTime coding time
[athul/waka-readme](https://github.com/athul/waka-readme) or [anmol098/waka-readme-stats](https://github.com/anmol098/waka-readme-stats) · Action writes text into the README · **needs setup: a WakaTime account + `WAKATIME_API_KEY` secret** · daily. Sample of the format, not real data:

```text
TypeScript   12 hrs 40 mins  ████████████▓░░░░░░░░░░░░   48.1 %
Dart          6 hrs 05 mins  ██████░░░░░░░░░░░░░░░░░░░   23.1 %
Markdown      3 hrs 12 mins  ███░░░░░░░░░░░░░░░░░░░░░░   12.2 %
```

### 35 · Spotify now playing
[kittinan/spotify-github-profile](https://github.com/kittinan/spotify-github-profile) · external · **needs setup: Spotify login on their service** · live. Tool's own sample, not real data:

<img src="https://raw.githubusercontent.com/kittinan/spotify-github-profile/master/img/example.svg" alt="Spotify now playing sample" width="50%">

### 36 · Community chess (issue-driven game)
Pattern popularized by [timburgan](https://github.com/timburgan/timburgan): visitors open an issue with a move, an Action validates it and redraws the board · **needs a workflow on `master` and moderation** · preview only:

<img src="assets/catalog/local/chess-preview.svg" alt="Chess board preview" width="320">

---

<img src="assets/catalog/kit/footer.svg" alt="readme-kit footer" width="100%">

<sub>Courier Prime is used under the SIL Open Font License (`fonts/OFL-CourierPrime.txt`).</sub>
