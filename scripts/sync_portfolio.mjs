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
import { readFile, writeFile } from "node:fs/promises";
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

async function fromCheckout(dir) {
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

const repos = await readJson(new URL("data/repos.json", ROOT));
// One image per GitHub theme: assets/<dir>/<name>.dark.svg and .light.svg, picked by the reader's color scheme.
const pic = (path, alt, width = "100%") =>
  `<picture><source media="(prefers-color-scheme: dark)" srcset="${path}.dark.svg"><img src="${path}.light.svg" alt="${alt.replace(/"/g, "&quot;")}" width="${width}"></picture>`;

const blocks = {
  site: () => data.site.url,
  banner: () => `<a href="${data.site.url}">${pic("assets/static/banner", `${data.identity.mark}. ${data.identity.professionalName}, ${data.identity.base}. ${data.identity.promise} ${cv.currentRole}.`)}</a>`,
  links() {
    const { linkedin } = data.identity;
    const email = cv.email ?? data.identity.email;
    return [
      `<a href="${data.site.url}">${pic("assets/static/link-portfolio", "Portfolio", "23%")}</a>`,
      `<a href="${linkedin}">${pic("assets/static/link-linkedin", "LinkedIn", "23%")}</a>`,
      `<a href="mailto:${email}">${pic("assets/static/link-email", "Email", "23%")}</a>`,
      pic("assets/live/views", "Profile views", "23%"),
      // komarev.com counts each view through this invisible pixel; scripts/live.mjs draws the number in the chip daily.
      `<img src="https://komarev.com/ghpvc/?username=${data.identity.github?.split("/").pop() ?? "NahuelMosse"}&style=pixel" width="1" height="1" alt="">`,
    ].join("\n");
  },
  // The featured repos, three to a row: their animated previews (assets/previews/, built by scripts/build_previews.py),
  // then their cards, drawn daily by scripts/live.mjs; each links to its repository.
  repo_cards() {
    const owner = data.identity.github?.split("/").pop() ?? "NahuelMosse";
    const href = (name) => `https://github.com/${owner}/${name}`;
    const preview = (name) => `<a href="${href(name)}"><img src="assets/previews/${name}.webp" alt="${name}, moving" width="32%"></a>`;
    const card = (name) => `<a href="${href(name)}">${pic(`assets/live/repo-${name}`, `${name}: ${repos.repos[name]?.description ?? ""}`, "32%")}</a>`;
    return `<p align="center">\n${repos.featured.map(preview).join("\n")}\n<br>\n${repos.featured.map(card).join("\n")}\n</p>`;
  },
  // The dev-kit tools, one row of three cards (drawn daily by scripts/live.mjs) linking to GitHub.
  tool_cards() {
    const owner = data.identity.github?.split("/").pop() ?? "NahuelMosse";
    const card = (p) => `<a href="https://github.com/${owner}/${p}">${pic(`assets/live/tool-${p}`, `${p}: ${repos.repos[p]?.description ?? ""}`, "32%")}</a>`;
    return `<p align="center">\n${repos.npm.map(card).join("\n")}\n</p>`;
  },
  // npm: the all-time counter links to the maintainer's npm profile, and each package's counts to its npm page.
  npm() {
    const total = `<a href="https://www.npmjs.com/~nahuelmosse">${pic("assets/live/npm", "npm downloads of the dev-kit tools since publication and in the last 7 days", "100%")}</a>`;
    const card = (p) => `<a href="https://www.npmjs.com/package/${p}">${pic(`assets/live/npm-${p}`, `${p} on npm`, "32%")}</a>`;
    return `${total}\n\n<p align="center">\n${repos.npm.map(card).join("\n")}\n</p>`;
  },
};

const cv = await readJson(CV);
const template = await readFile(TEMPLATE, "utf8");
const readme = template.replace(/\{\{(\w+)\}\}/g, (_, name) => {
  if (!blocks[name]) throw new Error(`templates/README.md names an unknown block: ${name}`);
  return blocks[name]();
});
await writeFile(README, readme);
console.log(`README.md rendered (${data.source.kind} ${data.source.ref})`);
