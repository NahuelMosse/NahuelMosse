// How much of a screen comes from the component catalog and the project's set (reference/components.md: a component
// the catalog covers is installed, never written by hand; rules/interface.md: screens are composed, not drawn).
// Measured: a dense loan record passed every check while its markup named only classes of its own, with the set's
// record, facts, badges and phone action bar, and the catalog's ports, left in the templates.
// verify.mjs measures the screen the card wrote; plan.mjs asks the plan to name where each piece comes from.
import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export const SET = 'design/components';
export const TEMPLATES = '.claude/templates/components';
// Of the class words the card's markup names, the share the set (or a stylesheet the repo already had) must define.
export const SET_SHARE = 0.6;
// Fewer class words than this is a touch on a screen, not a screen.
export const MIN_CLASSES = 5;
// The blocks of the dense record (record.css): a card with `## Information` lays its screen out with them.
export const RECORD_BLOCKS = ['record-head', 'facts', 'decision', 'exceptions', 'checks', 'record-section', 'kv-group', 'history', 'path', 'record-table'];
export const RECORD_MIN = 3;
// A repo with shadcn installs its components from the catalog's registries (stacks/react-shadcn.md).
export const usesCatalog = (root) => existsSync(join(root, 'components.json'));
// Where shadcn installs what comes from a registry: the only place a native control is written in such a repo.
export const INSTALLED = /(^|\/)components\/ui\//;

// The native elements the catalog and the set already solve, with what replaces each one.
export const COVERED = {
  button: { set: 'btn', catalog: '@shadcn/button' },
  input: { set: 'input', catalog: '@shadcn/input or @coss/field' },
  textarea: { set: 'input', catalog: '@shadcn/textarea' },
  select: { set: 'select', catalog: '@coss/select' },
  table: { set: 'table or record-table', catalog: '@shadcn/table' },
  dialog: { set: 'dialog', catalog: '@coss/dialog' },
};
const TAGS = Object.keys(COVERED).join('|');

const IDENT = /^-?[a-z_][\w-]*$/i;
const words = (s) => s.split(/\s+/).filter((c) => IDENT.test(c));
// An interpolation becomes a marker: what it decides is not read, and a control whose class it decides is not judged.
const DYNAMIC = '__dynamic__';
const flatten = (text) => String(text).replace(/\$\{[^{}]*\}/g, ` ${DYNAMIC} `);
const CLASS_VALUE = /(?<![\w-])["']?class(?:Name)?["']?\s*(?:=\s*\{?|:)\s*(["'`])([^"'`]*)\1/g;

