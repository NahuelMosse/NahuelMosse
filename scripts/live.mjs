// Live widgets of the profile README, redrawn daily by .github/workflows/profile.yml: the featured repo cards (the text
// under each animated preview), the dev-kit tools' cards, npm downloads of the dev-kit tools, the 3D contribution skyline, the heatmap, the
// streak and "currently building". Every widget is written twice, <name>.dark.svg and <name>.light.svg, on a transparent
// background in the portfolio palette, for the README's <picture> to pick by the reader's GitHub theme.
// Needs GITHUB_TOKEN (the Actions token is enough; locally, `GITHUB_TOKEN=$(gh auth token)`).
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "assets", "live");
mkdirSync(out, { recursive: true });
const USER = process.env.PROFILE_USER || "NahuelMosse";
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("GITHUB_TOKEN is required");
const { featured: FEATURED, npm: NPM, repos: META } = JSON.parse(readFileSync(join(root, "data", "repos.json"), "utf8"));
const describe = (name) => META[name]?.description;

// Each theme names the GitHub page it sits on (bg), so solid fills can be mixed toward it and read as if transparent.
const RED = "#d2231b";
const THEMES = {
  dark: { bg: "#0d1117", fg: "#ede4d0", dim: "#9a9283", line: "#ede4d0", lineOp: 0.16, red: RED, shade: 0.3 },
  light: { bg: "#ffffff", fg: "#0c0c0b", dim: "#6b655a", line: "#0c0c0b", lineOp: 0.16, red: "#c41f17", shade: 0.18 },
};
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => "#" + hex(a).map((x, i) => Math.round(x + (hex(b)[i] - x) * t).toString(16).padStart(2, "0")).join("");
// Contribution levels 0..4: a faint fg tint for an empty day, then the red mixed into the page at rising strength.
const level = (T, l) => (l === 0 ? mix(T.bg, T.fg, 0.09) : mix(T.bg, T.red, [0, 0.38, 0.6, 0.8, 1][l]));

