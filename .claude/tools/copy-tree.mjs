// copy-tree.mjs — the project copy mutate.mjs works on.
//
// Everything is copied except git, what tools write while they run and what a build regenerates: those folders change under the
// copy's feet when another command —a Playwright suite run by verify.mjs in parallel— is writing and erasing them, and copying a
// Flutter `build/` or a Gradle cache costs minutes on a slow disk. The installed dependencies (`node_modules`, a Python `.venv`)
// are linked, at any depth, never copied. An entry that disappears or is locked during the copy is skipped, not fatal: the copy
// is of the code, and what vanishes was never code.
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmSync, statSync, symlinkSync, unlinkSync, utimesSync } from 'node:fs';
import { join } from 'node:path';

export const EXCLUDED = new Set([
  '.git', '.validation',
  'test-results', 'playwright-report', 'blob-report', 'coverage',
  'build', '.gradle', 'Pods', '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache',
]);
// Linked to the project's own folder: the dependencies are the same, and copying them is the slow part.
export const LINKED = new Set(['node_modules', '.venv', 'venv']);
const VANISHED = new Set(['ENOENT', 'EBUSY']);

const linkTo = (from, to) => { if (!existsSync(to)) symlinkSync(from, to, 'junction'); };

// Returns the paths it had to skip, for whoever wants to say so.
export const copyTree = (src, dest, { copyFile = copyFileSync, skipped = [] } = {}) => syncTree(src, dest, { copyFile, skipped, fresh: true });

// Brings `dest` to `src`: copies what is missing or changed (size or modification time), removes what `src` no longer has, links
// the dependencies. On a copy kept from an earlier run it touches only what changed since.
export const syncTree = (src, dest, { copyFile = copyFileSync, skipped = [], fresh = false } = {}) => {
  mkdirSync(dest, { recursive: true });
  let names;
  try { names = readdirSync(src); } catch (e) {
    if (!VANISHED.has(e.code)) throw e;
    skipped.push(src);
    return skipped;
  }
  if (!fresh) {
    const keep = new Set(names);
    for (const name of readdirSync(dest)) {
      if (keep.has(name) && !EXCLUDED.has(name)) continue;
      const stale = join(dest, name);
      try { if (lstatSync(stale).isSymbolicLink()) unlinkSync(stale); else { unlinkDependencies(stale); rmSync(stale, { recursive: true, force: true }); } } catch {}
    }
  }
  for (const name of names) {
    if (EXCLUDED.has(name)) continue;
    const from = join(src, name);
    const to = join(dest, name);
    try {
      const stat = lstatSync(from);
      if (LINKED.has(name) && stat.isDirectory()) linkTo(from, to);
      else if (stat.isDirectory()) syncTree(from, to, { copyFile, skipped, fresh });
      else if (stat.isSymbolicLink()) { if (!existsSync(to)) symlinkSync(readlinkSync(from), to); }
      else if (fresh || !existsSync(to) || (() => { const t = statSync(to); return t.size !== stat.size || t.mtimeMs !== stat.mtimeMs; })()) {
        copyFile(from, to);
        utimesSync(to, stat.atime, stat.mtime);
      }
    } catch (e) {
      if (!VANISHED.has(e.code)) throw e;
      skipped.push(from);
    }
  }
  return skipped;
};

// Removes the links before deleting a copy, so the deletion cannot follow them into the project's dependencies.
export const unlinkDependencies = (dir) => {
  let names;
  try { names = readdirSync(dir); } catch { return; }
  for (const name of names) {
    const path = join(dir, name);
    let stat;
    try { stat = lstatSync(path); } catch { continue; }
    if (stat.isSymbolicLink() && LINKED.has(name)) { try { unlinkSync(path); } catch {} }
    else if (stat.isDirectory() && !stat.isSymbolicLink()) unlinkDependencies(path);
  }
};
