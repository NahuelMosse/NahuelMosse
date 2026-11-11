#!/usr/bin/env node
// SessionStart: removes, in the background, the worktrees of this repository whose work is all kept elsewhere (merged,
// pushed, clean, idle; tools/worktrees.mjs decides). Worktrees made per card or per agent were never removed and piled up
// by the dozen. At most once every 12 hours per repository; what it did goes to .validation/worktrees.log. A worktree
// kept on purpose is locked: `git worktree lock <path>`.
// It prints nothing and never blocks.
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EVERY_MS = 12 * 3_600_000;

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  if (input.source && input.source !== 'startup') process.exit(0);
  const cwd = input.cwd ?? process.cwd();
  const git = (args) => spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 10_000 }).stdout?.trim() ?? '';
  const top = git(['rev-parse', '--show-toplevel']);
  const common = git(['rev-parse', '--git-common-dir']);
  if (!top || !common) process.exit(0);
  const stamp = join(resolve(cwd, common), 'kit-worktree-sweep');
  if (existsSync(stamp) && Date.now() - statSync(stamp).mtimeMs < EVERY_MS) process.exit(0);
  writeFileSync(stamp, `${new Date().toISOString()}\n`);
  const dir = join(top, '.validation');
  mkdirSync(dir, { recursive: true });
  const log = openSync(join(dir, 'worktrees.log'), 'a');
  const tool = fileURLToPath(new URL('../tools/worktrees.mjs', import.meta.url));
  spawn(process.execPath, [tool, 'prune', '--execute'], { cwd: top, detached: true, stdio: ['ignore', log, log], windowsHide: true }).unref();
  closeSync(log);
} catch {}
process.exit(0);