const font = readFileSync(join(root, "fonts", "courier-prime-subset.woff2")).toString("base64");
const style = `@font-face{font-family:CP;src:url(data:font/woff2;base64,${font}) format("woff2")}text{font-family:CP,"Courier New",monospace}
@keyframes in{from{opacity:0}to{opacity:1}}.f{animation:in .6s ease-out both}
@keyframes up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}.u{animation:up .7s cubic-bezier(.16,1,.3,1) both}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}.g{transform-box:fill-box;transform-origin:left;animation:grow .9s cubic-bezier(.16,1,.3,1) both}
@keyframes rise{from{transform:scaleY(0)}to{transform:scaleY(1)}}.r{transform-box:fill-box;transform-origin:bottom;animation:rise .9s cubic-bezier(.16,1,.3,1) both}
@keyframes draw{to{stroke-dashoffset:0}}.d{stroke-dasharray:1;stroke-dashoffset:1;animation:draw 2s cubic-bezier(.65,0,.35,1) both}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.d{stroke-dashoffset:0}}`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const wrap = (t, n) => { const lines = [""]; for (const w of t.split(/\s+/)) { if ((lines.at(-1) + " " + w).trim().length > n) lines.push(w); else lines[lines.length - 1] = (lines.at(-1) + " " + w).trim(); } return lines; };
const hair = (T, x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${T.line}" stroke-opacity="${T.lineOp}"/>`;

// One family: every widget is drawn at the size the README shows it at in the 1012 px profile column (a full-width one 1012 wide,
// a third-width one 337, a quarter-width one 252), so type reads at the same scale in all of them. Spacing 4 8 12 16 24 32 48;
// type 11 (titles, labels) 13 (body) 20 (names) 30 (stats) 48 (figures) 80 (the counter).
const PAD = 24, BAND = 48;
const H3 = 176; // height of a third-width card, and of the streak and building cards
const SLOT3 = 337, CARD3 = 325, STEP3 = 6; // three to a row, drawn with no whitespace between them: card i sits STEP3 * i in from its slot's left edge, so the row spans the column with 18 px gutters
// The frame every card shares: a hairline outline, a tinted title band with a red mark (pulsing when `pulse`) and the title in 11 px caps, an optional dim note at the band's right.
const card = (T, w, h, text, { right, pulse } = {}) => `<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" fill="none" stroke="${T.line}" stroke-opacity="${T.lineOp}"/>
<rect x="1" y="1" width="${w - 2}" height="${BAND - 1}" fill="${T.fg}" fill-opacity=".04"/>${hair(T, 1, BAND + 0.5, w - 1, BAND + 0.5)}
<rect x="${PAD}" y="24" width="8" height="8" fill="${T.red}">${pulse ? `<animate attributeName="opacity" values="1;.25;1" dur="1.6s" repeatCount="indefinite"/>` : ""}</rect>
<text x="${PAD + 16}" y="32" fill="${T.fg}" font-size="11" letter-spacing="1.5">${esc(text)}</text>${right ? `<text x="${w - PAD}" y="32" text-anchor="end" fill="${T.dim}" font-size="11" letter-spacing="1.5">${esc(right)}</text>` : ""}`;

// A link chip, four to a row (252 wide each, 12 px gutters by the same inset rule as the thirds): the shared frame without a band,
// the channel in 11 px caps after the red mark, its address in 13 px. build_plates.py draws the same chip for the link plates.
const chip = (T, i, key, value) => `<g transform="translate(${i * 4} 0)"><rect x=".5" y=".5" width="239" height="63" fill="none" stroke="${T.line}" stroke-opacity="${T.lineOp}"/>
<rect x="16" y="16" width="8" height="8" fill="${T.red}"/><text x="32" y="24" fill="${T.fg}" font-size="11" letter-spacing="1.5">${esc(key.toUpperCase())}</text>
<text x="16" y="48" fill="${T.fg}" font-size="13">${esc(value)}</text></g>`;

// Writes both themes of one widget; `draw(T)` returns the inner SVG for a theme.
function emit(name, w, h, label, draw) {
  for (const [key, T] of Object.entries(THEMES))
    writeFileSync(join(out, `${name}.${key}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">
<title>${esc(label)}</title><style>${style}</style>
${draw(T)}</svg>
`);
}

async function gql(query, variables) {
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}
async function rest(path) {
  const r = await fetch(`https://api.github.com${path}`, { headers: { Authorization: `bearer ${token}` } });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

const { user } = await gql(`query($login:String!){user(login:$login){
  contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount weekday}}}}
  repositories(ownerAffiliations:OWNER,isFork:false,first:100,privacy:PUBLIC,orderBy:{field:PUSHED_AT,direction:DESC}){nodes{
    name description stargazerCount pushedAt primaryLanguage{name}}}}}`, { login: USER });

const cal = user.contributionsCollection.contributionCalendar;
const weeks = cal.weeks;
const days = weeks.flatMap((w) => w.contributionDays);
const repos = user.repositories.nodes;
const max = Math.max(...days.map((d) => d.contributionCount), 1);
const q = (n) => (n === 0 ? 0 : Math.min(4, 1 + Math.floor((Math.log(n) / Math.log(max + 1)) * 4)));

// 3D skyline: each day a prism on an oblique grid, its height by contributions, rising week by week.
{
  const W = 1012, MAXH = 112;
  const e1 = [(W - 2 * PAD - 52) / weeks.length, 3.6], e2 = [-52 / 6, 7]; // one week, one weekday
  const ox = PAD + 52;
  const cells = [];
  weeks.forEach((w, wi) => w.contributionDays.forEach((d) => cells.push({ wi, di: d.weekday, n: d.contributionCount, date: d.date })));
  cells.sort((a, b) => a.wi * e1[1] + a.di * e2[1] - (b.wi * e1[1] + b.di * e2[1]) || a.wi - b.wi);
  const hOf = (n) => (n ? 5 + MAXH * Math.sqrt(n / max) : 1.5);
  const oy = BAND + 24 + Math.max(...cells.map((c) => hOf(c.n) - (c.wi * e1[1] + c.di * e2[1])));
  const H = Math.ceil(oy + (weeks.length - 1) * e1[1] + 6 * e2[1] + e1[1] + e2[1] + PAD);
  const P = (x, y) => `${x.toFixed(1)},${y.toFixed(1)}`;
  const total = fmt(cal.totalContributions);
  emit("skyline", W, H, `${total} contributions in the last year, as a 3D skyline`, (T) => {
    const prisms = cells.map(({ wi, di, n, date }) => {
      const h = hOf(n);
      const x = ox + wi * e1[0] + di * e2[0], y = oy + wi * e1[1] + di * e2[1];
      const a = [x, y], b = [x + e1[0], y + e1[1]], c = [x + e1[0] + e2[0], y + e1[1] + e2[1]], dd = [x + e2[0], y + e2[1]];
      const top = level(T, q(n)), side = mix(top, "#000000", T.shade), front = mix(top, "#000000", T.shade * 0.55);
      const up = (p) => [p[0], p[1] - h];
      return `<g class="r" style="animation-delay:${(wi * 0.018).toFixed(3)}s"><title>${date}: ${n}</title>`
        + `<polygon points="${P(...dd)} ${P(...c)} ${P(...up(c))} ${P(...up(dd))}" fill="${front}"/>`
        + `<polygon points="${P(...b)} ${P(...c)} ${P(...up(c))} ${P(...up(b))}" fill="${side}"/>`
        + `<polygon points="${P(...up(a))} ${P(...up(b))} ${P(...up(c))} ${P(...up(dd))}" fill="${top}"/></g>`;
    }).join("");
    return `${card(T, W, H, "CONTRIBUTIONS · LAST 12 MONTHS")}
<g class="u"><text x="${W - PAD}" y="112" text-anchor="end" fill="${T.red}" font-size="48">${total}</text>
<text x="${W - PAD}" y="136" text-anchor="end" fill="${T.dim}" font-size="11" letter-spacing="2">CONTRIBUTIONS</text></g>${prisms}`;
  });
}

// Contribution heatmap.
{
  const W = 1012, x0 = 60, y0 = 84, pitch = (W - PAD - x0) / weeks.length, gap = 3, s = pitch - gap;
  const H = Math.ceil(y0 + 7 * pitch - gap + PAD);
  emit("heatmap", W, H, `${cal.totalContributions} contributions in the last year`, (T) => {
    let cells = "", months = "", last = "";
    weeks.forEach((w, wi) => {
      const m = new Date(w.contributionDays[0].date + "T00:00:00Z").toLocaleString("en-US", { month: "short", timeZone: "UTC" });
      if (m !== last && wi < weeks.length - 2) { months += `<text x="${(x0 + wi * pitch).toFixed(1)}" y="${y0 - 8}" fill="${T.dim}" font-size="11">${m}</text>`; last = m; }
      for (const d of w.contributionDays)
        cells += `<rect x="${(x0 + wi * pitch).toFixed(1)}" y="${(y0 + d.weekday * pitch).toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" fill="${level(T, q(d.contributionCount))}" class="f" style="animation-delay:${(wi * 0.012).toFixed(3)}s"><title>${d.date}: ${d.contributionCount}</title></rect>`;
    });
    const labels = ["Mon", "Wed", "Fri"].map((d, i) => `<text x="${PAD}" y="${(y0 + (1 + i * 2) * pitch + 11).toFixed(1)}" fill="${T.dim}" font-size="11">${d}</text>`).join("");
    const key = [0, 1, 2, 3, 4].map((l, i) => `<rect x="${W - PAD - (5 - i) * 12 + 4}" y="24" width="8" height="8" fill="${level(T, l)}"/>`).join("");
    return `${card(T, W, H, "HEATMAP · DAY BY DAY")}${key}${months}${labels}${cells}`;
  });
}

// Streak and merged PRs: four numbers. Today without contributions does not break the current streak. Merged PRs come from the search API restricted to public repos
// (`is:public`), so the number is the same whichever token runs this; authored by the user, so no bot's PR counts.
{
  let longest = 0, run = 0;
  for (const d of days) { run = d.contributionCount ? run + 1 : 0; longest = Math.max(longest, run); }
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].contributionCount) current++;
    else if (i !== days.length - 1) break;
  }
  const active = days.filter((d) => d.contributionCount).length;
  const merged = (await rest(`/search/issues?q=${encodeURIComponent(`is:pr is:merged is:public author:${USER}`)}&per_page=1`)).total_count;
  const W = 1012, H = 176;
  emit("streak", W, H, `Current streak ${current} days, longest ${longest}, ${active} active days in the last year, ${merged} merged pull requests in public repositories`, (T) => {
    const big = (x, n, l, c, d) => `<g class="u" style="animation-delay:${d}s"><text x="${x}" y="112" text-anchor="middle" fill="${c}" font-size="48">${fmt(n)}</text><text x="${x}" y="144" text-anchor="middle" fill="${T.dim}" font-size="11" letter-spacing="2">${l}</text></g>`;
    const cols = [W * 0.125, W * 0.375, W * 0.625, W * 0.875];
    return card(T, W, H, "STREAK · LAST 12 MONTHS")
      + big(cols[0], current, "CURRENT STREAK", T.red, 0) + big(cols[1], longest, "LONGEST", T.fg, 0.08)
      + big(cols[2], active, "ACTIVE DAYS", T.fg, 0.16) + big(cols[3], merged, "MERGED PRS · PUBLIC REPOS", T.fg, 0.24)
      + hair(T, W * 0.25, 72, W * 0.25, 152) + hair(T, W * 0.5, 72, W * 0.5, 152) + hair(T, W * 0.75, 72, W * 0.75, 152);
  });
}

