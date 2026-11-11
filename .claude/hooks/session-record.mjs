#!/usr/bin/env node
// SessionStart, and PreToolUse on Edit|Write: writes where this session's complete record is —its
// transcript— to .validation/sessions.log of the repo, tagged with the card in progress there, so the
// close can say it in specs/<card>/sessions.md (V4).
// Measured: two cards in a row failed V4 with “path not available”: the agent does not know where
// its own transcript is; the hook does. And a session opened elsewhere that works on an external
// worktree leaves no line at the start in that repo: the first write into it registers the session
// there, by the repo the write touches and its card, not by the session's cwd. One line per
// session and card.
// It never blocks.
import { readFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, join, resolve, dirname } from 'node:path';

try {
  const raw = readFileSync(0, 'utf8');
  const input = JSON.parse(raw);
  const card = await import('../tools/card.mjs');
  await card.delegateToRepo(import.meta.url, raw, input);
  const cwd = input.cwd ?? process.cwd();
  const written = input.hook_event_name === 'PreToolUse' ? input.tool_input?.file_path ?? input.tool_input?.notebook_path : undefined;
  if (input.hook_event_name === 'PreToolUse' && typeof written !== 'string') process.exit(0);
  const root = written ? card.kitRootOf(dirname(resolve(cwd, written))) : card.kitRootOf(cwd) ?? cwd;
  if (!root) process.exit(0);
  const cardDir = card.currentCard(root);
  const name = cardDir ? basename(cardDir) : 'none';
  const session = input.session_id ?? 'unknown';
  const dir = join(root, '.validation');
  const log = join(dir, 'sessions.log');
  if (written && existsSync(log) && readFileSync(log, 'utf8').split('\n').some((l) => l.includes(` · session ${session} · `) && l.includes(` · card ${name} · `)))
    process.exit(0);
  mkdirSync(dir, { recursive: true });
  // What the validations generate does not go into the repo (O12): it is excluded locally, without
  // touching the repo's .gitignore. Measured: a card committed .validation/ whole.
  // In a worktree `.git` is a file that points at the real git folder: git itself says where
  // info/exclude is.
  const where = existsSync(join(root, '.git'))
    ? spawnSync('git', ['rev-parse', '--git-path', 'info/exclude'], { cwd: root, encoding: 'utf8', timeout: 20_000 }).stdout?.trim()
    : '';
  const exclude = where && resolve(root, where);
  if (exclude) {
    mkdirSync(dirname(exclude), { recursive: true });
    const now = existsSync(exclude) ? readFileSync(exclude, 'utf8') : '';
    if (!/^\/?\.validation\/?$/m.test(now)) appendFileSync(exclude, `${now && !now.endsWith('\n') ? '\n' : ''}.validation/\n`);
  }
  appendFileSync(log,
    `${new Date().toISOString()} · session ${session} · ${input.source ?? (written ? 'write' : 'start')} · card ${name} · record: ${input.transcript_path ?? 'not available'}\n`);
  // A session that comes back after a compaction or a crash starts with the card's state in its
  // context (SessionStart adds this stdout): the summary may be out of date, the disk is not.
  if (cardDir && ['compact', 'resume'].includes(input.source)) {
    process.stdout.write(`Card ${name} in progress: read specs/${name}/card.md (its Log is the state) with \`node .claude/tools/card-view.mjs specs/${name}\`, which folds the verbatim L1, and .claude/METHOD.md, then \`git status\` and \`git log -5\`.\n`);
  }
} catch {}
process.exit(0);
