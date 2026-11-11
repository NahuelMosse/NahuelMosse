// Fails when README.md or any committed SVG shows Spanish: accented letters (á é í ó ú ñ ¿ ¡) or common Spanish stopwords.
// Checks the visible text of each SVG (<text>, <tspan>, <title>, <desc>, aria-label) and the README with its alt texts.
// Proper names and the legal names of degrees are allowlisted in any case; the README shows each degree with an English gloss.
//   node scripts/check_english.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ALLOW = [
  "Analista en Informática", "Ingeniería en Informática", "Universidad de Morón", "Liceo Cultural Británico",
  "Frávega", "Jüsto",
];
const ACCENTS = /[áéíóúñ¿¡ÁÉÍÓÚÑ]/;
const STOPWORDS = / (de|la|el|para|con|que) /i;

function svgText(src) {
  const out = [];
  const body = src.replace(/<style[\s\S]*?<\/style>/g, "");
  for (const m of body.matchAll(/<(text|tspan|title|desc)\b[^>]*>([^<]*)/g)) out.push(m[2]);
  for (const m of body.matchAll(/aria-label="([^"]*)"/g)) out.push(m[1]);
  return out.join("\n");
}

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === ".git" || n === "node_modules") return [];
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const targets = [join(root, "README.md"), ...files(join(root, "assets")).filter((p) => p.endsWith(".svg"))];
const hits = [];
for (const file of targets) {
  const raw = readFileSync(file, "utf8");
  let text = decode(file.endsWith(".svg") ? svgText(raw) : raw);
  for (const a of ALLOW) text = text.replace(new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu"), " ");
  text.split("\n").forEach((line, i) => {
    const padded = ` ${line} `;
    if (ACCENTS.test(line) || STOPWORDS.test(padded)) hits.push(`${relative(root, file)}:${i + 1}: ${line.trim().slice(0, 140)}`);
  });
}
if (hits.length) {
  console.error(`Spanish found in ${hits.length} line(s):\n${hits.join("\n")}`);
  process.exit(1);
}
console.log(`English check passed: README.md and ${targets.length - 1} SVG files.`);
