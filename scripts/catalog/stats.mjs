// Self-hosted live widgets for the catalog, in the portfolio palette: stats, streak, languages (bar and donut), contribution
// heatmap, weekly activity, commit clock, contribution radar, "currently building", featured repo cards, npm downloads and
// milestone badges, plus the Mermaid language pie written between its <!-- live:* --> markers in README.md.
// Needs GITHUB_TOKEN (the Actions token is enough; locally, `GITHUB_TOKEN=$(gh auth token)`).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = join(root, "assets", "catalog", "gen");
mkdirSync(out, { recursive: true });
const USER = process.env.PROFILE_USER || "NahuelMosse";
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("GITHUB_TOKEN is required");
const TZ = -3; // Buenos Aires, no daylight saving.
const FEATURED = ["ClubNahuelMosse", "cebador-landing", "motion-audit", "http-attack", "migrations-safe", "Portfolio"];
const NPM = ["motion-audit", "http-attack", "migrations-safe"];

const INK = "#0c0c0b", BONE = "#ede4d0", RED = "#d2231b", DIM = "#8a8273", LINE = "#2a2824", PANEL = "#141311";
const SCALE = ["#1d1b18", "#4a1d17", "#7a2219", "#a8241b", RED];
const SHADES = [RED, BONE, "#b8ad97", DIM, "#5c564b", "#3a3732"];
const font = readFileSync(join(root, "fonts", "courier-prime-subset.woff2")).toString("base64");
const style = `@font-face{font-family:CP;src:url(data:font/woff2;base64,${font}) format("woff2")}text{font-family:CP,"Courier New",monospace}
@keyframes in{from{opacity:0}to{opacity:1}}.f{animation:in .6s ease-out both}
@keyframes up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}.u{animation:up .7s cubic-bezier(.16,1,.3,1) both}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}.g{transform-box:fill-box;transform-origin:left;animation:grow .9s cubic-bezier(.16,1,.3,1) both}
@keyframes draw{to{stroke-dashoffset:0}}.d{animation:draw 1.6s cubic-bezier(.16,1,.3,1) both}
@keyframes flick{0%,100%{transform:scale(1)}50%{transform:scale(1.06,.94)}}.fl{transform-box:fill-box;transform-origin:bottom;animation:flick 1.4s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const short = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n));

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

function card(name, w, h, title, inner, label, opts = {}) {
  const head = title ? `<rect x="24" y="22" width="10" height="10" fill="${RED}"/><text x="44" y="32" fill="${BONE}" font-size="14" letter-spacing="3">${esc(title)}</text>` : "";
  writeFileSync(join(out, name), `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">
