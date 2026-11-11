// tree-snapshot.mjs — what a gate line leaves changed in the versioned tree.
// `snapshot(root)` is the hash of every versioned file `git status --porcelain` lists (modified, added, deleted), plus the
// status line itself; untracked and ignored files are not versioned and never count. `changedBetween(before, after)` names
// the files whose state or content differ. A file that was already dirty before counts only if it changed again. The folders the kit writes while it works (`.validation/`,
// `specs/`, `node_modules/`, `test-results/`) are not the line's doing, nor `design/taste/`: the designer, running beside the
// builder, deals its sheet there, and no gate line reads it (the brand check, which does, reads it after the lines).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { git } from './card.mjs';

const OWN = /^(\.validation|specs|design\/taste|node_modules|test-results|\.playwright-mcp)\//;

export const snapshot = (root) => {
  const status = git(root, ['--no-optional-locks', '-c', 'core.quotepath=false', 'status', '--porcelain', '-uall']).stdout ?? '';
  const files = new Map();
  for (const line of status.split('\n').filter(Boolean)) {
    const code = line.slice(0, 2);
    const path = line.slice(3).split(' -> ').pop().replace(/^"|"$/g, '');
    if (code === '??' || OWN.test(path)) continue;
    let content = 'deleted';
    try { content = createHash('sha1').update(readFileSync(join(root, path))).digest('hex'); } catch { /* a deleted file has no content */ }
    files.set(path, `${code}:${content}`);
  }
  return files;
};

export const changedBetween = (before, after) => [...new Set([...before.keys(), ...after.keys()])]
  .filter((f) => before.get(f) !== after.get(f)).sort();
