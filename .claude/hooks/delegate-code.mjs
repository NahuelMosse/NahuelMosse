#!/usr/bin/env node
// PreToolUse on Edit and Write: who writes production code during a card (tools/delegate-rule.mjs); guard-shell.mjs
// applies the same rule to what a shell line writes.
// Measured: in three runs the code was written by the main thread with 90 to 410 thousand tokens of context re-read on
// every request.
// Contract: exit 0 lets it through; exit 2 blocks and Claude reads stderr. On its own error it blocks: a rule that
// lets the write through when it crashes is a suggestion.
import { readFileSync } from 'node:fs';

try {
  const raw = readFileSync(0, 'utf8');
  const input = JSON.parse(raw);
  const card = await import('../tools/card.mjs');
  await card.delegateToRepo(import.meta.url, raw, input);
  const { productionVerdict } = await import('../tools/delegate-rule.mjs');
  const why = await productionVerdict(input, input.tool_input?.file_path ?? input.tool_input?.notebook_path);
  if (why) {
    process.stderr.write(`${why}\n`);
    process.exit(2);
  }
  process.exit(0);
} catch (e) {
  process.stderr.write(`delegate-code could not decide who writes this file (${e.message}). It blocks when in doubt: retry.\n`);
  process.exit(2);
}
