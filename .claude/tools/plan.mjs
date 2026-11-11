// The plan of a card, judged before the code: what the gate would only find out after it. risk.mjs runs it before it freezes
// risk.json; a card with a gap in the plan is not built.
// One rule, two moments: the checks over `## Gate` (probe per state, attacks line) and over `## Tasks` (the layer of a file)
// are the ones gate-checks.mjs runs on the code afterwards.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, join, resolve } from 'node:path';
import { asmsOf, cardIdOf, plannedTestsOf, reuseOf, rolesOf, sectionOf, specTagsIn, specsOf, tasksOf, whyLayerOf } from './card-doc.mjs';
import { IS_CODE, IS_TEST, NOT_PRODUCTION } from './card.mjs';
import { gateLinesOf, hasAttacksLine, misplacedLayer, noLookOf, plainOf, roleFor, statesLacking, visualInstruments } from './gate-checks.mjs';
import { IS_MIGRATION } from './migrations.mjs';
import { informationProblems, isProductLook } from './information.mjs';
import { SET, TEMPLATES, usesCatalog } from './component-set.mjs';
import { active, isPoc } from './kit.mjs';
import { codeLanguageOf, declaresCodeLanguage, isSpanish } from './code-language.mjs';

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const LOOK_MAX_LINES = 15;