<title>${esc(label)}</title><style>${style}</style><rect width="${w}" height="${h}" fill="${INK}"/>${opts.noBorder ? "" : `<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" fill="none" stroke="${LINE}"/>`}
${head}${inner}</svg>`);
}

const { user } = await gql(`query($login:String!){user(login:$login){
  createdAt followers{totalCount}
  pullRequests(states:MERGED){totalCount}
  contributionsCollection{totalCommitContributions totalPullRequestContributions totalIssueContributions
    totalPullRequestReviewContributions totalRepositoryContributions restrictedContributionsCount
    contributionCalendar{totalContributions weeks{contributionDays{date contributionCount weekday}}}}
  repositories(ownerAffiliations:OWNER,isFork:false,first:100,privacy:PUBLIC,orderBy:{field:PUSHED_AT,direction:DESC}){totalCount nodes{
    name description stargazerCount forkCount pushedAt url primaryLanguage{name}
    languages(first:8,orderBy:{field:SIZE,direction:DESC}){edges{size node{name}}}}}}}`, { login: USER });

const cc = user.contributionsCollection;
const weeks = cc.contributionCalendar.weeks;
const days = weeks.flatMap((w) => w.contributionDays);
const repos = user.repositories.nodes;
const stars = repos.reduce((a, r) => a + r.stargazerCount, 0);

// Streaks over the last year; today without contributions does not break the current streak.
let longest = 0, run = 0;
for (const d of days) { run = d.contributionCount ? run + 1 : 0; longest = Math.max(longest, run); }
let current = 0;
for (let i = days.length - 1; i >= 0; i--) {
  if (days[i].contributionCount) current++;
  else if (i !== days.length - 1) break;
}
const activeDays = days.filter((d) => d.contributionCount).length;

// Stats card.
const rows = [
  ["Contributions (last year)", cc.contributionCalendar.totalContributions],
  ["Commits", cc.totalCommitContributions],
  ["Pull requests opened", cc.totalPullRequestContributions],
  ["PRs merged (all time)", user.pullRequests.totalCount],
  ["Code reviews", cc.totalPullRequestReviewContributions],
  ["Private contributions", cc.restrictedContributionsCount],
  ["Public repos · stars", `${user.repositories.totalCount} · ${stars}`],
];
card("stats.svg", 460, 260, "GITHUB · LAST 12 MONTHS",
  rows.map(([k, v], i) => `<g class="f" style="animation-delay:${i * 0.08}s"><text x="24" y="${70 + i * 26}" fill="${DIM}" font-size="15">${esc(k)}</text><text x="436" y="${70 + i * 26}" text-anchor="end" fill="${BONE}" font-size="16">${esc(typeof v === "number" ? fmt(v) : v)}</text></g>`).join(""),
  rows.map((r) => r.join(": ")).join(". "));

// Streak card with a flame.
const flame = `<g transform="translate(46 64)"><path class="fl" d="M24 0C30 14 44 20 44 38C44 52 35 62 22 62C9 62 0 52 0 39C0 28 7 22 11 14C13 22 17 26 21 27C19 17 20 8 24 0Z" fill="${RED}"/>
<path class="fl" style="animation-delay:.3s" d="M22 30C26 38 32 41 32 49C32 56 27 60 22 60C16 60 12 56 12 50C12 45 15 42 17 38C18 42 20 44 22 44C21 39 21 35 22 30Z" fill="#f2b8a0"/></g>`;
const big = (x, n, l, c) => `<g class="u"><text x="${x}" y="110" text-anchor="middle" fill="${c}" font-size="44">${fmt(n)}</text><text x="${x}" y="142" text-anchor="middle" fill="${DIM}" font-size="13" letter-spacing="2">${l}</text></g>`;
card("streak.svg", 460, 190, "", flame + big(186, current, "DAY STREAK", RED) + big(296, longest, "LONGEST", BONE) + big(396, activeDays, "ACTIVE DAYS", BONE)
  + `<line x1="244" y1="74" x2="244" y2="144" stroke="${LINE}"/><line x1="348" y1="74" x2="348" y2="144" stroke="${LINE}"/>
