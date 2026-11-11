// Scans shipped web files for LEG-04 (uncredited assets), LEG-05 (font CDNs) and LEG-08 (trackers); see reference/legal.md.
// A mechanical check of a few rules, not legal advice.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIP = new Set(['node_modules', '.git', 'specs', '.claude', 'dist', 'build', 'coverage', 'test', 'tests']);
const CODE = /\.(html|css|js|mjs|jsx|ts|tsx)$/i;
const ASSET = /\.(png|jpe?g|webp|avif|gif|svg|mp4|webm|woff2?|ttf|otf)$/i;
const ASSET_DIRS = new Set(['public', 'assets', 'fonts']);
const FONT_CDN = /fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit\.net/i;
const TRACKER = /google-analytics\.com|googletagmanager\.com|connect\.facebook\.net|doubleclick\.net|static\.hotjar\.com|clarity\.ms/i;

function perLine(file, text, re, make) {
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const m = line.match(re);
    if (m) out.push(make(`${file}:${i + 1}`, m[0]));
  });
  return out;
}

export function fontCdnProblems(file, text) {
  return perLine(file, text, FONT_CDN, (loc, host) => `LEG-05 · ${loc} · font loaded from ${host}: self-host it`);
}

export function trackerWarnings(file, text) {
  return perLine(file, text, TRACKER, (loc, host) => `LEG-08 · ${loc} · loads a tracker (${host}): it must wait for consent`);
}

function walk(dir, visit, inAssetDir = false) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP.has(e.name)) walk(full, visit, inAssetDir || ASSET_DIRS.has(e.name));
    } else visit(full, inAssetDir);
  }
}

function creditsTexts(root) {
  const files = [path.join(root, 'CREDITS.md')];
  const specs = path.join(root, 'specs');
  if (fs.existsSync(specs)) {
    for (const d of fs.readdirSync(specs, { withFileTypes: true })) {
      if (d.isDirectory()) files.push(path.join(specs, d.name, 'CREDITS.md'));
    }
  }
  return files.filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, 'utf8'));
}

export function uncreditedAssets(root) {
  const assets = [];
  walk(root, (full, inAssetDir) => {
    if (inAssetDir && ASSET.test(full)) assets.push(full);
  });
  if (!assets.length) return [];
  const credits = creditsTexts(root);
  const rel = (f) => path.relative(root, f).split(path.sep).join('/');
  if (!credits.length) {
    return [`LEG-04 · ${assets.length} files lack credit · no CREDITS.md found`];
  }
  const all = credits.join('\n');
  return assets
    .filter((f) => !all.includes(path.basename(f)))
    .map((f) => `LEG-04 · ${rel(f)}:1 · no credit line in CREDITS.md`);
}

export function scan(root) {
  const lines = [];
  walk(root, (full) => {
    if (!CODE.test(full)) return;
    const text = fs.readFileSync(full, 'utf8');
    const rel = path.relative(root, full).split(path.sep).join('/');
    lines.push(...fontCdnProblems(rel, text), ...trackerWarnings(rel, text));
  });
  lines.push(...uncreditedAssets(root));
  return lines;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] || process.cwd());
  const lines = scan(root);
  for (const l of lines) console.log(l);
  const fail = lines.filter((l) => /^LEG-0[45]/.test(l)).length;
  const warn = lines.length - fail;
  console.log(`legal-check: ${fail} FAIL, ${warn} WARN`);
  process.exit(fail ? 1 : 0);
}
