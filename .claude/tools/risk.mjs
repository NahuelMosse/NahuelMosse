#!/usr/bin/env node
// risk.mjs <card-dir> — classifies a card with code, not with a model, and freezes the result in
// `<card-dir>/risk.json`: `{ size, review, lenses }` plus what it was read from. Run once; a second run prints the
// frozen file and does not rewrite it.
// Inputs: the files `## Tasks` of card.md names, the signals of signals.mjs over them (the content of those that
// exist, their path for the rest) and the words of `## Specs` and of L1 that bring risk (auth, password, payment…),
// which count only when `## Tasks` names a production code file.
// - size: `small` when no file marks ui, api or data, no risk word appears and there are 1 or 2 tasks; else `large`.
// - review: `high` with risk words or security-l2 on and touched; `medium` with one or more of ui/api/data; `low` with none.
//   A migration word counts only in a repo that already holds data (a committed migration, data-layer file or `.sql`): the
//   first schema of a new repo migrates nothing.
// - lenses: ui → visual, api → contract, data → integrity; a `high` review with auth or payment words (or security-l2
//   touched) adds interpretation and security.
// Before it freezes anything it judges the plan (plan.mjs): a test planned for each S# and ASM, a layer for each production
// file, a probe per named state (visual), the attacks line (contract), a migration line (integrity). With a gap it lists what is
// missing, exits 3 and writes no risk.json: a card with an incomplete plan is not built. A second run revalidates the plan
// against the frozen lenses.
// `risk.mjs --diff <card-dir>` (verify.mjs runs it at the end of the gate) reads the card's real diff and only ever raises the
// classification: a file outside `## Tasks` that is sensitive (auth, payments, crypto, sessions, permissions) or that other
// modules import takes `review` to high; one that is a screen, a route or data takes it to what it is, and its lenses are added.
// The result is written in risk.json as `escalated: { review, lenses, why }`; nothing lowers it and nothing but this tool writes it.
// Prints the `risk:` line, not the JSON (it is in risk.json); a plan with gaps prints all of them at once and ends with the
// command to rerun.
// At poc the card has no Tasks: risk.json is `small · low` with the visual lens when the card has a `## Look`, with no plan check.
// Exits 0, 2 when the card has no card.md or `## Tasks` names no task, 3 when the plan is incomplete.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { active, isPoc, lensesOff } from './kit.mjs';
import { importersOf } from './importers.mjs';
import { IS_CODE, IS_TEST, NOT_PRODUCTION, cardFiles, cardStart, fileMapLines, git, namedIn } from './card.mjs';
import { AUTH_OR_PAYMENT, hasTasksSection, readCard, requirementOf, riskWordsIn, sectionOf, tasksOf } from './card-doc.mjs';
import { planProblems } from './plan.mjs';
import { noVisualOf } from './gate-checks.mjs';

// A component or page file logs someone in as much as a .ts does: a risk word weighs on it too.
const IS_RISK_CODE = (f) => IS_CODE.test(f) || /\.(vue|svelte|astro|html?)$/i.test(f);
import { IS_SCREEN, detectIn } from './signals.mjs';

const SIZE_LIMIT = 200_000;
// A file that is not written yet still says what it is by where it lives.
const API_PATH = /(^|\/)(api|routes?|controllers?|handlers?|endpoints?)\//;
const DATA_PATH = /(^|\/)(db|database|models?|repositor(?:y|ies)|migrations?)\//;

// What the repo already committed: a repo that git cannot list is taken as holding data, so the word keeps its weight.
const MIGRATION_WORD = /^migra/i;
const holdsData = (root) => {
  if (!root) return true;
  let r;
  try { r = git(root, ['ls-files']); } catch { return true; }
  if (r.status !== 0) return true;
  return r.stdout.split('\n').some((f) => DATA_PATH.test(f) || /\.sql$/i.test(f));
};

const linesOf = (root, file) => {
  const path = join(root, file);
  try { return statSync(path).size <= SIZE_LIMIT ? readFileSync(path, 'utf8').split('\n').map((text) => ({ f: file, text })) : []; } catch { return []; }
};

