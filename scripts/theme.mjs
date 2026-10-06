// Palette shared with assets/banner-*.svg. GitHub picks the file per theme through <picture>,
// so every generated asset is emitted once per theme instead of using prefers-color-scheme.
export const THEMES = {
  dark: {
    bg: "#00170d",
    rule: "#193429",
    text: "#f2eee7",
    muted: "#968e82",
    accent: "#bba07b",
    green: "#2f8a66",
    empty: "#11291f",
  },
  light: {
    bg: "#f2eee7",
    rule: "#e2dbcd",
    text: "#00170d",
    muted: "#6b6459",
    accent: "#9e6033",
    green: "#135b42",
    empty: "#e4ddd0",
  },
};

export const MONO = `ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, monospace`;

// Linear blend between two #rrggbb colors.
export function mix(a, b, t) {
  const pa = a.match(/\w\w/g).map((h) => parseInt(h, 16));
  const pb = b.match(/\w\w/g).map((h) => parseInt(h, 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

export const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
