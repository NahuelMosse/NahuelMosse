#!/usr/bin/env node
// Self-hosts a Google Fonts family: downloads the woff2 files of the weights asked, the family's licence beside them,
// and writes the @font-face rules. Files a page ships, not an installation (references/type.md §5, LEG-05).
//
//   node <skill>/scripts/fonts.mjs "Instrument Sans" --weights 400,600 [--italic] [--out public/fonts] [--subsets latin,latin-ext]
//
// Prints the preload and stylesheet lines, the files to name in the card's `## Tasks` and the CREDITS.md line. Exit 1 when the family or its licence cannot be fetched.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// A current Chrome user agent: Google serves woff2 with unicode-range subsets only to browsers that read them.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const LICENCES = [['ofl', 'OFL.txt', 'OFL-1.1'], ['apache', 'LICENSE.txt', 'Apache-2.0'], ['ufl', 'UFL.txt', 'UFL-1.0']];

export const slug = (family) => family.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const cssUrl = (family, weights, italic = false) => {
  const name = family.trim().replace(/ /g, '+');
  const ws = [...new Set(weights)].sort((a, b) => a - b);
  const axes = italic ? `ital,wght@${[...ws.map((w) => `0,${w}`), ...ws.map((w) => `1,${w}`)].join(';')}` : `wght@${ws.join(';')}`;
  return `https://fonts.googleapis.com/css2?family=${name}:${axes}&display=swap`;
};

// Pure: the faces of a css2 stylesheet, each with its subset comment, style, weight, url and unicode-range.
export const parseFaces = (css) => {
  const faces = [];
  const re = /(?:\/\*\s*([\w-]+)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/g;
  for (let m; (m = re.exec(css));) {
    const body = m[2];
    const get = (k) => (body.match(new RegExp(`${k}\\s*:\\s*([^;]+);`)) || [])[1]?.trim();
    const url = (get('src') || '').match(/url\(([^)]+)\)/)?.[1];
    if (!url) continue;
    faces.push({ subset: m[1] || 'all', style: get('font-style') || 'normal', weight: get('font-weight') || '400', url, range: get('unicode-range') || null });
  }
  return faces;
};

// Pure: the local file of each face; a variable font serves one url for every weight, so files are keyed by url.
export const plan = (family, faces, subsets) => {
  const keep = faces.filter((f) => f.subset === 'all' || subsets.includes(f.subset));
  const files = new Map();
  for (const f of keep) {
    if (files.has(f.url)) continue;
    const w = keep.filter((g) => g.url === f.url).map((g) => g.weight);
    const weight = w.length > 1 ? `${w[0]}-${w[w.length - 1]}` : w[0];
    files.set(f.url, `${slug(family)}-${weight}${f.style === 'italic' ? '-italic' : ''}${f.subset === 'all' ? '' : `-${f.subset}`}.woff2`);
  }
  return keep.map((f) => ({ ...f, file: files.get(f.url) }));
};

// A variable font serves every weight from one file: one rule per file, with its weight range.
export const fontFaceCss = (family, faces, prefix) => [...new Set(faces.map((f) => f.file))].map((file) => {
  const same = faces.filter((f) => f.file === file);
  const ws = [...new Set(same.map((f) => f.weight))];
  const { style, range } = same[0];
  return `@font-face { font-family: "${family}"; src: url("${prefix}${file}") format("woff2"); font-style: ${style}; font-weight: ${ws.length > 1 ? `${ws[0]} ${ws[ws.length - 1]}` : ws[0]}; font-display: swap;${range ? ` unicode-range: ${range};` : ''} }`;
}).join('\n');

// The files the card ships, to name in its `## Tasks`: a file the card adds outside them fails the gate's scope check.
export const tasksLine = (at, family, faces, licenceFile) =>
  `## Tasks, on the task that sets the type: ${[...new Set(faces.map((f) => f.file)), licenceFile, `${slug(family)}.css`].map((f) => `\`${at}/${f}\``).join(' ')}`;

async function main(argv) {
  const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
  const VALUED = ['--weights', '--out', '--subsets'];
  const family = argv.find((a, i) => !a.startsWith('--') && !VALUED.includes(argv[i - 1]));
  if (!family) { console.error('usage: fonts.mjs "<Family>" --weights 400,600 [--italic] [--out fonts] [--subsets latin,latin-ext]'); return 2; }
  const weights = opt('weights', '400,600').split(',').map(Number).filter(Boolean);
  const subsets = opt('subsets', 'latin,latin-ext').split(',');
  const out = opt('out', 'fonts');
  const res = await fetch(cssUrl(family, weights, argv.includes('--italic')), { headers: { 'user-agent': UA } });
  if (!res.ok) { console.error(`${family}: Google Fonts answered ${res.status} (is the family name exact, and are these weights in it?)`); return 1; }
  const faces = plan(family, parseFaces(await res.text()), subsets);
  if (!faces.length) { console.error(`${family}: no faces in the subsets ${subsets.join(', ')}`); return 1; }
  let licence = null;
  for (const [dir, file, id] of LICENCES) {
    const r = await fetch(`https://raw.githubusercontent.com/google/fonts/main/${dir}/${slug(family).replace(/-/g, '')}/${file}`);
    if (r.ok) { licence = { id, text: await r.text(), file: `${slug(family)}-${file}` }; break; }
  }
  if (!licence) { console.error(`${family}: its licence was not found in github.com/google/fonts; read it before shipping the files`); return 1; }
  mkdirSync(out, { recursive: true });
  for (const url of new Set(faces.map((f) => f.url))) {
    const r = await fetch(url);
    if (!r.ok) { console.error(`${url}: ${r.status}`); return 1; }
    writeFileSync(join(out, faces.find((f) => f.url === url).file), Buffer.from(await r.arrayBuffer()));
  }
  writeFileSync(join(out, licence.file), licence.text);
  writeFileSync(join(out, `${slug(family)}.css`), fontFaceCss(family, faces, '') + '\n');
  const at = relative(process.cwd(), out).replace(/\\/g, '/');
  // The page is served from public/ when there is one: its hrefs start below it.
  const href = at.replace(/^public\//, '');
  const first = faces.find((f) => f.subset === 'latin') || faces[0];
  console.log(`${new Set(faces.map((f) => f.url)).size} files in ${at}/ with ${licence.file} (${licence.id}); its rules in ${at}/${slug(family)}.css.\n`);
  console.log(`<link rel="preload" href="${href}/${first.file}" as="font" type="font/woff2" crossorigin>\n<link rel="stylesheet" href="${href}/${slug(family)}.css">\n`);
  console.log(`${tasksLine(at, family, faces, licence.file)}
`);
  console.log(`CREDITS.md: | \`${at}/${slug(family)}-*.woff2\` | ${family}, Google Fonts | ${licence.id} (\`${at}/${licence.file}\`) |`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(e.message); process.exit(1); });
}
