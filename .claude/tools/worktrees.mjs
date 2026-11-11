#!/usr/bin/env node
// worktrees.mjs — the worktrees of this repository, and the removal of the ones whose work is all kept elsewhere.
//
//   node .claude/tools/worktrees.mjs list
//   node .claude/tools/worktrees.mjs prune [--execute] [--idle-hours <n>] [--only <path>]
//   node .claude/tools/worktrees.mjs remove <path> [--discard]
//
// `prune` removes a worktree only when nothing in it exists anywhere else: no tracked change, no untracked file, no ignored
// file but rebuildable output (node_modules, dist, caches…), every commit on a remote or on the default branch, its branch
// merged (an ancestor of the default branch, or a merged PR), not locked, not the one this command runs in, and no git
// activity for `--idle-hours` (6 by default). Without `--execute` it only says what it would do. `remove` is for a scratch
// worktree (the base of a migration check): it refuses commits that are nowhere else, and `--discard` drops its changes.
//
// On Windows `git worktree remove`, with or without --force, walks into a junction and empties its target (measured: a
// `node_modules` junction to another repo was emptied twice). Every link inside the worktree that points outside it is
// unlinked first, and the target is checked to still be there before git deletes anything.
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync, statSync, unlinkSync, rmdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOUR = 3_600_000;
// Ignored output that a build or an install brings back: anything else ignored (`.env`, a local database, uploads) is kept.
const REBUILDABLE = /(?:^|\/)(?:node_modules|dist|build|out|\.next|\.nuxt|\.svelte-kit|\.turbo|\.cache|\.parcel-cache|\.vite|coverage|\.nyc_output|test-results|playwright-report|blob-report|\.validation|\.kit-incoming|\.playwright-mcp|\.dart_tool|\.gradle|target|bin|obj|__pycache__|\.pytest_cache|\.mypy_cache|\.ruff_cache|\.venv|venv|\.tox|\.angular|storybook-static)(?:\/|$)|\.(?:log|tsbuildinfo|pyc|eslintcache)$|(?:^|\/)(?:\.DS_Store|Thumbs\.db|next-env\.d\.ts)$/;

const run = (cwd, args, timeout = 30_000) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout, maxBuffer: 1 << 26 });
  // Only the end is trimmed: `status --porcelain` starts its first line with a space that is part of the entry.
  return { ok: !r.error && r.status === 0, out: (r.stdout ?? '').replace(/^\n+|\s+$/g, ''), err: (r.stderr ?? '').trim() || (r.error?.message ?? '') };
};
const norm = (p) => { let r = resolve(p); try { r = realpathSync.native(r); } catch {} r = r.replaceAll('\\', '/'); return process.platform === 'win32' ? r.toLowerCase() : r; };

// `git worktree list --porcelain`: the first is the main worktree.
export const worktreesOf = (repo) => {
  const r = run(repo, ['worktree', 'list', '--porcelain']);
  if (!r.ok) throw new Error(`git worktree list: ${r.err}`);
  return r.out.split(/\n\s*\n/).filter(Boolean).map((block, i) => {
    const get = (k) => block.split('\n').find((l) => l === k || l.startsWith(`${k} `));
    const value = (k) => get(k)?.slice(k.length + 1) ?? '';
    return {
      path: value('worktree'),
      head: value('HEAD'),
      branch: value('branch').replace(/^refs\/heads\//, '') || null,
      main: i === 0,
      bare: Boolean(get('bare')),
      locked: get('locked') ? value('locked') || 'locked' : null,
    };
  });
};

const defaultRefOf = (repo) => {
  const sym = run(repo, ['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD']);
  const candidates = [sym.ok && sym.out, 'origin/main', 'origin/master', 'main', 'master'].filter(Boolean);
  return candidates.find((ref) => run(repo, ['rev-parse', '-q', '--verify', `${ref}^{commit}`]).ok) ?? null;
};

// The most recent sign of work: the worktree's own index, HEAD and reflog, and its top folder.
const lastActivity = (path) => {
  const dotgit = join(path, '.git');
  let gitdir = null;
  try { gitdir = readFileSync(dotgit, 'utf8').match(/^gitdir:\s*(.+)$/m)?.[1]?.trim() ?? null; } catch {}
  if (gitdir && !isAbsolute(gitdir)) gitdir = resolve(path, gitdir);
  const files = [path, ...(gitdir ? ['index', 'HEAD', join('logs', 'HEAD')].map((f) => join(gitdir, f)) : [])];
  return Math.max(0, ...files.map((f) => { try { return statSync(f).mtimeMs; } catch { return 0; } }));
};

// Links inside the worktree whose target is outside it; a link is never followed.
export const outsideLinks = (path) => {
  const root = norm(path);
  const found = [];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (dir === path && e.name === '.git') continue;
      let isLink = e.isSymbolicLink();
      if (!isLink && e.isDirectory()) { try { isLink = lstatSync(full).isSymbolicLink(); } catch {} }
      if (isLink) {
        let target = '';
        try { target = norm(resolve(dirname(full), readlinkSync(full))); } catch {}
        if (!target || !(target === root || target.startsWith(`${root}/`))) found.push({ link: full, target });
      } else if (e.isDirectory()) walk(full);
    }
  };
  walk(path);
  return found;
};