// A public repo's name, description, stars, last push and language: from the GraphQL listing, or from REST when the listing
// doesn't have it.
async function repoInfo(name) {
  return repos.find((x) => x.name === name) || (await rest(`/repos/${USER}/${name}`).then((j) => ({ name: j.name, description: j.description, stargazerCount: j.stargazers_count, pushedAt: j.pushed_at, primaryLanguage: j.language ? { name: j.language } : null })).catch(() => null));
}

// The meta row at the foot of a third-width card: language dot and language, star count, last-push date.
function metaRow(T, r) {
  const star = `<path d="M0-7l2.1 4.3 4.7.7-3.4 3.3.8 4.7L0 3.8-4.2 6l.8-4.7L-6.8-2l4.7-.7z" fill="${T.fg}"/>`;
  return `<circle cx="29" cy="152" r="5" fill="${T.red}"/><text x="42" y="156" fill="${T.fg}" font-size="13">${esc(r.primaryLanguage?.name || "—")}</text>
<g transform="translate(160 152)">${star}</g><text x="174" y="156" fill="${T.fg}" font-size="13">${r.stargazerCount}</text>
<text x="${CARD3 - PAD}" y="156" text-anchor="end" fill="${T.dim}" font-size="12">${new Date(r.pushedAt).toISOString().slice(0, 10)}</text>`;
}
// A third-width card: the shared frame with its title, the name, up to two lines of body, and the foot row; `i` is its place in the row.
const third = (T, i, title, name, lines, foot, opts) => `<g transform="translate(${i * STEP3} 0)">${card(T, CARD3, H3, title, opts)}
<text x="${PAD}" y="80" fill="${T.fg}" font-size="20">${esc(name)}</text>
${lines.map((l, k) => `<text x="${PAD}" y="${104 + k * 19}" fill="${T.dim}" font-size="13">${esc(l)}</text>`).join("")}
${foot}</g>`;
const clip2 = (text) => { const lines = wrap(text, 33); if (lines.length > 2) lines[1] = lines[1].replace(/[\s—–-]*$/, "") + "…"; return lines.slice(0, 2); };

