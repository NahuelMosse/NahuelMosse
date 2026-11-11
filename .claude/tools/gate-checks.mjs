// The checks of the gate that are not a command of `## Gate`: they read what the card and the probe left on disk.
// Each returns `{ name, state: 'passed' | 'failed' | 'could not run', detail }`; verify.mjs prints one line per check.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cardIdOf, gateBlock, readCard, requirementOf, riskOf, rolesOf, specTagsIn, specsOf, tasksOf } from './card-doc.mjs';
import { IS_CODE, IS_TEST, NOT_PRODUCTION, cardFiles, cardStart, existedAt, originOf, ownBase } from './card.mjs';
import { IS_MIGRATION, migrationsOutlook } from './migrations.mjs';
import { overdesignFindings } from './overdesign.mjs';
import { hygieneFindings } from './hygiene.mjs';
import { codeLanguageOf, spanishNames } from './code-language.mjs';
import { active, isPoc, profileStates } from './kit.mjs';
import { IS_SCREEN, SCREEN_MARKUP } from './signals.mjs';
import { sectionOf } from './card-doc.mjs';
import { addedLines, isPublic, publicDeclarations, publicFindings, trackedFiles, visibilityProblems } from './public-bar.mjs';

// bot-wall.mjs and design-checks.mjs come with the web profile: the base alone installs without them, and their checks only run on visual cards.
const optional = async (file) => { try { return await import(file); } catch { return null; } };
const botWall = await optional('./bot-wall.mjs');
const designLib = await optional('./design-checks.mjs');
const colourLib = await optional('../skills/design-taste-frontend/scripts/lib/colour.mjs');
// draw.mjs runs its command line only when it is the entry point: here it only gives `replayDeal`.
const drawLib = await optional('../skills/design-taste-frontend/scripts/draw.mjs');


const ok = (name, detail = '') => ({ name, state: 'passed', detail });
const failed = (name, detail) => ({ name, state: 'failed', detail });
const couldNot = (name, detail) => ({ name, state: 'could not run', detail });

// Every `S#` of `## Specs` has a test that carries `@<ID>-S<n>`. The files looked at are those git knows (tracked or
// not yet), outside specs/ and the kit.
export const specsCheck = (root, cardDir) => {
  const doc = readCard(cardDir);
  const id = cardIdOf(cardDir);
  if (doc !== null && isPoc(root)) return ok('specs', 'poc: no tests');
  if (doc === null) return couldNot('specs', 'the card has no card.md');
  if (!id) return couldNot('specs', `the folder ${basename(cardDir)} has no card ID`);
  const specs = specsOf(doc);
  if (!specs.length) return failed('specs', 'card.md has no `S1 · "<quote>"` line under ## Specs');
  const grep = spawnSync('git', ['grep', '-l', '-I', '-F', '--untracked', '-e', `@${id}-S`, '--', ':(exclude)specs', ':(exclude).claude'], { cwd: root, encoding: 'utf8' });
  if (grep.status !== 0 && grep.status !== 1) return couldNot('specs', `git grep failed: ${(grep.stderr ?? '').trim().split('\n')[0]}`);
  // Only a test that runs covers a spec: a tag in a doc, or on a skipped or todo test, is the spec written down, not verified.
  const live = new Set();
  const dead = new Map();
  for (const f of (grep.stdout ?? '').split('\n').filter(Boolean)) {
    let text = '';
    try { text = readFileSync(join(root, f), 'utf8'); } catch { continue; }
    for (const t of taggedTestsIn(id, f, text)) {
      if (!t.skip) live.add(t.spec);
      else dead.set(t.spec, [dead.get(t.spec), `${f}:${t.line} ${t.skip}`].filter(Boolean).join(', '));
    }
  }
  const lacking = specs.filter((s) => !live.has(s.id)).map((s) => `${s.id}: ${dead.has(s.id) ? `tagged only where no test runs (${dead.get(s.id)})` : 'no test tagged'}`);
  return lacking.length ? failed('specs', `${lacking.join('; ')} (tag a test with @${id}-S<n>)`) : ok('specs', `${specs.length} specs, each with a tagged test`);
};