<text x="46" y="170" fill="${DIM}" font-size="12" letter-spacing="2">LAST 12 MONTHS</text>`,
  `Current streak ${current} days, longest ${longest}, ${activeDays} active days in the last year`);

// Languages by bytes across public, non-fork repos: bar card, donut and the Mermaid pie.
const bytes = {};
for (const r of repos) for (const e of r.languages.edges) bytes[e.node.name] = (bytes[e.node.name] || 0) + e.size;
const total = Object.values(bytes).reduce((a, b) => a + b, 0) || 1;
const top = Object.entries(bytes).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, b]) => [n, (b / total) * 100]);
let x = 24;
const bar = top.map(([, p], i) => { const w = (p / 100) * 412; const r = `<rect class="g" style="animation-delay:${i * 0.08}s" x="${x.toFixed(1)}" y="64" width="${Math.max(w, 1).toFixed(1)}" height="14" fill="${SHADES[i]}"/>`; x += w; return r; }).join("");
const legend = top.map(([n, p], i) => `<g class="f" style="animation-delay:${0.3 + i * 0.06}s"><rect x="${24 + (i % 2) * 210}" y="${112 + Math.floor(i / 2) * 34}" width="10" height="10" fill="${SHADES[i]}"/><text x="${42 + (i % 2) * 210}" y="${121 + Math.floor(i / 2) * 34}" fill="${BONE}" font-size="15">${esc(n)} <tspan fill="${DIM}">${p.toFixed(1)}%</tspan></text></g>`).join("");
card("languages.svg", 460, 260, "TOP LANGUAGES · PUBLIC REPOS", bar + legend, top.map(([n, p]) => `${n} ${p.toFixed(1)}%`).join(", "));

{
  const cx = 130, cy = 140, R = 80, C = 2 * Math.PI * R;
  let acc = 0;
  const arcs = top.map(([, p], i) => {
    const len = (p / 100) * C;
    const a = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${SHADES[i]}" stroke-width="26" stroke-dasharray="${(len - 2).toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-acc).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})" class="f" style="animation-delay:${i * 0.12}s"/>`;
    acc += len;
    return a;
  }).join("");
  const leg = top.map(([n, p], i) => `<g class="u" style="animation-delay:${0.2 + i * 0.08}s"><rect x="260" y="${76 + i * 26}" width="12" height="12" fill="${SHADES[i]}"/><text x="282" y="${87 + i * 26}" fill="${BONE}" font-size="15">${esc(n)}</text><text x="436" y="${87 + i * 26}" text-anchor="end" fill="${DIM}" font-size="14">${p.toFixed(1)}%</text></g>`).join("");
  card("donut.svg", 460, 260, "LANGUAGES", `${arcs}<text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="${BONE}" font-size="26">${top.length}</text><text x="${cx}" y="${cy + 18}" text-anchor="middle" fill="${DIM}" font-size="11" letter-spacing="2">TOP</text>${leg}`,
    "Language donut: " + top.map(([n, p]) => `${n} ${p.toFixed(1)}%`).join(", "));
}

// Contribution heatmap in red.
{
  const s = 14, gap = 3, x0 = 46, y0 = 58;
  const max = Math.max(...days.map((d) => d.contributionCount), 1);
  const q = (n) => (n === 0 ? 0 : Math.min(4, 1 + Math.floor((Math.log(n) / Math.log(max + 1)) * 4)));
  let cells = "", months = "", last = "";
  weeks.forEach((w, wi) => {
    const m = new Date(w.contributionDays[0].date + "T00:00:00Z").toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    if (m !== last && wi < weeks.length - 2) { months += `<text x="${x0 + wi * (s + gap)}" y="${y0 - 10}" fill="${DIM}" font-size="11">${m}</text>`; last = m; }
    for (const d of w.contributionDays)
      cells += `<rect x="${x0 + wi * (s + gap)}" y="${y0 + d.weekday * (s + gap)}" width="${s}" height="${s}" fill="${SCALE[q(d.contributionCount)]}" class="f" style="animation-delay:${(wi * 0.012).toFixed(3)}s"><title>${d.date}: ${d.contributionCount}</title></rect>`;
  });
  const W = x0 + weeks.length * (s + gap) + 24;
  const days3 = ["Mon", "Wed", "Fri"].map((d, i) => `<text x="12" y="${y0 + (1 + i * 2) * (s + gap) + 11}" fill="${DIM}" font-size="11">${d}</text>`).join("");
  const key = SCALE.map((c, i) => `<rect x="${W - 24 - (5 - i) * 18}" y="${y0 + 7 * (s + gap) + 10}" width="14" height="14" fill="${c}"/>`).join("");
  card("heatmap.svg", W, y0 + 7 * (s + gap) + 40, "", `<text x="${x0}" y="26" fill="${BONE}" font-size="14" letter-spacing="3">${fmt(cc.contributionCalendar.totalContributions)} CONTRIBUTIONS · LAST 12 MONTHS</text>${months}${days3}${cells}${key}`,
    `${cc.contributionCalendar.totalContributions} contributions in the last year`);
}

