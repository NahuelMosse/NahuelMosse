#!/usr/bin/env node
// PreToolUse on Skill and Agent: how many judges a card gets, and the launches that waste a context.
// - `judge`: what `risk.json` (risk.mjs) says. Only `review: high` gets a judge, one, of the plan (its prompt starts with
//   `PLAN`): it reads card.md before the code is built, and the green gate closes. A `judge` with no `PLAN`, or at low or
//   medium, is refused; so is a `builder` whose prompt starts with `FIX`: there is no judge of the code and no correction
//   round. A `judge` with no risk.json is refused: the classification comes first.
// - The agents whose model is part of what they are (`judge`, `oracle`, `planner`) are not launched with another one:
//   their frontmatter decides.
// - The `design-critic` runs once; a second call, starting with `RECHECK`, is allowed only while critique.md has an open blocker.
// - During a card every launch names its agent (no `general-purpose`), and a `scout` is not sent to read the kit.
// - A review skill (`/code-review`, `/simplify`…) has one lap per card: the judge is the review.
// The card is the one `specs/.current` names, in the repo that holds it; the counts live inside that repo's git folder
// (not committed, not erased by a cleanup of validation leftovers). A closed card (closing.md) is not counted.
// Measured: one card ran /code-review sixteen times; the main thread launched a reviewer agent on `haiku` over the `opus` of
// its frontmatter (hence the `judge`'s model is fixed).
// Contract: exit 0 lets it through; exit 2 blocks and Claude reads stderr. If it cannot read what is being asked, it
// blocks: a cap that crashes and lets things through is not a cap.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { delegateToRepo } from '../tools/card.mjs';
import { gitDirOf } from '../tools/browser-lock.mjs';
import { riskOf } from '../tools/card-doc.mjs';
import { critiqueOf } from '../tools/close.mjs';
import { active } from '../tools/kit.mjs';

const REVIEWS = new Set(['code-review', 'simplify', 'design-review', 'accessibility-audit', 'design-deslop']);
const PINNED = new Set(['judge', 'oracle', 'planner', 'design-critic']);
// A prompt that pastes what the agent can read costs its length once in the caller's context and again in every
// request of the agent. Past this many characters the call is warned, not blocked.
const LONG_PROMPT = 3000;

const advice = [];
const finish = () => {
  if (advice.length) {
    const message = advice.join(' ');
    process.stdout.write(JSON.stringify({ systemMessage: message, hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: message } }));
  }
  process.exit(0);
};
const refuse = (message) => { process.stderr.write(`${message}\n`); process.exit(2); };

let input;
let raw;
try { raw = readFileSync(0, 'utf8'); input = JSON.parse(raw); } catch (e) {
  refuse(`The review cap could not read what is being asked (${e.message}). It blocks when in doubt: retry.`);
}
await delegateToRepo(import.meta.url, raw, input);
const { tool_name: tool, tool_input: data = {}, cwd = process.cwd() } = input;
const agent = tool === 'Agent' ? String(data.subagent_type ?? '').trim() : '';
const prompt = String(data.prompt ?? '');

