// Self-hosted GitHub stats for the catalog: stats, streak and top-language cards as SVG, plus the live README blocks
// (recent activity and a Mermaid language pie) written between their <!-- live:* --> markers.
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

const INK = "#0c0c0b", BONE = "#ede4d0", RED = "#d2231b", DIM = "#8a8273", LINE = "#2a2824";
const font = readFileSync(join(root, "fonts", "courier-prime-subset.woff2")).toString("base64");
const style = `@font-face{font-family:CP;src:url(data:font/woff2;base64,${font}) format("woff2")}text{font-family:CP,"Courier New",monospace}
@keyframes in{from{opacity:0}to{opacity:1}}.f{animation:in .6s ease-out both}@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.g{transform-box:fill-box;transform-origin:left;animation:grow .9s cubic-bezier(.16,1,.3,1) both}@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (n) => n.toLocaleString("en-US");

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
  createdAt followers{totalCount}
  pullRequests(states:MERGED){totalCount}
  contributionsCollection{totalCommitContributions totalPullRequestContributions totalIssueContributions
    totalPullRequestReviewContributions restrictedContributionsCount
    contributionCalendar{totalContributions weeks{contributionDays{date contributionCount}}}}
  repositories(ownerAffiliations:OWNER,isFork:false,first:100,privacy:PUBLIC){totalCount nodes{name stargazerCount
    languages(first:8,orderBy:{field:SIZE,direction:DESC}){edges{size node{name}}}}}}}`, { login: USER });

const cc = user.contributionsCollection;
const days = cc.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
const stars = user.repositories.nodes.reduce((a, r) => a + r.stargazerCount, 0);

// Streaks over the last year; today without contributions does not break the current streak.
let longest = 0, run = 0;
for (const d of days) { run = d.contributionCount ? run + 1 : 0; longest = Math.max(longest, run); }
let current = 0;
for (let i = days.length - 1; i >= 0; i--) {
  if (days[i].contributionCount) current++;
  else if (i !== days.length - 1) break;
}
const activeDays = days.filter((d) => d.contributionCount).length;

function card(name, w, h, title, inner, label) {
  writeFileSync(join(out, name), `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">
<style>${style}</style><rect width="${w}" height="${h}" fill="${INK}"/><rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" fill="none" stroke="${LINE}"/>
<rect x="24" y="22" width="10" height="10" fill="${RED}"/><text x="44" y="32" fill="${BONE}" font-size="14" letter-spacing="3">${esc(title)}</text>${inner}</svg>`);
}

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

// Streak card.
const big = (x, n, l, c) => `<g class="f"><text x="${x}" y="118" text-anchor="middle" fill="${c}" font-size="44">${fmt(n)}</text><text x="${x}" y="150" text-anchor="middle" fill="${DIM}" font-size="13" letter-spacing="2">${l}</text></g>`;
card("streak.svg", 460, 190, "STREAK", big(80, current, "CURRENT", RED) + big(230, longest, "LONGEST", BONE) + big(380, activeDays, "ACTIVE DAYS", BONE)
  + `<line x1="155" y1="80" x2="155" y2="150" stroke="${LINE}"/><line x1="305" y1="80" x2="305" y2="150" stroke="${LINE}"/>`,
  `Current streak ${current} days, longest ${longest}, ${activeDays} active days in the last year`);

