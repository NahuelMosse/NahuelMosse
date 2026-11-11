#!/usr/bin/env node
// required.mjs — run from the repo root, with a card in progress.
//
// Says what is missing, on the code being delivered, to be able to close:
// - the mutation of every logic file the card touched (`mutationRequired`: nothing at poc, the domain and a screen's `*-state.js` at mvp, every file
//   but the screens at production; a screen file —markup, components— and a file marked `(presentation)` are not mutated, and
//   `declared · mutate · <file> · <why>` in the Log leaves one out, listed by the close for a person);
// - the linter over every test file the card touched;
// - that no file outside card.md's `## Tasks` was touched, and that no OUT points at something the card created or modified;
// - the migrations of main untouched, the new ones in order, and the upgrade from main run (migrations.mjs);
// - the findings verify.mjs left of its design, duplication and markup checks, on this code (QUALITY);
// - risk.json (risk.mjs), and, when it says `review: high`, the plan judge's judge.md with every ACT closed or declared.
// What is required comes from the diff, not from what the agent decided to run. It counts only what ran with once.mjs, passed,
// and ran on exactly the code as it is now: a later write invalidates it.
// A report whose owner still runs (the judge) is listed with PENDING: it is not an action, and the close still waits for it.
// Exits 0 if nothing is missing, 1 if something is missing, 2 if there is no card in progress.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  IS_CODE, IS_TEST, NOT_PRODUCTION, asOneArg, cardFiles, commandDir, oneRound, cardStart, copiedFromKit, currentCard, fileMapLines, keyOf, namedIn,
} from './card.mjs';
import { ROLES, actHold, actsOf, gateBlock, readCard, riskOf } from './card-doc.mjs';
import { active, cardLogic, isPoc, lateSignals, LATE_ADVICE } from './kit.mjs';
import { runningAgents } from './agents-running.mjs';
import { editedFromBase, IS_MIGRATION, migrationsOutlook } from './migrations.mjs';
import { outOfScopeThatBelongToTheCard } from './out-of-scope.mjs';
import { records } from './once.mjs';
import { linesOf } from './transcript.mjs';

const MUTATOR = /mutate\.mjs|stryker|mutmut|pitest|go-mutesting|cosmic-ray/i;
const LINTER = /eslint|ruff|golangci-lint|pylint|flake8|rubocop|ktlint|checkstyle|dotnet format|dart (?:analyze|format)|flutter analyze/i;

const today = () => new Date().toISOString().slice(0, 10);
const cardName = (cardDir) => cardDir.split(/[\\/]/).pop();
// The command of a line of card.md's `## Gate` (`suite: npm test` → `npm test`).
const gateLine = (cardDir, name) => {
  const doc = readCard(cardDir);
  const line = (doc && gateBlock(doc) ? gateBlock(doc) : '').split('\n').map((l) => l.trim()).find((l) => new RegExp(`^${name}\\b[^:]*:`).test(l));
  return line?.slice(line.indexOf(':') + 1).trim();
};

// The models a session's record names (`"model":"…"` of its messages), in the order they appear. Streamed: a long
// session's record passes V8's longest string.
export const modelsOf = (record) => {
  const models = new Set();
  try {
    for (const line of linesOf(record)) if (line.includes('"model"')) for (const m of line.matchAll(/"model"\s*:\s*"([^"<]+)"/g)) models.add(m[1]);
  } catch { /* a record that is not there names no model */ }
  return [...models];
};
// The records this card's sessions left in `.validation/sessions.log`, and the line of sessions.md each one needs.
export const sessionRecords = (root, cardDir) => {
  const log = join(root, '.validation', 'sessions.log');
  // Only the records the hook tagged with this card: another card's session is not this card's.
  return existsSync(log)
    ? readFileSync(log, 'utf8').split('\n').filter((l) => l.includes(` · card ${cardName(cardDir)} · `))
      .flatMap((l) => [...l.matchAll(/record: (.+?\.jsonl)\s*$/gm)].map((m) => m[1]))
    : [];
};
export const sessionLine = (record) => `${today()} · ${modelsOf(record).join(', ') || '<model>'} · cost not available · ${record}`;
// Writes the line each of the card's records lacks in sessions.md; close.mjs and verify.mjs both call it. Returns one entry per line written.
export const writeSessionLines = (root, cardDir) => {
  const sessions = join(cardDir, 'sessions.md');
  const wrote = [];
  for (const record of sessionRecords(root, cardDir)) {
    if ((existsSync(sessions) ? readFileSync(sessions, 'utf8') : '').includes(record)) continue;
    appendFileSync(sessions, `${sessionLine(record)}\n`);
    wrote.push(sessions);
  }
  return wrote;
};

