// The mark of a browser run in progress. Two Playwright runs share `test-results/` (the `outputDir`): one erased
// the other's output and a complete verification was repeated, 30 minutes. While a card is in progress, once.mjs
// —and so verify.mjs— writes `<git dir>/sdd-browser-run.json` with its PID and command, and removes it when it ends;
// guard-shell refuses a command that launches Playwright while that PID lives. The file is in the git folder: it is
// not committed, and `.validation/` cleanups do not erase it. A PID that is dead means a run that was killed: ignored.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { currentCard } from './card.mjs';

// A command with the package.json scripts it runs written out: `npm test` becomes the body of the `test` script,
// and so on down `npm run <other>` calls.
// npm, pnpm, yarn and bun are expanded; `run` is optional for all. A folder flag (`--prefix`, `-C`, `--dir`,
// `--cwd`) moves the scripts to that folder's package.json, read from `root` when given.
const FOLDER_FLAGS = String.raw`(?:\s+(?:--prefix|-C|--dir|--cwd)(?:=|\s+)(?:"[^"]*"|'[^']*'|\S+))*`;
const RUNNER = new RegExp(String.raw`\b(npm|pnpm|yarn|bun)(${FOLDER_FLAGS})\s+(?:(?:run(?:-script)?)\s+)?([\w:.-]+)`, 'g');
const scriptsOf = (folder) => {
  try { return JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')).scripts ?? {}; } catch { return {}; }
};
export const expandScripts = (command, scripts, depth = 0, root = null) => command.replace(
  RUNNER,
  (whole, _tool, flags, name) => {
    const dir = flags.match(/(?:--prefix|-C|--dir|--cwd)(?:=|\s+)("[^"]*"|'[^']*'|\S+)/)?.[1]?.replace(/^["']|["']$/g, '');
    const own = dir && root ? scriptsOf(resolve(root, dir)) : scripts;
    return own[name] && depth < 5 ? expandScripts(own[name], own, depth + 1, dir && root ? resolve(root, dir) : root) : whole;
  });

// A command launches Playwright when, with the scripts it runs written out, it says `playwright test`. Through
// once.mjs it is the command after `--`. Naming Playwright (`grep playwright`) is not launching it. It lives here,
// not in verify.mjs, because once.mjs needs it and verify.mjs imports once.mjs.
const PLAYWRIGHT_TEST = /(^|[\s/\\"'])playwright(?:\.cmd)?\s+test\b/;
export const launchesPlaywright = (command, root) => {
  let scripts = {};
  try { scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {}; } catch {}
  return PLAYWRIGHT_TEST.test(expandScripts(String(command).replace(/^.*\bonce\.mjs\s+\S+\s+--\s+/, ''), scripts, 0, root));
};

// The git folder is read from the nearest `.git` up from `folder` (a folder, or in a worktree a file `gitdir: <path>`)
// without spawning git: guard-shell asks for it on every shell command of a card, edit-count on every Edit. Anything
// else asks git.
export const gitDirOf = (folder) => {
  for (let dir = resolve(folder); ; dir = dirname(dir)) {
    const dotGit = join(dir, '.git');
    try {
      if (statSync(dotGit).isDirectory()) return dotGit;
      const pointer = readFileSync(dotGit, 'utf8').match(/^gitdir:\s*(.+?)\s*$/m)?.[1];
      if (pointer) return resolve(dir, pointer);
    } catch { /* no .git here: one folder up */ }
    if (dirname(dir) === dir) break;
  }
  const r = spawnSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: folder, encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : null;
};
export const lockFile = (root) => {
  const dir = gitDirOf(root);
  return dir ? join(dir, 'sdd-browser-run.json') : null;
};

// When the process started, as text that is stable for its lifetime; null when the system cannot say. A PID
// that was recycled by another process has another start time.
export const startOf = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  const r = process.platform === 'win32'
    ? spawnSync('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${pid}).StartTime.ToFileTimeUtc()`], { encoding: 'utf8' })
    : spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });
  const text = r.status === 0 ? String(r.stdout).trim() : '';
  return text || null;
};

const alive = (pid, started) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); } catch (e) { return e.code === 'EPERM'; }
  if (!started) return true;
  const now = startOf(pid);
  return now === null || now === started;
};

const readLock = (file) => {
  try { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null; } catch { return null; }
};

// `{ pid, command }` of the browser run that holds the lock, or null: no card in progress, no lock, a lock
// nobody can read, or a PID that is dead.
export const liveLock = (root) => {
  if (!currentCard(root)) return null;
  const file = lockFile(root);
  const held = file && readLock(file);
  return held && alive(held.pid, held.started) ? { pid: held.pid, command: String(held.command ?? '') } : null;
};

// Marks a browser run of this process. Returns the function that removes the mark (a no-op when nothing was
// marked: no card in progress, or another live run already holds it). Also removed when the process is ended.
export const takeLock = (root, command) => {
  if (!currentCard(root)) return () => {};
  const file = lockFile(root);
  if (!file) return () => {};
  const other = liveLock(root);
  if (other && other.pid !== process.pid) return () => {};
  try { writeFileSync(file, JSON.stringify({ pid: process.pid, started: startOf(process.pid), command, at: new Date().toISOString() })); } catch { return () => {}; }
  const release = () => {
    if (readLock(file)?.pid === process.pid) { try { rmSync(file, { force: true }); } catch { /* a stale mark is ignored once its PID is dead */ } }
  };
  process.once('exit', release);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { release(); process.exit(1); });
  return release;
};
