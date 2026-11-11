// Colour arithmetic shared by draw.mjs and the kit's gate: OKLCH from and to hex, the name a person gives
// a colour, the colours a brief names, WCAG contrast, and the recolouring of a library palette for a
// colour no palette carries. The gate recomputes a recoloured palette from its library entry with this
// same code, so a dealt sheet can be checked without trusting the file.
function srgbLin(c) { return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
export function rgbOf(hex) { let h = String(hex).replace('#', ''); if (h.length === 3) h = [...h].map((x) => x + x).join(''); return [0, 2, 4].map((i) => srgbLin(parseInt(h.slice(i, i + 2), 16) / 255)); };
export function hueOf(hex) {
  const [r, g, b] = rgbOf(hex);
  const [l, m, s] = [0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b, 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b].map(Math.cbrt);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { lightness: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, chroma: Math.hypot(A, B), hue: (Math.atan2(B, A) * 180 / Math.PI + 360) % 360 };
}
// the name a person would give a colour, from its OKLCH lightness, chroma and hue
export function colourName(hex) {
  const { lightness: L, chroma: C, hue: H } = hueOf(hex);
  if (C < 0.035) return L > 0.94 ? 'white' : L < 0.3 ? 'black' : 'grey';
  if (C < 0.09 && H >= 50 && H < 110 && L > 0.82) return 'cream';
  if (H >= 30 && H < 85 && L < 0.55) return 'brown';
  if (H >= 235 && H < 285 && L < 0.42) return 'navy';
  if (H < 15 || H >= 345) return L > 0.75 ? 'pink' : 'red';
  if (H < 40) return 'red';
  if (H < 75) return 'orange';
  if (H < 115) return 'yellow';
  if (H < 170) return 'green';
  if (H < 215) return 'teal';
  if (H < 285) return 'blue';
  if (H < 330) return 'purple';
  return 'pink';
}
// the colours a brief names, English and Spanish, each to one name of colourName
const COLOUR_WORDS = { green: 'green', verde: 'green', red: 'red', rojo: 'red', roja: 'red', blue: 'blue', azul: 'blue', yellow: 'yellow', amarillo: 'yellow', amarilla: 'yellow', orange: 'orange', naranja: 'orange', pink: 'pink', rosa: 'pink', rosado: 'pink', purple: 'purple', violet: 'purple', violeta: 'purple', lila: 'purple', teal: 'teal', turquoise: 'teal', turquesa: 'teal', navy: 'navy', cream: 'cream', crema: 'cream', beige: 'cream', brown: 'brown', marron: 'brown', 'marrón': 'brown', grey: 'grey', gray: 'grey', gris: 'grey', white: 'white', blanco: 'white', blanca: 'white', black: 'black', negro: 'black', negra: 'black',
  greens: 'green', verdes: 'green', reds: 'red', rojos: 'red', rojas: 'red', blues: 'blue', azules: 'blue', yellows: 'yellow', amarillos: 'yellow', amarillas: 'yellow', oranges: 'orange', naranjas: 'orange', pinks: 'pink', rosados: 'pink', rosadas: 'pink', purples: 'purple', violets: 'purple', violetas: 'purple', lilas: 'purple', teals: 'teal', creams: 'cream', beiges: 'cream', browns: 'brown', marrones: 'brown', greys: 'grey', grays: 'grey', grises: 'grey', whites: 'white', blancos: 'white', blancas: 'white', blacks: 'black', negros: 'black', negras: 'black' };
const NEGATIONS = new Set(['no', 'sin', 'nada', 'ni', 'not', 'without', 'avoid', 'evitar', 'never', 'nunca']);
const WORD = /[A-Za-zÁÉÍÓÚÑáéíóúñ]+/g;
// A colour word is not asked for when a negation stands within three words before it, when it is the Spanish "red de ..." (a network),
// or when it is a capitalised mid-sentence word followed by a capital letter, a digit or a capitalised word (a brand: "Naranja X").
export function namedColours(brief) {
  const text = String(brief || '');
  const words = [...text.matchAll(WORD)].map((m) => ({ raw: m[0], low: m[0].toLowerCase(), at: m.index }));
  const found = [];
  words.forEach((w, i) => {
    const name = COLOUR_WORDS[w.low];
    if (!name) return;
    if (words.slice(Math.max(0, i - 3), i).some((p) => NEGATIONS.has(p.low) && !/[.;!?\n]/.test(text.slice(p.at, w.at)))) return;
    if (w.low === 'red' && words[i + 1]?.low === 'de') return;
    const before = text.slice(0, w.at);
    const sentenceStart = !/\S/.test(before) || /[.!?:;\n][\s\-*#>"'(]*$/.test(before);
    if (/^[A-ZÁÉÍÓÚÑ]/.test(w.raw) && !sentenceStart && /^[ \t]+(?:[A-ZÁÉÍÓÚÑ]|\d)/.test(text.slice(w.at + w.raw.length))) return;
    found.push(name);
  });
  return [...new Set(found)];
}
export function disruptive(brief) {
  return /\b(?:disrupt\w*|unexpected|inesperad\w*|rupturist\w*|(?:against|breaks? with|breaking with) (?:the|its) (?:category|sector)|(?:romper con|contra|fuera de) (?:el|su) rubro)/i.test(brief) || /disruptiv/i.test(brief);
}
export function hexOf(L, C, H) {
  const a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180);
  const [l, m, s] = [L + 0.3963377774 * a + 0.2158037573 * b, L - 0.1055613458 * a - 0.0638541728 * b, L - 0.0894841775 * a - 1.291485548 * b].map((v) => v ** 3);
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return '#' + lin.map((c) => Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055))).toString(16).padStart(2, '0')).join('');
}
// a representative of each colour name: OKLCH lightness, chroma and hue
export const COLOUR_TARGET = { red: [0.55, 0.19, 27], orange: [0.68, 0.17, 52], yellow: [0.86, 0.16, 95], green: [0.52, 0.13, 150], teal: [0.55, 0.09, 195], blue: [0.5, 0.17, 258], purple: [0.5, 0.16, 305], pink: [0.78, 0.11, 350], navy: [0.3, 0.09, 265], brown: [0.4, 0.06, 55], cream: [0.95, 0.045, 85], white: [0.99, 0, 0], black: [0.18, 0, 0], grey: [0.62, 0.005, 250] };
// The colour asked for at the lightness where it holds against the ground (3:1 for a control) and still takes a 4.5:1 label.
function fitLightness(name, against, min) {
  const [L0, C, H] = COLOUR_TARGET[name];
  for (let d = 0; d <= 0.6; d += 0.01) for (const L of [L0 - d, L0 + d]) {
    if (L <= 0.05 || L >= 0.99) continue;
    const hex = hexOf(L, C, H);
    if (colourName(hex) === name && contrast(hex, against) >= min && Math.max(contrast(hex, '#ffffff'), contrast(hex, '#111111')) >= 4.5) return hex;
  }
  return hexOf(L0, C, H);
}
// The colours a palette fails to show of those asked. The first one named is the principal: it must be the
// ground, the accent or a section field, the colours a visitor sees as the page's; the others may be any role.
const LEAD = ['bg', 'accent'];
const leads = (p) => [...LEAD.map((k) => p[k]), ...(p.fields || []).map((f) => f.bg)].map(colourName);
export function missingColours(p, asked) {
  const any = new Set([...leads(p), colourName(p.surface), colourName(p.ink)]);
  return asked.filter((c, i) => !(i === 0 ? leads(p).includes(c) : any.has(c)));
}
const capital = (w) => w[0].toUpperCase() + w.slice(1);
// No palette of the library carries a colour the person asked for: keep the structure of the best one
// (its ground, ink, accent and fields, measured on a real site) and recolour the roles the asked
// colours belong to, held to the same contrast the library meets.
export function recolour(p, asked) {
  const q = { ...p, fields: (p.fields || []).map((f) => ({ ...f })) };
  let light = hueOf(q.bg).lightness > 0.6;
  // a role that already shows an asked colour is kept, so a second colour never paints over the first
  const holds = (role, hex) => asked.some((c, i) => c === colourName(hex) && (i > 0 || LEAD.includes(role)));
  const kept = new Set(Object.entries({ bg: q.bg, surface: q.surface, ink: q.ink, accent: q.accent }).filter(([role, hex]) => holds(role, hex)).map(([role]) => role));
  q.fields.forEach((f, i) => { if (asked.includes(colourName(f.bg))) kept.add(`field${i}`); });
  const free = (role) => !kept.has(role) && (kept.add(role), true);
  const field = (hex) => { const i = q.fields.findIndex((_, j) => !kept.has(`field${j}`)); const at = i < 0 ? q.fields.length : i; q.fields[at] = { bg: hex }; kept.add(`field${at}`); };
  // The colour asked takes the accent when it can hold 3:1 against the ground and stay itself (orange on a mustard ground cannot): a field otherwise.
  const takeAccent = (name, fieldHex) => {
    if (!free('accent')) return field(fieldHex);
    const hex = fitLightness(name, q.bg, 3);
    if (colourName(hex) === name && contrast(hex, q.bg) >= 3) q.accent = hex; else field(fieldHex);
  };
  const order = ['white', 'cream', 'black', 'navy', 'brown', 'grey'];
  const rank = (c) => (c === asked[0] ? 0 : order.indexOf(c) + 1 || 9);
  const missing = missingColours(q, asked).sort((a, b) => rank(a) - rank(b));
  for (const name of missing) {
    light = hueOf(q.bg).lightness > 0.6; // a role changed by the previous colour may have turned the ground
    const [L, C, H] = COLOUR_TARGET[name];
    // the principal colour takes the accent when it is not a ground: a button, never only the text or the panels
    if (name === asked[0] && !['white', 'cream'].includes(name) && !(['black', 'navy', 'brown'].includes(name) && !light)) {
      takeAccent(name, hexOf(L, C, H));
      continue;
    }
    if (['white', 'cream'].includes(name)) {
      // on a dark ground whose light text is already an asked colour, a light ground would lose that text: a field instead
      // a light accent already asked for (graphite-night's white button) would vanish on a light ground: the field takes it
      const lightAccent = kept.has('accent') && hueOf(q.accent).lightness > 0.85;
      if (!lightAccent && (light || !kept.has('ink')) && free('bg')) { q.bg = hexOf(L, C, H); if (!kept.has('surface')) q.surface = hexOf(L - 0.04, C, H); }
      else if (light && name !== asked[0] && free('surface')) q.surface = hexOf(L - 0.04, C, H);
      else field(hexOf(L, C, H));
    } else if (['black', 'navy', 'brown'].includes(name)) {
      if (light && free('ink')) q.ink = hexOf(Math.min(L, 0.3), C, H);
      else if (!light && free('bg')) { q.bg = hexOf(Math.min(L, 0.22), C, H); if (!kept.has('surface')) q.surface = hexOf(Math.min(L, 0.22) + 0.05, C, H); }
      else if (light && !kept.has('accent')) takeAccent(name, hexOf(Math.min(L, 0.3), C, H));
      else field(hexOf(Math.min(L, 0.3), C, H));
    } else if (name === 'grey') {
      if (free('surface')) q.surface = hexOf(light ? 0.86 : 0.34, 0.005, H);
      else field(hexOf(0.62, 0.005, H));
    } else takeAccent(name, hexOf(L, C, H));
  }
  // panels sit on the ground's side: a kept surface left dark under a light ground (or the reverse) moves beside it, its own colour kept
  const sideOf = (hex) => hueOf(hex).lightness > 0.6;
  if (sideOf(q.surface) !== sideOf(q.bg)) q.surface = besideGround(q.surface, q.bg);
  // text keeps the contrast the library holds: ink 7:1 and muted 4.5:1 on the ground, the label of a control 4.5:1
  if (contrast(q.ink, q.bg) < 7) q.ink = fitInk(q.ink, q.bg);
  if (contrast(q.accent, q.bg) < 3) q.accent = fitAccent(q.accent, q.bg);
  // an accent that cannot stay itself at 3:1 (white on a cream ground) becomes the ink, so the button inverts the ground,
  // unless it is an asked colour that no ground or panel shows
  const shown = (c) => [q.bg, q.surface].some((h) => colourName(h) === c);
  if (contrast(q.accent, q.bg) < 3 && (!asked.includes(colourName(q.accent)) || shown(colourName(q.accent)) || missingColours({ ...q, accent: q.ink }, asked).length === 0)) q.accent = q.ink;
  if (contrast(q.muted, q.bg) < 4.5 || contrast(q.muted, q.surface) < 4.5) q.muted = fitMuted(q);
  q.accentInk = labelOn(q.accent, p.accentInk);
  q.fields = q.fields.map((f) => ({ ...f, ink: labelOn(f.bg, f.ink) }));
  const fieldNote = q.fields.length ? ` Sections change to ${[...new Set(q.fields.map((f) => colourName(f.bg)))].join(' and ')} fields.` : ' No section changes colour.';
  const note = `A ${colourName(q.bg)} ground with ${colourName(q.surface)} panels and ${colourName(q.ink)} text.${fieldNote} ${capital(colourName(q.accent))} marks the buttons and at most one word in a heading.`;
  const name = `${capital(colourName(q.accent))} on ${colourName(q.bg)}, built on ${p.name}`;
  return { ...q, id: `${p.id}+${asked.join('-')}`, name, note, generated: { from: p.id, asked, was: { bg: p.bg, accent: p.accent } } };
}
// The text on a fill: the palette's own when it still reads at 4.5:1, else the strongest of white and black.
function labelOn(fill, own) {
  if (own && contrast(own, fill) >= 4.5) return own;
  return ['#ffffff', '#111111', '#000000'].reduce((a, b) => (contrast(b, fill) > contrast(a, fill) ? b : a));
}
// A panel colour moved to the ground's side of the lightness scale, a step off the ground, keeping its hue and chroma.
function besideGround(surface, bg) {
  const { chroma, hue } = hueOf(surface);
  const L = hueOf(bg).lightness;
  const name = colourName(surface);
  for (let step = 0.05; step <= 0.4; step += 0.01) {
    const hex = hexOf(L > 0.6 ? L - step : L + step, chroma, hue);
    if (colourName(hex) === name) return hex;
  }
  return hexOf(L > 0.6 ? L - 0.05 : L + 0.05, chroma, hue);
}
// The ink moved away from the ground, its hue and chroma kept (a brown or navy text stays brown or navy), to 7:1.
function fitInk(ink, bg) {
  const { lightness, chroma, hue } = hueOf(ink);
  const down = contrast('#000000', bg) >= contrast('#ffffff', bg);
  for (let L = lightness; L > 0 && L < 1; L += down ? -0.01 : 0.01) { const hex = hexOf(L, chroma, hue); if (contrast(hex, bg) >= 7) return hex; }
  return down ? '#000000' : '#ffffff';
}
function fitMuted(q) {
  const { hue } = hueOf(q.ink);
  const dark = hueOf(q.bg).lightness > 0.6;
  for (let L = 0.5; L >= 0.02 && L <= 0.98; L += dark ? -0.01 : 0.01) { const hex = hexOf(L, 0.01, hue); if (contrast(hex, q.bg) >= 4.5 && contrast(hex, q.surface) >= 4.5) return hex; }
  return q.ink;
}
// The accent brought to 3:1 against the ground, still the colour it was named: its lightness first, then less chroma, and the hue
// may drift as long as colourName gives the same name. The label on it still takes 4.5:1.
function fitAccent(accent, bg) {
  const { lightness: L0, chroma: C0, hue: H0 } = hueOf(accent);
  const name = colourName(accent);
  const holds = (hex) => colourName(hex) === name && contrast(hex, bg) >= 3 && Math.max(contrast(hex, '#ffffff'), contrast(hex, '#111111')) >= 4.5;
  for (const dh of [0, 4, -4, 8, -8, 12, -12, 18, -18, 25, -25, 35, -35]) for (const k of [1, 0.85, 0.7, 0.55, 0.4, 0.25]) for (let d = 0; d <= 0.6; d += 0.01) for (const L of [L0 - d, L0 + d]) {
    if (L <= 0.03 || L >= 0.99) continue;
    const hex = hexOf(L, C0 * k, (H0 + dh + 360) % 360);
    if (holds(hex)) return hex;
  }
  return accent;
}
function luminance(hex) { const [r, g, b] = rgbOf(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
export function contrast(a, b) { const [x, y] = [luminance(a), luminance(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
// warm: reds, oranges, yellows and pinks; cool: greens, teals and blues (OKLCH hue)
export function temperature(hex) { const { chroma, hue } = hueOf(hex); if (chroma < 0.05) return null; return hue < 110 || hue >= 330 ? 'warm' : hue >= 130 && hue < 280 ? 'cool' : null; }