export const classify = ({ files, taskCount, text, root, securityL2On = false, noVisual = null }) => {
  const found = detectIn({ files, added: files.flatMap((f) => linesOf(root, f)) });
  // `no-visual:` holds only when the screen signal comes from markup inside code files (risk() refuses it when a file is a view).
  const markup = (found.screen ?? []).flatMap((e) => e.match(/^markup in (.+)$/)?.[1] ?? []);
  const declaredOff = Boolean(noVisual) && markup.length > 0 && !files.some((f) => IS_SCREEN.test(f));
  const modules = {
    ui: Boolean(found.screen) && !declaredOff,
    api: Boolean(found.route || found.listen || found['http-dependency'] || files.some((f) => API_PATH.test(f))),
    data: Boolean(found.schema || found['data-dependency'] || files.some((f) => DATA_PATH.test(f))),
  };
  // A risk word weighs only on a card that writes production code: docs, specs and tests do not log anyone in.
  const writesCode = files.some((f) => IS_RISK_CODE(f) && !IS_TEST.test(f) && !NOT_PRODUCTION.test(f));
  const spoken = writesCode ? [...new Set(riskWordsIn(text).map((w) => w.toLowerCase()))] : [];
  const words = spoken.some((w) => MIGRATION_WORD.test(w)) && !holdsData(root) ? spoken.filter((w) => !MIGRATION_WORD.test(w)) : spoken;
  const touched = Object.keys(modules).filter((m) => modules[m]);
  const securityTouched = securityL2On && Boolean(found['auth-dependency']);
  const size = !touched.length && !words.length && taskCount >= 1 && taskCount <= 2 ? 'small' : 'large';
  // Several modules are a larger card, not a riskier one: the gate's checks per lens hold each of them.
  const review = words.length || securityTouched ? 'high' : touched.length ? 'medium' : 'low';
  const lenses = [
    ...(modules.ui ? ['visual'] : []), ...(modules.api ? ['contract'] : []), ...(modules.data ? ['integrity'] : []),
    ...(review === 'high' && (securityTouched || AUTH_OR_PAYMENT.test(words.join(' '))) ? ['interpretation', 'security'] : []),
  ];
  return {
    size, review, lenses, modules: touched, signals: Object.keys(found).sort(), words, files, tasks: taskCount,
    ...(declaredOff ? { declared: [{ lens: 'visual', why: noVisual, files: markup }] } : {}),
  };
};

export const riskLine = (r) => `risk: ${r.size} · ${r.review} · lenses ${r.lenses.length ? r.lenses.join(', ') : 'none'}${r.lenses.length ? `\nquestions: .claude/reference/lenses.md (${r.lenses.join(', ')})` : ''}${(r.declared ?? []).filter((d) => d.lens === 'visual').map((d) => ` · visual declared off: ${d.why}`).join('')}`;

// Every gap at once, each with the line it asks for, and the command that judges the plan again.
const planMessage = (gaps, cardArg) => `The plan in card.md is incomplete (${gaps.length}); risk.json is not written and nothing is built until it is:\n${gaps.map((g) => `  - ${g}`).join('\n')}\nfix them all, then rerun: node .claude/tools/risk.mjs ${cardArg}`;

export const risk = (root, cardArg) => {
  const cardDir = isAbsolute(cardArg) ? cardArg : resolve(root, cardArg);
  const doc = readCard(cardDir);
  if (doc === null) return { code: 2, message: `${cardDir}: no card.md here: risk.mjs reads the card's single document` };
  // A poc card has no Tasks or tests to check: small, low review, the visual lens when the card has a `## Look`.
  if (isPoc(root)) {
    const file = join(cardDir, 'risk.json');
    if (existsSync(file)) { const frozen = JSON.parse(readFileSync(file, 'utf8')); return { code: 0, result: frozen, line: riskLine(frozen), kept: true }; }
    const result = { size: 'small', review: 'low', lenses: sectionOf(doc, 'Look') === null ? [] : ['visual'], modules: [], signals: [], words: [], files: [], tasks: 0 };
    writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
    return { code: 0, result, line: riskLine(result), kept: false };
  }
  const tasks = tasksOf(doc);
  if (!hasTasksSection(doc) || !tasks.length) return { code: 2, message: 'card.md has no `## Tasks` with a line `T1 · S1,S2 · <files>`: the classification reads the files from there' };
  const noVisual = noVisualOf(doc);
  const view = noVisual ? tasks.flatMap((t) => t.files).find((f) => IS_SCREEN.test(f)) : undefined;
  if (view) return { code: 3, message: planMessage([`no-visual cannot hold: ${view} is a view`], cardArg) };
  const out = join(cardDir, 'risk.json');
  if (existsSync(out)) {
    const frozen = JSON.parse(readFileSync(out, 'utf8'));
    const gaps = planProblems(doc, { cardDir, lenses: frozen.lenses ?? [], root });
    if (gaps.length) return { code: 3, message: planMessage(gaps, cardArg) };
    return { code: 0, result: frozen, line: riskLine(frozen), kept: true };
  }
  const text = `${sectionOf(doc, 'Specs') ?? ''}\n${requirementOf(doc)}`;
  let securityL2On = false;
  try { securityL2On = active(root).on.has('security-l2'); } catch { /* a repo without the kit's manifest has no module on */ }
  const files = [...new Set(tasks.flatMap((t) => t.files))];
  const result = classify({ files, taskCount: tasks.length, text, root, securityL2On, noVisual });
  // A lens whose instruments belong to a profile that is off is not asked for; the card says so and the close lists it.
  const off = lensesOff(root).filter((x) => result.lenses.includes(x.lens));
  if (off.length) {
    result.lenses = result.lenses.filter((l) => !off.some((x) => x.lens === l));
    result.lensesOff = off;
  }
  const gaps = planProblems(doc, { cardDir, lenses: result.lenses, root });
  if (gaps.length) return { code: 3, message: planMessage(gaps, cardArg) };
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  return { code: 0, result, line: riskLine(result), kept: false };
};

