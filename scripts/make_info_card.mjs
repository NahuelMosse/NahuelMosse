// Writes assets/card-{dark,light}.svg: a neofetch-style panel whose lines print in one by one.
// Static content; rerun by hand when the details change.
import { writeFile } from "node:fs/promises";
import { THEMES, MONO, esc } from "./theme.mjs";

const W = 490;
const H = 400;
const X = 26;
const KEY_W = 74;
const TOP = 76;
const LH = 21.5;

const ROWS = [
  ["role", "Full Stack Engineer"],
  ["now", "Kovix Consulting · 4 years"],
  ["based", "Buenos Aires, AR"],
  ["backend", "Node.js · NestJS · TypeScript"],
  ["front", "React · Angular · Next.js"],
  ["data", "PostgreSQL · MongoDB"],
  ["testing", "Jest · Vitest · Playwright"],
  ["tooling", "Docker · Git · Linux"],
  ["after", "Python · Java · Flutter"],
  ["study", "Computer Eng. · 4th year · UM"],
  ["origin", "Minecraft → Jarvis → this"],
];

const ALT = ROWS.map(([k, v]) => `${k}: ${v}`).join("; ");

function render(name) {
  const t = THEMES[name];
  const step = 0.11;
  const start = 0.35;
  let line = 0;
  const at = () => (start + step * line++).toFixed(2);

  const head = `<g class="ln" style="animation-delay:${at()}s">
    <text x="${X}" y="${TOP}"><tspan class="u">nahuelmosse</tspan><tspan class="m">@</tspan><tspan class="h">github</tspan></text>
  </g>
  <g class="ln" style="animation-delay:${at()}s">
    <text x="${X}" y="${TOP + LH}" class="m">${"─".repeat(18)}</text>
  </g>`;

  const rows = ROWS.map(([k, v], i) => {
    const y = TOP + LH * (i + 2.4);
    return `<g class="ln" style="animation-delay:${at()}s">
    <text x="${X}" y="${y}" class="k">${esc(k)}</text>
    <text x="${X + KEY_W}" y="${y}">${esc(v)}</text>
  </g>`;
  }).join("\n  ");

  const swY = TOP + LH * (ROWS.length + 2.8);
  const swatches = [t.text, t.accent, t.green, t.muted, t.rule]
    .map((f, i) => `<rect x="${X + i * 26}" y="${swY}" width="22" height="12" rx="2" fill="${f}"/>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(ALT)}">
  <title>nahuelmosse@github</title>
  <style>
    text { font-family: ${MONO}; font-size: 13px; fill: ${t.text}; white-space: pre; }
    .k { fill: ${t.accent}; font-weight: 700; }
    .m { fill: ${t.muted}; }
    .u { fill: ${t.accent}; font-weight: 700; }
    .h { fill: ${t.green}; font-weight: 700; }
    .bar { font-size: 11px; fill: ${t.muted}; }
    .ln { opacity: 0; animation: print .35s ease-out forwards; }
    @keyframes print { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .ln { animation: none; opacity: 1; } }
  </style>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${t.bg}" stroke="${t.rule}"/>
  <line x1="1" y1="34" x2="${W - 1}" y2="34" stroke="${t.rule}"/>
  <circle cx="20" cy="17.5" r="4.5" fill="${t.rule}"/><circle cx="36" cy="17.5" r="4.5" fill="${t.rule}"/><circle cx="52" cy="17.5" r="4.5" fill="${t.rule}"/>
  <text class="bar" x="${W / 2}" y="21.5" text-anchor="middle">~ $ neofetch</text>
  ${head}
  ${rows}
  <g class="ln" style="animation-delay:${at()}s">${swatches}</g>
</svg>
`;
}

for (const name of Object.keys(THEMES)) {
  await writeFile(new URL(`../assets/card-${name}.svg`, import.meta.url), render(name));
}
console.log(`card: ${ROWS.length} rows`);