// Each spec tag of a file with whether its test runs: `skip` is null, or the reason it does not (a file that is not a test,
// a skipped or todo test, a pytest skip/skipif/xfail mark, a Dart `skip:`).
const SKIPPED_CALL = /\b(?:(?:test|it|describe|suite|specify|context)\s*\.\s*(skip|todo|fixme)|(xit|xdescribe|xtest|xcontext|xspecify))\s*\(/;
const CALL_START = /\b(?:test|it|describe|suite|specify|context|xit|xdescribe|xtest|testWidgets|group|scenario|Scenario)\b(?:\s*\.\s*\w+)*\s*\(/;
const EACH_START = /\b(?:test|it|describe)(?:\s*\.\s*(?:only|concurrent))*\s*\.\s*each\s*[(`]/g;
const SKIP_OPTION = /\{\s*(?:\w+\s*:[^,}]*,\s*)*(skip|todo)\s*(?::\s*([^,}]+?))?\s*[,}]/;
const DART_SKIP = /\bskip\s*:\s*(?!false\b|null\b)\S/;
const PY_SKIP = /^\s*@pytest\.mark\.(skip|skipif|xfail)\b/;
// The text of the call that opens at `from`, up to its closing parenthesis (strings skipped roughly).
const callText = (text, from) => {
  let depth = 0;
  let quote = '';
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return text.slice(from, i + 1);
  }
  return text.slice(from);
};
// [start, end) of the first string argument of the call whose `(` is at `open`, or null when it does not open with a string.
const titleRange = (text, open) => {
  let i = open + 1;
  while (/\s/.test(text[i] ?? '')) i++;
  const q = text[i];
  if (q !== '"' && q !== "'" && q !== '`') return null;
  for (let j = i + 1; j < text.length; j++) {
    if (text[j] === '\\') j++;
    else if (text[j] === q) return [i, j];
  }
  return null;
};
// Per language: how a test declaration looks, and the markers that switch it off. A marker counts on an uncommented line.
const DECLARATION = {
  go: { decl: /^\s*(?:\/\/\s*)?func\s+Test\w*/, marks: [[/\bt\.Skip(?:f|Now)?\s*\(/, 't.Skip']], inBody: true },
  cs: { decl: /^\s*(?:\/\/\s*)?(?:public\s+|private\s+|internal\s+)?(?:async\s+)?(?:void|Task)\s+\w+\s*\(/, marks: [[/\[\s*(?:Fact|Theory)\s*\([^\]]*\bSkip\s*=/, 'Skip ='], [/\[\s*Ignore\b/, '[Ignore]']] },
  java: { decl: /^\s*(?:\/\/\s*)?(?:public\s+|private\s+|protected\s+)?(?:static\s+)?void\s+\w+\s*\(/, marks: [[/@(?:Disabled|Ignore)\b/, '@Disabled']] },
  kt: { decl: /^\s*(?:\/\/\s*)?(?:public\s+|private\s+|internal\s+)?fun\s+/, marks: [[/@(?:Disabled|Ignore)\b/, '@Ignore']] },
  feature: { decl: /^\s*(?:#\s*)?(?:Scenario(?: Outline)?|Scenario Template|Example)\s*:/, marks: [[/(?:^|\s)@(?:skip|ignore|wip)\b/i, '@skip']] },
};
const COMMENTED = /^\s*(?:\/\/|#|\*|\/\*)/;
const nearestDeclaration = (lang, lines, n, at) => {
  const { decl, marks, inBody } = DECLARATION[lang];
  if (lang === 'feature' && COMMENTED.test(lines[n])) return { ...at, skip: 'tag is commented out' };
  let d = n;
  while (d < lines.length && !decl.test(lines[d])) d++;
  // No declaration after the tag (a file of tags alone): only the markers around the tag can switch it off.
  if (d >= lines.length) d = n;
  else if (COMMENTED.test(lines[d])) return { ...at, skip: 'test is commented out' };
  // The annotations or tag lines above the tag belong to the same declaration.
  let from = n;
  while (from > 0 && /^\s*(?:@|\[|\/\/|#|\/\*|\*)/.test(lines[from - 1])) from--;
  let to = d;
  if (inBody) { to = d + 1; while (to < lines.length && !decl.test(lines[to])) to++; }
  for (let k = from; k < to; k++) {
    if (COMMENTED.test(lines[k]) && lang !== 'feature') continue;
    if (lang === 'feature' && /^\s*#/.test(lines[k])) continue;
    const hit = marks.find(([re]) => re.test(lines[k]));
    if (hit) return { ...at, skip: hit[1] };
  }
  return at;
};
export const taggedTestsIn =(id, file, text) => {
  const lines = String(text).split('\n');
  const isTestFile = IS_TEST.test(file) && !/\.md$/i.test(file);
  return lines.flatMap((l, n) => specTagsIn(id, l).map((spec) => {
    const at = { spec, line: n + 1, skip: null };
    if (!isTestFile) return { ...at, skip: 'is not a test file' };
    if (/\.py$/.test(file)) {
      let d = n;
      while (d >= 0 && !/^\s*(?:async\s+)?def\s/.test(lines[d])) d--;
      for (let k = d - 1; k >= 0 && /^\s*@/.test(lines[k]); k--) {
        const m = lines[k].match(PY_SKIP);
        if (m) return { ...at, skip: `@pytest.mark.${m[1]}` };
      }
      return at;
    }
    // Go, C#, Java, Kotlin and Gherkin have no title rule: the tag counts when the nearest declaration after it runs.
    const other = file.match(/\.(go|cs|java|kt|feature)$/i)?.[1].toLowerCase();
    if (other) return nearestDeclaration(other, lines, n, at);
    // The tag counts only inside the title (first string argument) of a test call.
    const tagAt = lines.slice(0, n).reduce((a, x) => a + x.length + 1, 0) + Math.max(0, lines[n].indexOf(`@${id}-${spec}`));
    const calls = [...String(text).matchAll(new RegExp(CALL_START.source, 'g'))].map((m) => {
      const open = m.index + m[0].length - 1;
      const title = titleRange(text, open);
      return { start: m.index, open, title, head: m[0], end: m.index + callText(text, open).length };
    });
    // `test.each(table)('title', fn)` and `it.each\`table\`('title', fn)`: the title is in the second call.
    for (const m of String(text).matchAll(EACH_START)) {
      const first = m.index + m[0].length - 1;
      let after = first;
      if (m[0].endsWith('(')) after = first + callText(text, first).length;
      else { const close = titleRange(text, first - 1); after = close ? close[1] + 1 : first + 1; }
      while (/\s/.test(text[after] ?? '')) after++;
      if (text[after] !== '(') continue;
      calls.push({ start: m.index, open: after, title: titleRange(text, after), head: m[0], end: after + callText(text, after).length });
    }
    // Playwright's `test('title', { tag: '@X-1-S1' }, fn)` (a string or an array) tags the test in its options.
    const tagged = (c) => {
      const body = callText(text, c.open).search(/=>|\bfunction\b/);
      return tagAt > c.open && (body < 0 || tagAt < c.open + body) && /\btag\s*:\s*\[?[^\]}]*$/.test(text.slice(c.open, tagAt));
    };
    const own = calls.find((c) => c.title && tagAt >= c.title[0] && tagAt < c.title[1]) ?? calls.find(tagged);
    if (!own) return { ...at, skip: 'tag is not in the title of a test' };
    const outer = calls.find((c) => c !== own && c.start < own.start && c.end > own.start && SKIPPED_CALL.test(c.head));
    if (outer) { const m = outer.head.match(SKIPPED_CALL); return { ...at, skip: `inside ${m[1] ? `.${m[1]}(` : `${m[2]}(`}` }; }
    const offset = own.start;
    const call = callText(text, own.open);
    const skipped = own.head.match(SKIPPED_CALL);
    if (skipped) return { ...at, skip: skipped[1] ? `.${skipped[1]}(` : `${skipped[2]}(` };
    // The options of a node/vitest test sit between the title and the body; a Dart `skip:` after the body.
    const body = call.search(/=>|\bfunction\b/);
    const options = (body < 0 ? call : call.slice(0, body)).match(SKIP_OPTION);
    if (options && !/\.dart$/.test(file) && !/^(?:false|null|undefined)$/.test(options[2] ?? '')) return { ...at, skip: `{ ${options[1]} }` };
    if (/\.dart$/.test(file) && DART_SKIP.test(call.slice(call.lastIndexOf('}')))) return { ...at, skip: 'skip:' };
    return at;
  }));
};

// What `app.mjs probe` wrote (`.validation/probe/w<width>-step<NN>.json`), and in each `--out .validation/probe/<state>/` folder.
export const probeRecords = (root) => {
  const dir = join(root, '.validation', 'probe');
  if (!existsSync(dir)) return [];
  const folders = ['', ...readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()];
  return folders.flatMap((sub) => readdirSync(join(dir, sub)).filter((f) => /^w\d+(?:x\d+)?-step\d+\.json$/.test(f)).sort().flatMap((f) => {
    try { return [{ file: (sub ? `${sub}/` : '') + f.replace(/\.json$/, ''), ...JSON.parse(readFileSync(join(dir, sub, f), 'utf8')) }]; } catch { return []; }
  }));
};

const lensesOf = (cardDir) => riskOf(cardDir)?.lenses ?? [];
export const gateLinesOf = (doc) => (gateBlock(doc) ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

// A spec names its states in the line: `S2 · "…" · state: sending, empty`. With the `visual` lens, each one needs its own
// `probe <state>: <command>` line in `## Gate` (the command writes to `.validation/probe/<state>/`). The same rule judges the
// plan (risk.mjs, before the code) and the gate (after it).
export const statesNamed = (doc) => [...new Set(specsOf(doc).flatMap((s) => (s.text.match(/\bstates?:\s*([^·]+)/i)?.[1] ?? '').split(/[,;]/).map((x) => x.trim()).filter(Boolean)))];
// The instrument of the visual lens depends on the profiles that are on: `probe` for web (the browser probe), `golden` for flutter
// (`kitGolden` in test/kit). Both when both profiles are on; with no kit.json to say, `probe`, as it always was. Given the card,
// one whose task files have Dart and no web screen is a Flutter screen even with web on: goldens and kitA11y, no browser.
export const visualInstruments = (root, doc = null) => {
  let states = {};
  try { states = root ? profileStates(root) : {}; } catch { states = {}; }
  const flutter = states.flutter?.state === 'on';
  const web = states.web?.state === 'on';
  const files = doc ? tasksOf(doc).flatMap((t) => t.files) : [];
  if (flutter && web && files.some((f) => f.endsWith('.dart')) && !files.some((f) => IS_SCREEN.test(f))) return { probe: false, golden: true };
  return { probe: web || !flutter, golden: flutter };
};

// `remove-only: <what goes>` in `## Look`: the card only takes something off a screen (a notice, an error screen). There is no new
// look to bring to a reference, so no `ref:`, no design rounds and no round.json; the states, a11y and screen checks still run on
// what remains. This check holds it against the diff: the card's presentation files lose more lines than they gain.
export const removeOnlyOf = (doc) => sectionOf(doc ?? '', 'Look')?.match(/^\s*(?:[-*]\s*)?remove-only:\s*(\S.*)$/im)?.[1].trim() ?? null;
// `plain: <why>` in `## Look`: the requirement asks for a screen, not for a look (no reference, brand, design or landing in it).
// The screen takes the repo's own styles, or plain semantic HTML when there are none: no `ref:`, no designer, no design rounds,
// no brand sheet and no design line; the states, a11y and screen checks still run.
export const plainOf = (doc) => sectionOf(doc ?? '', 'Look')?.match(/^\s*(?:[-*]\s*)?plain:\s*(\S.*)$/im)?.[1].trim() ?? null;
export const noLookOf = (doc) => removeOnlyOf(doc) ?? plainOf(doc);
export const removeOnlyCheck = (root, cardDir) => {
  const doc = readCard(cardDir) ?? '';
  if (!removeOnlyOf(doc)) return [];
  const roles = rolesOf(doc);
  const files = [...new Set(tasksOf(doc).flatMap((t) => t.files))].filter((f) => roleFor(roles, f) === 'presentation' || IS_SCREEN.test(f) || f.endsWith('.dart'));
  if (!files.length) return [failed('remove-only', 'no presentation file in ## Tasks to take something off')];
  const diff = spawnSync('git', ['diff', '--numstat', `${ownBase(root, cardStart(root, cardDir))}..HEAD`, '--', ...files], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (diff.status !== 0) return [couldNot('remove-only', `git diff failed: ${(diff.stderr ?? '').trim().split('\n')[0]}`)];
  const [added, removed] = diff.stdout.split('\n').filter(Boolean).reduce(([a, r], l) => { const [x, y] = l.split('\t'); return [a + (Number(x) || 0), r + (Number(y) || 0)]; }, [0, 0]);
  return [removed > added ? ok('remove-only', `the presentation files lose ${removed} lines and gain ${added}`) : failed('remove-only', `the presentation files gain ${added} lines and lose ${removed}: the card adds look, so it needs ## Look with ref: and the rounds`)];
};
const instrumentList = (instruments) => [...(instruments.probe ? ['probe'] : []), ...(instruments.golden ? ['golden'] : [])];
export const statesLacking = (doc, instruments = { probe: true, golden: false }) => {
  const kinds = instrumentList(instruments);
  const covered = new Set(gateLinesOf(doc).map((l) => l.match(new RegExp(`^(?:${kinds.join('|')})\\s+([^:[]+?)\\s*(?:\\[[^\\]]*\\])?\\s*:`, 'i'))?.[1]?.toLowerCase()).filter(Boolean));
  return statesNamed(doc).filter((x) => !covered.has(x.toLowerCase()));
};
export const statesCheck = (cardDir, root) => {
  if (!lensesOf(cardDir).includes('visual')) return [];
  const doc = readCard(cardDir) ?? '';
  const named = statesNamed(doc);
  if (!named.length) return [];
  const instruments = visualInstruments(root, doc);
  const lacking = statesLacking(doc, instruments);
  const kind = instrumentList(instruments).join(' or ');
  const hints = [
    instruments.probe ? 'probe <state>: node .claude/tools/app.mjs probe <steps>.json --axe --contrast "…" --out .validation/probe/<state>' : null,
    instruments.golden ? 'golden <state>: flutter test <file> (kitGolden)' : null,
  ].filter(Boolean).map((h) => `\`${h}\``).join(' or ');
  return [lacking.length ? couldNot('states', lacking.map((x) => `no ${kind} for state ${x}`).join('; ') + ` (add ${hints} to ## Gate)`) : ok('states', `${named.length} states, each with its ${kind}`)];
};

// The `contract` lens asks for the HTTP attacks: `attacks: node .claude/tools/attack.mjs <url> … --body-limit <bytes>` in `## Gate`.
export const hasAttacksLine = (doc) => gateLinesOf(doc).some((l) => /^attacks\s*(\[[^\]]*\])?\s*:/i.test(l));
export const attacksCheck = (cardDir) => {
  if (!lensesOf(cardDir).includes('contract')) return [];
  return [hasAttacksLine(readCard(cardDir) ?? '') ?ok('attacks', 'the gate has its attacks line') : failed('attacks', 'contract lens without attacks line')];
};

// The visual rounds: with the `visual` lens the designer leaves the capture of the reference in `specs/<card>/ref/`, and
// `specs/<card>/rondas.md` with one `## Round <k>` per round (2 at least), each with 3 differences or more that carry a change
// (a line that says «sin cambios», «correcto» or «ok» is not one; round 1 alone may carry one `at level · <evidence>` line instead); the captures of the last round are in
// `specs/<card>/rondas/r<k>/` (one folder per round, the probe's `--out`). A form check: it counts headings, lines and files.
export const MIN_ROUNDS = 2;
export const MIN_DIFFERENCES = 3;
const NO_CHANGE = /sin cambios|sin diferencias|no changes?\b|unchanged|correcto|\bok\b/i;
const IMAGE = /\.(?:png|jpe?g|webp)$/i;
// The only way out of a round 1 with no change: `at level · <evidence>` that names 3 aspects at least (hierarchy, typography,
// depth or color, composition, motion or states) and the capture of the reference in `ref/` it was compared with.
const ASPECTS = [/hierarch|jerarqu/i, /typograph|tipograf/i, /depth|profundidad|color/i, /composition|composici/i, /motion|states?\b|estados?/i];
export const atLevelEvidence = (line) => {
  const m = line.match(/^\s*(?:(?:\d+[.)]|[-*])\s+)?at level\s*·\s*(.+)$/i);
  return Boolean(m) && /\bref\/\S+\.(?:png|jpe?g|webp)/i.test(m[1]) && ASPECTS.filter((a) => a.test(m[1])).length >= 3;
};
export const roundsCheck = (cardDir) => {
  if (!lensesOf(cardDir).includes('visual') || noLookOf(readCard(cardDir))) return [];
  // The rounds the grade asks (`designRounds` of its level, 1 at poc); strict when the level cannot be read.
  let minRounds = MIN_ROUNDS;
  try { minRounds = active(resolve(String(cardDir), '..', '..')).exempt.level?.designRounds ?? MIN_ROUNDS; } catch { minRounds = MIN_ROUNDS; }
  const dir = join(cardDir, 'rondas');
  const folders = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && /^r\d+$/.test(e.name)).map((e) => e.name).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))) : [];
  const last = folders.at(-1);
  const images = (d, pattern) => existsSync(d) && readdirSync(d, { withFileTypes: true }).some((e) => (e.isFile() && pattern.test(e.name)) || (e.isDirectory() && images(join(d, e.name), pattern)));
  const notes = existsSync(join(cardDir, 'rondas.md')) ? readFileSync(join(cardDir, 'rondas.md'), 'utf8') : '';
  const blocks = notes.split(/^(?=##\s+(?:Round|Ronda)\s+\d+)/im).filter((b) => /^##\s+(?:Round|Ronda)\s+\d+/i.test(b));
  const thin = blocks.flatMap((b) => {
    const lines = b.split(/\r?\n/).slice(1);
    const first = /^##\s+(?:Round|Ronda)\s+1\b/i.test(b);
    const changes = first && lines.some(atLevelEvidence) ? MIN_DIFFERENCES : lines.filter((l) => /^\s*(?:\d+[.)]|[-*])\s+\S/.test(l) && !NO_CHANGE.test(l)).length;
    return changes < MIN_DIFFERENCES ? [`${b.match(/^##\s+(\S+\s+\d+)/)[1]} has ${changes} differences with a change (${MIN_DIFFERENCES} at least)`] : [];
  });
  const problems = [
    blocks.length < minRounds ? `${blocks.length} rounds in rondas.md (${minRounds} at least)` : null,
    ...thin,
    images(join(cardDir, 'ref'), IMAGE) ? null : 'no capture of the reference in ref/',
    last && images(join(dir, last), /\.png$/i) ? null : 'no captures of the last round (rondas/r<k>/)',
  ].filter(Boolean);
  return [problems.length ? failed('rounds', `visual rounds: ${problems.join('; ')}`) : ok('rounds', `${blocks.length} rounds, the reference in ref/ and the captures of ${last} are there`)];
};

// `ref-genre: <genre>` in `## Look` declares the field of the reference. `ref/` then holds its captures, named
// `<genre>-<site>-<width>-<NN>.png`, 8 or more per width (390 and 1440), none a bot wall or an error page: the capture tool writes
// `ref/captures.json` (`[{ "file", "status", "title", "text" }]`) and bot-wall.mjs reads each entry. No declaration, no check.
export const REF_FRAMES = 8;
export const REF_WIDTHS = [390, 1440];
// A gloss after the genre («drink-food (a local bakery)», «saas — b2b») is a comment, not part of the file names.
export const refGenreOf = (doc) => sectionOf(doc, 'Look')?.match(/^\s*(?:[-*]\s*)?ref-genre:\s*(\S.*)$/im)?.[1].split(/\s+(?:\(|—|·|#)/)[0].trim() || null;
export const refGenreCheck = (cardDir) => {
  if (!lensesOf(cardDir).includes('visual')) return [];
  const genre = refGenreOf(readCard(cardDir) ?? '');
  if (!genre) return [];
  const slug = genre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const dir = join(cardDir, 'ref');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith(`${slug}-`) && IMAGE.test(f)) : [];
  const per = (w) => files.filter((f) => new RegExp(`-${w}-\\d+\\.\\w+$`).test(f)).length;
  const short = REF_WIDTHS.filter((w) => per(w) < REF_FRAMES).map((w) => `${w} px has ${per(w)} captures of ${genre} (${REF_FRAMES} at least, named ${slug}-<site>-${w}-<NN>.png)`);
  if (short.length) return [failed('ref', short.join('; '))];
  let manifest = null;
  try { manifest = JSON.parse(readFileSync(join(dir, 'captures.json'), 'utf8')); } catch { /* absent */ }
  if (!Array.isArray(manifest)) return [couldNot('ref', `${files.length} captures of ${genre}, but ref/captures.json is missing: no way to tell a bot wall or an error page`)];
  if (!botWall) return [couldNot('ref', 'bot-wall.mjs is not installed (web profile off): no way to tell a bot wall or an error page')];
  const walls = manifest.flatMap((c) => { const why = botWall.reasonOf({ status: Number(c.status ?? 0), title: String(c.title ?? ''), text: String(c.text ?? ''), html: '' }); return why ? [`${c.file}: ${why}`] : []; });
  const unlisted = files.filter((f) => !manifest.some((c) => c.file === f));
  if (walls.length) return [failed('ref', `bot wall or error page in ref/: ${walls.slice(0, 5).join('; ')}`)];
  if (unlisted.length) return [couldNot('ref', `${unlisted.length} captures not in ref/captures.json (${unlisted.slice(0, 3).join(', ')}): not checked for a bot wall`)];
  return [ok('ref', `${files.length} captures of ${genre}, ${REF_FRAMES}+ at each of ${REF_WIDTHS.join(' and ')} px, none a bot wall`)];
};

// What design-round.mjs measured (`specs/<card>/rondas/r<k>/round.json`, the last round): the dead-click sweep fails on one
// dead control, and the brand rows on one off the sheet. No round.json is a check that could not run, never a pass.
export const lastRound = (cardDir) => {
  const dir = join(cardDir, 'rondas');
  const folders = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && /^r\d+$/.test(e.name)).map((e) => e.name).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))) : [];
  try { return folders.length ? { name: folders.at(-1), round: JSON.parse(readFileSync(join(dir, folders.at(-1), 'round.json'), 'utf8')) } : null; } catch { return null; }
};
// The sweep reads a page in a browser: a Flutter screen, a remove-only or a plain card has no round.json.
export const designRoundChecks = (cardDir, root) => {
  const doc = readCard(cardDir);
  if (!lensesOf(cardDir).includes('visual') || noLookOf(doc) || !visualInstruments(root, doc).probe) return [];
  const last = lastRound(cardDir);
  const none = 'no rondas/r<k>/round.json: run `node .claude/tools/design-round.mjs <url> --out specs/<card>/rondas/r<k>`';
  if (!last) return [couldNot('dead-clicks', none), couldNot('brand', none)];
  const out = [];
  const sweeps = Object.entries(last.round.widths ?? {}).filter(([, w]) => w.sweep);
  if (!sweeps.length) out.push(couldNot('dead-clicks', `${last.name}/round.json has no sweep (widths 390 touch and 1440)`));
  else {
    const dead = sweeps.flatMap(([key, w]) => w.sweep.dead.map((d) => `${d.selector} (${key}, ${d.reason}, ${d.capture})`));
    out.push(dead.length ? failed('dead-clicks', `${dead.length} dead controls: ${dead.slice(0, 5).join('; ')}`) : ok('dead-clicks', `${sweeps.map(([key, w]) => `${key}: ${w.sweep.checked}`).join(', ')} controls, each with an effect`));
  }
  out.push(brandCheck(last, root, cardDir));
  return out;
};

// The brand rows of the last round hold the page to its sheet: a round run without `--brand`, or with a sheet that has no colors, never
// passes, since a model left to choose returns the same cream and terracotta on every project. A dealt `direction.json` must still be the
// library's: its palette and type, or for an app screen its style tokens and face, are compared with the entries of their ids. A palette
// recoloured for colours no entry carries is recomputed from its entry, and only for colours the card's text names.
const TASTE_LIBRARY = '.claude/skills/design-taste-frontend/library';
const APP_TOKEN_KEYS = ['ground', 'surface', 'raised', 'active', 'text', 'muted', 'accent'];
const PALETTE_FREE_KEYS = ['id', 'name', 'note', 'fit', 'seenIn', 'generated'];
// A value as the comparison sees it: objects with sorted keys, strings in lower case (a hex is the same colour in any case).
const canon = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : typeof x === 'string' ? x.toLowerCase() : x));
const shown = (v) => (typeof v === 'string' ? v : JSON.stringify(v ?? null));
export const dealtDrift = (direction, root, cardText = null) => {
  const lib = join(root, TASTE_LIBRARY);
  if (direction.kind === 'app') {
    let app;
    try { app = JSON.parse(readFileSync(join(lib, 'app.json'), 'utf8')); } catch { return null; }
    const s = (app.styles ?? []).find((x) => x.id === direction.style?.id);
    if (!s) return [`app style ${direction.style?.id ?? '(no id)'} is not in the library`];
    const mine = direction.style.tokens ?? {};
    const drift = APP_TOKEN_KEYS.filter((k) => String(s.tokens?.[k] ?? '').toLowerCase() !== String(mine[k] ?? '').toLowerCase()).map((k) => `style ${s.id}.${k} ${mine[k]} (library ${s.tokens?.[k]})`);
    if (canon(s.tokens?.font ?? null) !== canon(mine.font ?? null)) drift.push(`style ${s.id} font ${shown(mine.font)} (library ${shown(s.tokens?.font)})`);
    return drift;
  }
  let palettes, types;
  try { palettes = JSON.parse(readFileSync(join(lib, 'palettes.json'), 'utf8')); types = JSON.parse(readFileSync(join(lib, 'type.json'), 'utf8')); } catch { return null; }
  const drift = [];
  const generated = direction.palette?.generated;
  // `--keep palette` leaves the colours to the brand: there is no palette to compare.
  let p = direction.palette === null ? null : palettes.find((x) => x.id === (generated ? generated.from : direction.palette?.id));
  if (!p && direction.palette !== null) drift.push(`palette ${generated?.from ?? direction.palette?.id ?? '(no id)'} is not in the library`);
  else if (generated) {
    const asked = Array.isArray(generated.asked) ? generated.asked.map(String) : [];
    // Who asked for a colour is L1 alone, the requirement as given and guarded: the rest of card.md is written by the agent.
    const need = colourLib && cardText !== null ? colourLib.namedColours(requirementOf(cardText)) : null;
    if (!colourLib) drift.push(`palette ${direction.palette.id} is recoloured and the kit's colour module cannot be loaded to recompute it`);
    else if (!asked.length) drift.push(`palette ${direction.palette.id} is recoloured for no colour`);
    else if (need === null) drift.push(`palette ${direction.palette.id} is recoloured and the card's text cannot be read to see who asked for ${asked.join(' and ')}`);
    else {
      const unasked = asked.filter((c) => !need.includes(c));
      const unknown = asked.filter((c) => !(c in colourLib.COLOUR_TARGET));
      if (unasked.length) drift.push(`palette ${direction.palette.id} is recoloured for ${unasked.join(' and ')}, which card.md never names`);
      else if (asked[0] !== need[0]) drift.push(`palette ${direction.palette.id} is recoloured with ${asked[0]} first, and the requirement names ${need[0]} first`);
      if (unknown.length) { drift.push(`palette ${direction.palette.id} is recoloured for ${unknown.join(' and ')}, which is not a colour the kit knows`); p = null; }
      else p = colourLib.recolour(p, asked);
    }
  }
  // Every key of the palette, the fields' ground and ink included: only what the deal annotates (name, note, fit, seenIn, generated) is free.
  if (p && (!generated || p.generated)) {
    const mine = direction.palette ?? {};
    for (const k of [...new Set([...Object.keys(p), ...Object.keys(mine)])].filter((x) => !PALETTE_FREE_KEYS.includes(x))) if (canon(p[k] ?? null) !== canon(mine[k] ?? null)) drift.push(`palette ${p.id}.${k} ${shown(mine[k])} (library ${shown(p[k])})`);
  }
  // `--keep type` leaves the type to the brand: there is nothing to compare.
  if (direction.type === null) return drift;
  const t = types.find((x) => x.id === direction.type?.id);
  if (!t) drift.push(`type ${direction.type?.id ?? '(no id)'} is not in the library`);
  else for (const k of ['display', 'text']) if ((t[k]?.family ?? null) !== (direction.type[k]?.family ?? null)) drift.push(`type ${t.id}.${k} ${direction.type[k]?.family} (library ${t[k]?.family})`);
  return drift;
};
// The palette the deal recorded (`deal` of direction.json: seed, input, history) dealt again by draw.mjs. A palette taken from the
// library by hand has a deal that does not give it. Rows of drift, or null when the replay cannot run.
export const dealReplayDrift = (direction) => {
  if (direction.kind === 'app' || direction.palette === null) return [];
  if (!drawLib) return null;
  if (!direction.deal || typeof direction.deal !== 'object') return ['direction.json carries no `deal` (seed, input, history): the palette cannot be shown to come from the deal'];
  let again;
  try { again = drawLib.replayDeal(JSON.parse(JSON.stringify(direction.deal))); } catch (e) { return [`the \`deal\` of direction.json cannot be dealt again: ${e.message}`]; }
  const dealt = again?.id ?? null;
  const mine = direction.palette?.id ?? null;
  return dealt === mine ? [] : [`palette ${mine} is not what its recorded deal (seed ${direction.deal.seed}) gives: ${dealt}`];
};
// Where a sheet that is not a dealt direction may come from: the `## Brand` block the card was committed with, a DESIGN.md
// identical to a template of the kit, or a file the repo already held, unchanged, before the card started. A sheet written
// during the card is the designer choosing its own palette again. Null when the origin holds, else the reason.
const blockOf = (text, name) => (String(text).split(/^## /m).find((x) => new RegExp(`^${name}\\b`).test(x)) ?? null)?.trim() ?? null;
const showAt = (root, ref, rel) => { const r = spawnSync('git', ['show', `${ref}:${rel}`], { cwd: root, encoding: 'utf8' }); return r.status === 0 ? r.stdout : null; };
const HEX_COLOUR = /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi;
const sameText = (a, b) => a !== null && b !== null && a.replace(/\r\n/g, '\n').trim() === b.replace(/\r\n/g, '\n').trim();
export const sheetOriginProblem = (root, cardDir, file) => {
  const abs = resolve(root, file);
  const rel = relative(root, abs).replaceAll('\\', '/');
  if (rel.startsWith('..') || isAbsolute(rel)) return `${file} lies outside the repo: its origin cannot be checked`;
  let text;
  try { text = readFileSync(abs, 'utf8'); } catch { return `${file} is not readable`; }
  if (resolve(abs) === resolve(cardDir, 'card.md')) {
    const first = spawnSync('git', ['log', '--diff-filter=A', '--format=%H', '--', rel], { cwd: root, encoding: 'utf8' }).stdout?.trim().split('\n').filter(Boolean).at(-1);
    const committed = first ? blockOf(showAt(root, first, rel) ?? '', 'Brand') : null;
    const now = blockOf(text, 'Brand');
    if (sameText(committed, now)) return null;
    // The brand of an existing site is written into `## Brand` after the first commit: its colours are the ones L1 names.
    const norm = (h) => (h.length === 4 ? `#${[...h.slice(1)].map((c) => c + c).join('')}` : h).toLowerCase();
    const mine = (now ?? '').match(HEX_COLOUR) ?? [];
    const required = new Set((requirementOf(text).match(HEX_COLOUR) ?? []).map(norm));
    if (mine.length && mine.every((h) => required.has(norm(h)))) return null;
    return `the ## Brand block of ${rel} is not the one the card was committed with, and holds a colour its requirement does not name`;
  }
  const templates = join(root, '.claude', 'templates', 'design-md');
  if (existsSync(templates) && readdirSync(templates).some((f) => { try { return sameText(readFileSync(join(templates, f), 'utf8'), text); } catch { return false; } })) return null;
  const base = ownBase(root, cardStart(root, cardDir));
  if (sameText(showAt(root, base, rel), text)) return null;
  const unseen = coloursUnseenBefore(root, base, text);
  if (unseen && !unseen.length) return null;
  const detail = unseen?.length ? ` (${unseen.slice(0, 4).join(', ')} not in the repo before the card)` : '';
  return `${rel} was written or edited during the card${detail}: the sheet is the dealt direction.json, a DESIGN.md of .claude/templates/design-md/ as is, the card's ## Brand, a sheet the repo held before the card, or one whose every colour the repo's code already used`;
};
// A sheet written during the card that transcribes the palette the product already has (its theme tokens, its CSS) chooses no
// colour of its own. The colours of the sheet missing from the tree at `base`, outside `.claude/` and `specs/` (the kit's
// templates and the references of earlier cards are not the product), as `#rrggbb`, `#rgb` or a `0xAARRGGBB` literal.
// Null when the sheet holds no colour or the tree cannot be read.
const coloursUnseenBefore = (root, base, text) => {
  const norm = (h) => (h.length === 4 ? `#${[...h.slice(1)].map((c) => c + c).join('')}` : h).toLowerCase();
  const colours = [...new Set((String(text).match(HEX_COLOUR) ?? []).map(norm))];
  if (!colours.length || !base) return null;
  const unseen = [];
  for (const c of colours) {
    const six = c.slice(1);
    const short = six[0] === six[1] && six[2] === six[3] && six[4] === six[5] ? `|#${six[0]}${six[2]}${six[4]}` : '';
    const r = spawnSync('git', ['grep', '-q', '-i', '-E', `(#|0x[0-9a-f]{2})${six}\\b${short ? `${short}\\b` : ''}`, base, '--', '.', ':!.claude', ':!specs'], { cwd: root, encoding: 'utf8' });
    if (r.status === 1) unseen.push(c);
    else if (r.status !== 0) return null;
  }
  return unseen;
};
const brandCheck = (last, root, cardDir) => {
  const sheet = last.round.brand;
  if (!sheet?.file) return failed('brand', `${last.name} ran without --brand: deal the palette and type (\`draw.mjs --out design/taste\`) and run design-round with \`--brand design/taste/direction.json\`, or the card's DESIGN.md or brand sheet`);
  if (!sheet.colors?.length) return failed('brand', `${sheet.file} holds no colors: the primary action and the background are held to nothing (use the dealt direction.json, a DESIGN.md with colors:, or a brand.json with palette)`);
  const where = resolve(root ?? '.', sheet.file);
  // The rows were judged against the sheet as it was when the round ran: the file must still say the same.
  if (designLib) {
    let now = null;
    try { now = designLib.loadBrand(where); } catch { return couldNot('brand', `${sheet.file} is not readable: the round's sheet cannot be checked`); }
    const same = (a, b) => JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort());
    if (!same(now.fonts, sheet.fonts) || !same(now.colors, sheet.colors)) return failed('brand', `${sheet.file} changed since ${last.name} ran: run the round again on the sheet as it is`);
    // Any other edit of the sheet (a role moved, a value changed) leaves the colour and font sets alone: the text itself is hashed.
    if (sheet.sheetHash && designLib.sheetHashOf(where) !== sheet.sheetHash) return failed('brand', `the sheet changed since the round: ${sheet.file} is not the text ${last.name} ran on (sheetHash): run the round again on the sheet as it is`);
  }
  if (/direction\.json$/i.test(sheet.file)) {
    let direction = null;
    try { direction = JSON.parse(readFileSync(where, 'utf8')); } catch { return couldNot('brand', `${sheet.file} is not readable: the dealt sheet cannot be compared with the library`); }
    let cardText = null;
    try { cardText = cardDir ? readFileSync(join(cardDir, 'card.md'), 'utf8') : null; } catch { cardText = null; }
    const replay = dealReplayDrift(direction);
    if (replay === null) return couldNot('brand', 'draw.mjs is not installed: the recorded deal cannot be dealt again');
    const drift = [...(dealtDrift(direction, root ?? '.', cardText) ?? []), ...replay];
    if (drift.length) return failed('brand', `${sheet.file} is not what the library dealt: ${drift.slice(0, 4).join('; ')}`);
  } else if (root && cardDir) {
    const problem = sheetOriginProblem(root, cardDir, sheet.file);
    if (problem) return failed('brand', problem);
  }
  const off = Object.entries(last.round.widths ?? {}).flatMap(([key, w]) => (w.rules ?? []).filter((r) => String(r.rule).startsWith('brand:') && !r.pass && !r.report).map((r) => `${r.rule} (${key}): ${r.value}, ${r.range}${r.detail?.length ? ` · ${r.detail.slice(0, 2).join(', ')}` : ''}`));
  if (off.length) return failed('brand', `${off.length} brand rows off ${sheet.file}: ${off.slice(0, 4).join('; ')}`);
  const rows = Object.values(last.round.widths ?? {}).flatMap((w) => (w.rules ?? []).filter((r) => String(r.rule).startsWith('brand:') && !r.report));
  if (!rows.length) return couldNot('brand', `${last.name}/round.json has no brand rows: no text was measured`);
  return ok('brand', `${rows.length} brand rows within ${sheet.file}`);
};

// The layers: a `rule` file (domain) does no I/O, SQL lives only in `data` files, a `presentation` file has no db access.
// The roles come from `## Tasks` (`src/db.mjs (data)`); the files looked at are the card's production files in the diff.
const NO_IO = [
  ['fetch', /\bfetch\s*\(/],
  ['fs', /\bfrom\s+['"](?:node:)?fs(?:\/promises)?['"]|\brequire\s*\(\s*['"](?:node:)?fs(?:\/promises)?['"]|\bfs(?:\.promises)?\.\w+\s*\(/],
  ['process.env', /\bprocess\.env\b/],
  ['console', /\bconsole\.\w+/],
  ['document', /\bdocument\./],
  ['window', /\bwindow\./],
  ['localStorage', /\blocalStorage\b/],
  ['Date.now', /\bDate\.now\s*\(/],
  ['new Date()', /\bnew\s+Date\s*\(\s*\)/],
  ['Math.random', /\bMath\.random\s*\(/],
];
const SQL = /\b(?:SELECT|INSERT|UPDATE|DELETE)\b[\s\S]{0,80}\b(?:FROM|INTO|SET)\b/i;
const DB_CALL = /\b[\w.]*db\w*\.(?:prepare|exec|query)\s*\(/i;
// Comments are blanked (line numbers stay) so that a word in a comment does not count.
const blankComments = (code) => code.replace(/\/\*[\s\S]*?\*\/|(^|[^:'"`])\/\/[^\n]*/g, (m, lead) => (lead ?? '') + m.slice((lead ?? '').length).replace(/[^\n]/g, ' '));

// The layer a production file has in `## Tasks`: its own path, or the path it ends with; unmarked, the layer folder of its
// slice says it (measured: 24 of 108 refused plans in one repo only lacked a mark the folder already gave).
export const roleFor = (roles, file) => roles.get(file) ?? [...roles].find(([f]) => file.endsWith(`/${f}`))?.[1] ?? layerOfPath(file);
const layerOfPath = (file) => {
  const m = String(file).replaceAll('\\', '/').match(SLICE_FILE);
  return m && m[2].includes('/') ? LAYER_OF_FOLDER[m[2].split('/')[0]] : undefined;
};

// Inside a slice (`modules/<m>/`, `features/<f>/`) each file sits in the folder of its layer, so a feature reads by layer at a
// glance: presentation in `presentation/`, rules in `domain/` (or `application/` for a use case that orchestrates), data in `data/`.
// The names a repo already uses for the same layer count too. Only files the card created are placed; the index stays at the root.
const LAYER_FOLDERS = {
  presentation: ['presentation', 'ui', 'api', 'interface'],
  rule: ['domain', 'application'],
  data: ['data', 'infrastructure'],
};
const LAYER_OF_FOLDER = Object.fromEntries(Object.entries(LAYER_FOLDERS).flatMap(([role, dirs]) => dirs.map((d) => [d, role])));
const SLICE_FILE = /^(.*?(?:^|\/)(?:modules|features)\/[^/]+)\/(.+)$/;
const isSliceDoor = (slice, rest) => /^index\.[a-z]+$/i.test(rest) || rest === `${slice.split('/').pop()}.dart`;
export const misplacedLayer = (file, role) => {
  const m = file.match(SLICE_FILE);
  if (!m || !role || isSliceDoor(m[1], m[2])) return null;
  const folder = m[2].split('/')[0];
  if (m[2].includes('/') && LAYER_FOLDERS[role].includes(folder)) return null;
  return `${file} is (${role}) and sits outside its layer folder · move it to ${m[1]}/${LAYER_FOLDERS[role][0]}/`;
};
// Imports point inward: `domain/` imports neither `presentation/` nor `data/` of its slice, and `data/` does not import `presentation/`.
// A Dart `package:<app>/…` import is read as `lib/…`.
const INWARD = { rule: ['presentation', 'data'], data: ['presentation'] };
export const layerImportProblems = (file, text) => {
  const m = file.match(SLICE_FILE);
  const from = m && LAYER_OF_FOLDER[m[2].split('/')[0]];
  if (!from || !INWARD[from]) return [];
  const lib = file.includes('lib/') ? file.slice(0, file.indexOf('lib/') + 4) : 'lib/';
  const out = [];
  for (const s of blankComments(text).matchAll(SPECIFIERS)) {
    const spec = (s[1] ?? s[2] ?? s[3] ?? s[4]).replace(/^package:[^/]+\//, lib);
    const target = resolveSpecifier(file, spec).match(SLICE_FILE);
    if (!target || target[1] !== m[1]) continue;
    const to = LAYER_OF_FOLDER[target[2].split('/')[0]];
    if (INWARD[from].includes(to)) out.push(`${file}: ${m[2].split('/')[0]}/ imports ${target[2]} · the ${from === 'rule' ? 'domain' : 'data layer'} does not know the ${to === 'data' ? 'data layer' : 'presentation'}; pass what it needs as a parameter`);
  }
  return out;
};

// Text between the bracket that opens at `from` and its pair: a body or an argument list, without parsing the language.
const balanced = (text, from) => {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    if ('({['.includes(text[i])) depth++;
    else if (')}]'.includes(text[i]) && --depth === 0) return text.slice(from + 1, i);
  }
  return text.slice(from + 1);
};
const LOGS = /\bconsole\.|\blogger\b|\blog(?:ger)?\.\w+\(|\blog\(|\bnext\(\s*(?:e|err|error)\b|\bthrow\b/;
// Failures a screen or a server hides: a catch that answers 500 and logs nothing leaves no trace to debug, a `fetch` with no `signal`
// leaves "Sending…" up for good when the server hangs, a form of text fields with no `method="post"` puts what was typed in the URL.
export const sourceProblems = (file, role, raw) => {
  const text = blankComments(raw);
  const out = [];
  const lineOf = (i) => text.slice(0, i).split('\n').length;
  // A comment on the catch's line, inside it or on the line above states why the error does not matter.
  const commented = (from, to) => /\/\/|\/\*/.test(raw.slice(raw.lastIndexOf('\n', raw.lastIndexOf('\n', from - 1) - 1) + 1, (raw.indexOf('\n', to) + 1 || raw.length + 1) - 1));
  for (const m of text.matchAll(/\bcatch\s*(?:\([^)]*\))?\s*\{/g)) {
    if (/["'`]/.test(text[m.index - 1] ?? '')) continue;
    const open = m.index + m[0].length - 1;
    const body = balanced(text, open);
    if (/\b500\b|\bstatus\s*\(\s*500|\bsendStatus\s*\(\s*500/.test(body) && !LOGS.test(body)) out.push(`${file}:${lineOf(m.index)} catch answers 500 and logs nothing · console.error(err) before the response`);
    else if (!body.trim() && !commented(m.index, open + body.length + 2)) out.push(`${file}:${lineOf(m.index)} empty catch swallows the error · handle it, rethrow it, or say in a comment why it does not matter`);
  }
  for (const m of text.matchAll(/\.catch\(\s*(?:\(\s*\w*\s*(?::\s*\w+)?\s*\)|\w+)\s*=>\s*(?:\{\s*\}|null|undefined|void 0)\s*\)/g)) {
    if (!commented(m.index, m.index + m[0].length)) out.push(`${file}:${lineOf(m.index)} .catch that discards the error · log it or let it reach the caller`);
  }
  for (const m of text.matchAll(/^\s*debugger\s*;?\s*$/gm)) out.push(`${file}:${lineOf(m.index)} debugger statement left in production code`);
  // Credentials written in the source reach the repository and the PR; they belong in the environment. Comments are skipped
  // (documentation examples), a key header needs its body after it, and Firebase's generated config holds public identifiers.
  const firebaseConfig = /(^|\/)(firebase_options\.dart|google-services\.json|GoogleService-Info\.plist)$|(^|\/)firebase[\w.-]*\.(js|ts)$/i.test(file);
  for (const m of text.matchAll(/\b(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}|xox[abpr]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35})\b|-----BEGIN [A-Z ]*PRIVATE KEY-----(?:\\n|\s)*[A-Za-z0-9+/=]{40}/g)) {
    if (/EXAMPLE$/.test(m[0]) || (firebaseConfig && m[0].startsWith('AIza'))) continue;
    out.push(`${file}:${lineOf(m.index)} credential written in the source · read it from the environment and rotate it`);
  }
  // File-wide: the options may be built outside the call (`fetch(url, opts)` with `opts.signal`).
  if (role === 'presentation' && !/\bsignal\b|\bAbortSignal\b|\bAbortController\b/.test(text)) {
    const m = /\bfetch\s*\(/.exec(text);
    if (m) out.push(`${file}:${lineOf(m.index)} fetch with no signal in the file · AbortSignal.timeout(ms) so a hung server ends the wait`);
  }
  // A public rule that destructures its object in the parameter list throws TypeError on `fn(null)` before any of its validation runs.
  if (role === 'rule' && /\.(?:[cm]?[jt]s|tsx?)$/.test(file)) {
    for (const m of text.matchAll(/^export\s+(?:default\s+)?(?:async\s+)?function\s*(\w*)\s*\(\s*\{|^export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\(\s*\{/gm)) {
      out.push(`${file}:${lineOf(m.index)} ${m[1] || m[2] || 'default export'} destructures its object parameter: fn(null) throws TypeError before its validation · take the object, validate it (null, {}, missing) and then read its fields`);
    }
  }
  for (const m of text.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const typed = /<input\b(?![^>]*type\s*=\s*["']?(?:hidden|submit|button|checkbox|radio|file)\b)[^>]*>|<textarea\b/i.test(m[2]);
    const method = m[1].match(/\bmethod\s*=\s*(?:["']([^"']*)["']|\{)/i);
    if (typed && (!method || (method[1] !== undefined && method[1].toLowerCase() !== 'post'))) out.push(`${file}:${lineOf(m.index)} form with text fields and no method="post" · a GET puts what was typed in the URL`);
  }
  return out;
};

export const layersCheck = (root, cardDir) => {
  const roles = rolesOf(readCard(cardDir) ?? '');
  if (!roles.size) return couldNot('layers', 'no file roles in ## Tasks');
  const base = cardStart(root, cardDir);
  const files = cardFiles(root, base).filter((f) => IS_CODE.test(f) && !NOT_PRODUCTION.test(f) && existsSync(join(root, f)));
  const found = [];
  for (const file of files) {
    const role = roleFor(roles, file);
    let raw;
    try { raw = readFileSync(join(root, file), 'utf8'); } catch { continue; }
    if (!existedAt(root, ownBase(root, base), file) && !originOf(root, base, file)) { const p = misplacedLayer(file, role); if (p) found.push(p); }
    found.push(...layerImportProblems(file, raw), ...sourceProblems(file, role, raw));
    if (role === 'data') continue;
    const text = blankComments(raw);
    const lines = text.split('\n');
    const at = (re) => { const i = lines.findIndex((l) => re.test(l)); return i < 0 ? null : i + 1; };
    if (role === 'rule') for (const [name, re] of NO_IO) { const n = at(re); if (n) found.push(`${file}:${n} rule file does I/O (${name})`); }
    const hit = SQL.exec(text);
    const sql = hit ? text.slice(0, hit.index).split('\n').length : at(DB_CALL);
    if (sql) found.push(`${file}:${sql} ${role === 'presentation' ? 'presentation file has SQL or db access' : 'SQL outside a data file'}`);
  }
  // Markup is a screen too: its form, its inline script and a component's fetch hide the same failures.
  for (const file of cardFiles(root, base).filter((f) => /\.(html?|vue|svelte|astro)$/i.test(f) && !NOT_PRODUCTION.test(f) && existsSync(join(root, f)))) {
    try { found.push(...sourceProblems(file, 'presentation', readFileSync(join(root, file), 'utf8'))); } catch { /* unreadable: the file checks report it */ }
  }
  // `declared · layers · <file> · <why>` in the card keeps a finding the card means (a catch that must stay silent) as a note.
  const kept = new Set([...(readCard(cardDir) ?? '').matchAll(/declared\s*·\s*layers\s*·\s*([^\s·]+)\s*·\s*\S/g)].map((m) => m[1]));
  const isKept = (p) => kept.has(p.slice(0, p.search(/:\d+ /)));
  const blocking = found.filter((p) => !isKept(p));
  const notes = found.filter(isKept).map((p) => `note: layers · declared in the card: ${p}`);
  return { ...(blocking.length ? failed('layers', blocking.slice(0, 5).join('; ')) : ok('layers', `${files.length} production files, the layers hold`)), notes };
};

// Readability: a file is one concept. A production file that has a top-level class and a top-level function, more than one class, or
// a name of a grab-bag (utils, helpers, manager, misc, common) fails; `kit-shape: <reason>` anywhere in the file declares it.
const GRAB_BAG = /(^|\/)(utils?|helpers?|managers?|misc|common)(\.[a-z]+)*\.[a-z]+$/i;
const TOP_CLASS = /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+\w+/;
const TOP_FN = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\b|^export\s+const\s+\w+\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*(?::[^=]+)?=>|^(?:async\s+)?def\s+\w+/;
export const shapeProblems = (file, text) => {
  if (/kit-shape:\s*\S/.test(text)) return [];
  const lines = blankComments(text).split('\n');
  const classes = lines.filter((l) => TOP_CLASS.test(l)).length;
  const fns = lines.filter((l) => TOP_FN.test(l)).length;
  const out = [];
  if (GRAB_BAG.test(file)) out.push(`${file}: a grab-bag file name (utils, helpers, manager, misc, common) · name the file for the one concept it holds`);
  if (classes && fns) out.push(`${file}: a class and ${fns} top-level function(s) in one file · the class alone, the functions in their own module file`);
  if (classes > 1) out.push(`${file}: ${classes} classes in one file · one class per file`);
  return out;
};
// Only what the card made worse: a file that already had two classes before the card is the repo's, not the card's, and asking a
// card to annotate it cost a whole suite run per round (the annotation changes the code's key).
export const shapeCheck = (root, cardDir) => {
  const base = cardStart(root, cardDir);
  const files = cardFiles(root, base).filter((f) => IS_CODE.test(f) && !NOT_PRODUCTION.test(f) && existsSync(join(root, f)));
  // A moved file is compared with where it came from (originOf).
  const before = (f) => { const r = spawnSync('git', ['show', `${ownBase(root, base)}:${originOf(root, base, f) ?? f}`], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 }); return r.status === 0 ? r.stdout : null; };
  const found = files.flatMap((f) => {
    try {
      const now = shapeProblems(f, readFileSync(join(root, f), 'utf8'));
      const old = before(f);
      // Compared by kind, not by count: one more function in a file that already mixed them is not a new problem.
      const kind = (p) => p.replace(/\d+/g, 'N');
      const had = new Set(old === null ? [] : shapeProblems(f, old).map(kind));
      return now.filter((p) => !had.has(kind(p)));
    } catch { return []; }
  });
  return found.length ? failed('shape', found.slice(0, 5).join('; ')) : ok('shape', `${files.length} production files, one concept each`);
};

// Boundaries between slices (rules/architecture.md, "Module boundaries"): `shared/` imports no slice, a slice enters another
// only by its public index, a slice's index lists what it exports (no `export *`), and no folder is a grab-bag. It reads only
// the card's files, so what the repo already had is not this card's failure. `kit-boundary: <reason>` in the file declares it.
const SLICE = /(?:^|\/)(modules|features)\/([^/]+)(?:\/(.*))?$/;
const IN_SHARED = /(?:^|\/)shared\//;
const GRAB_DIR = /(?:^|\/)(common|core|utils?|helpers?|misc|managers?)\//i;
const SPECIFIERS = /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm;
const resolveSpecifier = (file, spec) => {
  if (!spec.startsWith('.')) return spec;
  const parts = file.split('/').slice(0, -1);
  for (const p of spec.split('/')) { if (p === '..') parts.pop(); else if (p !== '.') parts.push(p); }
  return parts.join('/');
};
const isIndex = (rest) => !rest || /^index(\.[a-z]+)?$/i.test(rest);
export const boundaryProblems = (file, text) => {
  if (/kit-boundary:\s*\S/.test(text)) return [];
  const code = blankComments(text);
  const out = [];
  const own = file.match(SLICE);
  const grab = file.match(GRAB_DIR);
  if (grab) out.push(`${file}: a grab-bag folder (${grab[1]}/) · name the folder for the concept it holds (shared/money/, shared/errors/)`);
  if (own && isIndex(own[3]) && /^\s*export\s*\*\s*from\b/m.test(code)) out.push(`${file}: \`export *\` in a slice's public index · list what is public by name`);
  for (const m of code.matchAll(SPECIFIERS)) {
    const target = resolveSpecifier(file, m[1] ?? m[2] ?? m[3] ?? m[4]).match(SLICE);
    if (!target) continue;
    if (IN_SHARED.test(file) && !own) out.push(`${file}: shared/ imports the slice ${target[2]} · shared knows no slice; move the piece into it or pass it as a parameter`);
    else if (own && own[2] !== target[2] && !isIndex(target[3])) out.push(`${file}: reaches inside the slice ${target[2]} (${target[3]}) · import its public index`);
  }
  return [...new Set(out)];
};
// The language of the code (code-language.mjs): the names in the files the card created are in English unless CLAUDE.md declares
// another `Code language:`. A file the repo already had keeps its names: renaming them is a card of its own.
export const codeLanguageCheck = (root, cardDir) => {
  if (codeLanguageOf(root) !== 'en') return [];
  const base = cardStart(root, cardDir);
  const files = cardFiles(root, base).filter((f) => IS_CODE.test(f) && !/^(?:\.claude|specs)\//.test(f) && existsSync(join(root, f)) && !existedAt(root, ownBase(root, base), f) && !originOf(root, base, f));
  const contract = requirementOf(readCard(cardDir) ?? '');
  const found = files.flatMap((f) => { try { return spanishNames(f, readFileSync(join(root, f), 'utf8'), contract); } catch { return []; } });
  return [found.length ? failed('code-language', `${found.slice(0, 5).join('; ')} · name it in English, or declare \`Code language: <lang>\` in CLAUDE.md`) : ok('code-language', `${files.length} new code files, named in English`)];
};

export const boundariesCheck = (root, cardDir) => {
  const files = cardFiles(root, cardStart(root, cardDir)).filter((f) => IS_CODE.test(f) && !NOT_PRODUCTION.test(f) && existsSync(join(root, f)));
  const found = files.flatMap((f) => { try { return boundaryProblems(f, readFileSync(join(root, f), 'utf8')); } catch { return []; } });
  return found.length ? failed('boundaries', found.slice(0, 5).join('; ')) : ok('boundaries', `${files.length} production files, each slice entered by its index`);
};

// The docs are a product built with the product (templates/docs.md): with the docs module on (mvp and up), a card that changes
// production code updates, in its own diff, the feature page that tells it (`docs/features/<feature>.md`, whose `tests:` names the
// card's tagged test files and whose body has its rules and edge cases), the API contract when it touches a route, and
// `docs/data-model.md` when it touches the schema. `no-docs: <why>` in `## Gate` declares a card that changes no behavior.
const FEATURE_PAGE = /^docs\/features\/.+\.md$/;
const CONTRACT = /(^|\/)(openapi|asyncapi|swagger)[^/]*\.(ya?ml|json)$|(^|\/)schema\.graphql$|^docs\/api\//i;
const DATA_MODEL = /^docs\/data-model\.md$/;
const API_FILE = /(^|\/)(api|routes?|controllers?|handlers?|endpoints?|resolvers?)\/|\.(controller|routes?|resolver)\.[a-z]+$/i;
const DATA_FILE = /(^|\/)(migrations?|schema|models?|entities)\/|\.(entity|model)\.[a-z]+$|(^|\/)schema\.prisma$|\.sql$/i;
export const noDocsOf = (doc) => gateLinesOf(doc).map((l) => l.match(/^no-docs\s*:\s*(\S.*)$/i)?.[1]?.trim()).find(Boolean) ?? null;
const frontList = (text, key) => (text.match(new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]`, 'm'))?.[1] ?? '').split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
export const docsProblems = ({ files, read, id, roles = new Map() }) => {
  const code = files.filter((f) => IS_CODE.test(f) && !NOT_PRODUCTION.test(f) && !IS_TEST.test(f));
  const touchesData = files.some((f) => !IS_TEST.test(f) && (DATA_FILE.test(f) || roles.get(f) === 'data'));
  if (!code.length && !touchesData) return [];
  const out = [];
  const pages = files.filter((f) => FEATURE_PAGE.test(f));
  const tagged = files.filter((f) => IS_TEST.test(f) && id && read(f).includes(`@${id}-S`));
  if (code.length && !pages.length) out.push(`the card changes production code and no docs/features/<feature>.md in its diff · update the page of the feature it changes (template: .claude/templates/docs.md), or \`no-docs: <why>\` in ## Gate when no behavior changes`);
  for (const p of pages) {
    const text = read(p);
    if (!/^##\s+(Rules|Reglas)/im.test(text) || !/^##\s+(Edge cases|Casos borde)/im.test(text)) out.push(`${p}: no \`## Rules\` and \`## Edge cases\` sections`);
  }
  const listed = new Set(pages.flatMap((p) => frontList(read(p), 'tests')));
  const missing = tagged.filter((t) => !listed.has(t));
  if (pages.length && missing.length) out.push(`the feature page's \`tests:\` does not name ${missing.join(', ')}, the card's tests · list them, and close each edge case with \`Tested: <test>\`, \`No test.\` or \`To decide: <AMB/ASM>\``);
  if (code.some((f) => API_FILE.test(f)) && !files.some((f) => CONTRACT.test(f))) out.push('the card touches a route and the API contract (openapi.yaml under docs/api/, or the repo\'s spec) is not in its diff · update the contract');
  if (touchesData && !files.some((f) => DATA_MODEL.test(f))) out.push('the card touches the schema or a data file and docs/data-model.md is not in its diff · update the entity, its relations and its diagram');
  return out;
};
export const docsCheck = (root, cardDir) => {
  let on;
  try { ({ on } = active(root)); } catch { return []; }
  if (!on?.has('docs')) return [];
  const doc = readCard(cardDir) ?? '';
  const declared = noDocsOf(doc);
  if (declared) return [ok('docs', `declared: ${declared}`)];
  const files = cardFiles(root, cardStart(root, cardDir)).filter((f) => existsSync(join(root, f)));
  const read = (f) => { try { return readFileSync(join(root, f), 'utf8'); } catch { return ''; } };
  const found = docsProblems({ files, read, id: cardIdOf(cardDir), roles: rolesOf(doc) });
  return [found.length ? failed('docs', found.slice(0, 5).join('; ')) : ok('docs', 'the feature page, the contract and the data model follow the code')];
};

// The table baseline (DB-MOD-03, DB-MOD-14, P17) over the `CREATE TABLE` of the card's SQL migrations, which Prisma, Drizzle and
// TypeORM also write: a primary key per the repo's id decision (`ids: bigint` in docs/data-model.md allows an identity bigint;
// otherwise a UUID), never serial or an int, and `created_at`/`updated_at` with time zone. `-- kit-table: append-only` above the
// statement leaves only `created_at`; the migrations' own history table is not the app's.
const CREATE_TABLE = /(--\s*kit-table:\s*append-only\s*\n\s*)?CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"\w.]+)\s*\(/gi;
const HISTORY_TABLE = /^[`"]?(_prisma_migrations|schema_migrations|knex_migrations|__drizzle_migrations|flyway_schema_history|alembic_version|__efmigrationshistory|django_migrations|typeorm_migrations|migrations)[`"]?$/i;
const bodyAt = (sql, from) => { let depth = 1; let i = from; for (; i < sql.length && depth; i++) { if (sql[i] === '(') depth++; else if (sql[i] === ')') depth--; } return sql.slice(from, i - 1); };
const columnsOf = (body) => { const out = []; let depth = 0; let cur = ''; for (const c of body) { if (c === '(') depth++; if (c === ')') depth--; if (c === ',' && !depth) { out.push(cur.trim()); cur = ''; } else cur += c; } if (cur.trim()) out.push(cur.trim()); return out; };
const nameOf = (col) => col.match(/^[`"]?(\w+)[`"]?\s/)?.[1]?.toLowerCase() ?? '';
export const tableShapeProblems = (file, sql, { bigintIds = false } = {}) => {
  const out = [];
  for (const m of sql.matchAll(CREATE_TABLE)) {
    const table = m[2].split('.').pop();
    if (HISTORY_TABLE.test(table)) continue;
    const cols = columnsOf(bodyAt(sql, m.index + m[0].length));
    const plain = table.replace(/[`"]/g, '');
    const at = `${file}: table ${plain}`;
    const pkLine = cols.find((c) => /\bPRIMARY\s+KEY\b/i.test(c) && !/^(CONSTRAINT|PRIMARY)\b/i.test(c));
    const pkConstraint = cols.find((c) => /^(CONSTRAINT\s+\S+\s+)?PRIMARY\s+KEY\s*\(/i.test(c));
    const pkCols = pkLine ? [pkLine] : (pkConstraint?.match(/PRIMARY\s+KEY\s*\(([^)]*)\)/i)?.[1] ?? '').split(',').map((n) => n.trim().replace(/[`"]/g, '').toLowerCase()).filter(Boolean).map((n) => cols.find((c) => nameOf(c) === n) ?? '');
    if (!pkCols.length) out.push(`${at} has no primary key (DB-MOD-03)`);
    for (const pk of pkCols.length === 1 ? pkCols : []) {
      if (/\b(small|big)?serial\b|\bAUTO_?INCREMENT\b/i.test(pk)) out.push(`${at}: the primary key is serial or auto-increment · use UUIDv7, or \`bigint GENERATED ALWAYS AS IDENTITY\` with \`ids: bigint\` in docs/data-model.md (DB-MOD-03)`);
      else if (/^\S+\s+(int|integer|int4|smallint|mediumint)\b/i.test(pk)) out.push(`${at}: the primary key is an int · use UUIDv7 (DB-MOD-03)`);
      else if (/^\S+\s+(bigint|int8)\b/i.test(pk) && !bigintIds) out.push(`${at}: the primary key is a bigint and docs/data-model.md does not say \`ids: bigint\` · UUIDv7 is the default (DB-MOD-03)`);
    }
    const appendOnly = Boolean(m[1]);
    for (const name of appendOnly ? ['created_at'] : ['created_at', 'updated_at']) {
      const col = cols.find((c) => [name, name.replace(/_(\w)/, (_, x) => x.toUpperCase())].includes(nameOf(c)) || nameOf(c) === name.replace('_', '').toLowerCase());
      if (!col) out.push(`${at} has no ${name} · \`${name} timestamptz NOT NULL DEFAULT now()\` (DB-MOD-14), or \`-- kit-table: append-only\` above an append-only table`);
      else if (/^\S+\s+timestamp\b(?!\s*(\(\d\))?\s*with\s+time\s+zone)/i.test(col)) out.push(`${at}: ${name} is a timestamp without time zone · \`timestamptz\` (Prisma: \`@db.Timestamptz(3)\`) (DB-MOD-14)`);
      else if (!/\bNOT\s+NULL\b/i.test(col)) out.push(`${at}: ${name} may be null · NOT NULL (DB-MOD-14)`);
    }
  }
  return out;
};
export const tableShapeCheck = (root, cardDir) => {
  const files = cardFiles(root, cardStart(root, cardDir)).filter((f) => IS_MIGRATION.test(f) && /\.sql$/i.test(f) && existsSync(join(root, f)));
  if (!files.length) return [];
  const read = (f) => { try { return readFileSync(join(root, f), 'utf8'); } catch { return ''; } };
  const bigintIds = /^\s*(?:[-*]\s*)?ids:\s*bigint\b/im.test(read('docs/data-model.md'));
  const found = files.flatMap((f) => tableShapeProblems(f, read(f), { bigintIds }));
  return [found.length ? failed('table-shape', found.slice(0, 6).join('; ')) : ok('table-shape', `${files.length} migrations, every new table with its key and its timestamps`)];
};

// Overdesign (overdesign.mjs): a pass-through method, an interface with one implementation or a folder with one tiny file
// fails when the card added it; the same already in the repo is a note, printed by verify.mjs.
export const overdesignCheck = (root, cardDir) => {
  let found;
  try { found = overdesignFindings(root, cardDir); } catch (e) { return couldNot('overdesign', e.message); }
  const result = found.blocking.length ? failed('overdesign', found.blocking.slice(0, 5).join('; ')) : ok('overdesign');
  return { ...result, notes: [
    ...found.notes.map((n) => (found.declared ?? []).includes(n)
      ? `note: overdesign · declared in the Log: ${n}`
      : `note: overdesign · already in the repo, not from this card: ${n}`),
  ] };
};

// Dead and slow code (hygiene.mjs) over what the card added or removed: fails from mvp; a poc carries neither, and a grade
// that leaves K5 off skips the dead code. What the Log declares stays a note.
export const hygieneChecks = (root, cardDir) => {
  if (isPoc(root)) return [];
  const deadOff = (() => { try { return active(root).exempt.criteria.has('K5'); } catch { return false; } })();
  let found;
  try { found = hygieneFindings(root, cardDir); } catch (e) { return [...(deadOff ? [] : [couldNot('dead-code', e.message)]), couldNot('slow-code', e.message)]; }
  const one = (name, f, clean, how) => {
    const r = f.blocking.length
      ? failed(name, `${f.blocking.slice(0, 8).join('; ')}${f.blocking.length > 8 ? `; and ${f.blocking.length - 8} more` : ''} · ${how}`)
      : ok(name, clean);
    return { ...r, notes: f.declared.map((n) => `note: ${name} · declared in the Log: ${n}`) };
  };
  const keep = (name) => `to keep one on purpose: \`kit-keep: <why>\` on its line, or \`declared · ${name} · <file> · <why>\` in the Log`;
  return [
    ...(deadOff ? [] : [one('dead-code', found.dead, 'nothing the card added or left behind is unused', keep('dead-code'))]),
    one('slow-code', found.slow, 'no query per iteration, blocking call, fetch on mount or list without a limit in the lines the card added', keep('slow-code')),
  ];
};

// A fresh migration with more than one statement runs inside a transaction: `BEGIN`/`COMMIT` in the file, or a runner in
// the card's production code that wraps each migration in one.
const statementsIn = (sql) => sql.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, '').split(';').filter((s) => s.trim()).length;
const WRAPS = /\b(?:BEGIN|START\s+TRANSACTION|COMMIT)\b|\.transaction\s*\(|\b(?:with|in)Transaction\b|\bbeginTransaction\b/i;
export const migrationsCheck = (root, cardDir) => {
  const fresh = migrationsOutlook(root).fresh.filter((f) => /\.sql$/i.test(f));
  const read = (f) => { try { return readFileSync(join(root, f), 'utf8'); } catch { return ''; } };
  const open = fresh.filter((f) => statementsIn(read(f)) > 1 && !WRAPS.test(read(f)));
  if (!open.length) return ok('migrations', `${fresh.length} fresh migrations, each atomic`);
  const runner = cardFiles(root, cardStart(root, cardDir)).some((f) => IS_CODE.test(f) && !NOT_PRODUCTION.test(f) && !IS_MIGRATION.test(f) && existsSync(join(root, f)) && /migrat/i.test(read(f)) && WRAPS.test(read(f)));
  return runner ? ok('migrations', `${fresh.length} fresh migrations, wrapped by the runner`) : failed('migrations', `${open.slice(0, 5).join(', ')}: more than one statement outside a transaction (BEGIN/COMMIT in the file, or a runner that wraps it)`);
};

// `no-visual: <why>` in `## Gate` says the card touches code files that build markup without changing what a screen shows. It is a
// declaration, not a command: risk.mjs keeps the visual lens off for it and this check holds it against the card's diff.
export const noVisualOf = (doc) => gateLinesOf(doc).map((l) => l.match(/^no-visual\s*:\s*(\S.*)$/i)?.[1]?.trim()).find(Boolean) ?? null;
const declaredVisual = (cardDir) => riskOf(cardDir)?.declared?.find((d) => d.lens === 'visual') ?? null;
export const noVisualCheck = (root, cardDir) => {
  const declared = declaredVisual(cardDir);
  if (!declared) return [];
  const diff = spawnSync('git', ['diff', '-U0', '--no-color', `${ownBase(root, cardStart(root, cardDir))}..HEAD`, '--', ...declared.files], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (diff.status !== 0) return [couldNot('no-visual', `git diff failed: ${(diff.stderr ?? '').trim().split('\n')[0]}`)];
  let file = '';
  for (const l of diff.stdout.split('\n')) {
    if (l.startsWith('+++ ')) { file = l.slice(4).replace(/^b\//, ''); continue; }
    if (l.startsWith('--- ') || !/^[+-]/.test(l)) continue;
    if (SCREEN_MARKUP.test(l.slice(1))) return [failed('no-visual', `${file} changes markup: ${l.slice(1).trim()}`)];
  }
  return [ok('no-visual')];
};

// The public bar (public-bar.mjs) over the lines the card's diff adds, outside specs/ and .claude/: blocking from mvp, where
// verify runs. `public-allow:` lines exempt a file or a kind with its reason; `public-skip:` carries the user's order.
export const publicCheck = (root, cardDir) => {
  const { allow, skip } = publicDeclarations(readCard(cardDir) ?? '');
  if (skip) return [ok('public', `skipped by the user: ${skip}`)];
  const files = cardFiles(root, cardStart(root, cardDir)).filter((f) => !/^(?:specs|\.claude|\.validation)\//.test(f) && existsSync(join(root, f)));
  if (!files.length) return [ok('public', 'no files outside specs/')];
  const diff = spawnSync('git', ['diff', '-U0', '--no-color', ownBase(root, cardStart(root, cardDir)), '--', ...files], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (diff.status !== 0) return [couldNot('public', `git diff failed: ${(diff.stderr ?? '').trim().split('\n')[0]}`)];
  // A file the card created and git does not track yet has no diff: its lines are all added.
  const untracked = files.filter((f) => !diff.stdout.includes(`+++ b/${f}\n`) && !existedAt(root, ownBase(root, cardStart(root, cardDir)), f) &&
    spawnSync('git', ['ls-files', '--error-unmatch', f], { cwd: root }).status !== 0);
  const lines = [...addedLines(diff.stdout), ...untracked.flatMap((f) => { try { return readFileSync(join(root, f), 'utf8').split('\n').map((line) => ({ file: f, line })); } catch { return []; } })];
  const found = publicFindings(lines, { allow });
  return [found.length ? failed('public', `${found.length} line${found.length > 1 ? 's' : ''} a public repo does not carry: ${found.slice(0, 50).join('; ')}${found.length > 50 ? `; and ${found.length - 50} more` : ''}` +
    ' · fix them, or declare in ## Gate `public-allow: <file> [<kind>] · <why>`; only the user skips the whole bar') : ok('public', `${lines.length} added lines, ready for a public repo`)];
};

// `Visibility: public` in CLAUDE.md: the files of an open-source project, a SemVer version and a CHANGELOG line per card.
export const visibilityCheck = (root, cardDir) => {
  if (!isPublic(root)) return [];
  const read = (f) => { try { return readFileSync(join(root, f), 'utf8'); } catch { return ''; } };
  const found = visibilityProblems({ tracked: trackedFiles(root), changed: cardFiles(root, cardStart(root, cardDir)), read });
  return [found.length ? failed('visibility', `the repo is declared public: ${found.join('; ')}`) : ok('visibility', 'license, changelog, contributing, security, templates and README in place')];
};

// The checks that read the card: verify.mjs adds them to the gate's. `layers` and `migrations` read the repo too, so they need `root`.
export const cardChecks = (cardDir, root) => [...statesCheck(cardDir, root), ...attacksCheck(cardDir), ...roundsCheck(cardDir), ...refGenreCheck(cardDir), ...designRoundChecks(cardDir, root), ...(root ? [layersCheck(root, cardDir), shapeCheck(root, cardDir), overdesignCheck(root, cardDir), ...hygieneChecks(root, cardDir), migrationsCheck(root, cardDir), boundariesCheck(root, cardDir), ...codeLanguageCheck(root, cardDir), ...noVisualCheck(root, cardDir), ...removeOnlyCheck(root, cardDir), ...docsCheck(root, cardDir), ...tableShapeCheck(root, cardDir), ...publicCheck(root, cardDir), ...visibilityCheck(root, cardDir)] : [])];

const NO_PROBE = 'no record in .validation/probe: run `node .claude/tools/app.mjs probe <steps.json> --axe --contrast "<status selectors>"` (a `probe:` line in ## Gate does it)';

// The four checks of the computed CSS the probe records on every step. `fonts`: two type families at most (icon fonts and
// code monospace aside). `sizes`: information for the judge, never a failure (fluid type multiplies the computed sizes;
// a `passed` whose detail starts `info:`). `controls`: fails when more than half of the action controls have no transition
// or animation, otherwise it lists them as info. `reduced-motion`: fails on large or continuous movement (infinite or over
// 1 s, on transform or position) under prefers-reduced-motion. Cheap and deterministic; none for a probe from before it
// recorded `design`.
export const MAX_FAMILIES = 2;
export const MAX_SIZES = 8;
export const designChecks = (records) => {
  const seen = records.filter((r) => r.design);
  if (!seen.length) return [];
  const out = [];
  const families = [...new Set(seen.flatMap((r) => r.design.families))];
  out.push(families.length > MAX_FAMILIES ? failed('fonts', `${families.length} type families (max ${MAX_FAMILIES}): ${families.slice(0, 5).join(', ')}`) : ok('fonts', `${families.length} type families`));
  const worst = seen.reduce((a, r) => (r.design.sizes.length > a.design.sizes.length ? r : a));
  out.push(ok('sizes', `info: ${worst.design.sizes.length} font sizes at most per step (${worst.file}, soft max ${MAX_SIZES}): ${worst.design.sizes.join(', ')}`));
  const still = seen.filter((r) => r.design.unanimatedCount > 0);
  const lack = (r) => `${r.file}: ${r.design.unanimatedCount} of ${r.design.controls} action controls with no transition or animation (${r.design.unanimated.slice(0, 8).join(', ')})`;
  const mostly = still.filter((r) => r.design.unanimatedCount * 2 > r.design.controls);
  if (mostly.length) out.push(failed('controls', mostly.slice(0, 3).map(lack).join('; ')));
  else out.push(ok('controls', still.length ? `info: ${still.slice(0, 3).map(lack).join('; ')}` : `${seen.reduce((n, r) => Math.max(n, r.design.controls), 0)} action controls at most, each with its response`));
  const hinted = seen.filter((r) => r.design.selectHints?.length);
  out.push(hinted.length ? failed('select-placeholder', hinted.slice(0, 3).map((r) => `${r.file}: ${r.design.selectHints.join(', ')} on its empty option in the color of typed text, while the inputs' placeholder is lighter`).join('; ')) : ok('select-placeholder', 'no select on its empty option reads as chosen'));
  const reduced = seen.filter((r) => r.reduced);
  if (!reduced.length) out.push(couldNot('reduced-motion', 'the probe did not measure prefers-reduced-motion'));
  else {
    const moving = reduced.filter((r) => r.reduced.moving > 0);
    out.push(moving.length ? failed('reduced-motion', moving.slice(0, 3).map((r) => `${r.file}: ${r.reduced.moving} large or continuous movements still run with prefers-reduced-motion (${(r.reduced.items ?? []).join(', ')})`).join('; ')) : ok('reduced-motion', 'no large or continuous movement with prefers-reduced-motion'));
  }
  return out;
};

// The three checks of a screen, over the probe's records: axe violations, the contrast of the status texts, and the
// focus after a failed submit (a step that leaves an alert on the page must leave the focus on an element).
export const screenChecks = (records) => {
  if (!records.length) return ['axe', 'contrast', 'focus'].map((n) => couldNot(n, NO_PROBE));
  const out = [];
  if (records.every((r) => r.axe === null || r.axe === undefined)) out.push(couldNot('axe', 'the probe ran without --axe'));
  else {
    const bad = records.flatMap((r) => (r.axe?.violations ?? []).map((v) => `${r.file} ${v.id} (${v.impact ?? 'n/a'})`));
    out.push(bad.length ? failed('axe', bad.slice(0, 5).join('; ')) : ok('axe', `${records.length} steps, no violation`));
  }
  const measured = records.flatMap((r) => [...(r.contrast ?? []), ...(r.statusContrast ?? [])].map((c) => ({ ...c, file: r.file })));
  if (!measured.length) out.push(couldNot('contrast', 'the probe ran without --contrast over the status texts'));
  else {
    // A selector the page lacks measured nothing: counting it as a measure would pass a contrast never taken. One selector is
    // given to every state's probe, so it is missing only when no step measured it (an error message exists only in the error state).
    const taken = new Set(measured.filter((c) => c.found !== false && !c.skipped).map((c) => c.selector));
    const never = new Set(measured.filter((c) => !c.auto && !taken.has(c.selector) && c.skipped !== 'disabled').map((c) => c.selector));
    const bad = [
      ...[...never].map((s) => `${s} ${measured.some((c) => c.selector === s && c.found !== false) ? 'showed no text at any step' : 'not found on the page'}`),
      ...measured.filter((c) => c.aa === false).map((c) => `${c.file} ${c.selector} ${c.ratio}:1 (needs ${c.needed})`),
    ];
    out.push(bad.length ? failed('contrast', bad.slice(0, 5).join('; ')) : ok('contrast', `${measured.length} measures, all AA`));
  }
  // A re-render that drops the focus sends the next Tab to the top of the page: a step that is not a navigation and leaves the
  // focus on nothing, right after a step at the same size that had it on an element, lost it.
  const dropped = records.filter((r, i) => {
    const prev = records[i - 1];
    const moves = r.action && ['goto', 'scroll', 'enter-each'].some((k) => k in r.action);
    return prev && prev.width === r.width && prev.height === r.height && prev.activeElement && !r.activeElement && !moves && !r.error;
  }).map((r) => `${r.file} drops the focus to the page (it was on ${records[records.indexOf(r) - 1].activeElement.tag})`);
  const noRing = records.filter((r) => r.activeElement?.ringDue && r.activeElement.ring === false).map((r) => `${r.file} focuses ${r.activeElement.tag}${r.activeElement.id ? `#${r.activeElement.id}` : ''} with no visible ring (no outline, no box-shadow)`);
  const alerts = records.filter((r) => (r.announcements ?? []).some((a) => a.role === 'alert'));
  // A screen with nothing to submit has no failed submit to look at. Older records carry no `submits` and stay could not run.
  const nothingToSubmit = records.every((r) => r.submits === 0);
  if (!alerts.length && !dropped.length && !noRing.length && nothingToSubmit) out.push(ok('focus', 'no step shows a form or a submit control: no failed submit to look at'));
  else if (!alerts.length && !dropped.length && !noRing.length) out.push(couldNot('focus','no probe step leaves a role=alert on the page: there is no failed submit to look at'));
  else {
    const lost = [...alerts.filter((r) => !r.activeElement).map((r) => `${r.file} shows an alert and the focus is on nothing`), ...dropped, ...noRing];
    out.push(lost.length ? failed('focus', [...new Set(lost)].slice(0, 5).join('; ')) : ok('focus', `${alerts.length} steps with an alert keep the focus on an element, and no step drops it`));
  }
  return [...out, ...busyChecks(records), ...langChecks(records), ...designChecks(records)];
};

// A busy state a screen reader hears and a person sees: `aria-busy` is "true" (an empty value reads as not busy), and the
// spinner inside a busy or disabled control takes a box, and no spinner shows in a button that is neither. Probes older than these fields add no line.
const busyChecks = (records) => {
  const seen = records.filter((r) => r.busyNotTrue || r.hiddenSpinners || r.idleSpinners);
  if (!seen.length) return [];
  const bad = seen.flatMap((r) => [
    ...(r.busyNotTrue ?? []).map((e) => `${r.file} ${e} has aria-busy that is not "true"`),
    ...(r.hiddenSpinners ?? []).map((e) => `${r.file} ${e} sits in a busy control with no box (hidden or display: none)`),
    ...(r.idleSpinners ?? []).map((e) => `${r.file} ${e} shows a spinner in a button that is neither aria-busy nor disabled`),
  ]);
  return [bad.length ? failed('busy', [...new Set(bad)].slice(0, 5).join('; ')) : ok('busy', 'every busy state is announced and its indicator seen')];
};

const STOPWORDS = {
  es: /(?<!\p{L})(el|la|los|las|del|que|tu|con|para|una|por|está|tus|ingresá|elegí)(?!\p{L})/giu,
  en: /(?<!\p{L})(the|and|of|to|your|with|for|is|this|you|enter|choose)(?!\p{L})/giu,
};
// The language the visible text is written in, by its stopwords; '' when neither clearly wins.
export const textLanguage = (text) => {
  const [first, second] = Object.entries(STOPWORDS).map(([lang, re]) => [lang, (String(text).match(re) ?? []).length]).sort((a, b) => b[1] - a[1]);
  return first[1] >= 3 && first[1] >= 2 * second[1] ? first[0] : '';
};

// `<html lang>` names the language of the text: a screen reader reads Spanish with an English voice otherwise.
const langChecks = (records) => {
  const seen = records.filter((r) => typeof r.lang === 'string' && r.text);
  if (!seen.length) return [];
  const bad = seen.map((r) => ({ r, said: r.lang.toLowerCase().split('-')[0], is: textLanguage(r.text) }))
    .filter(({ said, is }) => is && said !== is).map(({ r, said, is }) => `${r.file}: <html lang="${said}"> on text in ${is}`);
  return [bad.length ? failed('lang', [...new Set(bad)].slice(0, 3).join('; ')) : ok('lang', '<html lang> matches the language of the text')];
};