// Unlinks each link and checks its target survived; false at the first one that does not go cleanly.
const unlinkAll = (links) => {
  for (const { link, target } of links) {
    const had = target && existsSync(target);
    try { unlinkSync(link); } catch { try { rmdirSync(link); } catch {} }
    let gone = false;
    try { lstatSync(link); } catch { gone = true; }
    if (!gone || (had && !existsSync(target))) return `could not unlink ${link} safely`;
  }
  return null;
};

// Why a worktree has to stay, or null when everything in it exists elsewhere.
const keepReason = (repo, wt, { defaultRef, here, idleHours, now }) => {
  if (wt.main || wt.bare) return 'the main worktree';
  if (norm(wt.path) === here) return 'this command runs in it';
  if (wt.locked) return `locked (${wt.locked})`;
  if (!existsSync(wt.path)) return null;
  const idle = (now - lastActivity(wt.path)) / HOUR;
  if (idle < idleHours) return `active ${idle < 1 ? `${Math.round(idle * 60)} min` : `${idle.toFixed(1)} h`} ago`;
  const status = run(wt.path, ['--no-optional-locks', 'status', '--porcelain', '--ignored', '--untracked-files=normal'], 180_000);
  if (!status.ok) return `git status failed: ${status.err.split('\n')[0]}`;
  const lines = status.out.split('\n').filter(Boolean);
  const changed = lines.filter((l) => !l.startsWith('!! '));
  if (changed.length) return `${changed.length} uncommitted change(s): ${changed[0].slice(3)}`;
  const kept = lines.filter((l) => l.startsWith('!! ')).map((l) => l.slice(3).replace(/^"|"$/g, '')).filter((f) => !REBUILDABLE.test(f));
  if (kept.length) return `ignored files that are not rebuildable: ${kept.slice(0, 3).join(', ')}`;
  const elsewhere = ['--remotes', ...(defaultRef ? [defaultRef] : [])];
  const lone = run(wt.path, ['rev-list', '--count', 'HEAD', '--not', ...elsewhere]);
  if (!lone.ok) return `git rev-list failed: ${lone.err.split('\n')[0]}`;
  if (Number(lone.out) > 0) return `${lone.out} commit(s) on no remote and not in ${defaultRef ?? 'the default branch'}`;
  if (!wt.branch) return null;
  if (defaultRef && run(repo, ['merge-base', '--is-ancestor', wt.head, defaultRef]).ok) return null;
  return mergedPr(repo, wt.branch) ? null : `branch ${wt.branch} not merged into ${defaultRef ?? 'the default branch'}`;
};

const mergedPr = (repo, branch) => {
  const r = spawnSync('gh', ['pr', 'list', '--head', branch, '--state', 'merged', '--json', 'number', '--limit', '1'], { cwd: repo, encoding: 'utf8', timeout: 20_000 });
  return !r.error && r.status === 0 && /"number"/.test(r.stdout ?? '');
};

