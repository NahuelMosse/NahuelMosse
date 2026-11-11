#!/usr/bin/env node
// PreToolUse on Agent, Skill and Bash: the cap (`cap: <N> min` in the header of card.md) holds for every phase,
// not only for review laps (review-cap does those).
// Past 70 % of the cap (the header of card.md), the first Agent, Skill or Bash call of each ten minutes gets a warning that
// does not stop it. Past 100 %, no new agent starts —the plan judge included: it runs before building— and no test
// suite or mutation runs: the card closes with what it has and declares what did not run. Measured: a card with a 2-hour cap ran for ten hours.
// The clock starts at the commit that froze card.md, as in review-cap. The cap is read with the same function as require-bar;
// if it cannot be read here the hook
// says so instead of switching itself off silently.
// Contract: exit 0 lets it through (stdout JSON carries the warning); exit 2 blocks and Claude reads
// stderr. If it cannot read what is being asked, it blocks.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { delegateToRepo } from '../tools/card.mjs';
import { gitDirOf } from '../tools/browser-lock.mjs';

let input;
let raw;
try { raw = readFileSync(0, 'utf8'); input = JSON.parse(raw); } catch (e) {
  process.stderr.write(`The time cap could not read what is being asked (${e.message}). It blocks when in doubt: retry.\n`);
  process.exit(2);
}
await delegateToRepo(import.meta.url, raw, input);
const { tool_name: tool, tool_input: data = {}, cwd = process.cwd() } = input;
if (!['Agent', 'Skill', 'Bash', 'PowerShell'].includes(tool)) process.exit(0);

const WARN_AT = 0.7;
const EVERY_MIN = 10;
// What the close itself runs passes past the cap: the gate (verify.mjs), what required.mjs asks for (once.mjs) and the close.
// Blocking them left a card past its cap unable to close (require-at-close wants those records), and the repo stuck behind it.
const CLOSES = /^\s*(?:cd\s+[^;&|]+(?:&&|;)\s*)?node\s+\S*(?:verify|once|close|required)\.mjs\b/;
const RUNS_SUITE = /(^|[\s;&|(])(npm (run )?test\b|npm run test[\w:-]*|pnpm (run )?test\b|yarn test\b|npx (playwright|vitest|jest|stryker|c8)\b|node --test\b|node [^\s]*(mutate|verify)\.mjs\b|pytest\b|go test\b|dotnet test\b|mvn\b[^;&|]*\btest\b|gradle\b[^;&|]*\btest\b|\.\/gradlew\b[^;&|]*\btest\b|cargo test\b|stryker\b|vitest\b|jest\b)/;

try {
  const { hookCard, cardCap, minutesSinceSnapshot } = await import('../tools/card.mjs');
  const { root, card } = hookCard(cwd, process.env, input) ?? {};
  // A closed card has nothing left to cap. Measured: judging a finished run from outside stayed
  // blocked by its expired cap.
  if (card && existsSync(join(card, 'closing.md'))) process.exit(0);
  if (!card || !['card.md', 'plan.md'].some((f) => existsSync(join(card, f)))) process.exit(0);
  const elapsed = minutesSinceSnapshot(root, card);
  if (elapsed === null) process.exit(0);

  const capMin = cardCap(card);
  let message = null;
  if (capMin === null) {
    message = 'The card has no cap in the form `cap: <N> min` or `cap: <N> h` in the header of card.md, so the time cap cannot ' +
      'be enforced. Add it above the first `## ` heading.';
  } else {
    const pct = elapsed / capMin;
    if (pct >= 1) {
      const heavy = tool === 'Agent'
        ? true
        : tool !== 'Skill' && RUNS_SUITE.test(String(data.command ?? '')) && !CLOSES.test(String(data.command ?? ''));
      if (heavy) {
        process.stderr.write(
          "Past the time plan's cap: no new agent or suite. Close now with what there is: `node .claude/tools/verify.mjs`, what " +
          '`node .claude/tools/required.mjs` lists (through once.mjs), then `/close`, which declares what did not run (three states). ' +
          'A new request of the person is a new card after this one closes.\n');
        process.exit(2);
      }
    }
    if (pct >= WARN_AT) {
      message = `Time plan: ${Math.round(elapsed)} min of ${Math.round(capMin)} min cap (${Math.round(pct * 100)} %) since card.md was committed.` +
        (pct >= 1
          ? " Past the cap no new agent and no test suite starts outside the close: run the gate (verify.mjs), what required.mjs lists and `/close` now, declaring what did not run (three states)."
          : 'Cut scope now what will not fit, and keep the close for the time that is left.');
    }
  }
  if (!message) process.exit(0);

  // One warning per card every ten minutes: the state lives in the git folder, like review-cap's count.
  const gitDir = gitDirOf(root);
  let branch = 'no-branch';
  try { branch = readFileSync(join(gitDir, 'HEAD'), 'utf8').match(/^ref: refs\/heads\/(.+?)\s*$/m)?.[1] ?? 'no-branch'; } catch { /* no git folder: no branch */ }
  const dir = gitDir || join(root, '.validation');
  const file = join(dir, 'sdd-time-cap.json');
  let warned = {};
  try { if (existsSync(file)) warned = JSON.parse(readFileSync(file, 'utf8')); } catch {}
  if (Date.now() - (warned[branch] ?? 0) < EVERY_MIN * 60_000) process.exit(0);
  mkdirSync(dir, { recursive: true });
  warned[branch] = Date.now();
  writeFileSync(file, JSON.stringify(warned));
  process.stdout.write(JSON.stringify({
    systemMessage: message,
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: message },
  }));
} catch (e) {
  process.stderr.write(`The time cap could not be evaluated (${e.message}).\n`);
}
process.exit(0);
