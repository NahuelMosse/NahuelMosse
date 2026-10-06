// Scrapes the public contribution calendar (the same HTML fragment the profile page loads,
// no token needed) and writes data/contributions.json with days and derived stats.
import { mkdir, writeFile } from "node:fs/promises";

const USER = process.env.GH_USER ?? "NahuelMosse";
const OUT = new URL("../data/contributions.json", import.meta.url);

const res = await fetch(`https://github.com/users/${USER}/contributions`, {
  headers: { "User-Agent": `${USER}-profile-readme` },
});
if (!res.ok) throw new Error(`contributions fetch failed: HTTP ${res.status}`);
const html = await res.text();

const attr = (tag, name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];

// Counts live in <tool-tip for="cell-id">N contributions on …</tool-tip>, keyed by cell id.
const counts = new Map();
for (const [, id, text] of html.matchAll(/<tool-tip[^>]*\bfor="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
  const n = text.match(/^([\d,]+) contributions?/);
  counts.set(id, n ? Number(n[1].replace(/,/g, "")) : 0);
}

const days = [];
for (const [tag] of html.matchAll(/<td[^>]*\bdata-date="[^"]+"[^>]*>/g)) {
  days.push({
    date: attr(tag, "data-date"),
    level: Number(attr(tag, "data-level")),
    count: counts.get(attr(tag, "id")) ?? 0,
  });
}
if (days.length < 300) throw new Error(`parsed only ${days.length} days; markup changed?`);
days.sort((a, b) => a.date.localeCompare(b.date));

const totalMatch = html.replace(/\s+/g, " ").match(/([\d,]+) contributions? in the last year/);
const total = totalMatch
  ? Number(totalMatch[1].replace(/,/g, ""))
  : days.reduce((s, d) => s + d.count, 0);

let longest = 0;
let run = 0;
for (const d of days) {
  run = d.count > 0 ? run + 1 : 0;
  longest = Math.max(longest, run);
}
// Today's cell may still be empty early in the day; don't let it break the current streak.
let current = 0;
for (let i = days.length - 1; i >= 0; i--) {
  if (days[i].count > 0) current++;
  else if (i === days.length - 1) continue;
  else break;
}
const best = days.reduce((a, b) => (b.count > a.count ? b : a));

const data = {
  user: USER,
  fetchedAt: new Date().toISOString(),
  total,
  activeDays: days.filter((d) => d.count > 0).length,
  streak: { current, longest },
  bestDay: { date: best.date, count: best.count },
  days,
};

await mkdir(new URL("../data/", import.meta.url), { recursive: true });
await writeFile(OUT, JSON.stringify(data, null, 2) + "\n");
console.log(
  `${days.length} days · ${total} contributions · streak ${current}/${longest} · best ${best.count} on ${best.date}`,
);
