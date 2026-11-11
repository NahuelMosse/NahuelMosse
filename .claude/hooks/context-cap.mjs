#!/usr/bin/env node
// PreToolUse on every tool: the context of a `builder`, a `grunt` and a `designer` is capped, because every request re-reads
// it. The context is estimated from the `usage` of the last assistant message of its own transcript —input, cache read and
// cache creation tokens—: the agent is warned once at 150k and, past 200k (where the main thread compacts), refused every tool but a `git add`, `git commit`
// or `git status` and a Write of `specs/<card>/handoff*.md`, and returns so the main thread launches a fresh one with that handoff.
// The main thread is never capped: it is where the person manages the work, and `/compact` is theirs to call.
// The subagent's transcript is `agent_transcript_path` when the input has it, else the one next to the session transcript:
// `<session>/subagents/agent-<agent_id>.jsonl`. Without a readable transcript the hook says nothing: it is a saving, the guards
// that protect the card are others.
// Measured: an agent that reached 303 thousand tokens re-read on every request. And the other way: a cap of 120k forced 46
// handoffs in one repo, each a commit, a handoff.md and a fresh agent re-reading the card, against about USD 0.016 of cache
// read per request for the 80k it saves.
// Contract: exit 0 lets it through (stdout JSON carries the warning); exit 2 blocks and Claude reads stderr.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contextTokens, onlyCommit, transcriptOf } from '../tools/transcript.mjs';

const WARN = 150_000;
const STOP = 200_000;
const CAPPED = new Set(['builder', 'grunt', 'designer', 'design-critic']);

const HANDOFF = /(^|[\\/])specs[\\/][^\\/]+[\\/]handoff[^\\/]*\.md$/;

let input;
let raw;
try { raw = readFileSync(0, 'utf8'); input = JSON.parse(raw); } catch { process.exit(0); }
try {
  const card = await import('../tools/card.mjs');
  await card.delegateToRepo(import.meta.url, raw, input);
  if (!input.agent_id || !CAPPED.has(input.agent_type)) process.exit(0);
  const file = transcriptOf(input);
  if (!file || !existsSync(file)) process.exit(0);
  const used = contextTokens(file);
  if (used === null || used < WARN) process.exit(0);
  const who = input.agent_type;
  const k = `${Math.round(used / 1000)}k`;

  if (used >= STOP) {
    const data = input.tool_input ?? {};
    const commits = ['Bash', 'PowerShell'].includes(input.tool_name) && onlyCommit(String(data.command ?? ''));
    const handoff = input.tool_name === 'Write' && HANDOFF.test(String(data.file_path ?? ''));
    if (commits || handoff) process.exit(0);
    process.stderr.write(
      `The context of the ${who} is about ${k} tokens, past the cap of ${STOP / 1000}k: commit, write the handoff and return; the main thread launches a fresh ${who} with it. ` +
      'Allowed now: a shell command made only of git add, git commit and git status, chained with `&&`, optionally after `cd <path> &&` (no `export` or other prefix), and a Write to `specs/<card>/handoff.md` with what is done, what is left, the files, and the gate lines that pass and how to run them.\n'
    );
    process.exit(2);
  }

  const marker = join(tmpdir(), 'kit-context-cap');
  const warned = join(marker, `${String(input.agent_id).replace(/[^\w.-]/g, '_')}.warned`);
  if (existsSync(warned)) process.exit(0);
  mkdirSync(marker, { recursive: true });
  writeFileSync(warned, k);
  const message = `Context of the ${who}: about ${k} tokens, past ${WARN / 1000}k. At ${STOP / 1000}k every tool but the commit and the handoff is refused: ` +
    'wrap up, commit, write `specs/<card>/handoff.md` and return so the main thread launches a fresh one.';
  process.stdout.write(JSON.stringify({ systemMessage: message, hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: message } }));
} catch { /* a saving: without a reading, it says nothing */ }
process.exit(0);
