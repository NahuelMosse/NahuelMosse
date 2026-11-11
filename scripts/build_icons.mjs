// Builds the stack icon row (assets/static/stack-icons.svg): Simple Icons paths in bone on ink tiles, labelled in Courier.
// Run with `node scripts/build_icons.mjs`; it needs network access for the Simple Icons paths.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "assets", "static");
mkdirSync(out, { recursive: true });

const INK = "#0c0c0b";
const BONE = "#ede4d0";
const RED = "#d2231b";
const DIM = "#8a8273";
const font = readFileSync(join(root, "fonts", "courier-prime-subset.woff2")).toString("base64");
const fontFace = `@font-face{font-family:CP;src:url(data:font/woff2;base64,${font}) format("woff2")}`;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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

console.log("stack icons:", await stack());
