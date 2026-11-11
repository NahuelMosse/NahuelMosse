#!/usr/bin/env node
// UserPromptSubmit: a prompt in which the person corrects the work —«no, eso no era», «está mal», «sigue roto»,
// «that's not what I asked»— or leaves a note for the kit («kit: …», «nota para el kit: …») is recorded in the kit's notes
// (tools/kit-notes.mjs) with the repo and the card in progress, redacted and cut. A correction is the signal no check
// produces: where the method let a gap through that only the person saw.
// It prints nothing, so it costs no context, and it never blocks.
import { readFileSync } from 'node:fs';

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const { contextOf, feedbackOf, record } = await import('../tools/kit-notes.mjs');
  const found = feedbackOf(input.prompt);
  if (found) {
    record({ ...found, ...(await contextOf(input.cwd ?? process.cwd())), session: input.session_id ?? null });
  }
} catch {}
process.exit(0);
