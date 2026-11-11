// Live widgets of the profile README, redrawn daily by .github/workflows/profile.yml in the portfolio palette: the red
// contribution heatmap, the streak with its flame, the language donut, the featured repo cards (each with its image band
// from assets/cards/), npm downloads of the dev-kit tools and "currently building".
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

const INK = "#0c0c0b", BONE = "#ede4d0", RED = "#d2231b", DIM = "#8a8273", LINE = "#2a2824";
const SCALE = ["#1d1b18", "#4a1d17", "#7a2219", "#a8241b", RED];
const SHADES = [RED, BONE, "#b8ad97", DIM, "#5c564b", "#3a3732"];
const font = readFileSync(join(root, "fonts", "courier-prime-subset.woff2")).toString("base64");
const style = `@font-face{font-family:CP;src:url(data:font/woff2;base64,${font}) format("woff2")}text{font-family:CP,"Courier New",monospace}
@keyframes in{from{opacity:0}to{opacity:1}}.f{animation:in .6s ease-out both}
@keyframes up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}.u{animation:up .7s cubic-bezier(.16,1,.3,1) both}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}.g{transform-box:fill-box;transform-origin:left;animation:grow .9s cubic-bezier(.16,1,.3,1) both}
@keyframes flick{0%,100%{transform:scale(1)}50%{transform:scale(1.06,.94)}}.fl{transform-box:fill-box;transform-origin:bottom;animation:flick 1.4s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const short = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n));
const wrap = (t, n) => { const lines = [""]; for (const w of t.split(/\s+/)) { if ((lines.at(-1) + " " + w).trim().length > n) lines.push(w); else lines[lines.length - 1] = (lines.at(-1) + " " + w).trim(); } return lines; };

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

function card(name, w, h, title, inner, label) {
  const head = title ? `<rect x="24" y="22" width="10" height="10" fill="${RED}"/><text x="44" y="32" fill="${BONE}" font-size="14" letter-spacing="3">${esc(title)}</text>` : "";
  writeFileSync(join(out, name), `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">
<title>${esc(label)}</title><style>${style}</style><rect width="${w}" height="${h}" fill="${INK}"/><rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" fill="none" stroke="${LINE}"/>
${head}${inner}</svg>`);
}

const { user } = await gql(`query($login:String!){user(login:$login){
  contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount weekday}}}}
  repositories(ownerAffiliations:OWNER,isFork:false,first:100,privacy:PUBLIC,orderBy:{field:PUSHED_AT,direction:DESC}){nodes{
    name description stargazerCount pushedAt primaryLanguage{name}
    languages(first:8,orderBy:{field:SIZE,direction:DESC}){edges{size node{name}}}}}}}`, { login: USER });

const cal = user.contributionsCollection.contributionCalendar;
const weeks = cal.weeks;
const days = weeks.flatMap((w) => w.contributionDays);
const repos = user.repositories.nodes;

// Streak card with a flame; today without contributions does not break the current streak.
{
  let longest = 0, run = 0;
  for (const d of days) { run = d.contributionCount ? run + 1 : 0; longest = Math.max(longest, run); }
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].contributionCount) current++;
    else if (i !== days.length - 1) break;
  }
  const active = days.filter((d) => d.contributionCount).length;
  const flame = `<g transform="translate(46 94)"><path class="fl" d="M24 0C30 14 44 20 44 38C44 52 35 62 22 62C9 62 0 52 0 39C0 28 7 22 11 14C13 22 17 26 21 27C19 17 20 8 24 0Z" fill="${RED}"/>
