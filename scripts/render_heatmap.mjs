// Renders data/contributions.json as assets/heatmap.svg: the last 53 weeks as a grid of square
// cells, bone fading into red, on ink.
import { readFile, writeFile } from "node:fs/promises";
import { INK, BONE, RED, LABEL, LABEL_FONT_FACE, LABEL_TRACKING, mix, esc } from "./theme.mjs";

const data = JSON.parse(await readFile(new URL("../data/contributions.json", import.meta.url), "utf8"));

const W = 1200;
const H = 330;
const STEP = 20;
const CELL = 15.5;
const GX = 92; // grid origin
const GY = 104;
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

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

const empty = mix(INK, BONE, 0.07);
const ramp = [empty, mix(empty, RED, 0.38), mix(empty, RED, 0.6), mix(empty, RED, 0.8), RED];
const muted = mix(INK, BONE, 0.62);

const rects = cells
  .map((c) => {
    const x = (GX + c.col * STEP).toFixed(1);
    const y = (GY + c.row * STEP).toFixed(1);
    return `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="${ramp[c.level]}"/>`;
  })
  .join("\n    ");

const months = monthLabels
  .map(({ m, col }) => `<text x="${(GX + col * STEP).toFixed(1)}" y="${GY - 14}">${m}</text>`)
  .join("\n    ");

const weekdays = [
  [1, "MON"],
  [3, "WED"],
  [5, "FRI"],
]
  .map(([r, l]) => `<text x="${GX - 14}" y="${(GY + r * STEP + CELL - 3).toFixed(1)}" text-anchor="end">${l}</text>`)
  .join("\n    ");

const legendX = W - 48 - 5 * STEP - 44;
const legend = ramp
  .map((f, i) => `<rect x="${(legendX + i * STEP).toFixed(1)}" y="${H - 63}" width="${CELL}" height="${CELL}" fill="${f}"/>`)
  .join("");

const updated = data.fetchedAt.slice(0, 10);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${fmt(data.total)} GitHub contributions in the last year">
  <title>${esc(`${fmt(data.total)} contributions in the last year`)}</title>
  <style>
    ${LABEL_FONT_FACE}
    text { font-family: ${LABEL}; font-size: 13px; letter-spacing: ${LABEL_TRACKING}; fill: ${muted}; }
    .hd { font-size: 15px; fill: ${BONE}; }
    .num { fill: ${RED}; }
    .thread { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw 2.8s cubic-bezier(0.16, 1, 0.3, 1) .3s forwards; }
    @keyframes draw { to { stroke-dashoffset: 0; } }
    @media (prefers-reduced-motion: reduce) { .thread { animation: none; stroke-dashoffset: 0; } }
  </style>
  <rect width="${W}" height="${H}" fill="${INK}"/>
  <text class="hd" x="48" y="52">CONTRIBUTIONS · LAST 365 DAYS</text>
  <text x="${W - 48}" y="52" text-anchor="end">UPDATED ${updated}</text>
  <g>
    ${months}
    ${weekdays}
  </g>
  <g>
    ${rects}
  </g>
  <text x="48" y="${H - 50}"><tspan class="num">${fmt(data.total)}</tspan> CONTRIBUTIONS · LONGEST STREAK <tspan class="num">${data.streak.longest}</tspan> DAYS · BEST DAY <tspan class="num">${fmt(data.bestDay.count)}</tspan></text>
  <text x="${legendX - 12}" y="${H - 50}" text-anchor="end">LESS</text>
  ${legend}
  <text x="${(legendX + 5 * STEP + 6).toFixed(1)}" y="${H - 50}">MORE</text>
  <path class="thread" pathLength="1" d="M 0 ${H - 1.5} L ${W} ${H - 1.5}" stroke="${RED}" stroke-width="3" fill="none"/>
</svg>
`;

await writeFile(new URL("../assets/heatmap.svg", import.meta.url), svg);
console.log(`heatmap: ${cells.length} cells, ${monthLabels.length} month labels`);
