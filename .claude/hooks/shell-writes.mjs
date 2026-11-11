#!/usr/bin/env node
// PreToolUse and PostToolUse on Bash and PowerShell: what a subagent's shell call did to the production files.
// guard-shell.mjs refuses the writes it can read in the text of the command; a script that computes its path, or a
// tool that rewrites files, gets through it. Before the call this hook keeps in `.git/kit-shell-writes/` what git
// reports of the production files (status, size, modification time); after it, it compares, and if one changed it
// tells the agent to redo it with Edit or Write, where the guards of the card see it. It is advice, never a block:
// a formatter or a generator run on purpose is legitimate, and git commands change the tree by design.
// Contract: exit 0 always (stdout JSON carries the advice); a failure says nothing, the guard that blocks is another.
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

let input;
let raw;
try { raw = readFileSync(0, 'utf8'); input = JSON.parse(raw); } catch { process.exit(0); }
try {
  await (await import('../tools/card.mjs')).delegateToRepo(import.meta.url, raw, input);
  if (!input.agent_id) process.exit(0);
  const command = String(input.tool_input?.command ?? '');
  const unquoted = command.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""');
  // One git command, after an optional `cd`: it changes the tree by design.
  if (/^\s*(?:cd\s+\S+\s*&&\s*)?git(?:\.exe)?\s/.test(unquoted) && !/&&|;|\||\n/.test(unquoted.replace(/^\s*cd\s+\S+\s*&&/, ''))) process.exit(0);
  // A chain made only of `cd` and the git commands that change the tree by design (`git add -A && git commit`).
  const gitOnly = /^\s*(?:cd\s+\S+|git(?:\.exe)?\s+(?:-C\s+\S+\s+)?(?:add|commit|rm|mv)\b[^;&|]*)\s*$/;
  if (unquoted.split(/&&|;|\n/).filter((p) => p.trim()).every((p) => gitOnly.test(p))) process.exit(0);
  const { hookCard, isProductionPath } = await import('../tools/card.mjs');
  const { isSourceFile } = await import('../tools/shell-writes.mjs');
  const cwd = input.cwd ?? process.cwd();
  const found = hookCard(cwd, process.env, input);
  if (!found) process.exit(0);
  const git = (...args) => spawnSync('git', args, { cwd: found.root, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 20_000 });
  const gitDir = git('rev-parse', '--absolute-git-dir');
  const top = git('rev-parse', '--show-toplevel');
  if (gitDir.status !== 0 || top.status !== 0) process.exit(0);
  const folder = join(gitDir.stdout.trim(), 'kit-shell-writes');
  const file = join(folder, `${String(input.tool_use_id ?? input.agent_id).replace(/[^\w.-]/g, '_')}.json`);

  // The production files git reports, with what tells that one was written: its status, size and time.
  const fingerprint = () => {
    // Twice per shell call: without --no-optional-locks each one may rewrite the index and take its lock.
    const status = git('--no-optional-locks', 'status', '--porcelain', '-z', '--untracked-files=all');
    const entries = status.stdout.split('\0');
    const state = {};
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.length < 4) continue;
      if (/[RC]/.test(entry.slice(0, 2))) i++;
      const abs = join(top.stdout.trim(), entry.slice(3));
      if (!isProductionPath(found.root, abs) || !isSourceFile(abs)) continue;
      let stamp = 'gone';
      try { const s = statSync(abs); stamp = `${s.size}:${s.mtimeMs}`; } catch { /* deleted */ }
      state[entry.slice(3)] = `${entry.slice(0, 2)}:${stamp}`;
    }
    return state;
  };

  if (input.hook_event_name === 'PreToolUse') {
    mkdirSync(folder, { recursive: true });
    writeFileSync(file, JSON.stringify(fingerprint()));
    process.exit(0);
  }
  if (input.hook_event_name !== 'PostToolUse' || !existsSync(file)) process.exit(0);
  const before = JSON.parse(readFileSync(file, 'utf8'));
  rmSync(file, { force: true });
  const after = fingerprint();
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((f) => before[f] !== after[f]).sort();
  if (!changed.length) process.exit(0);
  const message = `That shell call changed production files: ${changed.slice(0, 8).join(', ')}${changed.length > 8 ? ` and ${changed.length - 8} more` : ''}. ` +
    'The guards that protect the card see Edit and Write, not the shell: if you wrote them by hand, redo it with Edit or Write ' +
    '(a formatter or a generator you ran on purpose is fine).';
  process.stdout.write(JSON.stringify({ systemMessage: message, hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: message } }));
} catch { /* advice only */ }
process.exit(0);