// The checks verify.mjs makes over the diff besides the gate's lines —design line, tokens, states and motion (I-*),
// duplication (K4), markup (K11)—: verify.mjs leaves their findings in this record, and required.mjs and close.mjs read it,
// so the three say the same. They run external tools (jscpd, html-validate) and do not run inside a hook.
export const QUALITY = { name: 'verify-quality', command: 'verify.mjs design duplication markup' };
const SCREEN_OR_CODE = /\.(css|scss|html?|jsx|tsx|vue|svelte)$/;
const qualityLines = (root, touched, current) => {
  if (!touched.some((f) => (IS_CODE.test(f) || SCREEN_OR_CODE.test(f)) && !/^(specs|\.claude)\//.test(f))) return [];
  const r = records(root).find((x) => x.name === QUALITY.name && x.command === QUALITY.command);
  if (!r || !current(r)) return [];
  return r.findings ?? [];
};

const tokens = (command) => command.split(/\s+/)
  .map((t) => t.replace(/^['"]|['"]$/g, '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, ''))
  .filter(Boolean);

// A file is covered by the command if it names it, names a folder that contains it, or runs over the whole repo.
// A command that starts with `cd <dir> &&` names its paths from that folder.
const covers = (command, file, { folders }) => {
  const dir = commandDir(command);
  return tokens(command).flatMap((t) => (dir ? [t, t === '.' ? dir : `${dir}/${t}`] : [t])).some((t) =>
    t === file || (folders && (t === '.' || file.startsWith(`${t}/`))));
};

// A screen is not mutated: a view file has no logic and needs a browser per mutant. Its logic lives in .ts/.js modules, which are.
const IS_UI = /\.(tsx|jsx|vue|svelte|html)$/;
const isPresentation = (lines, file, root) => IS_UI.test(file) || hasRole(lines, file, root, 'presentation');

// A file's role is the `(role)` right after it on its Tasks line: `repositorio.py (data), casos_de_uso.py (rule)` makes only the
// second a rule. A line that marks no file at all is read whole, as plain words.
const ROLE_AFTER = new RegExp(`([^\\s,\`]+)\`?\\s*\\((${ROLES.join('|')})\\)`, 'g');
const hasRole = (lines, file, root, role) => namedIn(lines, file, root).some((l) => {
  const marks = [...l.matchAll(ROLE_AFTER)];
  if (!marks.length) return new RegExp(`\\b${role}\\b`, 'i').test(l);
  return marks.some(([, path, r]) => {
    const p = path.replaceAll('\\', '/');
    return r === role && (p === file || file.endsWith(`/${p}`));
  });
});

// The domain: a file under a `domain/` folder or one the Tasks line marks as `rule`.
const isDomain = (lines, file, root) => /(^|\/)domain\//.test(file) || hasRole(lines, file, root, 'rule');

// `declared · mutate · <file> · <why>` in the Log: the card leaves that file unmutated on purpose; the close lists it for a person.
export const DECLARED_MUTATE = /declared\s*·\s*mutate\s*·\s*`?([^\s·`]+)`?\s*·\s*(.+?)\s*$/;
export const declaredUnmutated = (cardDir) => new Map((String(readCard(cardDir) ?? '').split(/^## Log\b.*$/m)[1] ?? '').split('\n')
  .map((l) => l.match(DECLARED_MUTATE)).filter(Boolean).map((m) => [m[1].replaceAll('\\', '/'), m[2]]));

// Whether the grade asks for the mutation of a file. `root` is the card's repo (the cwd by default).
// A screen's pure state module (`presentation/<name>-state.js`, templates/card.md) holds its validation and messages: logic,
// mutated at every grade that mutates, though it sits in presentation/.
const SCREEN_LOGIC = /(^|\/)[^/]+-state\.[cm]?[jt]s$/;
export const mutationRequired = (exempt, map, file, root = process.cwd()) => !exempt.criteria.has('T3') && (SCREEN_LOGIC.test(file)
  || (!isPresentation(map, file, root) && (exempt.level?.mutation !== 'domain' || isDomain(map, file, root))));

// Every report has an owner. A line for a report whose owner still runs starts with PENDING: it is not an action.
export const PENDING = 'pending · ';
export const splitPending = (lines) => ({
  actions: lines.filter((l) => !l.startsWith(PENDING)),
  pending: lines.filter((l) => l.startsWith(PENDING)).map((l) => l.slice(PENDING.length)),
});
const judgeRuns = () => runningAgents().some((a) => a.type === 'judge');

const CHANGE = { M: 'modifies', D: 'deletes', R: 'renames', T: 'changes the type of' };

// What a card that touches migrations leaves: the ones in main untouched (DB-MIG-12), the new ones after main's last with
// one head and no repeated sequence (DB-MIG-14), and the upgrade from main with seeded data run on this code (DB-MIG-15).
const migrationLines = (root, touched, recorded, current) => {
  const outlook = migrationsOutlook(root);
  const out = [
    ...editedFromBase(root).map(({ status, file, label }) =>
      `P16 · DB-MIG-12 · the branch ${CHANGE[status[0]] ?? 'changes'} ${file}, which exists in ${label}: restore it from the base and put the correction in a new migration`),
    ...outlook.problems.map((p) => `P16 · DB-MIG-14 · ${p}`),
  ];
  if (outlook.fresh.length || touched.some((f) => IS_MIGRATION.test(f))) {
    const ran = recorded.some((r) => /^migrate-upgrade\b/.test(r.name ?? '') && r.exit === 0 && current(r));
    if (!ran) out.push('P5 · DB-MIG-15 · the upgrade from main with seeded data, run on this code: a `migrate-upgrade: <the stack\'s command>` line in `## Gate` of card.md, which leaves its log through once.mjs');
  }
  return out;
};

