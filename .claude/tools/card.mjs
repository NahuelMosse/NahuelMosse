// What the hooks and tools need to know about the card in progress, in one place: if each one
// computes it its own way, one decides a file is production and another that it is not, and what is
// required when writing is not what is required when closing.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs, { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The bench runs each card in a subagent that acts as the main thread: for permissions and thresholds it is the main thread.
export const actsAsMain = (input) => !input?.agent_id || /^sdd-corrida-/.test(String(input.agent_type ?? '')) || ['sdd-control-experimento', 'card-runner'].includes(input.agent_type);

// The component set's gallery server and page come from the kit's template: they are the set's
// harness, not the product. Measured: mutating serve.mjs took 33 of a card's 61 minutes.
// A path inside the repo that is production code: what delegate-code.mjs keeps for the builder and the grunt.
export const isProductionPath = (root, path) => {
  const rel = relative(root, path).split(sep).join('/');
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel) && !NOT_PRODUCTION.test(rel);
};
export const NOT_PRODUCTION = /^(specs|\.claude|\.specify|scripts|docs)\/|(^|\/)(e2e|tests?|__tests__|__mocks__|integration_test|cypress|fixtures|vendor)\/|\.(stories|min)\.[jt]sx?$|\.(md|json|ya?ml|lock)$|(^|\/)[^/]*\.(test|spec)\.|(^|\/)(test_[^/]*|[^/]*_test|conftest)\.py$|_test\.go$|^\.|(^|\/)(playwright|vitest|jest|eslint|tsconfig|jsconfig)[^/]*$|(^|\/)design\/components\/(serve\.mjs|gallery\.html)$/;
export const IS_CODE = /\.(m?[jt]sx?|cjs|cts|py|go|cs|java|kt|rb|php|dart)$/;
export const IS_TEST = /\.(spec|test)\.[cm]?[tj]sx?$|(^|[\\/])test_[^\\/]*\.(py|c|cc|cpp|cxx)$|_(test|unittest)\.(py|go|dart|c|cc|cpp|cxx)$|Tests?\.(cs|java|kt)$|\.feature$/;

// The configs of what gets verified: loosening them is approving without fixing.
export const IS_VERIFICATION_CONFIG = /(^|\/)(eslint\.config\.[cm]?[jt]s|\.eslintrc(\.[a-z]+)?|playwright\.config\.[cm]?[jt]s|stryker\.conf(ig)?\.[a-z]+|\.c8rc(\.json)?|\.nycrc(\.json)?|jest\.config\.[cm]?[jt]s|vitest\.config\.[cm]?[jt]s|tsconfig[^/]*\.json|ruff\.toml|\.ruff\.toml|mypy\.ini|pytest\.ini|\.golangci\.[a-z]+|\.axerc[^/]*|\.prettierrc[^/]*|prettier\.config\.[cm]?[jt]s|biome\.jsonc?)$/;

// What kind of file a path is is defined once in signals.mjs and re-exported here so no import breaks. They are
// heuristics; a false negative is for the judge to catch. Paths are relative, with `/`.
export {
  I18N, INFRA_DEPENDENCY, IS_CI, IS_INFRA, IS_SCHEMA, IS_SCREEN, ROUTE, SCREEN_MARKUP,
} from './signals.mjs';

// What the agent never reads or writes: the value of a secret is set by a person. The example files
// carry only the names of the variables.
export const IS_SECRET = /(^|\/)\.env(\.[^/]+)?$|(^|\/)\.ssh\/|\.(pem|key|p12|pfx)$|(^|\/)id_(rsa|dsa|ecdsa|ed25519)$|(^|\/)id_[^/.]+$|(^|\/)\.aws\/(credentials|config)$|(^|\/)\.config\/gcloud\/|(^|\/)\.azure\/|(^|\/)\.docker\/config\.json$|(^|\/)\.kube\/config$|(^|\/)credentials\.json$|(^|\/)\.(netrc|npmrc|pypirc)$/;
export const SECRET_EXCEPTION = /(^|\/)\.env\.(example|sample|template|dist)$|\.pub$/;
export const isSecret = (path) => {
  const p = String(path).replaceAll('\\', '/');
  return IS_SECRET.test(p) && !SECRET_EXCEPTION.test(p);
};
// A glob counts too: `.env*`, `**/*.pem`.
export const isSecretGlob = (glob) => [String(glob).replaceAll('*', ''), String(glob).replaceAll('*', 'x')].some(isSecret);

