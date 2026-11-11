// Builds the catalog's hand-made SVGs: the typing terminal hero and the stack icon row.
// Run with `node scripts/catalog/build_local.mjs`; it needs network access for the Simple Icons paths.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = join(root, "assets", "catalog", "local");
mkdirSync(out, { recursive: true });

const INK = "#0c0c0b";
const BONE = "#ede4d0";
const RED = "#d2231b";
const DIM = "#8a8273";
const font = readFileSync(join(root, "fonts", "courier-prime-subset.woff2")).toString("base64");
const fontFace = `@font-face{font-family:CP;src:url(data:font/woff2;base64,${font}) format("woff2")}`;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Typing hero: each tagline is typed, held, and erased in turn, with a block cursor that follows the text.
function hero() {
  const W = 1200, H = 300, size = 30, adv = size * 0.6, x0 = 64, y0 = 196;
  const lines = [
    "Technical Lead at Kovix Consulting",
    "heading into Technical Project Management",
    "teams that ship with AI, under human review",
    "still writing code: Node, TypeScript, Flutter",
  ];
  const slot = 5, cycle = slot * lines.length;
  const pct = (t) => ((t / cycle) * 100).toFixed(3) + "%";
  let css = "", body = "";
  lines.forEach((line, i) => {
    const w = (line.length + 1) * adv, s = i * slot;
    const typeEnd = s + Math.min(2.4, line.length * 0.06), hold = s + slot - 0.9, gone = s + slot - 0.4;
    const k = [
      [0, 0], [s, 0], [typeEnd, w], [hold, w], [gone, 0], [cycle, 0],
    ].filter(([t], j, a) => j === 0 || t > a[j - 1][0]);
    css += `@keyframes m${i}{${k.map(([t, v]) => `${pct(t)}{width:${v.toFixed(1)}px}`).join("")}}`;
    css += `@keyframes c${i}{${k.map(([t, v]) => `${pct(t)}{transform:translateX(${(v - adv).toFixed(1)}px)}`).join("")}}`;
    css += `@keyframes v${i}{0%{opacity:0}${pct(s)}{opacity:1}${pct(gone)}{opacity:0}100%{opacity:0}}`;
    css += `.m${i}{animation:m${i} ${cycle}s linear infinite}.c${i}{animation:c${i} ${cycle}s linear infinite,v${i} ${cycle}s steps(1,end) infinite}`;
    body += `<clipPath id="k${i}"><rect class="m${i}" x="${x0}" y="${y0 - size}" width="0" height="${size * 1.4}"/></clipPath>`;
    body += `<text x="${x0}" y="${y0}" clip-path="url(#k${i})" class="t">${esc(line)}</text>`;
    body += `<rect class="c${i}" x="${x0}" y="${y0 - size * 0.8}" width="${adv}" height="${size}" fill="${RED}" opacity="0"/>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="NAWI. ${lines.join(". ")}.">
<style>${fontFace}text{font-family:CP,"Courier New",monospace}.t{fill:${BONE};font-size:${size}px}${css}
@keyframes blink{50%{opacity:0}}.bl{animation:blink 1s steps(1) infinite}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>
<rect width="${W}" height="${H}" fill="${INK}"/>
<rect x="0" y="0" width="${W}" height="36" fill="#161513"/>
<circle cx="24" cy="18" r="6" fill="${RED}"/><circle cx="44" cy="18" r="6" fill="#3a3732"/><circle cx="64" cy="18" r="6" fill="#3a3732"/>
<text x="${W / 2}" y="23" text-anchor="middle" fill="${DIM}" font-size="13" letter-spacing="2">nawi@buenos-aires: ~</text>
<text x="${x0}" y="104" fill="${RED}" font-size="15" letter-spacing="3">CASE FILE 001 · NAHUEL MOSSE</text>
<text x="${x0}" y="146" fill="${DIM}" font-size="22">$ whoami</text>
${body}
<text x="${x0}" y="258" fill="${DIM}" font-size="15" letter-spacing="1">nawi.dev · github.com/NahuelMosse · linkedin.com/in/nahuelmosse</text>
</svg>`;
  writeFileSync(join(out, "hero-typing.svg"), svg);
}

// Stack row: Simple Icons paths drawn in bone on ink tiles, labelled in Courier.
async function stack() {
  const items = [
    ["nodedotjs", "Node.js"], ["nestjs", "NestJS"], ["typescript", "TypeScript"], ["react", "React"],
    ["nextdotjs", "Next.js"], ["angular", "Angular"], ["flutter", "Flutter"], ["postgresql", "PostgreSQL"],
    ["prisma", "Prisma"], ["redis", "Redis"], ["docker", "Docker"], ["kubernetes", "Kubernetes"],
    ["terraform", "Terraform"], ["jest", "Jest"], ["claude", "Claude Code"], ["tailwindcss", "Tailwind"],
  ];
  const got = [];
  for (const [slug, label] of items) {
    const r = await fetch(`https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/${slug}.svg`);
    if (!r.ok) { console.warn("missing icon", slug); continue; }
    const d = (await r.text()).match(/ d="([^"]+)"/)?.[1];
    if (d) got.push([d, label]);
  }
  const per = 8, cw = 136, ch = 112, W = per * cw, H = Math.ceil(got.length / per) * ch;
  const tiles = got.map(([d, label], i) => {
    const x = (i % per) * cw, y = Math.floor(i / per) * ch;
    return `<g class="tile" style="animation-delay:${(i * 0.06).toFixed(2)}s"><rect x="${x + 6}" y="${y + 6}" width="${cw - 12}" height="${ch - 12}" fill="#161513" stroke="#2a2824"/>
<g transform="translate(${x + cw / 2 - 18} ${y + 22}) scale(1.5)"><path d="${d}" fill="${BONE}"/></g>
<text x="${x + cw / 2}" y="${y + ch - 20}" text-anchor="middle" font-size="13" fill="${DIM}">${esc(label)}</text></g>`;
  }).join("");
  writeFileSync(join(out, "stack-icons.svg"), `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Stack: ${got.map((g) => g[1]).join(", ")}">
<style>${fontFace}text{font-family:CP,"Courier New",monospace}
@keyframes in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.tile{animation:in .5s cubic-bezier(.16,1,.3,1) both}
.tile:hover rect{stroke:${RED}}@media (prefers-reduced-motion:reduce){.tile{animation:none}}</style>
<rect width="${W}" height="${H}" fill="${INK}"/>${tiles}</svg>`);
  return got.length;
}

hero();
console.log("stack icons:", await stack());