// Weekly activity area chart.
{
  const W = 900, H = 240, x0 = 40, x1 = W - 24, y0 = 60, y1 = H - 40;
  const vals = weeks.map((w) => w.contributionDays.reduce((a, d) => a + d.contributionCount, 0));
  const max = Math.max(...vals, 1);
  const pts = vals.map((v, i) => [x0 + (i / (vals.length - 1)) * (x1 - x0), y1 - (v / max) * (y1 - y0)]);
  const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join("");
  const area = `${line}L${x1} ${y1}L${x0} ${y1}Z`;
  const len = pts.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
  const peak = vals.indexOf(max);
  const grid = [0.5, 1].map((t) => `<line x1="${x0}" x2="${x1}" y1="${y1 - t * (y1 - y0)}" y2="${y1 - t * (y1 - y0)}" stroke="${LINE}"/><text x="${x0 - 8}" y="${y1 - t * (y1 - y0) + 4}" text-anchor="end" fill="${DIM}" font-size="11">${fmt(max * t)}</text>`).join("");
  card("weekly.svg", W, H, "WEEKLY CONTRIBUTIONS · 52 WEEKS",
    `<defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${RED}" stop-opacity=".45"/><stop offset="1" stop-color="${RED}" stop-opacity="0"/></linearGradient></defs>
${grid}<line x1="${x0}" x2="${x1}" y1="${y1}" y2="${y1}" stroke="${DIM}"/><path d="${area}" fill="url(#a)" class="f" style="animation-delay:.6s"/>
<path d="${line}" fill="none" stroke="${RED}" stroke-width="2.5" stroke-linejoin="round" stroke-dasharray="${len.toFixed(0)}" stroke-dashoffset="${len.toFixed(0)}" class="d"/>
<circle cx="${pts[peak][0].toFixed(1)}" cy="${pts[peak][1].toFixed(1)}" r="5" fill="${BONE}" class="f" style="animation-delay:1.4s"/>
<text x="${Math.min(pts[peak][0], x1 - 120).toFixed(1)}" y="${(pts[peak][1] - 12).toFixed(1)}" fill="${BONE}" font-size="12" class="f" style="animation-delay:1.4s">peak ${fmt(max)} / week</text>
<text x="${x0}" y="${H - 16}" fill="${DIM}" font-size="11">${weeks[0].contributionDays[0].date}</text><text x="${x1}" y="${H - 16}" text-anchor="end" fill="${DIM}" font-size="11">this week</text>`,
    `Weekly contributions over the last 52 weeks, peak ${max} in a week`);
}