// Colors, durations and spaces written by hand: in what a card adds, they come from a token. Declaring
// the token is the right place for a value.
export const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch|oklab|lab|lch)\(/g;
export const RAW_DURATION = /\b(transition|animation)(-duration)?\s*:[^;]*\b\d+m?s\b/g;
// A length other than 0 and 1px (hairlines) in a spacing, radius or shadow declaration.
export const RAW_LAYOUT = /\b(padding|margin|gap|row-gap|column-gap|border-radius|box-shadow)(-[a-z]+)?\s*:[^;{}]*?(?<![\w.-])(?!0\b|1px\b)\d*\.?\d+(px|rem|em)\b/g;
export const DECLARES_TOKEN = /^\s*[+]?\s*--[\w-]+\s*:/;

// The lines of `## Tasks` of card.md (or of the `## File map` of a plan.md a repo still has); null when there is none.
// A card migrated to card.md may keep its old plan.md: the `## Tasks` of card.md wins when it has one.
export const fileMapLines = (cardDir) => {
  const sectionIn = (file, heading) => {
    if (!existsSync(file)) return null;
    const section = readFileSync(file, 'utf8').split(/^## /m).find((s) => s.startsWith(heading));
    return section ? section.split('\n').slice(1) : null;
  };
  return sectionIn(join(cardDir, 'card.md'), 'Tasks') ?? sectionIn(join(cardDir, 'plan.md'), 'File map');
};
export const pathTokens = (line) => line.split(/[\s`|,;()*]+/)
  .map((t) => t.replaceAll('\\', '/').replace(/^\.\//, '').replace(/:\d+(:\d+)?$/, '').replace(/[.:]+$/, '')).filter(Boolean);
// The paths a Tasks line names, without its quoted test titles: a frozen title may mention a file the task does not touch.
export const taskTokens = (line) => pathTokens(String(line).replace(/"[^"\n]*"|«[^»\n]*»/g, ' '));

// The kit's own files are never the card's: they neither enter the card's diff nor make a file name
// ambiguous.
const IS_KIT = /^(\.claude|\.specify)\/|^CLAUDE\.md$/;

// The files of a repo, committed or not and not ignored, read once per process: `untracked` are the
// ones git does not follow yet. A process lives for one hook call or one command, so the list does not
// go stale; `resetFileCache` is for whoever changes the repo and asks again in the same process.
const listings = new Map();
const hashed = new Map();
// The card's files and its start are asked by every gate and close check: each answer is two git processes, seconds on a slow
// disk, and a close asked them more than twenty times for the same answer. They are kept only inside `oneRound`: one run of
// the checks over a repo that does not change meanwhile.
const changedFiles = new Map();
const starts = new Map();
let rounds = 0;
export const oneRound = (fn) => {
  rounds++;
  try { return fn(); } finally { if (--rounds === 0) { changedFiles.clear(); starts.clear(); renames.clear(); owns.clear(); existed.clear(); } }
};
const remembered = (cache, key, compute) => {
  if (!rounds) return compute();
  if (!cache.has(key)) cache.set(key, compute());
  return cache.get(key);
};
export const resetFileCache = () => { listings.clear(); hashed.clear(); changedFiles.clear(); starts.clear(); renames.clear(); owns.clear(); };
const listing = (root) => {
  if (!listings.has(root)) {
    const r = spawnSync('git', ['ls-files', '-co', '-t', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
    const entries = r.status === 0 ? [...new Set(r.stdout.split('\0').filter(Boolean).map((e) => `${e[0]}${e.slice(2)}`))] : null;
    listings.set(root, entries && {
      all: entries.map((e) => e.slice(1)),
      untracked: new Set(entries.filter((e) => e[0] === '?').map((e) => e.slice(1))),
    });
  }
  return listings.get(root) ?? null;
};

// A line names a file by its full path, or by its file name when that name is unique among the repo's
// files (the kit's own excluded); an ambiguous name names nothing. `root` is the repo of the card,
// never the cwd of the session. A file that does not exist yet counts as unique when no other file
// has its name: the plan names what the card is about to create.
export const namedIn = (lines, file, root = process.cwd()) => {
  const name = file.split('/').pop();
  const byName = () => {
    const files = listing(root);
    return Boolean(files) && !files.all.some((f) => f !== file && !IS_KIT.test(f) && f.split('/').pop() === name);
  };
  let unique = null;
  return lines.filter((l) => {
    const tokens = taskTokens(l);
    if (tokens.includes(file)) return true;
    if (!tokens.includes(name)) return false;
    unique ??= byName();
    return unique;
  });
};

// A file of `design/components/` that is byte for byte the kit's own and that a File map line declares as a set —`design/components/
// — copied from the kit`—: the set is one line of the map, not one line per file. A copy the card changed is its own file.
// The copy under the served folder (`public/design/components/`) is declared the same way, by its own folder.
const KIT_SET = /^((?:public|static|www|wwwroot)\/)?design\/components\//;
export const copiedFromKit = (root, map, file) => {
  const at = file.match(KIT_SET)?.[0];
  if (!at || !map.some((l) => /copied from the kit/i.test(l) && pathTokens(l).includes(at))) return false;
  try { return readFileSync(join(root, '.claude', 'templates', 'components', file.slice(at.length))).equals(readFileSync(join(root, file))); } catch { return false; }
};

// A file named loosely —a bare name or the end of a path— resolved against the paths the map's lines hold: the one
// path it is the end of, or null when none or several are. An action says `contacts-view.mjs`, the map `src/web/contacts-view.mjs`.
export const resolveInMap = (lines, name) => {
  const ending = name.replace(/^\.\//, '');
  const paths = [...new Set(lines.flatMap(pathTokens).filter((t) => t === ending || t.endsWith(`/${ending}`)))];
  return paths.length === 1 ? paths[0] : null;
};

// A git call that times out throws: the guards that ask git something block on an error, and nothing reads the empty answer as a "no".
export const git = (cwd, args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 20_000 });
  if (r.error?.code === 'ETIMEDOUT') throw new Error(`git ${args[0]} did not answer within 20 s`);
  return r;
};

// The root is the nearest folder upwards that has specs/. Without specs/ there is no card.
export const rootOf = (path) => {
  let root = path;
  do { root = join(root, '..'); } while (!existsSync(join(root, 'specs')) && join(root, '..') !== root);
  return existsSync(join(root, 'specs')) ? root : null;
};

// Where a call points before anyone looks at the cwd: the file a tool edits, or what a shell command
// names —a leading `cd <dir> &&`, then every absolute path in it—. Not what the command merely
// reads from elsewhere: the value of an `VAR=/path` assignment is configuration for the command; a
// path through `node_modules/`, `.git/` or a tool cache (`ms-playwright`, `.cache`) is a dependency or
// a store, not the work; and the value of `--config <path>` outside any repo with specs/ is another
// project's configuration. The leading `cd` always counts. Git Bash writes `/d/x` for `D:\x`.
const native = (p) => (process.platform === 'win32' ? p.replace(/^\/([A-Za-z])(?=\/|$)/, '$1:') : p);
const ABSOLUTE = /(?:^|[\s"'(])((?:[A-Za-z]:[\\/]|\/)[^\s"'`|;&<>()]+)/g;
const LEADING_CD = /^\s*cd\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))\s*(?:&&|;)/;
const CONFIG_OPTION = /--config(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s"'`|;&<>()]+))/g;
const NOT_THE_WORK = /(?:^|[\\/])(?:node_modules|\.git|ms-playwright|\.cache)(?:[\\/]|$)/;
// The directory a shell command moves to before anything else (`cd <dir> &&` or `;`), or null.
export const leadingCd = (cwd, command) => {
  const cd = String(command ?? '').match(LEADING_CD);
  return cd ? resolve(cwd, native(cd[1] ?? cd[2] ?? cd[3])) : null;
};
const touchedBy = (cwd, { tool_name: tool, tool_input: data = {} } = {}) => {
  const direct = [data.file_path, data.notebook_path].filter((p) => typeof p === 'string' && p);
  if (direct.length) return direct.map((p) => resolve(cwd, native(p)));
  if (!['Bash', 'PowerShell'].includes(tool) || typeof data.command !== 'string') return [];
  // The body of a heredoc is text written somewhere, not a path the command works on; its first line stays.
  const command = data.command.replace(/(<<-?\s*['"]?(\w+)['"]?[^\n]*)\n[\s\S]*?(?:\n\s*\2\b|$)/g, '$1');
  const cd = command.match(LEADING_CD);
  const foreignConfigs = new Set([...command.matchAll(CONFIG_OPTION)]
    .map((m) => (m[1] ?? m[2] ?? m[3]).replace(/[.,:]+$/, ''))
    .filter((p) => !rootOf(join(resolve(cwd, native(p)), '_'))));
  const named = [...command.matchAll(ABSOLUTE)].map((m) => m[1].replace(/[.,:]+$/, ''))
    .filter((p) => !NOT_THE_WORK.test(p) && !foreignConfigs.has(p));
  return [...(cd ? [cd[1] ?? cd[2] ?? cd[3]] : []), ...named].map((p) => resolve(cwd, native(p)));
};

// An Agent launch has no file and no command: the repo it is about is the one its prompt names by absolute
// path (the directory of the card, a file of the plan). A session opened from another directory launches
// its agents from there, and the cwd says nothing about the card. Same rule as a command: a named repo
// counts only with `specs/.current` (`hookCard` asks it).
// A Skill launch carries its text in `args`: a `/code-review` names the repo it reads there.
export const namedInPrompt = ({ tool_name: tool, tool_input: data = {} } = {}) => {
  const text = ['Agent', 'Task'].includes(tool) ? data.prompt : tool === 'Skill' ? data.args : null;
  if (typeof text !== 'string') return [];
  return [...text.matchAll(ABSOLUTE)].map((m) => m[1].replace(/[.,:;)]+$/, ''))
    .filter((p) => !NOT_THE_WORK.test(p)).map((p) => resolve(native(p)));
};

// The kit that governs a call is the one installed in the repo the call touches, not the one in
// the session's settings. Measured: a demo repo with its own kit had its hooks never run —the
// session's hooks, from another version of the kit, answered for it—, and the bench measured the
// hooks of main instead of the kit under test. `kitRootOf` is the nearest ancestor with
// `.claude/kit.json`; `delegateToRepo` imports that repo's hook of the same name, in this same
// process, and the hook answers with its own exit code and output. A repo whose kit lacks that hook
// has nothing to enforce there: exit 0. `SDD_HOOK_DELEGATED` stops the second hop. Hooks that block,
// block also when the hand-over fails; the ones that only save or record (SOFT) go on alone.
export const kitRootOf = (path) => {
  let dir = resolve(path);
  for (;;) {
    if (existsSync(join(dir, '.claude', 'kit.json'))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
};
export const SOFT = new Set(['trim-output', 'session-record', 'light-images', 'edit-count', 'no-pending-close', 'context-cap', 'turn-budget', 'shell-writes', 'kit-feedback', 'worktree-sweep']);
const real = (p) => { try { return realpathSync.native(p); } catch { return resolve(p); } };

// A hook reads its call from fd 0. Once the call was read here, an imported hook of another kit
// —which reads fd 0 by itself— is given the same text.
let fed = null;
export const feedStdin = (raw) => {
  if (fed === null) {
    const original = fs.readFileSync;
    fs.readFileSync = function readFileSync(path, options) {
      if (fed !== null && (path === 0 || path === '/dev/stdin')) {
        const encoding = typeof options === 'string' ? options : options?.encoding;
        return encoding ? fed : Buffer.from(fed);
      }
      return original.apply(this, arguments);
    };
    syncBuiltinESMExports();
  }
  fed = raw;
};

// The root of another kit that governs this call, or null when the hook's own kit does. The dispatcher asks it
// before skipping a hook: a hook that would hand the call to another kit's version of itself is never skipped.
export const delegationTarget = (hookUrl, call) => {
  if (process.env.SDD_HOOK_DELEGATED) return null;
  const cwd = call.cwd ?? process.cwd();
  const own = real(resolve(dirname(fileURLToPath(hookUrl)), '..', '..'));
  const touched = touchedBy(cwd, call);
  if (!touched.length) {
    const target = kitRootOf(cwd);
    return !target || real(target) === own ? null : target;
  }
  // A folder a call only names takes the hooks over when it is a worktree of this same repository with hooks of its
  // own; any other folder with a kit.json is a decoy that would turn every hook of the call off, so this kit answers.
  const target = touched.map(kitRootOf).find(Boolean);
  if (!target || real(target) === own) return null;
  return existsSync(join(target, '.claude', 'hooks')) && worktreesOf(own).has(sameCase(real(target))) ? target : null;
};
const sameCase = (p) => (process.platform === 'win32' ? p.replaceAll('\\', '/').toLowerCase() : p);
// The worktrees git lists for a repository; none when git does not answer within 20 s, so nothing is handed over.
const worktreesOf = (repo) => {
  const r = spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd: repo, encoding: 'utf8', timeout: 20_000 });
  if (r.error || r.status !== 0) return new Set();
  return new Set(r.stdout.split('\n').filter((l) => l.startsWith('worktree ')).map((l) => sameCase(real(l.slice(9).trim()))));
};

export const delegateToRepo = async (hookUrl, rawStdin, input) => {
  if (process.env.SDD_HOOK_DELEGATED) return;
  const name = basename(fileURLToPath(hookUrl));
  const soft = SOFT.has(name.replace(/\.mjs$/, ''));
  const environment = { delegated: process.env.SDD_HOOK_DELEGATED, project: process.env.CLAUDE_PROJECT_DIR };
  try {
    let call = input;
    if (call === undefined) {
      try { call = JSON.parse(rawStdin); } catch { return; }
    }
    if (!call || typeof call !== 'object') return;
    const target = delegationTarget(hookUrl, call);
    if (!target) return;
    // delegationTarget only hands over to a folder with its own hooks/; a hook missing from it has nothing to enforce.
    const hook = join(target, '.claude', 'hooks', name);
    if (!existsSync(hook)) process.exit(0);
    feedStdin(rawStdin);
    process.env.SDD_HOOK_DELEGATED = '1';
    process.env.CLAUDE_PROJECT_DIR = target;
    try {
      await import(pathToFileURL(hook).href);
    } catch (e) {
      // A worktree whose checkout is still writing its files misses a module for a moment (measured: the first call in a
      // new worktree, `Cannot find module …/card.mjs`). Wait for that file up to 15 s and import once more.
      const missing = e?.code === 'ERR_MODULE_NOT_FOUND' && /Cannot find module '([^']+)'/.exec(e.message)?.[1];
      if (!missing) throw e;
      const until = Date.now() + 15_000;
      while (!existsSync(missing) && Date.now() < until) await new Promise((r) => setTimeout(r, 250));
      if (!existsSync(missing)) throw new Error(`${e.message}; the repo's kit is incomplete — if a checkout is still writing it, retry once it ends`);
      await import(`${pathToFileURL(hook).href}?retry=${Date.now()}`);
    }
    process.exit(0);
  } catch (e) {
    if (environment.delegated === undefined) delete process.env.SDD_HOOK_DELEGATED; else process.env.SDD_HOOK_DELEGATED = environment.delegated;
    if (environment.project === undefined) delete process.env.CLAUDE_PROJECT_DIR; else process.env.CLAUDE_PROJECT_DIR = environment.project;
    if (soft) return;
    process.stderr.write(`The hook ${name} of the repo this call touches could not run (${e.message}). It blocks when in doubt: retry.\n`);
    process.exit(2);
  }
};

// The repo and the card a hook call is about: the one the call touches, else the one the call's cwd
// sits in or under, else the one the session was opened in. A hook that looks only at the cwd answers
// for whatever repo the cwd happens to be in —measured: a card's caps were read and counted in the
// kit's own repo, which has no card, and the time cap never found the card it had to stop. A subagent
// that runs inside the session has the session's cwd, not the card's.
// A repo that a shell command only names counts when its `specs/.current` names a card: a path in a command
// is often another project, and the most recent snapshot of a repo nobody opened a card in is not "the card
// in progress". That fallback is for where the session itself stands (the cwd, the project dir) and for the
// file a tool edits.
export const hookCard = (cwd, env = process.env, call = {}) => {
  const direct = [call.tool_input?.file_path, call.tool_input?.notebook_path].some((p) => typeof p === 'string' && p);
  const starts = [
    ...touchedBy(cwd, call).map((start) => [start, !direct]),
    ...namedInPrompt(call).map((start) => [start, true]),
    [cwd, false],
    [env.CLAUDE_PROJECT_DIR, false],
  ];
  for (const [start, named] of starts) {
    if (!start) continue;
    const root = rootOf(join(start, '_'));
    const card = root && currentCard(root, { named });
    if (card) return { root, card };
  }
  return null;
};

export const relativeTo =(root, path) => relative(root, path).split(sep).join('/');

// The document that marks a folder as a card: its snapshot, or `card.md` (the single document) when it has none.
export const frozenOf = (dir) => ['card.md', 'card.snapshot.md'].map((f) => join(dir, f)).find((p) => existsSync(p)) ?? null;

// The card in progress is the one `specs/.current` names —one line, the card's folder name, written
// by /card—. Without that file, or if it names no folder with a snapshot, it is the specs/ folder
// with the most recent snapshot: touching another card's snapshot then changes the answer, which
// is why the file exists.
// `{ named: true }` asks for the `.current` card alone, with no fallback.
export const currentCard = (root, { named: onlyNamed = false } = {}) => {
  if (!existsSync(join(root, 'specs'))) return null;
  try {
    const named = readFileSync(join(root, 'specs', '.current'), 'utf8').trim();
    if (/^[\w][\w.-]*$/.test(named) && frozenOf(join(root, 'specs', named))) return join(root, 'specs', named);
  } catch {}
  if (onlyNamed) return null;
  const snapshots = readdirSync(join(root, 'specs'))
    .map((d) => frozenOf(join(root, 'specs', d)))
    .filter(Boolean)
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return snapshots.length ? join(snapshots[0], '..') : null;
};

// The cap of the plan's `## Time plan`, in minutes: `cap: <N> min` or `cap: <N> h` (`tope:` too).
// Null when the section or the cap is missing. One reading for the plan-time check and the two hooks
// that enforce it, so what the plan is asked to write is what gets read.
export const TIME_PLAN_CAP = /\b(?:cap|tope)\b\s*:?\s*(\d+(?:[.,]\d+)?)\s*(h|hs|hours?|horas?|min|minutes?|minutos?)\b/i;
// The cap of a card: the header of card.md (what precedes its first `## `), else the plan's `## Time plan`.
export const cardCap = (cardDir) => {
  const doc = join(cardDir, 'card.md');
  if (existsSync(doc)) {
    const m = readFileSync(doc, 'utf8').split(/^## /m)[0].match(TIME_PLAN_CAP);
    return m ? Number(m[1].replace(',', '.')) * (/^h/i.test(m[2]) ? 60 : 1) : null;
  }
  const plan = join(cardDir, 'plan.md');
  return existsSync(plan) ? capMinutes(readFileSync(plan, 'utf8')) : null;
};
export const capMinutes = (planText) => {
  const section = planText.split(/^## /m).find((s) => s.startsWith('Time plan')) ?? '';
  const m = section.match(TIME_PLAN_CAP);
  return m ? Number(m[1].replace(',', '.')) * (/^h/i.test(m[2]) ? 60 : 1) : null;
};

// Minutes since the commit that added the card's snapshot; null if that commit does not exist yet. Not the last commit
// that touched it: every Log line commits card.md again. Measured: a worktree whose Log was committed at 191 % of the cap
// read 0 % and let new agents start.
export const minutesSinceSnapshot = (cwd, cardDir) => {
  const sec = git(cwd, ['log', '--diff-filter=A', '--format=%ct', '--', frozenOf(cardDir) ?? join(cardDir, 'card.md')]).stdout?.trim().split('\n').filter(Boolean).at(-1);
  return sec ? (Date.now() / 1000 - Number(sec)) / 60 : null;
};

// The card starts at the commit before the one that froze its snapshot. What existed there predates
// the card. If the snapshot is not committed yet, the card starts at HEAD. The parent is written
// `<sha>~1`, not `<sha>^`: the ref ends up inside command lines that pass through cmd.exe on Windows,
// where `^` is the escape character and is dropped.
// The card starts at the first commit that added a file of its folder: a card migrated from an older format kept its
// first snapshot or plan.md, and its code was committed before the card.md that replaced them.
export const cardStart = (root, cardDir) => remembered(starts, `${root}\0${cardDir}`, () => {
  const snapshot = relativeTo(root, frozenOf(cardDir) ?? join(cardDir, 'card.snapshot.md'));
  const r = git(root, ['log', '--diff-filter=A', '--format=%H', '--', relativeTo(root, cardDir), snapshot]);
  const sha = r.stdout?.trim().split('\n').filter(Boolean).at(-1);
  if (!sha) return 'HEAD';
  return git(root, ['rev-parse', '--verify', '-q', `${sha}~1`]).status === 0 ? `${sha}~1` : sha;
});

// Whether a commit already holds tests tagged for the card (`@<ID>-S<n>`): the RED that comes before the code.
export const redCommitted = (root, cardDir) => {
  const id = String(cardDir).split(/[\\/]/).filter(Boolean).pop()?.match(/^[A-Z][A-Z0-9]*-\d+[A-Za-z0-9]*/)?.[0];
  if (!id) return false;
  return git(root, ['grep', '-q', '-I', '-E', `@${id}-S[0-9]+`, 'HEAD', '--', ':(exclude)specs', ':(exclude).claude']).status === 0;
};

// The gate asks the same file from gate-checks, overdesign and verify in one process: one git call per file.
const existed = new Map();
export const existedAt = (root, ref, rel) => remembered(existed, `${root}\0${ref}\0${rel}`, () => git(root, ['cat-file', '-e', `${ref}:${rel}`]).status === 0);

// What the card touched: the diff since its start plus whatever has not entered git yet. The kit is
// not part of the card: measured, in a repo where the kit arrived unversioned, it asked to lint its
// own tests.
// The folder a command runs in, from its leading `cd <dir> &&`: its paths are relative to it, not to the repo root.
export const commandDir = (command) => String(command).match(/^\s*cd\s+(?:"([^"]+)"|'([^']+)'|([^\s&;|]+))\s*&&/)?.slice(1).find(Boolean)?.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '') ?? '';

// Where the card's own changes start: its first commit's parent, or, when main was merged into the card after that, the
// merge-base with main. Otherwise a merge of main makes every file of other cards look like this card's, and a file main moved
// looks new. What a file was before the card is read here, not at the card's start.
const owns = new Map();
export const ownBase = (root, base) => remembered(owns, `${root}\0${base}`, () => {
  for (const ref of ['main', 'origin/main', 'master']) {
    const mb = git(root, ['merge-base', 'HEAD', ref]).stdout?.trim();
    if (!mb) continue;
    const baseSha = git(root, ['rev-parse', '--verify', '-q', base]).stdout?.trim();
    const head = git(root, ['rev-parse', 'HEAD']).stdout?.trim();
    // A card on main itself (one branch) has HEAD as its merge-base: its start stays the base.
    if (mb !== head && mb !== baseSha && git(root, ['merge-base', '--is-ancestor', base, mb]).status === 0) return mb;
    return base;
  }
  return base;
});

// A file the card moved (git sees a rename at 50 % similarity or more) is judged against where it came from: its old
// classes, clones and interfaces are the repo's, not the card's; only the lines it changed in the move are. `originOf` is
// that path at the card's start, or null. 50 %, git's own default: a file moved and translated keeps about half its lines
// (measured: 90 test files moved and translated read as new duplication at 80 %).
export const RENAME = '-M50%';
const renames = new Map();
export const renamesOf = (root, base) => remembered(renames, `${root}\0${base}`, () => new Map(
  (git(root, ['diff', '--name-status', RENAME, '--diff-filter=R', ownBase(root, base)]).stdout ?? '').split('\n')
    .map((l) => l.split('\t')).filter((p) => p.length === 3 && /^R\d+/.test(p[0])).map(([, from, to]) => [to, from])));
export const originOf = (root, base, file) => renamesOf(root, base).get(file) ?? null;

export const cardFiles = (root, base) => [...remembered(changedFiles, `${root}\0${base}`, () => {
  const changed = git(root, ['diff', '--name-only', '-z', '--diff-filter=d', ownBase(root, base)]).stdout ?? '';
  const added = git(root, ['ls-files', '--others', '--exclude-standard', '-z']).stdout ?? '';
  return [...new Set([...changed.split('\0'), ...added.split('\0')].map((f) => f.trim()).filter((f) => f && !IS_KIT.test(f)))];
})];

// Cuts a shell line at ; & | and line breaks that are not inside quotes: `grep -E "a|gh pr"` is one command.
export const splitShell = (text) => {
  const out = [''];
  let quote = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\' && quote !== "'") { out[out.length - 1] += c + (text[++i] ?? ''); continue; }
    if (quote) { if (c === quote) quote = ''; } else if (c === '"' || c === "'") quote = c;
    else if (/[;&|\n]/.test(c)) { out.push(''); continue; }
    out[out.length - 1] += c;
  }
  return out;
};

// A shell line that publishes: a `git push` or a `gh pr create`, wherever it sits in the line. The
// parsing publish.mjs does decides whether it is allowed; this only says that the close is near.
export const publishes = (cmd) => splitShell(String(cmd).replace(/<<-?\s*['"]?(\w+)['"]?[^\n]*\n[\s\S]*?\n\s*\1\b/g, ' ')).some((segment) => {
    const tokens = [...segment.replace(/^\s*\(+/, '').matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
    while (tokens.length && /^\w+=/.test(tokens[0])) tokens.shift();
    const [program = '', ...rest] = tokens;
    if (/^git(\.exe)?$/i.test(program)) {
      let i = 0;
      while (i < rest.length && rest[i].startsWith('-')) i += ['-C', '-c', '--git-dir', '--work-tree'].includes(rest[i]) ? 2 : 1;
      return rest[i] === 'push';
    }
    if (/^gh(\.exe)?$/i.test(program)) {
      const [sub, verb] = rest.filter((a) => !a.startsWith('-'));
      return sub === 'pr' && verb === 'create';
    }
    return false;
  });

// “The same code”: once.mjs uses it to avoid repeating, and required.mjs and close.mjs to know whether something ran on what
// is there now. The key is the content of the files, not the commit: committing a file it already counted does not change it,
// while committing a file it did not count (untracked and without a source extension) does.

// A command line handed to a tool that runs it in a shell (`once.mjs`, `mutate.mjs`) has to stay one argument when it chains
// commands: unquoted, the caller's shell splits `cd apps/mobile && flutter test` at the `&&` and the tool gets only the `cd`.
const SHELL_CHAIN = /&&|\|\||[;|<>]/;
export const asOneArg = (command) => (SHELL_CHAIN.test(command) ? `"${command.replace(/"/g, '\\"')}"` : command);
// The command a tool got after `--`: one argument is the whole command; several are re-joined keeping each one whole.
export const shellJoin = (tokens) => (tokens.length === 1 ? tokens[0] : tokens.map((t) => (/[\s&|;<>"]/.test(t) ? `"${t.replace(/"/g, '\\"')}"` : t)).join(' '));

export const keyOf = (root, command) => {
  // The key is every tracked file plus the untracked, not ignored ones with a source extension,
  // outside specs/ and .validation/, plus the line: a stray pid, log or note must not make a pass look stale.
  // An import graph misses aliases (`#lib/*`, `@/x`, `from app.a import f`) and served a stale pass after the code broke:
  // a record is reused only when nothing in the repo changed.
  const { all, untracked } = listing(root) ?? { all: [], untracked: new Set() };
  const SOURCE = /\.(?:mjs|cjs|js|jsx|ts|tsx|py|dart|vue|svelte|astro|html|css|scss|json|sql|ya?ml|toml|sh)$/i;
  const files = all.filter((f) => !/^(?:specs|\.validation)\//.test(f) && !(untracked.has(f) && !SOURCE.test(f))).sort();
  // The hash of the files is the costly part and is the same for every command that runs over the same
  // set: it is computed once per process and each command only adds itself.
  const id = `${root}\0${files.join('\0')}`;
  if (!hashed.has(id)) {
    const hash = createHash('sha256');
    for (const f of files) {
      const path = join(root, f);
      if (!existsSync(path)) continue;
      hash.update(f);
      // A text file hashes with LF: the same code checked out with CRLF (autocrlf on Windows) is the same code.
      const bytes = readFileSync(path);
      hash.update(bytes.subarray(0, 8000).includes(0) ? bytes : bytes.toString('utf8').replace(/\r\n/g, '\n'));
    }
    hashed.set(id, hash);
  }
  const hash = hashed.get(id).copy();
  hash.update(command);
  return hash.digest('hex');
};
