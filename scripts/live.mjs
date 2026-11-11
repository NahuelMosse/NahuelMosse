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
const frame = (T, w, h) => `<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" fill="none" stroke="${T.line}" stroke-opacity="${T.lineOp}"/>`;
const title = (T, text, x = 24, y = 34) => `<rect x="${x}" y="${y - 10}" width="10" height="10" fill="${T.red}"/><text x="${x + 20}" y="${y}" fill="${T.fg}" font-size="14" letter-spacing="3">${esc(text)}</text>`;

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
  const W = 1100, H = 520;
  const e1 = [17.4, 4.4], e2 = [-9.2, 8]; // one week, one weekday
  const ox = 90, oy = 200;
  const cells = [];
  weeks.forEach((w, wi) => w.contributionDays.forEach((d) => cells.push({ wi, di: d.weekday, n: d.contributionCount, date: d.date })));
  cells.sort((a, b) => a.wi * e1[1] + a.di * e2[1] - (b.wi * e1[1] + b.di * e2[1]) || a.wi - b.wi);
  const P = (x, y) => `${x.toFixed(1)},${y.toFixed(1)}`;
  const total = fmt(cal.totalContributions);
  emit("skyline", W, H, `${total} contributions in the last year, as a 3D skyline`, (T) => {
    const prisms = cells.map(({ wi, di, n, date }) => {
      const h = n ? 5 + 150 * Math.sqrt(n / max) : 1.5;
      const x = ox + wi * e1[0] + di * e2[0], y = oy + wi * e1[1] + di * e2[1];
      const a = [x, y], b = [x + e1[0], y + e1[1]], c = [x + e1[0] + e2[0], y + e1[1] + e2[1]], dd = [x + e2[0], y + e2[1]];
      const top = level(T, q(n)), side = mix(top, "#000000", T.shade), front = mix(top, "#000000", T.shade * 0.55);
      const up = (p) => [p[0], p[1] - h];
      return `<g class="r" style="animation-delay:${(wi * 0.018).toFixed(3)}s"><title>${date}: ${n}</title>`
        + `<polygon points="${P(...dd)} ${P(...c)} ${P(...up(c))} ${P(...up(dd))}" fill="${front}"/>`
        + `<polygon points="${P(...b)} ${P(...c)} ${P(...up(c))} ${P(...up(b))}" fill="${side}"/>`
        + `<polygon points="${P(...up(a))} ${P(...up(b))} ${P(...up(c))} ${P(...up(dd))}" fill="${top}"/></g>`;
    }).join("");
    return `${title(T, "CONTRIBUTIONS · LAST 12 MONTHS")}
<g class="u"><text x="${W - 24}" y="70" text-anchor="end" fill="${T.red}" font-size="56">${total}</text>
<text x="${W - 24}" y="96" text-anchor="end" fill="${T.dim}" font-size="12" letter-spacing="3">CONTRIBUTIONS</text></g>${prisms}`;
  });
}

