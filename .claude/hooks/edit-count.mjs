#!/usr/bin/env node
// PreToolUse on Edit: counts the Edits of each file per agent, and on the second warns to write the file whole.
// Measured: one agent made 67 Edits and 25 Writes; every edit stays in the context and is re-read on each request.
// Files of more than 200 lines or 6000 characters are not warned about. It is a warning, never a block. The count lives in the git folder of the file's repo, like review-cap's.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const AT = 2;
const BIG = 200;
const BIG_CHARS = 6000;
try {
  const raw = readFileSync(0, 'utf8');
  const input = JSON.parse(raw);
  await (await import('../tools/card.mjs')).delegateToRepo(import.meta.url, raw, input);
  const target = input.tool_input?.file_path;
  if (!target) process.exit(0);
  const file = resolve(input.cwd ?? process.cwd(), target);
  const folder = dirname(file);
  const gitDir = existsSync(folder) ? (await import('../tools/browser-lock.mjs')).gitDirOf(folder) : '';
  const dir = gitDir || join(input.cwd ?? process.cwd(), '.validation');
  const store = join(dir, 'sdd-edit-count.json');
  let counts = {};
  try { if (existsSync(store)) counts = JSON.parse(readFileSync(store, 'utf8')); } catch {}
  const key = `${input.agent_id ?? 'main'}\n${file}`;
  counts[key] = (counts[key] ?? 0) + 1;
  mkdirSync(dir, { recursive: true });
  writeFileSync(store, JSON.stringify(counts));
  if (counts[key] !== AT) process.exit(0);
  // Past this size, rewriting the file whole costs more than the edits.
  if (existsSync(file)) {
    const text = readFileSync(file, 'utf8');
    if (text.length > BIG_CHARS || text.split('\n').length > BIG) process.exit(0);
  }
  const message = `Second edit of ${file}: write it whole with Write — each edit stays in the context and is re-read on every request.`;
  process.stdout.write(JSON.stringify({
    systemMessage: message,
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: message },
  }));
} catch {
  process.exit(0);
}
