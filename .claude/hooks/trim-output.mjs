#!/usr/bin/env node
// PreToolUse on Bash (it also fires for PowerShell and lets it through): a test, build, lint or mutation command writes its whole output to a log, and
// what enters the context is what trim.mjs keeps —the failures, the summary and the path of the log.
// Measured: between 26 and 42 commands per card brought 6 to 20 thousand tokens into the main thread,
// and each one was re-read on every request that followed. The kit's tools and an unlimited git log, diff or show
// were the next largest untrimmed items.
// It is a saving, not a guard: if anything goes wrong it lets the command through as it was.
// A command that already redirects or pipes its output, or runs in the background, is left alone.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const HEAVY = /(^|[\s;&|(])(npm (run )?test\b|npm run [\w:-]+|pnpm (run )?[\w:-]+|yarn [\w:-]+|npx (playwright|vitest|jest|eslint|tsc|stryker|c8|jscpd)\b|node (--test|[^\s]*(mutate|verify|required)\.mjs)\b|pytest\b|go (test|build|vet)\b|dotnet (test|build)\b|mvn\b|gradle\b|\.\/gradlew\b|cargo (test|build|clippy)\b|ruff\b|mypy\b)/;
const ALREADY = /[|>]|\btee\b|2>&1|&\s*$|\bnohup\b/;
// The kit's tools print long reports, except the ones whose output is the answer: `bar.mjs <IDs>`, help, log and trim itself.
const TOOL = /(^|[\s;&|(])node\s+\S*\.claude[\\/]tools[\\/]([\w-]+)\.mjs\b(\s+\S)?/g;
const toolIsHeavy = (cmd) => [...cmd.matchAll(TOOL)].some(([, , name, args]) => !['help', 'trim', 'log'].includes(name) && !(name === 'bar' && args));
// git log, diff and show are long unless the command already limits them.
const GIT_LONG = /(^|[\s;&|(])git\s+(log|diff|show)\b/;
const GIT_LIMITED = /--(stat|shortstat|numstat|name-only|name-status|max-count|quiet)\b|\s-n\s*\d+|\s-\d+\b/;

const pass = () => process.exit(0);
try {
  const raw = readFileSync(0, 'utf8');
  const input = JSON.parse(raw);
  await (await import('../tools/card.mjs')).delegateToRepo(import.meta.url, raw, input);
  const { tool_name: shell, tool_input: data = {}, cwd = process.cwd() } = input;
  const cmd = String(data.command ?? '');
  // The rewrite is POSIX shell syntax: PowerShell would not run it.
  if (shell === 'PowerShell' || data.run_in_background || ALREADY.test(cmd)) pass();
  const heavy = HEAVY.test(cmd) || toolIsHeavy(cmd) || (GIT_LONG.test(cmd) && !GIT_LIMITED.test(cmd));
  if (!heavy) pass();
  const slash = (p) => p.split('\\').join('/');
  const log = slash(join(cwd, '.validation', 'out', `${Date.now()}-${process.pid}.log`));
  const tool = slash(join(import.meta.dirname, '..', 'tools', 'trim.mjs'));
  const command = `mkdir -p "${slash(join(cwd, '.validation', 'out'))}" && { ${cmd}\n} > "${log}" 2>&1; s=$?; node "${tool}" "${log}" $s; exit $s`;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput: { ...data, command } } }));
} catch {
  pass();
}