const RANK = { low: 0, medium: 1, high: 2 };
const SENSITIVE = /(^|\/)(auth\w*|security|payments?|billing|crypto|permissions?|sessions?)\//i;
export const escalate = (root, cardArg) => {
  const cardDir = isAbsolute(cardArg) ? cardArg : resolve(root, cardArg);
  const out = join(cardDir, 'risk.json');
  if (!existsSync(out)) return { code: 2, message: `${out}: no risk.json: run \`node .claude/tools/risk.mjs ${cardArg}\` first` };
  const frozen = JSON.parse(readFileSync(out, 'utf8'));
  if (isPoc(root)) return { code: 0, escalated: null, line: 'risk: poc, the classification does not change' };
  const map = fileMapLines(cardDir) ?? [];
  const base = cardStart(root, cardDir);
  const outside = cardFiles(root, base).filter((f) => IS_RISK_CODE(f) && !NOT_PRODUCTION.test(f) && !IS_TEST.test(f) && !namedIn(map, f, root).length);
  const current = frozen.escalated ?? { review: frozen.review, lenses: frozen.lenses, why: [] };
  const why = [];
  let review = RANK[current.review] >= RANK[frozen.review] ? current.review : frozen.review;
  const lenses = new Set([...frozen.lenses, ...current.lenses]);
  const raise = (to, reason, add = []) => {
    if (RANK[to] > RANK[review]) review = to;
    for (const l of add) lenses.add(l);
    why.push(reason);
  };
  for (const f of outside) {
    if (SENSITIVE.test(f)) raise('high', `${f} is in a sensitive module and \`## Tasks\` does not name it`, ['interpretation', 'security']);
    else {
      const users = importersOf(root, f);
      if (users.length) raise('high', `${f} is shared code (imported by ${users.slice(0, 3).join(', ')}${users.length > 3 ? ', …' : ''}) and \`## Tasks\` does not name it`, ['contract']);
    }
  }
  if (outside.length) {
    const found = classify({ files: outside, taskCount: outside.length, text: '', root });
    const [first] = outside;
    if (RANK[found.review] > RANK[review] || found.lenses.some((l) => !lenses.has(l)))
      raise(found.review, `${outside.length > 1 ? `${first} and ${outside.length - 1} more` : first} outside \`## Tasks\` bring ${found.modules.join(', ') || 'risk'}`, found.lenses);
  }
  // A lens that belongs to a profile that is off is not added: it goes to `lensesOff`, as at the first classification.
  const off = lensesOff(root).filter((x) => lenses.has(x.lens));
  for (const x of off) lenses.delete(x.lens);
  const known = frozen.lensesOff ?? [];
  const newOff = off.filter((x) => !known.some((k) => k.lens === x.lens));
  const raised = RANK[review] > RANK[frozen.review] || [...lenses].some((l) => !frozen.lenses.includes(l));
  if (newOff.length && !raised) {
    writeFileSync(out, `${JSON.stringify({ ...frozen, lensesOff: [...known, ...newOff] }, null, 2)}\n`);
    return { code: 0, escalated: frozen.escalated ?? null, line: `risk: ${newOff.map((x) => x.lens).join(', ')} needs the ${newOff.map((x) => x.profile).join(', ')} profile, which is off; listed in lensesOff` };
  }
  if (!raised && !frozen.escalated) return { code: 0, escalated: null, line: 'risk: the diff stays inside the plan; the classification does not change' };
  const escalated = { review, lenses: [...lenses], why: [...new Set([...(current.why ?? []), ...why])] };
  const same = JSON.stringify(escalated) === JSON.stringify(frozen.escalated);
  if (!same && raised) writeFileSync(out, `${JSON.stringify({ ...frozen, ...(newOff.length ? { lensesOff: [...known, ...newOff] } : {}), escalated }, null, 2)}
`);
  return { code: 0, escalated: frozen.escalated ?? (raised ? escalated : null), line: `risk escalated by the diff: ${review} · lenses ${[...lenses].join(', ') || 'none'} · ${escalated.why.join('; ')}` };
};

if (process.argv[1] && process.argv[2] === '--diff' && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[3]) { console.error('usage: node risk.mjs --diff <card-dir>'); process.exit(2); }
  const r = escalate(process.cwd(), process.argv[3]);
  (r.code ? console.error : console.log)(r.message ?? r.line);
  process.exit(r.code);
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = process.argv[2];
  if (!arg) { console.error('usage: node risk.mjs <card-dir>'); process.exit(2); }
  const r = risk(process.cwd(), arg);
  if (r.code) { console.error(r.message); process.exit(r.code); }
  console.log(r.line);
}
