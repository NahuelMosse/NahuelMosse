#!/usr/bin/env node
// PreToolUse on every tool, for subagents only: a subagent that reaches its `maxTurns` is cut and returns half
// a text with «stopped at its N-turn limit (partial result)»: what it did is lost and the main thread does not
// know what is left uncovered. The limit is the `maxTurns` of the agent's frontmatter —`.claude/agents/<type>.md`
// of the repo, else `<home>/.claude/agents/<type>.md` (`KIT_HOME` or the home directory)—; without it, or for a plugin
// agent (`x:y`), the hook says nothing. The turns used are the assistant messages with a distinct `message.id` of
// the subagent's own transcript (`transcriptOf`, as context-cap.mjs does).
// At 70 % of the turns it warns once per agent to write down now what it verified; from 85 % it refuses every tool
// but a Write or Edit of a `.md` and a `git add`, `git commit` or `git status`, and asks it to return with what it
// covered and a `Not covered (turn budget)` section, so the main thread launches another agent for only that.
// Without a readable transcript or frontmatter the hook says nothing: it is a saving, the guards that protect the
// card are others.
// A SendMessage from the main thread to a subagent already past 85 % is refused: launch a fresh one instead.
// Contract: exit 0 lets it through (stdout JSON carries the warning); exit 2 blocks and Claude reads stderr.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { countTurns, onlyCommit, transcriptOf } from '../tools/transcript.mjs';

const WARN_AT = 0.7;
const STOP_AT = 0.85;

// `maxTurns` of the first `<dir>/.claude/agents/<type>.md` that has one, or null.
const maxTurnsOf = (type, dirs) => {
  if (!/^[\w.-]+$/.test(type)) return null;
  for (const dir of dirs) {
    const file = join(dir, '.claude', 'agents', `${type}.md`);
    if (!existsSync(file)) continue;
    const head = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---/);
    const found = head?.[1].match(/^maxTurns:\s*(\d+)\s*$/m);
    if (found) return Number(found[1]);
  }
  return null;
};

// A SendMessage to a subagent resumes it with the turns it already used: one past STOP_AT comes back in seconds with
// nothing done (measured: 12 s, 0 tools). The target is `to`, an agent id or a name in `<session>/subagents/*.meta.json`.
const resumesSpent = (input) => {
  const to = String(input.tool_input?.to ?? '').trim();
  const main = input.transcript_path;
  if (!to || !main || /[\\/]subagents[\\/]/.test(main)) return;
  const dir = join(dirname(main), basename(main, '.jsonl'), 'subagents');
  if (!existsSync(dir)) return;
  const metaOf = (id) => { try { return JSON.parse(readFileSync(join(dir, `agent-${id}.meta.json`), 'utf8')); } catch { return null; } };
  const ids = readdirSync(dir).filter((f) => /^agent-[\w.-]+\.jsonl$/.test(f)).map((f) => f.slice(6, -6));
  const id = ids.includes(to) ? to : ids.filter((i) => metaOf(i)?.name === to).at(-1);
  const type = id && metaOf(id)?.agentType;
  if (!type) return;
  const max = maxTurnsOf(String(type), [input.cwd ?? process.cwd(), process.env.KIT_HOME ?? homedir()]);
  if (!max) return;
  const used = countTurns(join(dir, `agent-${id}.jsonl`));
  if (used < max * STOP_AT) return;
  process.stderr.write(
    `${to} is a ${type} that already used ${used} of its ${max} turns: resumed, it stops before doing anything. ` +
    `Launch a fresh ${type} with the Agent tool, giving it the handoff.md (or the report) the last one wrote and only what it left uncovered.\n`
  );
  process.exit(2);
};

let input;
let raw;
try { raw = readFileSync(0, 'utf8'); input = JSON.parse(raw); } catch { process.exit(0); }
try {
  await (await import('../tools/card.mjs')).delegateToRepo(import.meta.url, raw, input);
  if (input.tool_name === 'SendMessage') resumesSpent(input);
  if (!input.agent_id || !input.agent_type) process.exit(0);
  const max = maxTurnsOf(String(input.agent_type), [input.cwd ?? process.cwd(), process.env.KIT_HOME ?? homedir()]);
  if (!max) process.exit(0);
  const file = transcriptOf(input);
  if (!file || !existsSync(file)) process.exit(0);
  const used = countTurns(file);
  if (used < max * WARN_AT) process.exit(0);
  const left = Math.max(0, max - used);

  if (used >= max * STOP_AT) {
    const tool = input.tool_name;
    const data = input.tool_input ?? {};
    const writesDoc = (tool === 'Write' || tool === 'Edit') && /\.md$/i.test(String(data.file_path ?? ''));
    const commits = (tool === 'Bash' || tool === 'PowerShell') && onlyCommit(String(data.command ?? ''));
    if (writesDoc || commits) process.exit(0);
    process.stderr.write(
      `This ${input.agent_type} has used ${used} of its ${max} turns (${left} left): the limit cuts it and the work not written is lost. ` +
      'Return now with the complete report of what you covered, written in handoff.md (or judge.md), and a section `Not covered (turn budget)` ' +
      'with what you did not get to review, each item as *could not run*, so the main thread launches another agent of the same type for only that. ' +
      'Allowed now: Write or Edit of a `.md` file, and a shell command made only of git add, git commit and git status, chained with `&&`, optionally after `cd <path> &&` (no `export` or other prefix).\n'
    );
    process.exit(2);
  }

  const marker = join(tmpdir(), 'kit-turn-budget');
  const warned = join(marker, `${String(input.agent_id).replace(/[^\w.-]/g, '_')}.warned`);
  if (existsSync(warned)) process.exit(0);
  mkdirSync(marker, { recursive: true });
  writeFileSync(warned, `${used}`);
  const message = `Turns of this ${input.agent_type}: ${used} of ${max}, ${left} left. Write now in handoff.md (or judge.md) what you verified so far, so nothing is lost, and go on. ` +
    `From ${Math.ceil(max * STOP_AT)} turns only a Write or Edit of a .md and the commit are allowed: return then with a \`Not covered (turn budget)\` section.`;
  process.stdout.write(JSON.stringify({
    systemMessage: message,
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: message },
  }));
} catch { /* a saving: without a reading, it says nothing */ }
process.exit(0);