// Commit clock: commits by hour of day (Buenos Aires) across public repos over the last year.
{
  const since = new Date(Date.now() - 365 * 864e5).toISOString();
  const hours = new Array(24).fill(0);
  let n = 0;
  for (const r of repos.slice(0, 40)) {
    for (let page = 1; page <= 3; page++) {
      const list = await rest(`/repos/${USER}/${r.name}/commits?author=${USER}&since=${since}&per_page=100&page=${page}`).catch(() => []);
      for (const c of list) {
        const t = new Date(c.commit.author.date);
        hours[(t.getUTCHours() + 24 + TZ) % 24]++;
        n++;
      }
      if (list.length < 100) break;
    }
  }
  const cx = 150, cy = 160, r0 = 46, r1 = 116, max = Math.max(...hours, 1);
  const bars = hours.map((v, h) => {
    const a = ((h / 24) * 360 - 90) * (Math.PI / 180), a2 = (((h + 0.8) / 24) * 360 - 90) * (Math.PI / 180);
    const r = r0 + (v / max) * (r1 - r0);
    const p = (rr, aa) => `${(cx + rr * Math.cos(aa)).toFixed(1)} ${(cy + rr * Math.sin(aa)).toFixed(1)}`;
    return `<path d="M${p(r0, a)}L${p(r, a)}A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${p(r, a2)}L${p(r0, a2)}A${r0} ${r0} 0 0 0 ${p(r0, a)}Z" fill="${v === max ? RED : v ? "#7a2219" : "#1d1b18"}" class="f" style="animation-delay:${(h * 0.04).toFixed(2)}s"><title>${h}:00 · ${v} commits</title></path>`;
  }).join("");
  const ticks = [0, 6, 12, 18].map((h) => { const a = ((h / 24) * 360 - 90) * (Math.PI / 180); return `<text x="${(cx + (r1 + 16) * Math.cos(a)).toFixed(1)}" y="${(cy + (r1 + 16) * Math.sin(a) + 4).toFixed(1)}" text-anchor="middle" fill="${DIM}" font-size="12">${String(h).padStart(2, "0")}</text>`; }).join("");
  const peakH = hours.indexOf(max);
  const night = hours.slice(0, 6).reduce((a, b) => a + b, 0) + hours.slice(22).reduce((a, b) => a + b, 0);
  const work = hours.slice(9, 19).reduce((a, b) => a + b, 0);
  card("commit-clock.svg", 460, 300, "COMMIT CLOCK · BUENOS AIRES",
    `${bars}${ticks}<text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="${BONE}" font-size="13">${fmt(n)}</text><text x="${cx}" y="${cy + 18}" text-anchor="middle" fill="${DIM}" font-size="9" letter-spacing="1">COMMITS</text>
<g class="u" style="animation-delay:.5s"><text x="300" y="120" fill="${DIM}" font-size="12" letter-spacing="2">PEAK HOUR</text><text x="300" y="150" fill="${RED}" font-size="30">${String(peakH).padStart(2, "0")}:00</text>
<text x="300" y="190" fill="${DIM}" font-size="12" letter-spacing="2">09–19 H</text><text x="300" y="216" fill="${BONE}" font-size="20">${n ? Math.round((work / n) * 100) : 0}%</text>
<text x="380" y="190" fill="${DIM}" font-size="12" letter-spacing="2">NIGHT</text><text x="380" y="216" fill="${BONE}" font-size="20">${n ? Math.round((night / n) * 100) : 0}%</text></g>`,
    `Commits by hour in Buenos Aires: ${n} commits, peak at ${peakH}:00`);
}