// Contribution heatmap.
{
  const s = 14, gap = 3, x0 = 46, y0 = 58;
  const W = x0 + weeks.length * (s + gap) + 24, H = y0 + 7 * (s + gap) + 40;
  emit("heatmap", W, H, `${cal.totalContributions} contributions in the last year`, (T) => {
    let cells = "", months = "", last = "";
    weeks.forEach((w, wi) => {
      const m = new Date(w.contributionDays[0].date + "T00:00:00Z").toLocaleString("en-US", { month: "short", timeZone: "UTC" });
      if (m !== last && wi < weeks.length - 2) { months += `<text x="${x0 + wi * (s + gap)}" y="${y0 - 10}" fill="${T.dim}" font-size="11">${m}</text>`; last = m; }
      for (const d of w.contributionDays)
        cells += `<rect x="${x0 + wi * (s + gap)}" y="${y0 + d.weekday * (s + gap)}" width="${s}" height="${s}" fill="${level(T, q(d.contributionCount))}" class="f" style="animation-delay:${(wi * 0.012).toFixed(3)}s"><title>${d.date}: ${d.contributionCount}</title></rect>`;
    });
    const labels = ["Mon", "Wed", "Fri"].map((d, i) => `<text x="8" y="${y0 + (1 + i * 2) * (s + gap) + 11}" fill="${T.dim}" font-size="11">${d}</text>`).join("");
    const key = [0, 1, 2, 3, 4].map((l, i) => `<rect x="${W - 24 - (5 - i) * 18}" y="${y0 + 7 * (s + gap) + 10}" width="14" height="14" fill="${level(T, l)}"/>`).join("");
    return `<text x="${x0}" y="26" fill="${T.fg}" font-size="14" letter-spacing="3">HEATMAP · DAY BY DAY</text>${months}${labels}${cells}${key}`;
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
  const W = 1100, H = 184, x0 = 24, x1 = W - 24;
  emit("streak", W, H, `Current streak ${current} days, longest ${longest}, ${active} active days in the last year, ${merged} merged pull requests in public repositories`, (T) => {
    const big = (x, n, l, c, d) => `<g class="u" style="animation-delay:${d}s"><text x="${x}" y="118" text-anchor="middle" fill="${c}" font-size="48">${fmt(n)}</text><text x="${x}" y="148" text-anchor="middle" fill="${T.dim}" font-size="12" letter-spacing="2">${l}</text></g>`;
    const cols = [W * 0.125, W * 0.375, W * 0.625, W * 0.875];
    return title(T, "STREAK · LAST 12 MONTHS")
      + big(cols[0], current, "CURRENT STREAK", T.red, 0) + big(cols[1], longest, "LONGEST", T.fg, 0.08)
      + big(cols[2], active, "ACTIVE DAYS", T.fg, 0.16) + big(cols[3], merged, "MERGED PRS · PUBLIC REPOS", T.fg, 0.24)
      + hair(T, W * 0.25, 82, W * 0.25, 152) + hair(T, W * 0.5, 82, W * 0.5, 152) + hair(T, W * 0.75, 82, W * 0.75, 152)
      + hair(T, x0, H - 8.5, x1, H - 8.5);
  });
}

// A public repo's name, description, stars, last push and language: from the GraphQL listing, or from REST when the listing
// doesn't have it.
async function repoInfo(name) {
  return repos.find((x) => x.name === name) || (await rest(`/repos/${USER}/${name}`).then((j) => ({ name: j.name, description: j.description, stargazerCount: j.stargazers_count, pushedAt: j.pushed_at, primaryLanguage: j.language ? { name: j.language } : null })).catch(() => null));
}

// The meta row at the foot of a 300x170 repo card: language dot and language, star count, last-push date, closing hairline.
function metaRow(T, r) {
  const star = `<path d="M0-7l2.1 4.3 4.7.7-3.4 3.3.8 4.7L0 3.8-4.2 6l.8-4.7L-6.8-2l4.7-.7z" fill="${T.fg}"/>`;
  return `<circle cx="30" cy="138" r="6" fill="${T.red}"/><text x="44" y="142" fill="${T.fg}" font-size="13">${esc(r.primaryLanguage?.name || "—")}</text>
<g transform="translate(150 138)">${star}</g><text x="164" y="142" fill="${T.fg}" font-size="13">${r.stargazerCount}</text>
<text x="284" y="142" text-anchor="end" fill="${T.dim}" font-size="12">${new Date(r.pushedAt).toISOString().slice(0, 10)}</text>
${hair(T, 24, 166.5, 284, 166.5)}`;
}

// Featured repo cards, three to a row: the text under each repo's animated preview (assets/previews/, built by
// build_previews.py): name, English description, language, stars and last push.
for (const name of FEATURED) {
  const r = await repoInfo(name);
  if (!r) continue;
  const text = describe(name) || r.description || "";
  const lines = wrap(text, 33);
  if (lines.length > 2) lines[1] = lines[1].replace(/[\s—–-]*$/, "") + "…";
  emit(`repo-${name}`, 300, 170, `${r.name}: ${text} ${r.stargazerCount} stars, ${r.primaryLanguage?.name || ""}`, (T) =>
    `<rect x="24" y="4" width="48" height="3" fill="${T.red}" class="g"/>
<text x="24" y="34" fill="${T.dim}" font-size="11" letter-spacing="3">REPOSITORY</text>
<text x="24" y="62" fill="${T.fg}" font-size="19">${esc(r.name)}</text>
${lines.slice(0, 2).map((l, i) => `<text x="24" y="${88 + i * 19}" fill="${T.dim}" font-size="13">${esc(l)}</text>`).join("")}
${metaRow(T, r)}`);
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
  for (const k of pkgs) {
    const r = await repoInfo(k.p);
    const lines = wrap(describe(k.p) || "", 33);
    if (lines.length > 2) lines[1] = lines[1].replace(/[\s—–-]*$/, "") + "…";
    emit(`tool-${k.p}`, 300, r ? 170 : 130, `${k.p}, an npm package and a Claude Code skill: ${describe(k.p) || ""}${r ? ` ${r.stargazerCount} stars, ${r.primaryLanguage?.name || ""}` : ""}`, (T) =>
      `<rect x="24" y="4" width="48" height="3" fill="${T.red}" class="g"/>
<text x="24" y="34" fill="${T.dim}" font-size="11" letter-spacing="1.6">NPM PACKAGE · CLAUDE CODE SKILL</text>
<text x="24" y="62" fill="${T.fg}" font-size="19">${esc(k.p)}</text>
${lines.slice(0, 2).map((l, i) => `<text x="24" y="${88 + i * 19}" fill="${T.dim}" font-size="13">${esc(l)}</text>`).join("")}
${r ? metaRow(T, r) : hair(T, 24, 126.5, 284, 126.5)}`);
  }
  const W = 1100, H = 400;
  const label = `npm downloads of the dev-kit tools since publication: ${fmt(total)} in total, ${fmt(week)} in the last 7 days. `
    + pkgs.map((k) => `${k.p} v${k.version}: ${fmt(k.total)}, ${fmt(lastWeek(k))} in the last 7 days`).join(". ");
  emit("npm", W, H, label, (T) => {
    // Rolling counter: each digit a column of 0-9 that scrolls to its value.
    const digits = fmt(total).split("");
    const size = 112, lh = 120, cw = size * 0.6;
    let x = 24, counter = "", keys = "";
    digits.forEach((ch, i) => {
      if (!/\d/.test(ch)) { counter += `<text x="${x - cw * 0.22}" y="${92 + size * 0.78}" fill="${T.red}" font-size="${size}">${ch}</text>`; x += cw * 0.5; return; }
      const v = Number(ch);
      keys += `@keyframes roll${i}{from{transform:translateY(0)}to{transform:translateY(-${(v + 10) * lh}px)}}`;
      const col = Array.from({ length: 20 }, (_, n) => `<text x="${x}" y="${92 + size * 0.78 + n * lh}" fill="${T.red}" font-size="${size}">${n % 10}</text>`).join("");
      counter += `<g style="animation:roll${i} ${1.6 + i * 0.25}s cubic-bezier(.16,1,.3,1) both">${col}</g>`;
      x += cw;
    });
    const clip = `<clipPath id="win"><rect x="0" y="92" width="${x + 20}" height="${lh}"/></clipPath>`;
    // Sparkline of weekly totals.
    const sx0 = 640, sx1 = W - 24, sy0 = 92, sy1 = 210;
    const bmax = Math.max(...buckets, 1);
    const pts = buckets.map((b, i) => [sx0 + (buckets.length < 2 ? 0 : (i / (buckets.length - 1)) * (sx1 - sx0)), sy1 - (b / bmax) * (sy1 - sy0)]);
    const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
    const area = `${line} L${pts.at(-1)[0].toFixed(1)} ${sy1} L${pts[0][0].toFixed(1)} ${sy1} Z`;
    const spark = `<defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.red}" stop-opacity=".28"/><stop offset="1" stop-color="${T.red}" stop-opacity="0"/></linearGradient></defs>
<text x="${sx0}" y="74" fill="${T.dim}" font-size="11" letter-spacing="2">${weekly ? "WEEKLY" : "DAILY"} DOWNLOADS SINCE ${first}</text>
${hair(T, sx0, sy1, sx1, sy1)}<path d="${area}" fill="url(#a)" class="f" style="animation-delay:1s"/>
<path d="${line}" pathLength="1" fill="none" stroke="${T.red}" stroke-width="2.5" stroke-linejoin="round" class="d"/>
<circle cx="${pts.at(-1)[0].toFixed(1)}" cy="${pts.at(-1)[1].toFixed(1)}" r="5" fill="${T.red}" class="f" style="animation-delay:2s"/>
<text x="${sx1}" y="${sy1 + 22}" text-anchor="end" fill="${T.dim}" font-size="11" letter-spacing="1">${fmt(buckets.at(-1) || 0)} ${weekly ? "THIS WEEK" : "LAST DAY"} · PEAK ${fmt(bmax)}</text>`;
    const cols = pkgs.map((k, i) => `<g transform="translate(${24 + i * 360} 0)"><g class="u" style="animation-delay:${0.4 + i * 0.12}s">
${i ? hair(T, -18, 290, -18, 372) : ""}<text x="0" y="306" fill="${T.fg}" font-size="18">${esc(k.p)}</text>
<text x="0" y="326" fill="${T.dim}" font-size="12">v${esc(k.version)} · since ${k.since}</text>
<text x="0" y="364" fill="${T.fg}" font-size="30">${fmt(k.total)}</text>
<text x="${String(fmt(k.total)).length * 18 + 14}" y="364" fill="${T.red}" font-size="14">+${fmt(lastWeek(k))} this week</text></g></g>`).join("");
    return `<style>${keys}</style><defs>${clip}</defs>${title(T, "NPM · ALL-TIME DOWNLOADS · 3 PACKAGES")}
<g clip-path="url(#win)">${counter}</g>
<text x="24" y="244" fill="${T.fg}" font-size="16" letter-spacing="1" class="u" style="animation-delay:1.2s"><tspan fill="${T.red}">+${fmt(week)}</tspan> in the last 7 days</text>
${spark}${hair(T, 24, 270, W - 24, 270)}${cols}`;
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
    emit("building", 1100, 190, `Currently building ${latest.name}: ${describe(latest.name)}${prEvent ? ` ${prVerb} in ${prRepo} on ${prEvent.created_at.slice(0, 10)}.` : ""}`, (T) => {
      const desc = wrap(describe(latest.name), 70).slice(0, 2).map((l, i) => `<text x="24" y="${112 + i * 18}" fill="${T.dim}" font-size="14">${esc(l)}</text>`).join("");
      return `${hair(T, 0, 0.5, 1100, 0.5)}${hair(T, 0, 189.5, 1100, 189.5)}
<circle cx="30" cy="34" r="6" fill="${T.red}"><animate attributeName="opacity" values="1;.25;1" dur="1.6s" repeatCount="indefinite"/></circle>
<text x="46" y="39" fill="${T.red}" font-size="13" letter-spacing="3">CURRENTLY BUILDING</text>
<g class="u"><text x="24" y="84" fill="${T.fg}" font-size="30">${esc(latest.name)}</text>${desc}
<text x="24" y="168" fill="${T.dim}" font-size="12" letter-spacing="1">${esc(latest.primaryLanguage?.name || "")} · last push ${ago(latest.pushedAt)}</text></g>
${hair(T, 720, 28, 720, 166)}
${prEvent ? `<g class="u" style="animation-delay:.2s"><text x="746" y="58" fill="${T.dim}" font-size="12" letter-spacing="2">LATEST REVIEWABLE WORK</text>
<text x="746" y="92" fill="${T.fg}" font-size="18">${esc(prVerb)}</text>
<text x="746" y="120" fill="${T.dim}" font-size="14">${esc(prRepo)} · #${prEvent.payload.number ?? prEvent.payload.pull_request?.number}</text>
<text x="746" y="146" fill="${T.dim}" font-size="13">${prEvent.created_at.slice(0, 10)}</text></g>` : ""}`;
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
  emit("views", 300, 56, `Profile views: ${fmt(views.count)}`, (T) =>
    `<text x="2" y="18" fill="${T.red}" font-size="11" letter-spacing="3">PROFILE VIEWS</text>`
    + `<text x="2" y="42" fill="${T.fg}" font-size="18">${fmt(views.count)}</text>`
    + `<rect x="2" y="51" width="296" height="2" fill="${T.red}" opacity=".5"/>`);
}

console.log(`live widgets ok: ${cal.totalContributions} contributions`);