// The visual direction a screen is built toward: `## Look` with `ref:` (an image in `specs/<card>/ref/` or a URL),
// `behavior:` (one line per moment) and `tokens:`; short, so that it is read.
export const lookProblems = (doc, cardDir) => {
  const section = sectionOf(doc, 'Look');
  if (section === null) return ['no `## Look` section (visual lens): add `ref:`, `behavior:`, `tokens:` and `copy:` (template: .claude/templates/card.md), `remove-only: <what goes>` when the card only takes something off a screen, or `plain: <why>` when the requirement asks for a screen and names no look, reference, brand or landing'];
  // A card that only takes something off has no new look to direct: the gate's `remove-only` check holds it against the diff.
  // A plain card takes the repo's styles: there is no direction to write.
  if (noLookOf(doc)) return [];
  const lines = section.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('<!--'));
  const field = (name) => lines.flatMap((l) => { const m = l.match(new RegExp(`^(?:[-*]\\s*)?${name}:\\s*(.*)$`, 'i')); return m && m[1].trim() ? [m[1].trim()] : []; });
  const out = [];
  if (lines.length > LOOK_MAX_LINES) out.push(`## Look has ${lines.length} lines (max ${LOOK_MAX_LINES}): it is a direction, not a document`);
  const refs = field('ref');
  if (!refs.length) out.push('## Look has no `ref:` (an image in specs/<card>/ref/ or a URL)');
  // A `ref:` is one or several parts joined by ` · ` (a file, a URL): each part is a file in ref/ or a well-formed http(s) URL.
  const wellFormedUrl = (u) => { try { return /^https?:$/.test(new URL(u).protocol) && !/\s/.test(u); } catch { return false; } };
  for (const r of refs) for (const part of r.split(' · ').map((p) => p.trim()).filter(Boolean)) {
    const ok = /^https?:\/\//i.test(part) ? wellFormedUrl(part) : existsSync(join(cardDir, 'ref', basename(part)));
    if (!ok) out.push(`## Look ref ${part}: not a well-formed http(s) URL and not a file in specs/${basename(String(cardDir))}/ref/`);
  }
  for (const i of field('intent')) if (!['collage', 'statement', 'grid', 'pinned-media'].includes(i.toLowerCase())) out.push(`## Look \`intent: ${i}\` is not one of collage, statement, grid, pinned-media`);
  if (!field('behavior').length) out.push('## Look has no `behavior:` line (load, cursor and hover, entering the view, each action or state of the card)');
  if (!field('copy').length) out.push('## Look has no `copy:` (the concrete number of the offer and who speaks, or "no number · <who speaks>"; reference/copy.md)');
  if (!field('tokens').length) out.push('## Look has no `tokens:` (mood or genre, spacing and easing; fonts and palette only when the brand or the requester gives them; or "the repo\'s: <path>")');
  for (const t of field('tokens')) {
    if (/los del repo|the repo'?s|design system/i.test(t)) continue;
    const names = t.split(/[·;|]/)[0].replace(/^\s*(?:fonts?|fuentes?)\b:?\s*/i, '').split(/[,+/]|\band\b|\by\b/i).map((n) => n.replace(/^["'\s]+|["'\s]+$/g, '').toLowerCase()).filter(Boolean);
    // A product screen reads in the system or a neutral UI font: the display-font rule is a landing's.
    if (!isProductLook(doc) && names.length && names.every((n) => GENERIC_FONTS.includes(n))) out.push('## Look `tokens:` names only generic fonts: a display font with character (the generic system fonts are the default look)');
  }
  return out;
};
const GENERIC_FONTS = ['system-ui', 'sans-serif', 'serif', '-apple-system', 'segoe ui', 'inter', 'roboto', 'arial', 'helvetica'];

// A spec that talks about a set («un campo», «cada campo», «todos», «cualquier», each, every, any) is tested once per member
// the card names between «», or the card says `declared · <S#> · <why>`.
export const QUANTIFIER = /\b(?:campo|campos|cada|todos|todas|cualquier|cualquiera|field|fields|each|every|any)\b/i;
export const membersOf = (doc) => {
  const seen = new Map();
  for (const m of (sectionOf(doc, 'Specs') ?? '').matchAll(/«([^»\n]+)»/g)) seen.set(m[1].trim().toLowerCase(), m[1].trim());
  return [...seen.values()];
};
export const quantifierProblems = (doc, id, planned) => {
  const members = membersOf(doc);
  if (!id || members.length < 2) return [];
  return specsOf(doc).flatMap((s) => {
    if (!QUANTIFIER.test(s.text)) return [];
    if (declaredFor(doc, s.id)) return [];
    const count = planned.filter((t) => specTagsIn(id, t.title).includes(s.id)).length;
    return count < members.length ? [`${s.id}: speaks of a set and the card names ${members.length} members (${members.map((x) => `«${x}»`).join(', ')}) but ${count} planned tests carry its tag · one test per member in its T line, or \`declared · ${s.id} · <why>\``] : [];
  });
};
// A spec with two branches («name or email», «the first one», «otherwise») tested once covers one of them: measured, the
// judge's findings on a single-test «or» repeated across cards.
export const BRANCH = /(?<![\p{L}\d])(?:o|u|or|either|otherwise|si no|sino|en cambio|primer|primera|primero|first)(?![\p{L}\d])/iu;
export const branchProblems = (doc, id, planned) => {
  if (!id) return [];
  return specsOf(doc).flatMap((s) => {
    if (!BRANCH.test(s.text) || declaredFor(doc, s.id)) return [];
    const count = planned.filter((t) => specTagsIn(id, t.title).includes(s.id)).length;
    return count === 1 ? [`${s.id}: has two branches («${s.text.match(BRANCH)[0]}») and one planned test · a test per branch in its T line, or \`declared · ${s.id} · <why>\``] : [];
  });
};
// A spec past 500 characters usually holds several behaviors under one tag, and the one test it gets checks only one of them.
export const SPEC_MAX_CHARS = 500;
// Only what the card writes counts: the quote of the requirement is verbatim and keeps its length.
// A quote is a pair of marks around a dozen characters or more, so an inch mark (6") does not open one.
const ownPart = (text) => text.replace(/(?<!\d)"[^"\n]{12,}"|“[^”]*”|«[^»]*»/g, '');
// Its own declaration, so keeping a long scenario does not also silence the branch and quantifier checks of that S#.
export const longSpecProblems = (doc) => specsOf(doc).flatMap((s) => (ownPart(s.text).length > SPEC_MAX_CHARS && !declaredFor(doc, `long-spec\\s*·\\s*${s.id}`)
  ? [`${s.id}: ${ownPart(s.text).length} characters in one scenario · split it into one S# per behavior, or \`declared · long-spec · ${s.id} · <why it is one>\``]
  : []));

const wordsOf = (s) => new RegExp(`(?<![\\p{L}\\d])(?:${s})(?![\\p{L}\\d])`, 'iu');
const PROMISES_RESPONSE = /\b[1-5]\d\d\b|\bdevuelv\w*|\bresponde\w*|\breturns?\b|\bresponds?\b|\bse (?:guarda|devuelve)\b|\b(?:saved|stored|returned)\b/i;
// A test goes through the app when a path or file-name token is one of these (`test/api/x`, `items-api.test`, `app.test`),
// not when the letters appear inside another word (`mapper`, `happy-path`, `approval`).
const API_TEST_FILE = /(?:^|[/._-])(?:api|http|e2e|app|route|server)(?:[/._-]|$)/i;
const EVERY_RESPONSE = wordsOf('toda respuesta|todas las respuestas|every response|all responses');
// A uniqueness constraint, not «the only one» (`el único pedido`) nor a one-off (`pago único`): «único»/«unique» counts
// next to a key noun or with «por»/«per»; «ya existe», «repetido», «duplicado», «duplicate», «no se repite» count alone.
const UNIQUE_WORD = '[uú]nic[oa]s?|unique';
const UNIQUE_KEY = 'e-?mails?|correo|c[oó]digo|code|id|n[uú]mero|number|nombre|name|key|clave|dni|cuit|usuario|user|username|slug|sku|token|identificador|identifier';
const UNIQUENESS = wordsOf(`ya existe|no se repite|repetid[oa]s?|duplicad[oa]s?|duplicate|` +
  // A key noun and «único» in a constraint frame: «el email es único», «unique email», «único por usuario». A price, a size
  // or an experience that is «único» constrains nothing.
  `(?:${UNIQUE_KEY})\\s+(?:(?:es|is|must be|debe ser|has to be|tiene que ser)\\s+(?:[\\p{L}-]+\\s+(?:y|and)\\s+)?)?(?:${UNIQUE_WORD})|` +
  // «dos usuarios con el mismo email», «two users with the same email», «el email registrado dos veces», «the email used twice».
  `(?:dos|two)\\s+(?:[\\p{L}-]+\\s+){1,4}?(?:con el mismo|with the same|mismo|same)\\s+(?:${UNIQUE_KEY})|` +
  `(?:${UNIQUE_KEY})(?:\\s+[\\p{L}-]+){0,6}?\\s+(?:dos veces|twice)|` +
  `(?<!(?<![\\p{L}\\d])(?:el|la|los|las|lo|un|una|su|sus|the|only)\\s+)(?:${UNIQUE_WORD})\\s+(?:${UNIQUE_KEY})|` +
  `(?:${UNIQUE_WORD})\\s+(?:por|per)\\s+(?:${UNIQUE_KEY}|cliente|customer|cuenta|account|pedido|order)`);
const CONTRACT_DOC = wordsOf('contrato|contract|openapi|documenta\\w*|documents');
const OLD_ROWS = wordsOf('old|existing|legacy|null|viej[oa]s?|existentes?');
const FILTER_OR_ORDER = wordsOf('filters?|filtering|filtros?|filtra\\w*|search|busca\\w*|order\\w*|orden\\w*|sort\\w*');
const SEVERAL = wordsOf('several|two|multiple|varios|varias|dos|m[uú]ltiples');
const DOM_FILE = /\.(tsx|jsx|vue|svelte|html)$/;
const hasFlag =(lines, flag) => lines.some((l) => l.includes(flag));
// `declared · <topic> · <why>` as a line of its own (a Log line may carry its `L<n> · <date> ·`); the topic may lead a list («S1, S2»).
const declaredFor = (doc, what) => new RegExp(`^\\s*(?:[-*]\\s*)?(?:L\\d+\\s*·\\s*(?:\\d{4}-\\d{2}-\\d{2}\\s*·\\s*)?)?declared\\s*·\\s*(?:[\\w-]+\\s*,\\s*)*(?:${what})\\b`, 'im').test(doc);

// `<ID>-ASM-NN · <reading> · S<n>` → { id, text } with the id removed from the text.
const asmLinesOf = (doc) => (sectionOf(doc, 'Specs') ?? '').split('\n').flatMap((line) => {
  const m = line.match(/^\s*(?:[-*]\s*)?([A-Z][A-Z0-9]*-\d+[A-Za-z0-9]*-ASM-\d+)\b[\s·:.-]*(.*)$/);
  return m ? [{ id: m[1], text: m[2].trim() }] : [];
});

// The steps files the `probe <state>:` lines name, read from the repo root, the card folder or its steps/ folder; '' when none exists yet.
const probeLinesOf = (doc) => gateLinesOf(doc).filter((l) => /^probe\s+[^:[]+?\s*(?:\[[^\]]*\])?\s*:/i.test(l));
const stepsTextOf = (doc, cardDir, root) => probeLinesOf(doc).flatMap((l) => l.match(/[^\s"']+\.json\b/g) ?? []).flatMap((p) =>
  [join(root, p), join(cardDir, p), join(cardDir, 'steps', basename(p))].filter(existsSync).slice(0, 1)).map((p) => readFileSync(p, 'utf8')).join('\n');

// The behavior a card already has: a file of `## Tasks` that exists in main, in a card that touches a route or a screen.
// One listing per ref, not one git call per file and ref.
const filesAt = new Map();
const filesOf = (root, ref) => {
  const key = `${root}\n${ref}`;
  if (!filesAt.has(key)) {
    const r = spawnSync('git', ['ls-tree', '-r', '-z', '--full-tree', '--name-only', ref], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
    filesAt.set(key, r.status === 0 ? new Set(r.stdout.split('\0')) : new Set());
  }
  return filesAt.get(key);
};
const existsInMain = (root, file) => ['origin/main', 'main', 'master'].some((ref) => filesOf(root, ref).has(file));

// The plan rules that read what a spec or an assumption promises against the layer of its test, the flags of `attacks:` and the steps of `probe`.
const mutateSuiteOf = (tasks, f) => {
  const test = tasks.find((t) => t.files.includes(f))?.files.find((x) => IS_TEST.test(x));
  return test ? `node --test ${test}` : 'node --test <test file that imports it>';
};

export const promiseProblems = (doc, { cardDir, lenses = [], root }) => {
  const out = [];
  const id = cardIdOf(cardDir);
  const planned = plannedTestsOf(doc);
  const tasks = tasksOf(doc);
  const roles = rolesOf(doc);
  const gate = gateLinesOf(doc);
  const attacks = gate.filter((l) => /^attacks\s*(\[[^\]]*\])?\s*:/i.test(l));
  const specs = specsOf(doc);
  const asms = asmLinesOf(doc);
  const items = [...specs.map((s) => ({ ...s, tests: id ? planned.filter((t) => specTagsIn(id, t.title).includes(s.id)) : [] })),
    ...asms.map((a) => ({ ...a, tests: planned.filter((t) => new RegExp(`@(?:assumption:)?${escape(a.id)}(?!\\d)`).test(t.title)) }))];

  if (lenses.includes('contract')) for (const it of items) {
    if (!PROMISES_RESPONSE.test(it.text) || !it.tests.length) continue;
    const observable = it.tests.some((t) => {
      const task = tasks.find((k) => k.id === t.task);
      return API_TEST_FILE.test(posix(t.file)) || (task?.files ?? []).some((f) => !IS_TEST.test(f) && roleFor(roles, f) !== 'rule');
    });
    if (!observable) out.push(`${it.id}: promises a response and its planned tests are all on rules (rule) · add a test through the app or the api (a file named api|http|e2e|app|route|server) to its T line: \`· tests: test/api/<x>.test.mjs "<title @${it.id.includes('-') ? it.id : `${id}-${it.id}`}>"\``);
  }

  for (const a of asms) {
    if (declaredFor(doc, escape(a.id))) continue;
    const titles = planned.filter((t) => new RegExp(`@(?:assumption:)?${escape(a.id)}(?!\\d)`).test(t.title)).map((t) => t.title.toLowerCase());
    const body = a.text.replace(/·\s*S\d+\s*$/, '');
    // A number inside a name (CU-18, a date, v2) is not a value of the assumption.
    const values = [...new Set([...(body.match(/(?<![\w./-])\d+(?![\w/-])/g) ?? []), ...[...body.matchAll(/«([^»\n]+)»/g)].map((m) => m[1].trim())])];
    const ordered = /\b(?:orden|order)\b/i.test(body) ? [...body.matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim()) : [];
    const all = [...values, ...ordered];
    const missing = all.filter((v) => !titles.some((t) => t.includes(v.toLowerCase())));
    // The rule is for an assumption of several clauses, where a test can cover one and skip the rest; a single value is
    // one clause, and its tagged test already covers it (measured: 20 of 35 refusals were of one value).
    if (titles.length && all.length >= 2 && missing.length) out.push(`${a.id}: its literal values (${missing.map((v) => `«${v}»`).join(', ')}) are in no title of its planned tests · name them in the title of its test, or \`declared · ${a.id} · <why>\``);
  }

  if (lenses.includes('contract') && specs.some((s) => EVERY_RESPONSE.test(s.text)) && !hasFlag(attacks, '--common-headers') && !declaredFor(doc, 'common-headers'))
    out.push(`${specs.find((s) => EVERY_RESPONSE.test(s.text)).id}: speaks of every response and \`attacks:\` has no \`--common-headers "<A, B>"\` · append it, or \`declared · common-headers · <why>\``);
  if (lenses.includes('contract')) {
    const unique = items.find((s) => UNIQUENESS.test(s.text));
    const search = specs.find((s) => /\b(?:buscar|busca|búsqueda|search|contiene|contains)\b/i.test(s.text));
    if (search && !hasFlag(attacks, '--search') && !declaredFor(doc, 'search'))
      out.push(`${search.id}: filters by free text and \`attacks:\` has no \`--search "<path> <param>"\` (\`%\`, \`_\` and a quote are literal) · append it, or \`declared · search · <why>\``);
    const contractual = specs.find((s) => CONTRACT_DOC.test(s.text));
    if (contractual && !hasFlag(attacks, '--openapi') && !declaredFor(doc, 'openapi'))
      out.push(`${contractual.id}: speaks of a contract or its documentation and \`attacks:\` has no \`--openapi <file.yaml|json>\` · append it to the \`attacks:\` line, e.g. \`--openapi docs/openapi.yaml\`, or \`declared · openapi · <why>\``);
    if (unique && !hasFlag(attacks, '--unique') && !declaredFor(doc, 'unique')) out.push(`${unique.id}: speaks of a duplicate or a unique value and \`attacks:\` has no \`--unique "<METHOD> <path> <body>"\` · append it to the \`attacks:\` line, e.g. \`--unique "POST /<path> <field>=<value>"\`, or \`declared · unique · <why>\``);
  }
  const hasData = tasks.some((t) => t.files.some((f) => IS_MIGRATION.test(f) || roleFor(roles, f) === 'data'));
  if ((lenses.includes('contract') || lenses.includes('integrity')) && hasData && !hasFlag(attacks, '--fault-db') && !declaredFor(doc, 'fault-db'))
    out.push('a migration or a `(data)` file in ## Tasks and `attacks:` has no `--fault-db <file>` · add it, or `declared · fault-db · <why>`');
  const migrations = [...new Set(tasks.flatMap((t) => t.files))].filter((f) => IS_MIGRATION.test(f));
  const titles = planned.map((t) => t.title);
  const tagOf = (sid) => `@${id ?? '<ID>'}-${sid}`;
  const addsNullable = migrations.some((f) => { try { return /add\s+column\b(?![^;]*\bnot\s+null)/i.test(readFileSync(join(root, f), 'utf8')); } catch { return false; } })
    || (migrations.length > 0 && /\bnullable\b|columna nueva|new column|agrega(?:r)? (?:una )?columna|adds? a (?:new )?column/i.test(sectionOf(doc, 'Specs') ?? ''));
  if (addsNullable && !titles.some((t) => OLD_ROWS.test(t) && FILTER_OR_ORDER.test(t)) && !declaredFor(doc, 'nullable'))
    out.push(`a migration adds a nullable column and no planned test title mixes old rows with a filter or the order (old, existing or null, plus filter, search or order) · add one to a T line, e.g. \`· tests: test/api/<x>.test.mjs "existing rows with null <column> still appear in the filter and the order ${tagOf('S<n>')}"\`, or \`declared · nullable · <why>\``);
  const uniqueSpec = items.find((s) => UNIQUENESS.test(s.text));
  if (uniqueSpec && migrations.length && !titles.some((t) => SEVERAL.test(t) && /\bnull\b/i.test(t)) && !declaredFor(doc, 'null-unique'))
    out.push(`${uniqueSpec.id}: speaks of a unique value and the card has a migration, and no planned test title says several or two and null (several rows with null in the unique column are not duplicates) · add one to a T line, e.g. \`· tests: test/api/<x>.test.mjs "two rows with null <column> do not collide ${tagOf(uniqueSpec.id)}"\`, or \`declared · null-unique · <why>\``);
  const mutated = gate.filter((l) => /^mutate\b/i.test(l)).join('\n');
  const unmutated = [...new Set(tasks.flatMap((t) => t.files))].filter((f) => !IS_TEST.test(f) && !IS_MIGRATION.test(f) && IS_CODE.test(f) && ['presentation', 'data'].includes(roleFor(roles, f)) && !DOM_FILE.test(f) && !mutated.includes(f) && !declaredFor(doc, `mutate\\s*·\\s*${escape(f)}`));
  // A screen's script is mutated too: measured, a form whose logic only browser tests reached left every mutant alive.
  // A DOM file (.tsx, .jsx, .vue, .svelte, .html) is not: it has no logic and needs a browser per mutant (required.mjs).
  if ((lenses.includes('contract') || lenses.includes('visual')) && mutated && unmutated.length)
    out.push(`${unmutated[0]} carries behavior the card promises and no \`mutate\` line names it${unmutated.length > 1 ? ` (nor ${unmutated.slice(1).join(', ')})` : ''} · add to ## Gate: ${unmutated.map((f) => `\`mutate ${f}: ${mutateSuiteOf(tasks, f)}\``).join(' · ')} (each with a node test that imports its logic), or \`declared · mutate · <file> · <why>\` for the file it silences`);
  // Measured: 9 refusals in one repo repeated this rule, whose message gave no form to close it.
  if (lenses.includes('integrity') && gate.some((l) => /^app\s*:/i.test(l)) && !planned.some((t) => /reinici|restart|sobrevive/i.test(t.title)) && !declaredFor(doc, 'restart'))
    out.push('integrity lens with an `app:` line and no planned test whose title says reinici, restart or sobrevive (a record survives restarting the app on the same database) · ' +
      'add that test to a T line, e.g. `· tests: test/api/<x>.test.mjs "a saved record survives a restart of the app @' + (id ?? '<ID>') + '-S<n>"`, or `declared · restart · <why>` when the card keeps nothing a restart can lose');

  const instruments = visualInstruments(root ?? resolve(String(cardDir), '..', '..'), doc);
  if (lenses.includes('visual') && instruments.golden) {
    if (!gate.some((l) => /^a11y\s*(\[[^\]]*\])?\s*:/i.test(l))) out.push('no `a11y:` line in ## Gate (visual lens, flutter): `a11y: flutter test <file>` with `kitA11y`');
    const moving = (sectionOf(doc, 'Look') ?? '').split('\n').some((l) => /^\W*behavior:/i.test(l.trim()) && /\b(?:hover|cursor|foco|focus|press|tap|animat\w*|transition\w*|hero|fade|slide)\b/i.test(l));
    if (moving && !gate.some((l) => /^motion\s*:/i.test(l) && /kitTrace|flutter test/i.test(l))) out.push('## Look declares movement and no `motion:` line in ## Gate runs `flutter test` with `kitTrace`');
  }
  if (lenses.includes('visual') && instruments.probe) {
    const steps = stepsTextOf(doc, cardDir, root ?? resolve(String(cardDir), '..', '..'));
    const enter = specs.find((s) => /\bEnter\b/.test(s.text));
    if (enter && !steps.includes('enter-each')) out.push(`${enter.id}: names Enter and no steps file of a \`probe <state>:\` line has an \`{ "enter-each": "<form>" }\` step`);
    const typed = specs.find((s) => /«[^»]*(?:<[^>\n]+>|\{[^}\n]+\})[^»]*»/.test(s.text));
    if (typed && !steps.includes('type-markup')) out.push(`${typed.id}: shows text the person typed and no steps file has a \`{ "type-markup": "<locator>" }\` step`);
    const moves = (sectionOf(doc, 'Look') ?? '').split('\n').some((l) => /^\W*behavior:/i.test(l.trim()) && /\b(?:hover|cursor|foco|focus|press)\b/i.test(l));
    if (moves && !gate.some((l) => /^motion\s*:/i.test(l))) out.push('## Look has a `behavior:` of hover, cursor, focus or press and no `motion:` line in ## Gate · add `motion: node .claude/tools/motion-audit.mjs <url>`');
    const states = probeLinesOf(doc).length;
    const onLoadOnly = gate.filter((l) => /^overflow\s*:/i.test(l) && !/\.json\b/.test(l));
    if (states > 1 && onLoadOnly.length && specs.some((s) => /desbord|overflow/i.test(s.text)) && !declaredFor(doc, 'overflow'))
      out.push(`a spec speaks of overflow, \`overflow:\` measures only the page on load and the Gate has ${states} \`probe <state>:\` lines · measure the text of each state, or \`declared · overflow-states · <why>\``);
    for (const l of probeLinesOf(doc)) {
      const widths = l.match(/--widths\s+(\S+)/)?.[1];
      if (widths && !widths.split(',').some((w) => Number.parseInt(w, 10) === 320)) out.push(`${l.match(/^probe\s+([^:[]+?)\s*(?:\[[^\]]*\])?\s*:/i)[1]}: the probe measures overflow at ${widths} and not at 320 px · drop \`--widths\` or add 320`);
    }
  }

  if (root && existsSync(join(root, '.git')) && sectionOf(doc, 'Changes') === null && (lenses.includes('contract') || lenses.includes('visual'))) {
    const touched = [...new Set(tasks.flatMap((t) => t.files))].filter((f) => IS_CODE.test(f) && !NOT_PRODUCTION.test(f) && !IS_TEST.test(f) && existsInMain(root, f));
    if (touched.length) out.push(`${touched[0]} exists in main and the card touches a route or a screen: add \`## Changes to existing behavior\` (\`none\` if nothing changes)`);
  }
  return out;
};

// Feature first: a production file under a top-level folder of a layer or of a kind of file (`domain/`, `data/`, `screens/`,
// `services/`, `models/`… directly under the repo, `src/`, `app/`, `lib/` or a workspace's `src/`) spans every feature; it belongs
// in its slice, `modules/<feature>/<layer>/` (`lib/features/<feature>/<layer>/` in Flutter), or in `shared/`. A file the repo already
// has (`root` given) stays where it is: moving it is a card of its own. `components/ui/` is where shadcn installs the UI primitives.
export const LAYER_FIRST = /^(?:(?:src|app|lib|apps\/[^/]+(?:\/src)?|packages\/[^/]+(?:\/src)?)\/)?(domain|application|infrastructure|presentation|data|screens|pages|views|widgets|components(?!\/ui\/)|services|models|entities|repositories|providers|controllers|blocs?|cubits?|viewmodels|use_?cases)\//i;
const posix = (f) => f.split('\\').join('/').replace(/^\.\//, '');
// `pages/` is the folder Next.js requires for its router: allowed in a repo with `next.config.*` or a `next` dependency.
const usesNext = (root) => {
  if (!root) return false;
  try {
    if (readdirSync(root).some((f) => /^next\.config\./.test(f))) return true;
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    return Boolean({ ...pkg.dependencies, ...pkg.devDependencies }.next);
  } catch { return false; }
};
export const layerFirstProblems = (doc, root) => [...new Set(tasksOf(doc).flatMap((t) => t.files))]
  .filter((f) => IS_CODE.test(f) && !NOT_PRODUCTION.test(f) && !IS_TEST.test(f) && LAYER_FIRST.test(posix(f)) && !(root && existsSync(join(root, f)))
    && !(posix(f).match(LAYER_FIRST)[1].toLowerCase() === 'pages' && usesNext(root)))
  .map((f) => { const folder = posix(f).match(LAYER_FIRST)[1]; return `${f}: a top-level \`${folder}/\` folder spans every feature · place it in its feature's slice, \`src/modules/<feature>/<layer>/\` (\`lib/features/<feature>/<layer>/\` in Flutter), or in \`shared/\` if every feature uses it`; });

export const GRAB_BAG_NAME = /(^|\/)(utils?|helpers?|managers?|misc|common)(\.[a-z]+)*\.[a-z]+$/i;
export const grabBagProblems = (doc, root) => [...new Set(tasksOf(doc).flatMap((t) => t.files))]
  .filter((f) => IS_CODE.test(f) && !NOT_PRODUCTION.test(f) && !IS_TEST.test(f) && GRAB_BAG_NAME.test(posix(f)) && !(root && existsSync(join(root, f))))
  .map((f) => `${f}: a grab-bag file name · name the file for the one concept it holds (a use case, an entity, an adapter)`);

// A task that writes production code says what already exists that it uses or extends (`reuses:`), or why nothing fits (`new:`):
// the plan is where the repo is searched, before the code repeats a piece. A path in `reuses:` must exist, or be a file the card itself writes.
const NO_REASON = /^(?:n\/?a|none|nothing|-+|tbd|todo)\.?$/i;
export const reuseProblems = (doc, root) => {
  const tasks = tasksOf(doc);
  const own = new Set(tasks.flatMap((t) => t.files));
  return reuseOf(doc).flatMap((t) => {
    if (!t.files.some((f) => IS_CODE.test(f) && !NOT_PRODUCTION.test(f))) return [];
    if (!t.kind) return [`${t.id}: no \`reuses:\` or \`new:\` line · search the module and \`shared/\` for what this task needs (Grep by intent words, names, signatures), then add under its T line \`  reuses: <file> <symbol it uses or extends>\` or \`  new: <why nothing in the repo fits>\``];
    if (!t.text || NO_REASON.test(t.text) || (t.kind === 'new' && t.text.split(/\s+/).length < 3))
      return [`${t.id}: \`${t.kind}:\` says nothing · ${t.kind === 'new' ? 'name what you searched and why it does not fit' : 'name the file and the symbol it uses or extends'}`];
    if (t.kind === 'new' || !root) return [];
    return [...t.text.replaceAll('\\', '/').matchAll(/[\w.@-]+(?:\/[\w.@-]+)+\.\w+/g)].map((m) => m[0])
      .filter((f) => !own.has(f) && !existsSync(join(root, f)))
      .map((f) => `${t.id}: \`reuses:\` names ${f}, which is not in the repo and no task of the card writes it · name what exists, or use \`new:\``);
  });
};

// A screen is composed from the catalog and the set: the task that builds it names in `reuses:` where its pieces come from —
// the catalog's registries (`@shadcn/table`, `@coss/dialog`, or what they installed in components/ui/) in a repo with shadcn,
// the set and its ports in design/components/ in one without—, which exist or are installed or copied by a task of the card. Not at poc.
const setOff = (root) => { try { return active(root).exempt.procedures.has('component-set'); } catch { return false; } };
export const setPlanProblems = (doc, root) => {
  if (root && setOff(root)) return [];
  const roles = rolesOf(doc);
  const screens = reuseOf(doc).filter((t) => t.files.some((f) => !f.startsWith('design/') && /\.(html?|s?css|m?js|ts|jsx|tsx|vue|svelte)$/.test(f) && roleFor(roles, f) === 'presentation'));
  if (!screens.length) return [];
  if (root && usesCatalog(root)) {
    if (screens.some((t) => /(^|[\s/])components\/ui\/|@[a-z][\w-]*\/[\w-]/i.test(t.text))) return [];
    return [`${screens.map((t) => t.id).join(', ')}: the screen is planned without the catalog · under the task that builds it write \`  reuses: <registry items or components/ui/ files it composes>\` (\`@shadcn/table, @coss/dialog, @magicui/number-ticker\`…, reference/components.md), and add a task that installs what is missing with \`npx shadcn@latest add\` (a component the catalog covers is installed, never written by hand)`];
  }
  if (screens.some((t) => t.text.includes(`${SET}/`))) return [];
  const pieces = /^## Information\b/m.test(doc) ? 'record.html record-head, facts, decision, exceptions, checks, record-section' : 'components.css <the components it composes>';
  return [`${screens.map((t) => t.id).join(', ')}: the screen is planned without the component set · under the task that builds it write \`  reuses: ${SET}/${pieces}\`, naming too the catalog's ports it uses (${TEMPLATES}/motion/, reference/components.md «Without React»), and add a task that copies the set and those ports from ${TEMPLATES}/ if ${SET}/ does not have them (rules/interface.md: screens are composed from the set, not drawn)`];
};

// The simplest structure that works: the layer folders of a slice are its shape, but a task that adds a factory, strategy, adapter,
// builder, bus, mediator, container, registry, locator or `I<Name>` interface file says in `why-layer:` which second variant or business
// rule it serves; without it the pattern is dropped. Checked against the repo, so it needs `root`.
export const isPatternFile = (file) => {
  const name = file.split('/').pop();
  if (DOM_FILE.test(name)) return false;
  return /(?:^|[-_.])(?:factory|strategy|adapter|builder|bus|mediator|container|registry|locator)(?:[-_.]|$)/i.test(name)
    // A pattern word that ends the name as a whole PascalCase segment (`OrderFactory`, `XAdapter`, `EventBus`). A component file
    // (`PageContainer.tsx`, `FormBuilder.tsx`) is a view, not the pattern.
    || /[A-Za-z0-9](?:Factory|Strategy|Adapter|Builder|Bus|Mediator|Container|Registry|Locator)(?:[-_.]|$)/.test(name)
    || /^I[A-Z]\w*\.(?:ts|cs|java|dart)$/.test(name) || /\.(?:port|interface)\.[a-z]+$/.test(name);
};
export const whyLayerProblems = (doc, root) => {
  if (!root) return [];
  const why = whyLayerOf(doc);
  return tasksOf(doc).flatMap((t) => {
    const files = t.files.map(posix).filter((f) => IS_CODE.test(f) && !NOT_PRODUCTION.test(f) && !IS_TEST.test(f));
    const found = files.find((f) => isPatternFile(f) && !existsSync(join(root, f)));
    if (!found) return [];
    const text = why.get(t.id);
    if (text === undefined) return [`${t.id}: ${found} adds a factory, strategy, adapter, builder, bus, mediator, container, registry or interface file and has no \`why-layer:\` · under its T line write \`  why-layer: <the second variant it serves, or the test fake that needs it>\`, or drop it and use the concrete class`];
    if (!text || NO_REASON.test(text) || text.split(/\s+/).length < 3) return [`${t.id}: \`why-layer:\` says nothing · name the second variant or the test fake the pattern serves`];
    return [];
  });
};

// The code is in English unless CLAUDE.md declares `Code language:`. A repo whose code is already mostly in another language and
// declares none is asked to declare it once, so new files do not mix two languages.
const codeLanguageProblems = (newFiles, root) => {
  if (!root || codeLanguageOf(root) !== 'en') return [];
  const tracked = (spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).stdout ?? '').split('\n').filter((f) => IS_CODE.test(f) && !/^(?:\.claude|specs)\//.test(f));
  const spanish = tracked.filter((f) => isSpanish(f.split('/').pop())).length;
  if (!declaresCodeLanguage(root) && tracked.length >= 5 && spanish / tracked.length > 0.3) {
    return [`${spanish} of the repo's ${tracked.length} code files have Spanish names and CLAUDE.md declares no code language · add the line \`Code language: es\` to the CLAUDE.md of the product repo to keep the repo's language, or \`Code language: en\` to write new code in English (the default), so new files do not mix the two`];
  }
  return newFiles.filter((f) => f.split('/').some(isSpanish)).map((f) => `${f}: a Spanish name in the code · the code is in English (identifiers, file names, comments, test names); the UI text, commits and the PR speak the team's language. Another language is declared in CLAUDE.md as \`Code language: <lang>\``);
};

// What is missing from the plan, one line each; an empty list is a complete plan.
export const planProblems = (doc, { cardDir, lenses = [], root }) => {
  const id = cardIdOf(cardDir);
  const out = [];
  const planned = plannedTestsOf(doc);
  // A poc card has no Tasks, tests or Gate to plan: only its Look is checked.
  if (root && isPoc(root)) return lenses.includes('visual') ? lookProblems(doc, cardDir) : [];
  if (!id) out.push(`the folder ${String(cardDir).split(/[\\/]/).filter(Boolean).pop()} has no card ID: the tags of the tests cannot be checked`);
  else {
    const tagged = new Set(planned.flatMap((t) => [...specTagsIn(id, t.title), ...[...t.title.matchAll(new RegExp(`@(?:assumption:)?(${escape(id)}-ASM-\\d+)(?!\\d)`, 'g'))].map((m) => m[1])]));
    for (const s of specsOf(doc)) if (!tagged.has(s.id)) out.push(`${s.id}: no planned test · add to its T line \`· tests: <file> "<title @${id}-${s.id}>"\``);
    for (const a of asmsOf(doc)) if (!tagged.has(a)) out.push(`${a}: no planned test · add to its T line \`· tests: <file> "<title @${a}>"\``);
    for (const t of planned) if (!new RegExp(`@(?:assumption:)?${escape(id)}-(?:S|ASM-)\\d+(?!\\d)`).test(t.title)) out.push(`${t.task}: the test "${t.title}" carries no tag @${id}-S<n> or @${id}-ASM-NN`);
  }
  out.push(...quantifierProblems(doc, id, planned));
  out.push(...branchProblems(doc, id, planned));
  out.push(...longSpecProblems(doc));
  out.push(...promiseProblems(doc, { cardDir, lenses, root }));
  const roles = rolesOf(doc);
  const unmarked = [...new Set(tasksOf(doc).flatMap((t) => t.files))].filter((f) => IS_CODE.test(f) && !NOT_PRODUCTION.test(f) && !roleFor(roles, f));
  for (const f of unmarked) out.push(`${f}: no layer · mark it \`${f} (presentation|rule|data)\` in ## Tasks`);
  // A new file of a slice is planned in the folder of its layer; one the repo already has stays where it is.
  const newFiles = [...new Set(tasksOf(doc).flatMap((t) => t.files))].filter((f) => IS_CODE.test(f) && !NOT_PRODUCTION.test(f) && !(root && existsSync(join(root, f))));
  for (const f of newFiles) { const p = misplacedLayer(f, roleFor(roles, f)); if (p) out.push(p); }
  out.push(...codeLanguageProblems(newFiles, root));
  const migrationLens = () => {
    if (lenses.includes('integrity') || tasksOf(doc).some((t) => t.files.some((f) => IS_MIGRATION.test(f)))) {
      const upgrade = gateLinesOf(doc).some((l) => /^migrate-upgrade\b/i.test(l));
      const migration = tasksOf(doc).some((t) => t.files.some((f) => IS_MIGRATION.test(f)));
      const form = '`migrate-upgrade: <the stack\'s command that upgrades a copy of main\'s database with seeded data>` (reference/database.md)';
      if (!migration && !upgrade) out.push(`no migration file in ## Tasks and no \`migrate-upgrade:\` line in ## Gate (integrity lens) · add the migration to a T line, or ${form}`);
      if (migration && !upgrade) out.push(`a migration in ## Tasks and no \`migrate-upgrade:\` line in ## Gate · add ${form}`);
    }
  };
  out.push(...layerFirstProblems(doc, root));
  out.push(...grabBagProblems(doc, root));
  out.push(...reuseProblems(doc, root));
  out.push(...whyLayerProblems(doc, root));
  if (lenses.includes('visual')) {
    const instruments = visualInstruments(root ?? resolve(String(cardDir), '..', '..'), doc);
    const kind = instruments.probe && instruments.golden ? 'probe` or `golden' : instruments.golden ? 'golden' : 'probe';
    for (const x of statesLacking(doc, instruments)) out.push(`state ${x}: no \`${kind} ${x}:\` line in ## Gate (visual lens)`);
  }
  // A plain screen takes the repo's styles, or semantic HTML when there are none: no component set to copy.
  if (lenses.includes('visual')) out.push(...lookProblems(doc, cardDir), ...informationProblems(doc, gateLinesOf(doc)), ...(plainOf(doc) ? [] : setPlanProblems(doc, root)));
  if (lenses.includes('contract') && !hasAttacksLine(doc)) out.push('no `attacks:` line in ## Gate (contract lens) · add `attacks: node .claude/tools/attack.mjs --write "POST /<path> <field>=<value>" --read "/<path>"`, with `--body-limit <bytes>` if the card sets a limit');
  migrationLens();
  return out;
};