// Contribution radar (log scale): commits, pull requests, reviews, issues, new repositories.
{
  const axes = [["Commits", cc.totalCommitContributions], ["PRs", cc.totalPullRequestContributions], ["Reviews", cc.totalPullRequestReviewContributions],
    ["Issues", cc.totalIssueContributions], ["Repos", cc.totalRepositoryContributions]];
  const cx = 230, cy = 170, R = 110, lg = (v) => Math.log10(v + 1) / 4;
  const pt = (i, r) => { const a = (-90 + (i * 360) / axes.length) * (Math.PI / 180); return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const ring = (t) => axes.map((_, i) => pt(i, R * t).map((v) => v.toFixed(1)).join(",")).join(" ");
  const shape = axes.map(([, v], i) => pt(i, R * Math.min(1, lg(v))).map((q) => q.toFixed(1)).join(",")).join(" ");
  const labels = axes.map(([k, v], i) => { const [lx, ly] = pt(i, R + 26); return `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" fill="${BONE}" font-size="13">${k}<tspan x="${lx.toFixed(1)}" dy="15" fill="${DIM}" font-size="12">${fmt(v)}</tspan></text>`; }).join("");
  card("radar.svg", 460, 330, "CONTRIBUTION MIX · LAST 12 MONTHS",
    [0.25, 0.5, 0.75, 1].map((t) => `<polygon points="${ring(t)}" fill="none" stroke="${LINE}"/>`).join("")
    + axes.map((_, i) => { const [ex, ey] = pt(i, R); return `<line x1="${cx}" y1="${cy}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="${LINE}"/>`; }).join("")
    + `<polygon points="${shape}" fill="${RED}" fill-opacity=".35" stroke="${RED}" stroke-width="2" class="f"/>${labels}`,
    "Contribution mix: " + axes.map(([k, v]) => `${k} ${v}`).join(", "));
}

// Currently building: the most recently pushed public repo and the latest PR.
{
  const latest = repos.find((r) => r.name !== USER) || repos[0];
  const events = await rest(`/users/${USER}/events/public?per_page=50`);
  let pr = null;
  for (const e of events) {
    if (e.type !== "PullRequestEvent") continue;
    const n = e.payload.number ?? e.payload.pull_request?.number;
    pr = await rest(`/repos/${e.repo.name}/pulls/${n}`).catch(() => null);
    if (pr) { pr.repoName = e.repo.name.split("/")[1]; break; }
  }
  const ago = (iso) => { const h = Math.round((Date.now() - new Date(iso)) / 36e5); return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`; };
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  card("building.svg", 900, 170, "",
    `<circle cx="38" cy="36" r="6" fill="${RED}"><animate attributeName="opacity" values="1;.25;1" dur="1.6s" repeatCount="indefinite"/></circle>
<text x="54" y="41" fill="${RED}" font-size="13" letter-spacing="3">CURRENTLY BUILDING</text>
<g class="u"><text x="32" y="88" fill="${BONE}" font-size="30">${esc(latest.name)}</text>
<text x="32" y="116" fill="${DIM}" font-size="14">${esc(clip(latest.description || "", 60))}</text>
<text x="32" y="146" fill="${DIM}" font-size="12" letter-spacing="1">${esc(latest.primaryLanguage?.name || "")} · pushed ${ago(latest.pushedAt)}</text></g>
<line x1="520" y1="28" x2="520" y2="146" stroke="${LINE}"/>
${pr ? `<g class="u" style="animation-delay:.2s"><text x="546" y="58" fill="${DIM}" font-size="12" letter-spacing="2">LATEST PULL REQUEST</text>
<text x="546" y="90" fill="${BONE}" font-size="16">${esc(clip(pr.title, 34))}</text>
<text x="546" y="116" fill="${DIM}" font-size="13">${esc(pr.repoName)} #${pr.number} · ${pr.merged_at ? "merged" : pr.state}</text></g>` : ""}`,
    `Currently building ${latest.name}${pr ? `; latest pull request: ${pr.title}` : ""}`);
}

// Featured repo cards with live stars, language and last push.
for (const name of FEATURED) {
  const r = repos.find((x) => x.name === name) || (await rest(`/repos/${USER}/${name}`).then((j) => ({ name: j.name, description: j.description, stargazerCount: j.stargazers_count, pushedAt: j.pushed_at, primaryLanguage: j.language ? { name: j.language } : null })).catch(() => null));
  if (!r) continue;
  const lines = [""];
  for (const w of (r.description || "").split(/\s+/)) { if ((lines.at(-1) + " " + w).trim().length > 46) lines.push(w); else lines[lines.length - 1] = (lines.at(-1) + " " + w).trim(); }
  const desc = lines.slice(0, 2).map((l, i) => `<text x="24" y="${92 + i * 20}" fill="${DIM}" font-size="13">${esc(l)}</text>`).join("");
  const star = `<path d="M0-7l2.1 4.3 4.7.7-3.4 3.3.8 4.7L0 3.8-4.2 6l.8-4.7L-6.8-2l4.7-.7z" fill="${BONE}"/>`;
  card(`repo-${name}.svg`, 420, 170, "",
    `<rect x="0" y="0" width="420" height="4" fill="${RED}" class="g"/>
<text x="24" y="40" fill="${DIM}" font-size="11" letter-spacing="3">REPOSITORY</text>
<text x="24" y="66" fill="${BONE}" font-size="22">${esc(r.name)}</text>${desc}
<circle cx="30" cy="146" r="6" fill="${RED}"/><text x="44" y="150" fill="${BONE}" font-size="13">${esc(r.primaryLanguage?.name || "—")}</text>
<g transform="translate(176 146)">${star}</g><text x="190" y="150" fill="${BONE}" font-size="13">${r.stargazerCount}</text>
<text x="396" y="150" text-anchor="end" fill="${DIM}" font-size="12">${new Date(r.pushedAt).toISOString().slice(0, 10)}</text>`,
    `${r.name}: ${r.description || ""}. ${r.stargazerCount} stars, ${r.primaryLanguage?.name || ""}`);
}

// npm downloads for the dev-kit tools (no token needed).
{
  const data = [];
  for (const p of NPM) {
    const d = await fetch(`https://api.npmjs.org/downloads/point/last-month/${p}`).then((r) => r.json()).catch(() => ({}));
    const t = await fetch(`https://api.npmjs.org/downloads/point/2015-01-01:${new Date().toISOString().slice(0, 10)}/${p}`).then((r) => r.json()).catch(() => ({}));
    const v = await fetch(`https://registry.npmjs.org/${p}/latest`).then((r) => r.json()).catch(() => ({}));
    data.push({ p, month: d.downloads ?? 0, total: t.downloads ?? 0, version: v.version || "—" });
  }
  card("npm.svg", 900, 190, "NPM · THE DEV-KIT TOOLS",
    data.map((d, i) => `<g class="u" style="animation-delay:${i * 0.12}s" transform="translate(${24 + i * 300} 0)">
<text x="0" y="74" fill="${BONE}" font-size="16">${esc(d.p)}</text><text x="0" y="94" fill="${DIM}" font-size="12">v${esc(d.version)}</text>
<text x="0" y="146" fill="${RED}" font-size="40">${short(d.total)}</text><text x="0" y="170" fill="${DIM}" font-size="11" letter-spacing="2">DOWNLOADS · ${short(d.month)} LAST 30 DAYS</text>
${i ? `<line x1="-14" y1="60" x2="-14" y2="170" stroke="${LINE}"/>` : ""}</g>`).join(""),
    data.map((d) => `${d.p} v${d.version}: ${d.total} downloads, ${d.month} in the last month`).join(". "));
}

// Milestone badges: hexagons with live counts.
{
  const years = Math.floor((Date.now() - new Date(user.createdAt)) / (365.25 * 864e5));
  const items = [[`${years}`, "YEARS ON GITHUB"], [short(user.pullRequests.totalCount), "PRS MERGED"], [short(cc.contributionCalendar.totalContributions), "CONTRIBUTIONS / YR"],
    [String(user.repositories.totalCount), "PUBLIC REPOS"], [String(NPM.length), "NPM PACKAGES"], [String(longest), "DAY STREAK"]];
  const hex = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i - Math.PI / 2; return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }).join(" ");
  card("milestones.svg", 900, 200, "",
    items.map(([v, l], i) => { const cx = 80 + i * 148; return `<g class="u" style="animation-delay:${i * 0.1}s"><polygon points="${hex(cx, 86, 58)}" fill="${PANEL}" stroke="${i % 2 ? BONE : RED}" stroke-width="2"/>
<polygon points="${hex(cx, 86, 48)}" fill="none" stroke="${LINE}"/><text x="${cx}" y="98" text-anchor="middle" fill="${i % 2 ? BONE : RED}" font-size="30">${esc(v)}</text>
<text x="${cx}" y="172" text-anchor="middle" fill="${DIM}" font-size="10" letter-spacing="1.5">${l}</text></g>`; }).join(""),
    items.map(([v, l]) => `${v} ${l.toLowerCase()}`).join(", "), { noBorder: true });
}

// Mermaid language pie between the live markers.
const pie = ["```mermaid", `%%{init: {"theme":"base","themeVariables":{"pie1":"${RED}","pie2":"${BONE}","pie3":"#b8ad97","pie4":"${DIM}","pie5":"#5c564b","pie6":"#3a3732","pieStrokeColor":"${INK}","pieOuterStrokeColor":"${INK}","pieTitleTextColor":"${DIM}","pieSectionTextColor":"${INK}","pieLegendTextColor":"${DIM}"}}}%%`,
  "pie showData title Bytes of code by language, public repos", ...top.map(([n, p]) => `  "${n}" : ${p.toFixed(1)}`), "```"].join("\n");
const readmePath = join(root, "README.md");
let readme = readFileSync(readmePath, "utf8");
readme = readme.replace(/(<!-- live:langs-pie -->)[\s\S]*?(<!-- \/live:langs-pie -->)/, `$1\n${pie}\n$2`);
writeFileSync(readmePath, readme);
console.log(`stats ok: ${cc.contributionCalendar.totalContributions} contributions, streak ${current}/${longest}`);
