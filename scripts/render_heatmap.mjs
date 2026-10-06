// Renders data/contributions.json as assets/heatmap-{dark,light}.svg: a 53-week calendar whose
// cells drop in diagonally once on load and then stay put.
import { readFile, writeFile } from "node:fs/promises";
import { THEMES, MONO, mix, esc } from "./theme.mjs";

const data = JSON.parse(await readFile(new URL("../data/contributions.json", import.meta.url), "utf8"));

const W = 860;
const H = 222;
const CELL = 11.5;
const STEP = 14.8;
const GX = 52; // grid origin
const GY = 72;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fmt = (n) => n.toLocaleString("en-US");
const dow = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const offset = dow(data.days[0].date);

const cells = data.days.map((d, i) => {
  const slot = i + offset;
  return { ...d, col: Math.floor(slot / 7), row: slot % 7 };
});

// A month label sits over the first column whose top cell falls in that month.
const monthLabels = [];
for (const c of cells) {
  if (c.row !== 0 && c.col !== 0) continue;
  if (monthLabels.at(-1)?.col === c.col) continue;
  const m = MONTHS[Number(c.date.slice(5, 7)) - 1];
  if (monthLabels.at(-1)?.m !== m) monthLabels.push({ m, col: c.col });
}
// A partial first month leaves its label crowding the next one.
if (monthLabels.length > 1 && monthLabels[1].col - monthLabels[0].col < 3) monthLabels.shift();

function render(name) {
  const t = THEMES[name];
  const ramp = [t.empty, mix(t.empty, t.accent, 0.46), mix(t.empty, t.accent, 0.68), mix(t.empty, t.accent, 0.86), t.accent];
  const last = cells.at(-1).col;
  const revealEnd = (last * 0.018 + 6 * 0.04 + 0.45).toFixed(2);

  const rects = cells
    .map((c) => {
      const x = (GX + c.col * STEP).toFixed(1);
      const y = (GY + c.row * STEP).toFixed(1);
      const delay = (c.col * 0.018 + c.row * 0.04).toFixed(3);
      return `<rect class="c" x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2.6" fill="${ramp[c.level]}" style="animation-delay:${delay}s"/>`;
    })
    .join("\n    ");

  const months = monthLabels
    .map(({ m, col }) => `<text x="${(GX + col * STEP).toFixed(1)}" y="${GY - 10}">${m}</text>`)
    .join("\n    ");

  const weekdays = [
    [1, "Mon"],
    [3, "Wed"],
    [5, "Fri"],
  ]
    .map(([r, l]) => `<text x="${GX - 10}" y="${(GY + r * STEP + CELL - 2).toFixed(1)}" text-anchor="end">${l}</text>`)
    .join("\n    ");

  const legendX = W - 28 - 5 * STEP - 34;
  const legend = ramp
    .map((f, i) => `<rect x="${(legendX + i * STEP).toFixed(1)}" y="${H - 42}" width="${CELL}" height="${CELL}" rx="2.6" fill="${f}"/>`)
    .join("");

  const updated = data.fetchedAt.slice(0, 10);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${fmt(data.total)} GitHub contributions in the last year">
  <title>${esc(`${fmt(data.total)} contributions in the last year`)}</title>
  <style>
    text { font-family: ${MONO}; font-size: 11px; fill: ${t.muted}; }
    .hd { font-size: 12px; fill: ${t.text}; }
    .hd tspan.p { fill: ${t.green}; }
    .num { fill: ${t.accent}; font-weight: 700; }
    .c { opacity: 0; transform-box: fill-box; transform-origin: center; animation: drop .45s cubic-bezier(.2,.7,.2,1) forwards; }
    .f { opacity: 0; animation: fade .6s ease-out ${revealEnd}s forwards; }
    @keyframes drop { from { opacity: 0; transform: translateY(-9px) scale(.55); } to { opacity: 1; transform: none; } }
    @keyframes fade { to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .c, .f { animation: none; opacity: 1; } }
  </style>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${t.bg}" stroke="${t.rule}"/>
  <text class="hd" x="24" y="30"><tspan class="p">~/github</tspan> contributions --last 365d</text>
  <text x="${W - 24}" y="30" text-anchor="end">updated ${updated}</text>
  <g>
    ${months}
    ${weekdays}
  </g>
  <g>
    ${rects}
  </g>
  <g class="f">
    <text x="24" y="${H - 32}"><tspan class="num">${fmt(data.total)}</tspan> contributions · longest streak <tspan class="num">${data.streak.longest}</tspan> days · best day <tspan class="num">${data.bestDay.count}</tspan></text>
    <text x="${legendX - 8}" y="${H - 32}" text-anchor="end">less</text>
    ${legend}
    <text x="${(legendX + 5 * STEP + 4).toFixed(1)}" y="${H - 32}">more</text>
  </g>
</svg>
`;
}

for (const name of Object.keys(THEMES)) {
  await writeFile(new URL(`../assets/heatmap-${name}.svg`, import.meta.url), render(name));
}
console.log(`heatmap: ${cells.length} cells, ${monthLabels.length} month labels`);
