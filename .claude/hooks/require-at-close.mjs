#!/usr/bin/env node
// PreToolUse: the close does not start while it is still missing to run, on the code being delivered,
// the mutation of every production file the card touched and the linter over every test it touched.
// It opens the close three ways, because /close was never invoked as a Skill in three cards and the
// check never ran: the Skill `close`, a write to specs/<card>/closing.md, and the push or `gh pr create`
// that publishes the card. Writing closing.md is not asked for what closing.md is about to say.
// What is required is computed by required.mjs from the diff, not chosen by the agent.
// Contract: exit 0 lets it through; exit 2 blocks and Claude reads stderr. On its own error it blocks.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const block = (reason) => {
  process.stderr.write(reason + '\n');
  process.exit(2);
};

try {
  const raw = readFileSync(0, 'utf8');
  const input = JSON.parse(raw);
  const card = await import('../tools/card.mjs');
  await card.delegateToRepo(import.meta.url, raw, input);
  const tool = input.tool_name;
  const data = input.tool_input ?? {};
  const closingFile = ['Write', 'Edit'].includes(tool) && /(^|\/)specs\/[^/]+\/closing\.md$/.test(String(data.file_path ?? '').replaceAll('\\', '/'));
  const opens = (tool === 'Skill' && String(data.skill ?? '').split(':').pop() === 'close') ||
    closingFile || (['Bash', 'PowerShell'].includes(tool) && card.publishes(data.command ?? ''));
  if (!opens) process.exit(0);
  const cwd = input.cwd ?? process.cwd();
  // A push that first moves into another repo publishes that repo: without a card named in its specs/.current there
  // is nothing of a card to close there, and the card of the session's cwd is not the one being published.
  const moved = ['Bash', 'PowerShell'].includes(tool) ? card.leadingCd(cwd, data.command) : null;
  if (moved) {
    const there = card.rootOf(join(moved, '_'));
    const here = card.rootOf(join(cwd, '_'));
    if (there !== here && !(there && card.currentCard(there, { named: true }))) process.exit(0);
  }
  const { missing } = await import('../tools/required.mjs');
  const lacking = missing(card.hookCard(cwd, process.env, input)?.root ?? cwd, { closing: !closingFile });
  if (lacking?.length) {
    block(
      `Not closing yet: ${lacking.length} thing${lacking.length > 1 ? 's are' : ' is'} missing on the ` +
      `code being delivered —${lacking.slice(0, 8).join('; ')}${lacking.length > 8 ? '…' : ''}—. ` +
      'Run `node .claude/tools/required.mjs`: it lists each one with the command that resolves it.'
    );
  }
} catch (e) {
  block(`Could not check what is missing to run before closing (${e.message}). It blocks when in doubt: ` +
        'run `node .claude/tools/required.mjs` and see what it says.');
}
process.exit(0);