<path class="fl" style="animation-delay:.3s" d="M22 30C26 38 32 41 32 49C32 56 27 60 22 60C16 60 12 56 12 50C12 45 15 42 17 38C18 42 20 44 22 44C21 39 21 35 22 30Z" fill="#f2b8a0"/></g>`;
  const big = (x, n, l, c) => `<g class="u"><text x="${x}" y="140" text-anchor="middle" fill="${c}" font-size="40">${fmt(n)}</text><text x="${x}" y="170" text-anchor="middle" fill="${DIM}" font-size="13" letter-spacing="2">${l}</text></g>`;
  card("streak.svg", 460, 260, "STREAK · LAST 12 MONTHS", flame + big(170, current, "CURRENT", RED) + big(276, longest, "LONGEST", BONE) + big(386, active, "ACTIVE DAYS", BONE)
    + `<line x1="223" y1="104" x2="223" y2="174" stroke="${LINE}"/><line x1="329" y1="104" x2="329" y2="174" stroke="${LINE}"/>`,
    `Current streak ${current} days, longest ${longest}, ${active} active days in the last year`);
}

// Language donut by bytes across public, non-fork repos.
{
  const bytes = {};
  for (const r of repos) for (const e of r.languages.edges) bytes[e.node.name] = (bytes[e.node.name] || 0) + e.size;
  const total = Object.values(bytes).reduce((a, b) => a + b, 0) || 1;
  const top = Object.entries(bytes).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, b]) => [n, (b / total) * 100]);
  const cx = 130, cy = 140, R = 80, C = 2 * Math.PI * R;
  let acc = 0;
  const arcs = top.map(([, p], i) => {
    const len = (p / 100) * C;
    const a = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${SHADES[i]}" stroke-width="26" stroke-dasharray="${(len - 2).toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-acc).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})" class="f" style="animation-delay:${i * 0.12}s"/>`;
    acc += len;
    return a;
  }).join("");
  const leg = top.map(([n, p], i) => `<g class="u" style="animation-delay:${0.2 + i * 0.08}s"><rect x="260" y="${76 + i * 26}" width="12" height="12" fill="${SHADES[i]}"/><text x="282" y="${87 + i * 26}" fill="${BONE}" font-size="15">${esc(n)}</text><text x="436" y="${87 + i * 26}" text-anchor="end" fill="${DIM}" font-size="14">${p.toFixed(1)}%</text></g>`).join("");
  card("donut.svg", 460, 260, "LANGUAGES · PUBLIC REPOS", `${arcs}<text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="${BONE}" font-size="26">${top.length}</text><text x="${cx}" y="${cy + 18}" text-anchor="middle" fill="${DIM}" font-size="11" letter-spacing="2">TOP</text>${leg}`,
    "Languages by code size: " + top.map(([n, p]) => `${n} ${p.toFixed(1)}%`).join(", "));
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
  const labels = ["Mon", "Wed", "Fri"].map((d, i) => `<text x="12" y="${y0 + (1 + i * 2) * (s + gap) + 11}" fill="${DIM}" font-size="11">${d}</text>`).join("");
  const key = SCALE.map((c, i) => `<rect x="${W - 24 - (5 - i) * 18}" y="${y0 + 7 * (s + gap) + 10}" width="14" height="14" fill="${c}"/>`).join("");
  card("heatmap.svg", W, y0 + 7 * (s + gap) + 40, "", `<text x="${x0}" y="26" fill="${BONE}" font-size="14" letter-spacing="3">${fmt(cal.totalContributions)} CONTRIBUTIONS · LAST 12 MONTHS</text>${months}${labels}${cells}${key}`,
    `${cal.totalContributions} contributions in the last year`);
}

// Featured repo cards: the image band from assets/cards/, then name, English description, language, stars and last push.
for (const name of FEATURED) {
  const r = repos.find((x) => x.name === name) || (await rest(`/repos/${USER}/${name}`).then((j) => ({ name: j.name, description: j.description, stargazerCount: j.stargazers_count, pushedAt: j.pushed_at, primaryLanguage: j.language ? { name: j.language } : null })).catch(() => null));
  if (!r) continue;
  const text = describe(name) || r.description || "";
  const lines = wrap(text, 52);
  if (lines.length > 2) lines[1] = lines[1].replace(/[\s—–-]*$/, "") + "…";
  const img = META[name]?.image && join(root, "assets", "cards", `${META[name].image}.webp`);
  const band = img && existsSync(img)
    ? `<image href="data:image/webp;base64,${readFileSync(img).toString("base64")}" x="1" y="1" width="438" height="168" preserveAspectRatio="xMidYMid slice"/>
<defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="${INK}" stop-opacity="0"/><stop offset="1" stop-color="${INK}"/></linearGradient></defs>
<rect x="1" y="1" width="438" height="168" fill="url(#fade)"/>`
    : `<rect x="1" y="1" width="438" height="168" fill="#141311"/>`;
  const star = `<path d="M0-7l2.1 4.3 4.7.7-3.4 3.3.8 4.7L0 3.8-4.2 6l.8-4.7L-6.8-2l4.7-.7z" fill="${BONE}"/>`;
  card(`repo-${name}.svg`, 440, 330, "",
    `${band}<rect x="0" y="168" width="440" height="3" fill="${RED}" class="g"/>
<text x="24" y="206" fill="${DIM}" font-size="11" letter-spacing="3">REPOSITORY</text>
<text x="24" y="234" fill="${BONE}" font-size="22">${esc(r.name)}</text>
${lines.slice(0, 2).map((l, i) => `<text x="24" y="${260 + i * 19}" fill="${DIM}" font-size="13">${esc(l)}</text>`).join("")}
<circle cx="30" cy="308" r="6" fill="${RED}"/><text x="44" y="312" fill="${BONE}" font-size="13">${esc(r.primaryLanguage?.name || "—")}</text>
<g transform="translate(186 308)">${star}</g><text x="200" y="312" fill="${BONE}" font-size="13">${r.stargazerCount}</text>
<text x="416" y="312" text-anchor="end" fill="${DIM}" font-size="12">${new Date(r.pushedAt).toISOString().slice(0, 10)}</text>`,
    `${r.name}: ${text} ${r.stargazerCount} stars, ${r.primaryLanguage?.name || ""}`);
}

