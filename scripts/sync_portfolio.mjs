// Syncs data/portfolio.json from the portfolio and renders README.md from templates/README.md.
// The text is synced here; the art plates need the portfolio's fonts, so they are rebuilt locally with scripts/build_art.py.
//
//   node scripts/sync_portfolio.mjs --from ../Portfolio-d                 a local checkout (reads its content.ts; Node >= 22.18)
//   node scripts/sync_portfolio.mjs --from https://nawi.dev/portfolio.json  the deployed payload
//   node scripts/sync_portfolio.mjs                                         render README.md from the data as it is
//
// The deployed payload carries only the text fields (no stacks, titles, periods, groups or credits), so it can update the
// words of what the data already has, never add or drop an entry. A payload older than the data's is left alone.
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = new URL("../", import.meta.url);
const DATA = new URL("data/portfolio.json", ROOT);
const CV = new URL("data/cv.json", ROOT);
const TEMPLATE = new URL("templates/README.md", ROOT);
const README = new URL("README.md", ROOT);

const args = process.argv.slice(2);
const from = args[args.indexOf("--from") + 1] && args.includes("--from") ? args[args.indexOf("--from") + 1] : null;

const readJson = async (url) => JSON.parse(await readFile(url, "utf8"));
const semver = (v) => String(v ?? "0").split(".").map(Number);
const newer = (a, b) => {
  const [x, y] = [semver(a), semver(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0) ? 1 : -1;
  return 0;
};

// The CV is published from the checkout as a file of this repo, so the link does not depend on a branch of the portfolio.
const CV_PDF = new URL("cv/Nahuel-Mosse-CV.pdf", ROOT);

async function fromCheckout(dir) {
  await mkdir(new URL("cv/", ROOT), { recursive: true });
  await copyFile(join(dir, "cv/CV.pdf"), CV_PDF);
  const content = await import(pathToFileURL(join(dir, "features/portfolio/presentation/content.ts")).href);
  const machine = await readFile(join(dir, "lib/machine-readable.ts"), "utf8");
  const git = (...a) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8" }).trim();
  const { identity, projects, groups, experience, offer, credits } = content;
  return {
    source: {
      kind: "checkout",
      ref: `${git("rev-parse", "--abbrev-ref", "HEAD")}@${git("rev-parse", "--short", "HEAD")}`,
      payloadVersion: machine.match(/version: "([\d.]+)"/)?.[1] ?? "0.0.0",
      syncedAt: new Date().toISOString(),
    },
    site: { url: machine.match(/NEXT_PUBLIC_SITE_URL \|\| "([^"]+)"/)?.[1] },
    identity: { ...identity, location: `${identity.base}, Argentina` },
    groups,
    projects: projects.map(({ id, name, what, problem, role, line, stack, links, pieces }) => ({
      id,
      name,
      what,
      problem,
      role,
      line,
      stack,
      links,
      pieces: pieces.map((p) => ({ frame: p.frame, file: (p.poster ?? p.src).split("/").pop(), alt: p.alt })),
    })),
    experience: experience.map(({ id, name, title, period, current = false, what, problem, role }) => ({ id, name, title, period, current, what, problem, role })),
    offer: Object.fromEntries(Object.entries(offer).map(([k, v]) => [k, { ...v, href: content.doorHref(v) }])),
    credits: { studies: credits.studies.map((c) => c.text), certifications: credits.certifications.map((c) => c.text) },
  };
}

function fromPayload(data, payload, url) {
  const byId = (list) => new Map(list.map((x) => [x.id, x]));
  const fresh = { projects: byId(payload.projects ?? []), experience: byId(payload.experience ?? []) };
  for (const kind of ["projects", "experience"]) {
    const known = new Set(data[kind].map((x) => x.id));
    const added = [...fresh[kind].keys()].filter((id) => !known.has(id));
    const dropped = [...known].filter((id) => !fresh[kind].has(id));
    if (added.length || dropped.length)
      console.warn(`${kind}: the deployed site added [${added}] and dropped [${dropped}]; sync from a checkout to take them`);
    for (const entry of data[kind]) Object.assign(entry, pick(fresh[kind].get(entry.id), ["name", "what", "problem", "role", "links"]));
  }
  for (const card of Object.values(data.offer)) Object.assign(card, pick(payload.offer?.find((o) => o.title === card.title), ["line"]));
  const p = payload.profile ?? {};
  Object.assign(data.identity, pick({ role: p.role, promise: p.summary, email: p.email, location: p.location, linkedin: p.links?.linkedin, github: p.links?.github }, ["role", "promise", "email", "location", "linkedin", "github"]));
  data.source = { kind: "deployed", ref: url, payloadVersion: payload.version, syncedAt: new Date().toISOString() };
  return data;
}

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj?.[k] != null).map((k) => [k, obj[k]]));

let data = await readJson(DATA).catch(() => null);
if (from && /^https?:/.test(from)) {
  const res = await fetch(from, { redirect: "follow" });
  if (!res.ok) throw new Error(`${from}: HTTP ${res.status}`);
  const payload = await res.json();
  if (!data) throw new Error("No data/portfolio.json yet: sync once from a checkout");
  if (newer(payload.version, data.source.payloadVersion) < 0) {
    console.log(`${res.url} serves payload ${payload.version}, older than the data's ${data.source.payloadVersion}: text left as it is`);
  } else {
    data = fromPayload(data, payload, res.url);
    console.log(`synced text from ${res.url} (payload ${payload.version})`);
  }
} else if (from) {
  data = await fromCheckout(resolve(from));
  console.log(`synced from ${from} (${data.source.ref}, payload ${data.source.payloadVersion})`);
}
if (!data) throw new Error("No data/portfolio.json: pass --from <checkout>");
await writeFile(DATA, JSON.stringify(data, null, 2) + "\n");