const removeOne = (repo, wt, { force, defaultRef }) => {
  const links = existsSync(wt.path) ? outsideLinks(wt.path) : [];
  const unsafe = unlinkAll(links);
  if (unsafe) return { ok: false, why: unsafe };
  if (existsSync(wt.path)) {
    const r = run(repo, ['worktree', 'remove', ...(force ? ['--force'] : []), wt.path], 120_000);
    if (!r.ok) return { ok: false, why: r.err.split('\n')[0] };
  }
  let branch = '';
  if (wt.branch && defaultRef && run(repo, ['merge-base', '--is-ancestor', wt.head, defaultRef]).ok && run(repo, ['branch', '-d', wt.branch]).ok) branch = `, branch ${wt.branch} deleted`;
  return { ok: true, why: `${links.length ? `${links.length} link(s) unlinked first` : 'no links'}${branch}` };
};

export const prune = (repo, { execute = false, idleHours = 6, only = null, now = Date.now(), here = norm(process.cwd()) } = {}) => {
  const defaultRef = defaultRefOf(repo);
  const rows = [];
  for (const wt of worktreesOf(repo)) {
    if (only && norm(wt.path) !== norm(only)) continue;
    if (wt.main) continue;
    const reason = keepReason(repo, wt, { defaultRef, here: norm(here), idleHours, now });
    if (reason) { rows.push({ path: wt.path, action: 'kept', why: reason }); continue; }
    if (!execute) { rows.push({ path: wt.path, action: 'would remove', why: 'all its work is on a remote or in the default branch' }); continue; }
    const r = removeOne(repo, wt, { force: false, defaultRef });
    rows.push({ path: wt.path, action: r.ok ? 'removed' : 'kept', why: r.ok ? r.why : `removal failed: ${r.why}` });
  }
  if (execute) run(repo, ['worktree', 'prune']);
  return rows;
};

export const removeScratch = (repo, path, { discard = false, here = norm(process.cwd()) } = {}) => {
  const wt = worktreesOf(repo).find((w) => norm(w.path) === norm(path));
  if (!wt) return { ok: false, why: `${path} is not a worktree of this repository` };
  if (wt.main || norm(wt.path) === norm(here)) return { ok: false, why: 'the main worktree, or the one this command runs in' };
  const defaultRef = defaultRefOf(repo);
  if (existsSync(wt.path)) {
    const lone = run(wt.path, ['rev-list', '--count', 'HEAD', '--not', '--remotes', ...(defaultRef ? [defaultRef] : [])]);
    if (!lone.ok || Number(lone.out) > 0) return { ok: false, why: `${lone.ok ? lone.out : '?'} commit(s) exist only here: push or merge them first` };
    if (!discard) {
      const status = run(wt.path, ['--no-optional-locks', 'status', '--porcelain']);
      if (status.out) return { ok: false, why: 'it has changes: commit them, or pass --discard to drop them' };
    }
  }
  return removeOne(repo, wt, { force: discard, defaultRef });
};

const main = () => {
  const [cmd, ...rest] = process.argv.slice(2);
  const flag = (name) => rest.includes(name);
  const option = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
  const top = run(process.cwd(), ['rev-parse', '--show-toplevel']);
  if (!top.ok) { console.error('worktrees.mjs: not inside a git repository'); process.exit(2); }
  const repo = top.out;
  if (cmd === 'list' || cmd === 'prune') {
    const rows = prune(repo, { execute: cmd === 'prune' && flag('--execute'), idleHours: cmd === 'list' ? 0 : Number(option('--idle-hours') ?? 6), only: option('--only') ?? null, here: norm(repo) });
    for (const r of rows) console.log(`${r.action} · ${r.path} · ${r.why}`);
    if (!rows.length) console.log('no worktree besides the main one');
    if (cmd === 'prune' && !flag('--execute') && rows.some((r) => r.action === 'would remove')) console.log('dry run: --execute removes them');
    process.exit(0);
  }
  if (cmd === 'remove' && rest[0] && !rest[0].startsWith('--')) {
    const r = removeScratch(repo, resolve(rest[0]), { discard: flag('--discard'), here: norm(repo) });
    console.log(`${r.ok ? 'removed' : 'kept'} · ${rest[0]} · ${r.why}`);
    process.exit(r.ok ? 0 : 1);
  }
  console.error('usage: worktrees.mjs list | prune [--execute] [--idle-hours <n>] [--only <path>] | remove <path> [--discard]');
  process.exit(2);
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
