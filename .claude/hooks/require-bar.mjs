#!/usr/bin/env node
// PreToolUse on Edit and Write: production code is not written while the card in progress lacks what its code is
// written and gated against: `cap: <N> min` (or `<N> h`) in the header of card.md, `## Specs`, `## Tasks` and a `## Gate` with
// its block of commands (at poc only the cap and the Specs, and no logic file). The cap is what time-cap and review-cap enforce: if it cannot be read they would silently do
// nothing, so it is asked for here. A repo that still has a `plan.md` instead of card.md is asked for its cap only
// (its `## Time plan`).
// A module that is off by a person's decision (`.claude/kit.json`) whose signal shows up in what the card says it will
// touch blocks the write: the person turns it on or confirms it stays off (tools/kit.mjs).
// Contract: exit 0 lets it through; exit 2 blocks and Claude reads stderr. On its own error it blocks.
import { readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const block = (reason) => {
  process.stderr.write(`${reason}\n`);
  process.exit(2);
};

try {
  const { NOT_PRODUCTION, rootOf, relativeTo, currentCard, cardCap } = await import('../tools/card.mjs');
  const { gateBlock, hasTasksSection, rolesOf, sectionOf, specsOf } = await import('../tools/card-doc.mjs');
  const { active, lateSignals, LATE_ADVICE, isPoc, pocLogic } = await import('../tools/kit.mjs');
  const raw = readFileSync(0, 'utf8');
  const input = JSON.parse(raw);
  await (await import('../tools/card.mjs')).delegateToRepo(import.meta.url, raw, input);
  const path = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (!path) process.exit(0);
  const root = rootOf(path);
  if (!root) process.exit(0);
  const rel = relativeTo(root, path);
  const cardDir = currentCard(root);
  if (!cardDir) process.exit(0);
  if (NOT_PRODUCTION.test(rel)) process.exit(0);
  const modules = active(root);

  // A signal that shows up after a module was turned off is not decided by the agent: the person turns
  // the module on, or confirms it stays off with the reason.
  const late = Object.entries(lateSignals(root, cardDir));
  if (late.length)
    block(`Not writing ${rel}: ${late.map(([mod, found]) => `the module ${mod} is off (“${modules.off.get(mod).reason}”) and the card brings ${found.join('; ')}`).join('; and ')}. ` +
      `Resolve it with ${late.map(([mod]) => LATE_ADVICE(mod, modules.grade)).join('; and ')}.`);

  const problems = [];
  let poc = false;
  const doc = join(cardDir, 'card.md');
  if (existsSync(doc)) {
    const text = readFileSync(doc, 'utf8');
    if (cardCap(cardDir) === null) problems.push('`cap: <N> min` (or `<N> h`) in the header of card.md, above its first `## ` heading');
    if (!specsOf(text).length) problems.push('“## Specs” with a line `S1 · "<quote of the card>"` for each sentence');
    // At poc the card is a facade: cap and Specs only, no Tasks or Gate, and no logic in what is written.
    poc = isPoc(root);
    if (!poc) {
      if (!hasTasksSection(text) || !sectionOf(text, 'Tasks')?.match(/\bT\d+\s*·/)) problems.push('“## Tasks” with a line `T1 · S1 · <files>`');
      if (!gateBlock(text)?.trim()) problems.push('“## Gate” with a block of commands, one per line (`suite: …`, `lint: …`)');
    } else {
      const added = String(input.tool_input?.content ?? input.tool_input?.new_string ?? '').split('\n').map((line) => ({ f: rel, text: line }));
      const logic = pocLogic([rel], added, rolesOf(text));
      if (logic.length)
        block(`Not writing ${rel}: it brings logic (${logic[0]}). A poc is a facade: mock it in presentation; logic belongs to the mvp.`);
    }
  } else if (existsSync(join(cardDir, 'plan.md')) && cardCap(cardDir) === null) {
    problems.push('`cap: <N> min` (or `<N> h`) in the plan\'s “## Time plan”');
  }
  if (problems.length)
    block(`Not writing ${rel} yet: the card in progress (${relative(root, doc)}) is missing ${problems.join(' and ')}. ` +
      'It is what the code is gated against: written beforehand, it does not come back as a finding. Skeleton:\n' +
      `cap: 30 min\n## Specs\nS1 · "<quote of the card>"` +
      (poc ? '' : '\n## Tasks\nT1 · S1 · <files>\n## Gate\n(a ``` block, one command per line: `suite: …`, `lint: …`)'));
} catch (e) {
  block(`Could not check the card (${e.message}). It blocks when in doubt: retry.`);
}
process.exit(0);
