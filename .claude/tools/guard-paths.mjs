// What guard.mjs and guard-shell.mjs agree on about a path: one spelling to match it in, and whether a test file is
// frozen. A path has many spellings on Windows (`CARD.MD`, `./`, `//`, `card.md::$DATA`) that all reach the same file,
// so the rules match a single normalized form.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

// Git Bash writes `/d/x` for `D:\x`.
export const native = (p) => (process.platform === 'win32' ? p.replace(/^\/([A-Za-z])(?=\/|$)/, '$1:') : p);

// Absolute, forward slashes, `.` and `//` collapsed, an NTFS stream suffix (`::$DATA`, `:name`) dropped, and lowercase on
// win32. `{ fold: false }` keeps the case, for the path a git or fs call opens.
export const normalizePath = (path, cwd = process.cwd(), { fold = true } = {}) => {
  const parts = resolve(cwd, native(String(path))).replaceAll('\\', '/').split('/');
  const last = parts.length - 1;
  const colon = parts[last].indexOf(':');
  // The drive of `C:` alone is the first and last segment: it is not a stream.
  if (colon >= 0 && !(last === 0 && /^[A-Za-z]:$/.test(parts[0]))) parts[last] = parts[last].slice(0, colon);
  const joined = parts.join('/').replace(/(?<!^)\/{2,}/g, '/');
  return fold && process.platform === 'win32' ? joined.toLowerCase() : joined;
};

// The path as the disk spells it: git looks up `HEAD:<name>` case-sensitively, and an edit of `A.TEST.MJS` reaches `a.test.mjs`.
export const onDisk = (path, cwd = process.cwd()) => {
  const plain = normalizePath(path, cwd, { fold: false });
  try { return realpathSync.native(plain).replaceAll('\\', '/'); } catch { return plain; }
};

export const IS_TEST_FILE = /\.(spec|test)\.[cm]?[tj]sx?$|(^|\/)test_[^/]*\.(py|c|cc|cpp|cxx)$|_(test|unittest)\.(py|go|dart|c|cc|cpp|cxx)$|tests?\.(cs|java|kt)$|\.feature$/i;
// A test is frozen once HEAD holds it with a tag of a Spec or of an assumption tied to it.
export const FROZEN_TAG = /@[A-Z][A-Z0-9]*-\d+-(?:S\d+|ASM-\d+)(?!\d)/;
export const GIT_TIMEOUT_MS = 20_000;

// `{ frozen, text }` from git, or `{ error }` when git could not answer: the caller blocks then.
export const committedTagged = (path, cwd = process.cwd()) => {
  const file = onDisk(path, cwd);
  if (!existsSync(file)) return { frozen: false, text: '' };
  const head = spawnSync('git', ['show', `HEAD:./${basename(file)}`], { cwd: dirname(file), encoding: 'utf8', maxBuffer: 1 << 26, timeout: GIT_TIMEOUT_MS });
  if (head.error) return { error: head.error.code ?? head.error.message };
  if (head.status !== 0) return { frozen: false, text: '' };
  return { frozen: FROZEN_TAG.test(head.stdout), text: head.stdout };
};

// The base names of the tagged tests HEAD holds in the repo at `cwd`, or `{ error }`.
export const frozenNames = (cwd) => {
  // A folder that does not exist holds no repo: nothing is frozen there.
  if (!existsSync(native(cwd))) return { names: [] };
  // The answer depends only on HEAD's tree: kept in `.git/kit-frozen.json`, so a loaded disk greps once per commit, not per call.
  const at = spawnSync('git', ['rev-parse', 'HEAD^{tree}', '--git-path', 'kit-frozen.json'], { cwd, encoding: 'utf8', timeout: GIT_TIMEOUT_MS });
  const [tree, cachePath] = at.status === 0 ? at.stdout.trim().split('\n') : [];
  const cache = tree && cachePath ? resolve(cwd, cachePath) : null;
  if (cache) { try { const c = JSON.parse(readFileSync(cache, 'utf8')); if (c.tree === tree && Array.isArray(c.names)) return { names: c.names }; } catch { /* no cache yet */ } }
  const r = spawnSync('git', ['grep', '-l', '-E', '@[A-Z][A-Z0-9]*-[0-9]+-(S[0-9]+|ASM-[0-9]+)', 'HEAD', '--'], { cwd, encoding: 'utf8', maxBuffer: 1 << 26, timeout: GIT_TIMEOUT_MS });
  if (r.error) return { error: r.error.code ?? r.error.message };
  // Exit 1 is no match; 128 is no repo or no HEAD: nothing is frozen there.
  if (r.status !== 0 && r.status !== 1) return { names: [] };
  const names = r.stdout.split('\n').filter(Boolean).map((l) => l.replace(/^HEAD:/, '').split('/').pop()).filter((n) => IS_TEST_FILE.test(n));
  if (cache) { try { writeFileSync(cache, JSON.stringify({ tree, names })); } catch { /* read-only .git: no cache */ } }
  return { names };
};

// The exemptions of a frozen test, read from the card in progress: `refactor-tests: <why>` in its `## Gate`, or a level
// with `testsFrozen: false` (poc). Without a named card there is no exemption. A repo with no `specs/` folder (`root` is
// null) has no cards, so no test in it is frozen.
export const frozenExempt = async (root, currentCard) => {
  if (!root) return true;
  const card = currentCard(root, { named: true });
  const gate = (() => { try { return (readFileSync(`${card}/card.md`, 'utf8').split(/^## Gate\b/m)[1] ?? '').split(/^## /m)[0]; } catch { return ''; } })();
  if (card && /^\s*refactor-tests\s*:\s*\S/m.test(gate)) return true;
  try { return (await import('./kit.mjs')).active(root).exempt.level?.testsFrozen === false; } catch { return false; }
};