// Featured repo cards, three to a row: the text under each repo's animated preview (assets/previews/, built by
// build_previews.py): name, English description, language, stars and last push.
for (const [i, name] of FEATURED.entries()) {
  const r = await repoInfo(name);
  if (!r) continue;
  const text = describe(name) || r.description || "";
  emit(`repo-${name}`, SLOT3, H3, `${r.name}: ${text} ${r.stargazerCount} stars, ${r.primaryLanguage?.name || ""}`, (T) => third(T, i, "REPOSITORY", r.name, clip2(text), metaRow(T, r)));
}

// npm: all-time downloads of the dev-kit tools since each was published, as a rolling counter, the last 7 days, each
// package's counts and the weekly total as a sparkline. Daily counts from api.npmjs.org (no token needed); npm publishes a
// day's counts the next day, so the window ends at the last day it reports.
{
  const today = new Date().toISOString().slice(0, 10);
  const pkgs = [];
  for (const p of NPM) {
    const meta = await fetch(`https://registry.npmjs.org/${p}`).then((r) => r.json()).catch(() => ({}));
    const since = (meta.time?.created || "2026-01-01").slice(0, 10);
    const range = await fetch(`https://api.npmjs.org/downloads/range/${since}:${today}/${p}`).then((r) => r.json()).catch(() => ({}));
    const daily = (range.downloads || []).filter((d) => d.day >= since);
    pkgs.push({ p, since, version: meta["dist-tags"]?.latest || "—", daily, total: daily.reduce((a, d) => a + d.downloads, 0) });
  }
  const byDay = {};
  for (const k of pkgs) for (const d of k.daily) byDay[d.day] = (byDay[d.day] || 0) + d.downloads;
  const reported = Object.keys(byDay).filter((d) => byDay[d] > 0).sort();
  const end = reported.at(-1) || today;
  const first = pkgs.map((k) => k.since).sort()[0] || today;
  const dayList = Object.keys(byDay).filter((d) => d >= first && d <= end).sort();
  const lastWeek = (k) => k.daily.filter((d) => d.day > shift(end, -7) && d.day <= end).reduce((a, d) => a + d.downloads, 0);
  function shift(day, n) { const t = new Date(day + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
  // Weekly totals ending at `end`; while the packages are under four weeks old, the daily counts instead.
  const weekly = dayList.length >= 28;
  const buckets = [];
  if (weekly) for (let i = dayList.length; i > 0; i -= 7) buckets.unshift(dayList.slice(Math.max(0, i - 7), i).reduce((a, d) => a + byDay[d], 0));
  else buckets.push(...dayList.map((d) => byDay[d]));
  const total = pkgs.reduce((a, k) => a + k.total, 0);
  const week = pkgs.reduce((a, k) => a + lastWeek(k), 0);
  // The tools' own cards, three to a row under the projects: each is both an npm package and a Claude Code skill; name and
  // what it does in two lines, and the same meta row as the repo cards. Their downloads are in the npm card below.
  for (const [i, k] of pkgs.entries()) {
    const r = await repoInfo(k.p);
    emit(`tool-${k.p}`, SLOT3, H3, `${k.p}, an npm package and a Claude Code skill: ${describe(k.p) || ""}${r ? ` ${r.stargazerCount} stars, ${r.primaryLanguage?.name || ""}` : ""}`, (T) =>
      third(T, i, "NPM PACKAGE · CLAUDE CODE SKILL", k.p, clip2(describe(k.p) || ""), r ? metaRow(T, r) : ""));
  }
  // Each package's counts as its own third-width card, so the README can link each one to its npm page.
  for (const [i, k] of pkgs.entries()) emit(`npm-${k.p}`, SLOT3, H3, `${k.p} v${k.version} on npm: ${fmt(k.total)} downloads since ${k.since}, ${fmt(lastWeek(k))} in the last 7 days`, (T) =>
    `<g transform="translate(${i * STEP3} 0)">${card(T, CARD3, H3, "NPM DOWNLOADS", { right: `v${k.version}` })}<g class="u">
<text x="${PAD}" y="80" fill="${T.fg}" font-size="20">${esc(k.p)}</text>
<text x="${PAD}" y="104" fill="${T.dim}" font-size="13">since ${k.since}</text>
<text x="${PAD}" y="156" fill="${T.fg}" font-size="30">${fmt(k.total)}</text>
<text x="${CARD3 - PAD}" y="156" text-anchor="end" fill="${T.red}" font-size="13">+${fmt(lastWeek(k))} this week</text></g></g>`);
  const W = 1012, H = 240;
  const label = `npm downloads of the dev-kit tools since publication: ${fmt(total)} in total, ${fmt(week)} in the last 7 days. `
    + pkgs.map((k) => `${k.p} v${k.version}: ${fmt(k.total)}, ${fmt(lastWeek(k))} in the last 7 days`).join(". ");
  emit("npm", W, H, label, (T) => {
    // Rolling counter: each digit a column of 0-9 that scrolls to its value.
    const digits = fmt(total).split("");
    const size = 80, lh = 96, cw = size * 0.6, wy = 76, base = wy + size * 0.78;
    let x = PAD, counter = "", keys = "";
    digits.forEach((ch, i) => {
      if (!/\d/.test(ch)) { counter += `<text x="${x - cw * 0.22}" y="${base}" fill="${T.red}" font-size="${size}">${ch}</text>`; x += cw * 0.5; return; }
      const v = Number(ch);
      keys += `@keyframes roll${i}{from{transform:translateY(0)}to{transform:translateY(-${(v + 10) * lh}px)}}`;
      const col = Array.from({ length: 20 }, (_, n) => `<text x="${x}" y="${base + n * lh}" fill="${T.red}" font-size="${size}">${n % 10}</text>`).join("");
      counter += `<g style="animation:roll${i} ${1.6 + i * 0.25}s cubic-bezier(.16,1,.3,1) both">${col}</g>`;
      x += cw;
    });
    const clip = `<clipPath id="win"><rect x="0" y="${wy}" width="${x + 20}" height="${lh}"/></clipPath>`;
    // Sparkline of weekly totals.
    const sx0 = 560, sx1 = W - PAD, sy0 = 100, sy1 = 196;
    const bmax = Math.max(...buckets, 1);
    const pts = buckets.map((b, i) => [sx0 + (buckets.length < 2 ? 0 : (i / (buckets.length - 1)) * (sx1 - sx0)), sy1 - (b / bmax) * (sy1 - sy0)]);
    const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
    const area = `${line} L${pts.at(-1)[0].toFixed(1)} ${sy1} L${pts[0][0].toFixed(1)} ${sy1} Z`;
    const spark = `<defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.red}" stop-opacity=".28"/><stop offset="1" stop-color="${T.red}" stop-opacity="0"/></linearGradient></defs>
<text x="${sx0}" y="84" fill="${T.dim}" font-size="11" letter-spacing="1.5">${weekly ? "WEEKLY" : "DAILY"} DOWNLOADS SINCE ${first}</text>${hair(T, sx0 - 32, 72, sx0 - 32, 216)}
${hair(T, sx0, sy1, sx1, sy1)}<path d="${area}" fill="url(#a)" class="f" style="animation-delay:1s"/>
<path d="${line}" pathLength="1" fill="none" stroke="${T.red}" stroke-width="2.5" stroke-linejoin="round" class="d"/>
<circle cx="${pts.at(-1)[0].toFixed(1)}" cy="${pts.at(-1)[1].toFixed(1)}" r="5" fill="${T.red}" class="f" style="animation-delay:2s"/>
<text x="${sx1}" y="${sy1 + 20}" text-anchor="end" fill="${T.dim}" font-size="11" letter-spacing="1.5">${fmt(buckets.at(-1) || 0)} ${weekly ? "THIS WEEK" : "LAST DAY"} · PEAK ${fmt(bmax)}</text>`;
    return `<style>${keys}</style><defs>${clip}</defs>${card(T, W, H, "NPM · ALL-TIME DOWNLOADS · 3 PACKAGES")}
<g clip-path="url(#win)">${counter}</g>
<text x="${PAD}" y="200" fill="${T.fg}" font-size="13" class="u" style="animation-delay:1.2s"><tspan fill="${T.red}">+${fmt(week)}</tspan> in the last 7 days</text>
${spark}`;
  });
}

// Currently building: the most recently pushed public repo with an English description in data/repos.json, and the latest
// pull-request activity in such a repo. Raw PR and commit titles are never printed.
{
  const latest = repos.find((r) => r.name !== USER && describe(r.name));
  const events = await rest(`/users/${USER}/events/public?per_page=100`);
  const prEvent = events.find((e) => e.type === "PullRequestEvent" && describe(e.repo.name.split("/")[1]));
  const ago = (iso) => { const h = Math.round((Date.now() - new Date(iso)) / 36e5); return h < 1 ? "just now" : h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`; };
  if (latest) {
    const prRepo = prEvent?.repo.name.split("/")[1];
    const prVerb = prEvent ? `Pull request ${prEvent.payload.action}` : "";
    emit("building", 1012, 176, `Currently building ${latest.name}: ${describe(latest.name)}${prEvent ? ` ${prVerb} in ${prRepo} on ${prEvent.created_at.slice(0, 10)}.` : ""}`, (T) => {
      const desc = wrap(describe(latest.name), 76).slice(0, 2).map((l, i) => `<text x="${PAD}" y="${120 + i * 19}" fill="${T.dim}" font-size="13">${esc(l)}</text>`).join("");
      return `${card(T, 1012, 176, "CURRENTLY BUILDING", { pulse: true })}
<g class="u"><text x="${PAD}" y="96" fill="${T.fg}" font-size="30">${esc(latest.name)}</text>${desc}
<text x="${PAD}" y="156" fill="${T.dim}" font-size="13">${esc(latest.primaryLanguage?.name || "")} · last push ${ago(latest.pushedAt)}</text></g>
${hair(T, 680, 72, 680, 152)}
${prEvent ? `<g class="u" style="animation-delay:.2s"><text x="704" y="84" fill="${T.dim}" font-size="11" letter-spacing="1.5">LATEST REVIEWABLE WORK</text>
<text x="704" y="112" fill="${T.fg}" font-size="20">${esc(prVerb)}</text>
<text x="704" y="136" fill="${T.dim}" font-size="13">${esc(prRepo)} · #${prEvent.payload.number ?? prEvent.payload.pull_request?.number}</text>
<text x="704" y="156" fill="${T.dim}" font-size="13">${prEvent.created_at.slice(0, 10)}</text></g>` : ""}`;
    });
  }
}

// Profile views, drawn as a fourth link chip. The README counts each view with komarev.com's invisible 1x1 "pixel"
// badge; komarev has no read-only endpoint, so this reads the number from its regular badge (one extra count a day) and
// keeps the last good number in data/views.json when the service does not answer.
{
  const store = join(root, "data", "views.json");
  const kept = existsSync(store) ? JSON.parse(readFileSync(store, "utf8")) : { count: 0, date: null };
  const badge = await fetch(`https://komarev.com/ghpvc/?username=${USER}&style=flat-square`, { signal: AbortSignal.timeout(20000) })
    .then((r) => (r.ok ? r.text() : "")).catch(() => "");
  const read = Number(([...badge.matchAll(/>([\d,]+)</g)].at(-1)?.[1] ?? "").replace(/,/g, "") || NaN);
  const views = Number.isFinite(read) && read >= kept.count ? { count: read, date: new Date().toISOString().slice(0, 10) } : kept;
  writeFileSync(store, JSON.stringify(views, null, 2) + "\n");
  emit("views", 252, 64, `Profile views: ${fmt(views.count)}`, (T) => chip(T, 3, "PROFILE VIEWS", fmt(views.count)));
}

console.log(`live widgets ok: ${cal.totalContributions} contributions`);