// A poc's diff brings no logic: data is mocked in presentation files; logic belongs to the mvp.
const pocVisualLogic = (root, cardDir) => {
  if (!isPoc(root)) return [];
  const logic = cardLogic(root, cardDir, readCard(cardDir) ?? '');
  return logic.length ? [`T14 · a poc's diff brings no logic (${logic[0]}): mock the data in presentation files; logic belongs to the mvp`] : [];
};

// `closing: false` leaves out what is about the text of closing.md: whoever is writing it cannot be asked for what it is about to say.
const missingOnce = (root, { closing = true } = {}) => {
  if (!existsSync(join(root, 'specs'))) return null;
  const cardDir = currentCard(root);
  if (!cardDir) return null;
  const base = cardStart(root, cardDir);
  const touched = cardFiles(root, base);
  const production = touched.filter((f) => IS_CODE.test(f) && !NOT_PRODUCTION.test(f));
  const map = fileMapLines(cardDir) ?? [];
  // A frozen test the Log declares replaced (`replaces: <file> "<title>"`) is not linted: a formatter would rewrite it.
  const replaced = new Set([...(String(readCard(cardDir) ?? '').split(/^## Log\b.*$/m)[1] ?? '').matchAll(/replaces:\s*(\S+)\s+"/g)].map((m) => m[1]));
  const tests = touched.filter((f) => IS_TEST.test(f) && !replaced.has(f));
  const { exempt, off, grade } = active(root);
  const name = cardName(cardDir);

  // A record counts when it ran on the code as it is now.
  const recorded = records(root).filter((r) => r.command);
  const current = new Map();
  const runOnThisCode = (r) => {
    if (!current.has(r)) current.set(r, r.key === keyOf(root, r.command));
    return current.get(r);
  };
  const passed = (re, codes) => recorded.filter((r) => re.test(r.command) && codes.includes(r.exit) && runOnThisCode(r));
  const mutations = passed(MUTATOR, [0, 3]);
  const unmutated = declaredUnmutated(cardDir);
  const lints = passed(LINTER, [0]);
  // The card's own `lint:` line, run through once.mjs as `lint`, is its linter whatever it calls (`sh lint.sh`): it covers every test.
  const lintLine = gateLine(cardDir, 'lint');
  const declaredLint = !!lintLine && recorded.some((r) => r.name === 'lint' && r.exit === 0 && r.command.trim() === lintLine.trim() && runOnThisCode(r));

  const out = [
    ...production.filter((f) => mutationRequired(exempt, map, f, root) && !unmutated.has(f))
      .filter((f) => !mutations.some((r) => covers(r.command, f, { folders: false })))
      .map((f) => `mutation of ${f} · run: \`node .claude/tools/once.mjs mutate -- node .claude/tools/mutate.mjs ${f} --since ${base} -- ${asOneArg(gateLine(cardDir, 'suite') ?? '<unit suite command>')}\``),
    ...(exempt.criteria.has('T6') || declaredLint ? [] : tests.filter((f) => !lints.some((r) => covers(r.command, f, { folders: true })))
      .map((f) => `linter on ${f} · run: \`node .claude/tools/once.mjs lint -- ${asOneArg(gateLine(cardDir, 'lint') ?? `<linter command> ${f}`)}\``)),
    // Measured: 2 runs brought files the card did not ask for.
    ...(map.length ? touched.filter((f) => !NOT_PRODUCTION.test(f) && !namedIn(map, f, root).length && !copiedFromKit(root, map, f))
      .map((f) => `${f} is not in the \`## Tasks\` of card.md: add it to a task line with its reason, or undo it`) : []),
    ...outOfScopeThatBelongToTheCard(root, base, cardDir, touched),
    ...migrationLines(root, touched, recorded, runOnThisCode),
    ...qualityLines(root, touched, runOnThisCode),
    ...Object.entries(lateSignals(root, cardDir, { diff: true }))
      .map(([mod, found]) => `the module ${mod} is off (“${off.get(mod).reason}”) and the diff brings ${found.join('; ')}: ${LATE_ADVICE(mod, grade)}`),
    ...pocVisualLogic(root, cardDir),
  ];

  const risk = riskOf(cardDir);
  if (!risk) out.push(`risk.json · run: \`node .claude/tools/risk.mjs specs/${name}\``);
  else if (risk.review !== 'low' && closing) {
    const judge = join(cardDir, 'judge.md');
    if (!existsSync(judge) && risk.review === 'high' && !exempt.without.has('judge')) out.push(`${judgeRuns() ? PENDING : ''}judge.md: risk.json says review: high · launch the \`judge\` in plan mode (prompt starting PLAN) with card.md, before building${judgeRuns() ? ' (owner: the judge, still running)' : ''}`);
    if (existsSync(judge)) for (const a of actsOf(readFileSync(judge, 'utf8'))) {
      const why = actHold(a, readCard(cardDir));
      if (why) out.push(`${a.id} of judge.md is ${why} · close it in the line: \`… · closed · <${a.plan ? 'ASM-NN, T<n> or Gate line of card.md' : 'output of its command or test'}>\`, or \`… · declared · <why it is not fixed>\``);
    }
  }
  return out;
};
// One round: its checks share one listing of the card's files and one start (card.mjs, `oneRound`).
export const missing = (root, options = {}) => oneRound(() => missingOnce(root, options));

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const lacking = missing(process.cwd());
  if (lacking === null) {
    console.error('No card in progress: nothing to require.');
    process.exit(2);
  }
  if (lacking.length === 0) {
    console.log('Everything required ran and passed on the code being delivered.');
    process.exit(0);
  }
  console.log(`Missing, on the code as it is now (${lacking.length}) — what gets run goes through once.mjs:`);
  for (const f of lacking) console.log(`  - ${f}`);
  process.exit(1);
}