// The class words a piece of markup or of code that builds markup names: `class="…"`, `className="…"`,
// `classList.add('…')`, and `{ class: '…' }` handed to an element helper. What an interpolation decides is not read.
export const classesIn = (text) => {
  const flat = flatten(text);
  const out = new Set();
  for (const m of flat.matchAll(CLASS_VALUE)) for (const c of words(m[2])) if (c !== DYNAMIC) out.add(c);
  for (const m of flat.matchAll(/classList\.(?:add|toggle|replace)\(([^)]*)\)/g))
    for (const s of m[1].matchAll(/["'`]([^"'`]+)["'`]/g)) for (const c of words(s[1])) out.add(c);
  return out;
};

// The files that can write a screen's markup. A docstring of a Python or Go file that names `<table>` is not a screen.
export const MARKUP_FILE = /\.(html?|vue|svelte|astro|php|m?[jt]sx?|cjs|cts)$/;

// The classes a stylesheet defines in its selectors; the declarations are emptied first, so `0.5rem` or `a.woff2` do not count.
export const classesDefined = (css) => new Set([...String(css).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{[^{}]*\}/g, '{}')
  .matchAll(/\.(-?[a-z_][\w-]*)/gi)].map((m) => m[1]));

// The stylesheets of the set in the repo, by path: its own components and the catalog's ports copied with it.
// A copy under the folder the server serves (public/design/components/) is the set too: a page loads it from there.
export const SERVED = ['', 'public/', 'static/', 'www/', 'wwwroot/'];
export const setSheets = (root) => SERVED.map((p) => `${p}${SET}`).filter((d) => existsSync(join(root, d)))
  .flatMap((d) => readdirSync(join(root, d), { recursive: true }).map((f) => `${d}/${String(f).split('\\').join('/')}`))
  .filter((f) => /\.s?css$/.test(f));

// The classes the repo's stylesheets defined before the card: a screen that uses them is composed too. The kit's
// templates are not the project's: a class there is used only once it is copied into the set.
export const classesAt = (root, base) => {
  if (!base) return new Set();
  const r = spawnSync('git', ['grep', '-h', '-I', '-e', '', base, '--', '*.css', '*.scss', ':!.claude/**'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return classesDefined(r.stdout ?? '');
};

// The covered elements a piece of markup writes, as `<tag class="…">` or through a helper (`el('button', { class: … })`),
// with the classes each one carries. A hidden input carries a value, it is not a control.
// Comments are not markup: a `<table>` named in `<!-- -->` or `/* */` writes no control.
export const coveredIn = (text) => {
  const flat = flatten(String(text).replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//g, ''));
  const out = [];
  for (const m of flat.matchAll(new RegExp(`<(${TAGS})\\b([^>]*)>`, 'g'))) {
    if (m[1] === 'input' && /\btype\s*=\s*\{?["'`]?hidden\b/i.test(m[2])) continue;
    const classes = [...m[2].matchAll(CLASS_VALUE)].flatMap((c) => words(c[2]));
    if (!classes.includes(DYNAMIC) && !/\bclass(?:Name)?\s*=\s*\{(?!\s*["'`])/.test(m[2])) out.push({ tag: m[1], classes, at: m[0].slice(0, 60) });
  }
  for (const m of flat.matchAll(new RegExp(`\\b(?:h|el|tag|node|make|elem|element)\\(\\s*["'\`](${TAGS})["'\`]\\s*(?:,\\s*(\\{[^{}]*\\}))?`, 'g'))) {
    if (m[1] === 'input' && /type\s*:\s*["'`]hidden/.test(m[2] ?? '')) continue;
    const classes = [...(m[2] ?? '').matchAll(CLASS_VALUE)].flatMap((c) => words(c[2]));
    if (!classes.includes(DYNAMIC) && !/["']?class(?:Name)?["']?\s*:\s*(?![\s"'`])/.test(m[2] ?? '')) out.push({ tag: m[1], classes, at: m[0].slice(0, 60) });
  }
  return out;
};

// The findings of a repo without a catalog of registries, from what was measured: `used` the class words of the markup
// the card added, `files` that markup by file, `set` and `before` the classes the set and the earlier stylesheets
// define, `sheets` the set's stylesheets, `loaded` whether a screen file names one of them, `record` whether the card
// has `## Information`.
export const setFindings = ({ used, files = [], set, before = new Set(), sheets = [], loaded = true, record = false }) => {
  const problems = [];
  const known = (c) => set.has(c) || before.has(c);
  const copy = `\`mkdir -p ${SET} && cp ${TEMPLATES}/{primitives,components,record}.css ${TEMPLATES}/record.{html,js} ${SET}/\`, the ports of ${TEMPLATES}/motion/ the screen uses (reference/components.md, «Without React»), and ${TEMPLATES}/tokens.css as the line's design/tokens.css adapted to its direction`;
  const bare = files.flatMap(({ file, text }) => coveredIn(text).filter((e) => !e.classes.some(known)).map((e) => `${file} ${e.at}`));
  if (bare.length)
    problems.push(`I-set · ${bare.length} control(s) written by hand that the set already solves: ${bare.slice(0, 6).join('; ')}${bare.length > 6 ? '; …' : ''} · close: give each one the set's component (${Object.entries(COVERED).map(([t, c]) => `${t} → ${c.set}`).join(', ')}), with its states and motion; ${sheets.length ? '' : `the project has no set yet: ${copy}`}`);
  if (used.size < MIN_CLASSES) return problems;
  const own = [...used].filter((c) => !known(c));
  const share = (used.size - own.length) / used.size;
  const sample = own.slice(0, 8).join(', ') + (own.length > 8 ? ', …' : '');
  if (share < SET_SHARE && !sheets.length)
    problems.push(`I-set · the screen is drawn by hand: ${own.length} of the ${used.size} classes it names are its own (${sample}) and the project has no component set (${SET}/) · close: copy the set —${copy}—, load its stylesheets on the screen (serve ${SET}/ or copy them beside it) and compose the screen from its components (btn, badge, facts, record-section, …) and the catalog's ports${record ? `, starting from ${SET}/record.html` : ''}; a piece neither covers enters the set, with its states, before the screen uses it`);
  else if (share < SET_SHARE)
    problems.push(`I-set · ${own.length} of the ${used.size} classes the screen names are its own, not the set's (${sample}) · close: compose the screen from the components of ${SET}/ and the catalog's ports in ${TEMPLATES}/motion/; a piece neither covers enters the set, with its states and its gallery entry, before the screen uses it`);
  if (sheets.length && !loaded && [...used].some((c) => set.has(c) && !before.has(c)))
    problems.push(`I-set · the screen names the set's classes but loads none of its stylesheets (${sheets.join(', ')}) · close: link them from the screen, or serve ${SET}/ beside it`);
  const blocks = RECORD_BLOCKS.filter((b) => used.has(b) && known(b));
  if (record && blocks.length < RECORD_MIN)
    problems.push(`I-set · the card has ## Information (a dense record) and the screen uses ${blocks.length} of the record's blocks (${RECORD_BLOCKS.join(', ')}) · close: start the screen from ${SET}/record.html —copy record.css, record.js and record.html from ${TEMPLATES}/—: the header with its facts and the decision (a bottom bar on the phone), the exceptions, the checks and the sections`);
  return problems;
};

// In a repo with the catalog's registries, a native control outside components/ui/ is a component written by hand.
// A control that carries a class the repo's own stylesheets already defined (`before`) is the repo's own component set in use.
export const catalogFindings = (files, before = new Set()) => {
  const native = files.filter(({ file }) => !INSTALLED.test(file))
    .flatMap(({ file, text }) => coveredIn(text).filter((e) => !e.classes.some((c) => before.has(c))).map((e) => ({ file, ...e })));
  if (!native.length) return [];
  const tags = [...new Set(native.map((e) => e.tag))];
  return [`I-catalog · ${native.length} native control(s) written by hand where the catalog has the component: ${native.slice(0, 6).map((e) => `${e.file} ${e.at}`).join('; ')}${native.length > 6 ? '; …' : ''} · close: install and import it —${tags.map((t) => `${t} → ${COVERED[t].catalog}`).join(', ')}— with \`npx shadcn@latest add <item>\`, and the catalog's rows for the rest (reference/components.md); a native element is written only inside components/ui/`];
};