// ---------- README ----------

const cv = await readJson(CV);
const md = (s) => String(s).replace(/\|/g, "\|");
const short = (period) => period.replace(/\s*–\s*Present/i, "–present").replace(/\s*–\s*/, "–");

// Whole years since the earliest start date in the experience, as the site states its periods (MM/YYYY).
function experienceYears(now = new Date()) {
  const starts = data.experience.map((e) => e.period.match(/(\d{2})\/(\d{4})/)).filter(Boolean);
  const [, m, y] = starts.sort((a, b) => a[2] - b[2] || a[1] - b[1])[0];
  const months = (now.getUTCFullYear() - Number(y)) * 12 + (now.getUTCMonth() + 1 - Number(m));
  return { years: Math.floor(months / 12), since: `${m}/${y}` };
}

// The site's studies, each with its Spanish name where it has one, and the degree in progress; school diplomas left out.
function studies() {
  const [first] = data.credits.studies;
  const [title, school, year] = first.split(" · ");
  return [`${cv.localNames[title] ?? title} · ${school} · ${year}`, ...cv.inProgress.map((s) => s.replace(/^.*\((.*)\)(.*)$/, "$1$2"))];
}

// A selected entry is a project id, or a group id that stands for all its projects in one cell.
function workCell(key) {
  const group = data.groups.find((g) => g.id === key);
  const thumb = `<img src="assets/thumbs/${key}.webp" alt="" width="240">`;
  if (group) {
    const items = group.projects.map((id) => data.projects.find((p) => p.id === id));
    const names = items.map((p) => `<a href="${p.links.find((l) => l.label === "GitHub")?.href ?? p.links[0]?.href}">${p.name}</a>`).join(" · ");
    return `${thumb}<br><b>${group.label}</b>: ${names}<br><sub>${group.line}</sub>`;
  }
  const p = data.projects.find((x) => x.id === key);
  const link = p.links[0] ? ` · <a href="${p.links[0].href}">${p.links[0].label}</a>` : "";
  return `${thumb}<br><b>${p.name}</b>${link}<br><sub>${p.what}</sub>`;
}

// Three cells a row, each a thumbnail over its name and one line, so GitHub keeps the thumbnails at their width.
function workGrid(columns = 3) {
  const rows = [];
  for (let i = 0; i < cv.selectedWork.length; i += columns) rows.push(cv.selectedWork.slice(i, i + columns));
  const cell = (key) => `    <td width="33%" valign="top">${workCell(key)}</td>`;
  const tr = (row) => ["  <tr>", ...row.map(cell), "  </tr>"].join("\n");
  return ["<table>", ...rows.map(tr), "</table>"].join("\n");
}

const blocks = {
  site: () => data.site.url,
  banner_alt: () => `${data.identity.mark}. ${data.identity.professionalName}, ${data.identity.base}. ${data.identity.promise} ${cv.currentRole}.`.replace(/"/g, "&quot;"),
  links() {
    const { email, linkedin } = data.identity;
    const a = (href, label) => `<a href="${href}">${label}</a>`;
    return [a(data.site.url, "Portfolio"), a(linkedin, "LinkedIn"), a(`mailto:${email}`, "Email"), a(cv.url, `CV (PDF, ${cv.language})`)].join(" · ");
  },
  glance() {
    const { years, since } = experienceYears();
    const rows = [
      ["Role now", cv.currentRole],
      ["Target role", data.offer.tpm.title],
      ["Experience", `${years}+ years, since ${since}`],
      ["Based in", data.identity.location],
      ["Languages", cv.languages.join(" · ")],
      ["Studies", studies().join("<br>")],
      ["Focus", data.offer.tpm.line.replace(/^For companies:\s*/, "").replace(/^./, (c) => c.toUpperCase())],
    ];
    return ["| | |", "|---|---|", ...rows.map(([k, v]) => `| **${k}** | ${md(v)} |`)].join("\n");
  },
  impact: () => cv.impact.map((r) => `- **${r.where}:** ${r.result}`).join("\n"),
  work: () => workGrid(),
  experience() {
    // every employer on the site is a Kovix Consulting engagement: the CV lists them as its projects
    const line = (e) => `${e.name} (${e.title}, ${short(e.period)})`;
    const now = data.experience.filter((e) => e.current).map(line).join(" · ");
    const before = data.experience.filter((e) => !e.current).map(line).join(" · ");
    return [`- **${cv.currentRole}**, client engagements: ${now}`, `- **Earlier Kovix engagements:** ${before}`].join("\n");
  },
  stack: () => cv.skills.map((s) => `**${s.area}** ${s.items.join(", ")}`).join(" · "),
  footer() {
    const u = data.site.url;
    return `Off duty: ${cv.offDuty}. · Machine-readable: [portfolio.json](${u}/portfolio.json) · [llms.txt](${u}/llms.txt)`;
  },
};

const template = await readFile(TEMPLATE, "utf8");
const readme = template.replace(/\{\{(\w+)\}\}/g, (_, name) => {
  if (!blocks[name]) throw new Error(`templates/README.md names an unknown block: ${name}`);
  return blocks[name]();
});
await writeFile(README, readme);
console.log(`README.md rendered (${data.source.kind} ${data.source.ref})`);