// npm downloads of the dev-kit tools (no token needed).
{
  const data = [];
  for (const p of NPM) {
    const month = await fetch(`https://api.npmjs.org/downloads/point/last-month/${p}`).then((r) => r.json()).catch(() => ({}));
    const all = await fetch(`https://api.npmjs.org/downloads/point/2015-01-01:${new Date().toISOString().slice(0, 10)}/${p}`).then((r) => r.json()).catch(() => ({}));
    const v = await fetch(`https://registry.npmjs.org/${p}/latest`).then((r) => r.json()).catch(() => ({}));
    data.push({ p, month: month.downloads ?? 0, total: all.downloads ?? 0, version: v.version || "—" });
  }
  card("npm.svg", 900, 190, "NPM · THE DEV-KIT TOOLS",
    data.map((d, i) => `<g transform="translate(${24 + i * 300} 0)"><g class="u" style="animation-delay:${i * 0.12}s">
<text x="0" y="74" fill="${BONE}" font-size="16">${esc(d.p)}</text><text x="0" y="94" fill="${DIM}" font-size="12">v${esc(d.version)}</text>
<text x="0" y="146" fill="${RED}" font-size="40">${short(d.total)}</text><text x="0" y="170" fill="${DIM}" font-size="11" letter-spacing="2">${d.total === d.month ? "DOWNLOADS · LAST 30 DAYS" : `DOWNLOADS · ${short(d.month)} LAST 30 DAYS`}</text>
${i ? `<line x1="-14" y1="60" x2="-14" y2="170" stroke="${LINE}"/>` : ""}</g></g>`).join(""),
    data.map((d) => `${d.p} v${d.version}: ${d.total} downloads, ${d.month} in the last 30 days`).join(". "));
}

// Currently building: the most recently pushed public repo with an English description in data/repos.json, and the latest
// pull-request activity in such a repo. Raw PR and commit titles are never printed.
{
  const latest = repos.find((r) => r.name !== USER && describe(r.name));
  const events = await rest(`/users/${USER}/events/public?per_page=100`);
  const prEvent = events.find((e) => e.type === "PullRequestEvent" && describe(e.repo.name.split("/")[1]));
  const ago = (iso) => { const h = Math.round((Date.now() - new Date(iso)) / 36e5); return h < 1 ? "just now" : h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`; };
  if (latest) {
    const desc = wrap(describe(latest.name), 58).slice(0, 2).map((l, i) => `<text x="32" y="${116 + i * 18}" fill="${DIM}" font-size="14">${esc(l)}</text>`).join("");
    const prRepo = prEvent?.repo.name.split("/")[1];
    const prVerb = prEvent ? `Pull request ${prEvent.payload.action}` : "";
    card("building.svg", 900, 190, "",
      `<circle cx="38" cy="36" r="6" fill="${RED}"><animate attributeName="opacity" values="1;.25;1" dur="1.6s" repeatCount="indefinite"/></circle>
<text x="54" y="41" fill="${RED}" font-size="13" letter-spacing="3">CURRENTLY BUILDING</text>
<g class="u"><text x="32" y="88" fill="${BONE}" font-size="30">${esc(latest.name)}</text>${desc}
<text x="32" y="170" fill="${DIM}" font-size="12" letter-spacing="1">${esc(latest.primaryLanguage?.name || "")} · last push ${ago(latest.pushedAt)}</text></g>
<line x1="560" y1="28" x2="560" y2="166" stroke="${LINE}"/>
${prEvent ? `<g class="u" style="animation-delay:.2s"><text x="586" y="58" fill="${DIM}" font-size="12" letter-spacing="2">LATEST REVIEWABLE WORK</text>
<text x="586" y="92" fill="${BONE}" font-size="18">${esc(prVerb)}</text>
<text x="586" y="120" fill="${DIM}" font-size="14">${esc(prRepo)} · #${prEvent.payload.number ?? prEvent.payload.pull_request?.number}</text>
<text x="586" y="146" fill="${DIM}" font-size="13">${prEvent.created_at.slice(0, 10)}</text></g>` : ""}`,
      `Currently building ${latest.name}: ${describe(latest.name)}${prEvent ? ` ${prVerb} in ${prRepo} on ${prEvent.created_at.slice(0, 10)}.` : ""}`);
  }
}

console.log(`live widgets ok: ${cal.totalContributions} contributions`);