// Top languages by bytes across public, non-fork repos.
const bytes = {};
for (const r of user.repositories.nodes) for (const e of r.languages.edges) bytes[e.node.name] = (bytes[e.node.name] || 0) + e.size;
const total = Object.values(bytes).reduce((a, b) => a + b, 0) || 1;
const top = Object.entries(bytes).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, b]) => [n, (b / total) * 100]);
const shades = [RED, BONE, "#b8ad97", DIM, "#5c564b", "#3a3732"];
let x = 24;
const bar = top.map(([n, p], i) => { const w = (p / 100) * 412; const r = `<rect class="g" style="animation-delay:${i * 0.08}s" x="${x.toFixed(1)}" y="56" width="${Math.max(w, 1).toFixed(1)}" height="12" fill="${shades[i]}"/>`; x += w; return r; }).join("");
const legend = top.map(([n, p], i) => `<g class="f" style="animation-delay:${0.3 + i * 0.06}s"><rect x="${24 + (i % 2) * 210}" y="${92 + Math.floor(i / 2) * 26}" width="10" height="10" fill="${shades[i]}"/><text x="${42 + (i % 2) * 210}" y="${101 + Math.floor(i / 2) * 26}" fill="${BONE}" font-size="14">${esc(n)} <tspan fill="${DIM}">${p.toFixed(1)}%</tspan></text></g>`).join("");
card("languages.svg", 460, 190, "TOP LANGUAGES · PUBLIC REPOS", bar + legend, top.map(([n, p]) => `${n} ${p.toFixed(1)}%`).join(", "));

// Live README blocks.
const events = await rest(`/users/${USER}/events/public?per_page=100`);
// The events API trims PR payloads, so titles and merge state come from the pulls endpoint.
const seen = new Set();
const perRepo = {};
const activity = [];
for (const e of events) {
  const repo = e.repo.name, url = `https://github.com/${repo}`;
  if ((perRepo[repo] || 0) >= 2) continue;
  let line = null;
  if (e.type === "PullRequestEvent" && ["opened", "closed"].includes(e.payload.action)) {
    const n = e.payload.number ?? e.payload.pull_request?.number;
    const pr = await rest(`/repos/${repo}/pulls/${n}`).catch(() => null);
    const verb = e.payload.action === "closed" ? (pr?.merged_at ? "Merged" : null) : "Opened";
    if (pr && verb) line = `${verb} PR [#${n}](${pr.html_url}) in [${repo}](${url}): ${pr.title}`;
  } else if (e.type === "ReleaseEvent") {
    line = `Released [${e.payload.release.tag_name}](${e.payload.release.html_url}) of [${repo}](${url})`;
  } else if (e.type === "CreateEvent" && e.payload.ref_type === "repository") {
    line = `Created [${repo}](${url})`;
  } else if (e.type === "PushEvent") {
    const n = e.payload.size ?? e.payload.commits?.length ?? 0;
    if (n) line = `Pushed ${n} commit${n > 1 ? "s" : ""} to [${repo}](${url})`;
  }
  if (line && !seen.has(line)) { seen.add(line); perRepo[repo] = (perRepo[repo] || 0) + 1; activity.push(`${e.created_at.slice(0, 10)} · ${line}`); }
  if (activity.length === 6) break;
}
const pie = ["```mermaid", `%%{init: {"theme":"base","themeVariables":{"pie1":"${RED}","pie2":"${BONE}","pie3":"#b8ad97","pie4":"${DIM}","pie5":"#5c564b","pie6":"#3a3732","pieStrokeColor":"${INK}","pieOuterStrokeColor":"${INK}","pieTitleTextColor":"${DIM}","pieSectionTextColor":"${INK}","pieLegendTextColor":"${DIM}"}}}%%`,
  "pie showData title Bytes of code by language, public repos", ...top.map(([n, p]) => `  "${n}" : ${p.toFixed(1)}`), "```"].join("\n");

const readmePath = join(root, "README.md");
let readme = readFileSync(readmePath, "utf8");
const put = (key, body) => {
  readme = readme.replace(new RegExp(`(<!-- live:${key} -->)[\\s\\S]*?(<!-- /live:${key} -->)`), `$1\n${body}\n$2`);
};
put("activity", activity.length ? activity.map((a) => `- ${a}`).join("\n") : "- No public activity in the last 90 days.");
put("langs-pie", pie);
writeFileSync(readmePath, readme);
console.log(`stats ok: ${cc.contributionCalendar.totalContributions} contributions, streak ${current}/${longest}, ${activity.length} activity lines`);