if (PINNED.has(agent) && data.model) {
  let pinned = null;
  try {
    const head = readFileSync(new URL(`../agents/${agent}.md`, import.meta.url), 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
    pinned = head?.[1].match(/^model:\s*(\S+)/m)?.[1] ?? null;
  } catch { /* an agent with no file has no pinned model */ }
  if (pinned && data.model !== pinned)
    refuse(`The ${agent} runs on ${pinned}, set in its frontmatter; the call asked for ${data.model}. Do not pass \`model\`: a judge on a weaker model gives a weaker verdict, and the cost of the lap is the same.`);
}
if (tool === 'Agent' && prompt.length > LONG_PROMPT)
  advice.push(`The prompt of this agent is ${prompt.length} characters: point to card.md and the files instead of pasting them; the agent reads them in its own context.`);

let open;
try { open = (await import('../tools/card.mjs')).hookCard(cwd, process.env, input); } catch (e) {
  refuse(`The review cap could not find the card (${e.message}). It blocks when in doubt: retry.`);
}
const live = open && !existsSync(join(open.card, 'closing.md')) ? open : null;

// Measured: the visual judge and the audits went to `general-purpose`, which inherits Opus and the whole context.
if (tool === 'Agent' && /^(general-purpose)?$/.test(agent) && live)
  refuse('No `general-purpose` agent during a card: it inherits Opus and the whole context. Name the agent: `builder` for the code of a large card, `designer` for the look of a screen, `judge` for the review by risk, `design-critic` for the polish of a visual card, ' +
    '`runner` for a long log, `scout` to search, `grunt` for a decided change.');
if (agent === 'scout' && /\.claude\//.test(prompt) && live)
  refuse('The kit\'s documents are not delegated to a `scout`: `.claude/METHOD.md` says what a card needs; a tool: `node .claude/tools/help.mjs <tool>`.');

let review = null;
if (tool === 'Skill') {
  const name = String(data.skill ?? '').split(':').pop();
  if (REVIEWS.has(name)) review = name;
} else if (agent === 'judge') {
  if (!/^\s*PLAN\b/.test(prompt))
    refuse('The `judge` reads the plan only: its prompt starts with `PLAN`. There is no judge of the code. What a code judge found is checked by the gate: `node .claude/tools/risk.mjs <card-dir>` (rules over card.md), `attack.mjs` and `probe.mjs` (the card\'s limits and states) and the questions of `.claude/reference/lenses.md`, which `/card` walks before `## Specs` closes.');
  review = 'judge-plan';
} else if (agent === 'design-critic') review = 'design-critic';
else if (agent === 'builder' && /^\s*FIX\b/.test(prompt))
  refuse('There is no `FIX` round. A red gate after two rounds without progress is written in the `## Log` and the close lists it in `## Could not run`. What a finding round caught is checked earlier: `node .claude/tools/risk.mjs <card-dir>`, the gate (`attack.mjs`, `probe.mjs`) and `.claude/reference/lenses.md`.');
if (!review || !live) finish();

const { root, card } = live;
const cardName = card.split(/[\\/]/).pop();
const gitDir = gitDirOf(root);
const dir = gitDir || join(root, '.validation');
const file = join(dir, 'sdd-reviews.json');
let counts = {};
try { if (existsSync(file)) counts = JSON.parse(readFileSync(file, 'utf8')); } catch { /* a count that cannot be read starts again */ }
const key = `${cardName} · ${review}`;
const done = counts[key] ?? 0;

const risk = riskOf(card);
if (review === 'judge-plan') {
  if (!risk) refuse(`No judge without risk.json: run \`node .claude/tools/risk.mjs specs/${cardName}\` first. The classification decides whether the card gets a judge.`);
  if (risk.review !== 'high') refuse(`risk.json of ${cardName} says review: ${risk.review}: no judge. Only high gets the plan judge; the plan rules (\`node .claude/tools/risk.mjs <card-dir>\`), the gate and \`.claude/reference/lenses.md\` are the whole review of this card.`);
  const { exempt } = active(root);
  if (exempt.without.has('judge')) refuse(`The repo's grade is ${exempt.grade}: it launches no judge, whatever risk.json says. The plan rules (\`node .claude/tools/risk.mjs <card-dir>\`), the gate and \`.claude/reference/lenses.md\` are the whole review of this card.`);
}
if (review === 'design-critic') {
  if (!risk) refuse(`No design-critic without risk.json: run \`node .claude/tools/risk.mjs specs/${cardName}\` first.`);
  if (!risk.lenses?.includes('visual')) refuse(`risk.json of ${cardName} has no \`visual\` lens: the design-critic runs only on a visual card.`);
}
// The design-critic runs once, and once more only to re-check its own blockers: `critique.md` holds an open blocker and the
// prompt starts with `RECHECK`. Never a third call.
let cap = 1;
if (review === 'design-critic' && done === 1) {
  const critique = join(card, 'critique.md');
  const openBlockers = existsSync(critique) ? critiqueOf(readFileSync(critique, 'utf8')).blockers : [];
  if (openBlockers.length) {
    cap = 2;
    if (!/^\s*RECHECK\b/.test(prompt))
      refuse(`The design-critic already ran on this card (${cardName}) and critique.md has an open blocker: the second call re-checks only that blocker, and its prompt starts with \`RECHECK\`. It does not re-run the rubric: it looks at the blocker with fresh captures and updates critique.md with the blocker closed or still open.`);
  }
}
if (done >= cap) {
  const what = review === 'judge-plan' ? `The plan judge already ran on this card (${cardName}); a card gets one` : review === 'design-critic' ? `The design-critic already ran on this card (${cardName})${done >= 2 ? ' and re-checked its blocker' : ' and critique.md has no open blocker to re-check'}; a card gets one critique and, with a blocker, one re-check` : `${review} already ran on this card (${cardName}); a card gets one lap`;
  refuse(`${what}. Another round will not leave it spotless: it finds something else small. What is left is closed or declared in judge.md, and the PR is the review of the rest.`);
}
mkdirSync(dir, { recursive: true });
counts[key] = done + 1;
writeFileSync(file, JSON.stringify(counts, null, 1));
finish();
