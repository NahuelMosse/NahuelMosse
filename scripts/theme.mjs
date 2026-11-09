// The portfolio's palette (design/tokens.css): one red as the only accent, over ink and bone.
// The art is dark in both GitHub themes, so every asset is emitted once.
import { readFileSync } from "node:fs";

export const INK = "#0c0c0b";
export const BONE = "#ede4d0";
export const RED = "#d2231b";

export const LABEL_TRACKING = "0.16em";

// Courier Prime subset (SIL OFL, fonts/OFL.txt), built by scripts/build_art.py. An SVG shown
// through <img> cannot load external fonts, so it travels inside the file.
const courier = readFileSync(new URL("../fonts/courier-prime.woff2", import.meta.url)).toString("base64");
export const LABEL_FONT_FACE = `@font-face { font-family: "Courier Prime"; src: url(data:font/woff2;base64,${courier}) format("woff2"); }`;
export const LABEL = `"Courier Prime", ui-monospace, monospace`;

// Linear blend between two #rrggbb colors.
export function mix(a, b, t) {
  const pa = a.match(/\w\w/g).map((h) => parseInt(h, 16));
  const pb = b.match(/\w\w/g).map((h) => parseInt(h, 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

export const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
