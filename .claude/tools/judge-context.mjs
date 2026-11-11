#!/usr/bin/env node
// judge-context.mjs [lens…] — run from the repo of the card, with a card in progress.
//
// Everything the judge reads, in one call and one output, so it neither guesses paths nor reads them one by one:
//   card.md              the single document: L1 verbatim, the specs, the tasks, the gate, the log
//   risk.json            size, review and the lenses (the lenses default to its list)
//   the gate             one line per record of `.validation/once` (name, exit, when), and the flaky list if there is one
//   the diff             `git diff <base>` of the card, without specs/ and the kit, and the new files git does not follow yet
//   the criteria         `bar.mjs --lens <lens>` for each lens: the full rows of the judgment and running-app criteria
//   design/line.md       with the `visual` lens, the design brief if the repo has one
// Each part is headed `=== <path or command> ===`; one that does not exist says so. The output is cut at 120000 characters
// (`KIT_JUDGE_CONTEXT_CAP`), with what was left out named. Exits 2 with no card or an unknown lens.
// Measured: the judges needed five calls to gather the card, bar and diff, and each call re-reads the whole context.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { cardFiles, git, relativeTo } from './card.mjs';
import { riskOf } from './card-doc.mjs';
import { LENS_AREAS } from './bar.mjs';
import { records } from './once.mjs';
import { reviewRange } from './review-range.mjs';

const CAP = Number(process.env.KIT_JUDGE_CONTEXT_CAP) || 120000;
const TOOLS = import.meta.dirname;

const file = (root, rel) => {
  const path = join(root, rel);
  return { title: rel, body: existsSync(path) ? readFileSync(path, 'utf8').trimEnd() : '(does not exist)' };
};

export const parts = (lenses, range) => {
  const { root, cardDir, base } = range;
  const rel = (name) => relativeTo(root, join(cardDir, name));
  const out = [file(root, rel('card.md')), file(root, rel('risk.json'))];
  const gate = records(root).filter((r) => r.command).sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map((r) => `${r.name}: exit ${r.exit} · ${r.when}${r.flaky?.length ? ` · flaky ${r.flaky.map((f) => f.test).join(', ')}` : ''} · ${r.command}`);
  out.push({ title: 'the gate (.validation/once)', body: gate.join('\n') || '(no record: verify.mjs has not run)' });
  const diff = git(root, ['diff', base, '--', '.', ':(exclude)specs', ':(exclude).claude']).stdout.trimEnd();
  out.push({ title: `git diff ${base}`, body: diff || '(empty)' });
  const tracked = new Set(git(root, ['diff', '--name-only', base]).stdout.split('\n'));
  const fresh = cardFiles(root, base).filter((f) => !tracked.has(f) && !f.startsWith('specs/'));
  out.push({ title: 'new files git does not follow yet', body: fresh.join('\n') || '(none)' });
  for (const lens of lenses) {
    const bar = spawnSync(process.execPath, [join(TOOLS, 'bar.mjs'), '--lens', lens], { cwd: root, encoding: 'utf8' });
    out.push({ title: `bar.mjs --lens ${lens}`, body: (bar.stdout + bar.stderr).trimEnd() });
  }
  if (lenses.includes('visual')) out.push(file(root, 'design/line.md'));
  return out;
};

export const render = (list, cap = CAP) => {
  const left = [];
  let size = 0;
  const kept = [];
  for (const { title, body } of list) {
    const block = `=== ${title} ===\n${body}\n`;
    if (size + block.length > cap && kept.length) { left.push(title); continue; }
    kept.push(size + block.length > cap ? `${block.slice(0, cap - size)}\n[cut at ${cap} characters]\n` : block);
    size += block.length;
  }
  if (left.length) kept.push(`left out by the cap: ${left.join(', ')} (read them yourself)\n`);
  return kept.join('\n');
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const range = reviewRange();
  if (!range) {
    console.error('No card in progress found: run it from the repo of the card.');
    process.exit(2);
  }
  const asked = process.argv.slice(2);
  const lenses = asked.length ? asked : riskOf(range.cardDir)?.lenses ?? [];
  const unknown = lenses.filter((l) => !LENS_AREAS[l]);
  if (unknown.length) {
    console.error(`Unknown lens ${unknown.join(', ')}: ${Object.keys(LENS_AREAS).join(', ')}`);
    process.exit(2);
  }
  console.log(render(parts(lenses, range)));
}
