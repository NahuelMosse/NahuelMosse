#!/usr/bin/env node
// verify.mjs — run from the repo root, with a card in progress.
//
// Everything mechanical about a card, at once and in parallel: the commands of the plan's
// `## Verification`, each through once.mjs —what already passed on the same code is not repeated—,
// and then required.mjs. Returns a single list of actions.
// Measured: with one executor per pause, a final serial repeat and the suite run a dozen times, a
// one-minute card without the method took two hours with the method.
//
// In the plan, a code block with one command per line:
//   suite: npm test
//   lint: npx eslint src test e2e
//   mutate src/app.mjs: node --test test/app.test.mjs
//   attacks: npm run attacks
// `mutate <file>: <suite>` expands to mutate.mjs from the start of the card, with the declared
// equivalents, and in parallel if the suite is not a screen one.
// What uses a browser or starts the app goes one at a time: two on the same port take each other down.
// It prints to stderr a line when each command starts and when it ends, with its duration, and one a
// minute while it runs. Each line has a time limit —`name [timeout 30 min]: command` in the plan, or else
// the greater of `VERIFY_TIMEOUT_MIN` (20 min by default) and 4 times the measured duration of the
// command's last run—: past it the command is killed and reported as
// `could not run: timeout`, never as passed.
// What the grade leaves out does not run: a `mutate` line over a file the grade does not ask to mutate
// (required.mjs `mutationRequired`: none at poc, the domain and a screen's `*-state.js` at mvp), a line whose criterion the grade leaves
// out (`LINE_CRITERIA`) and the HTML check (K11) are reported as
// `skipped: not required by grade <g>`, never as passed. Measured: a card at mvp ran 13 mutations for 2
// domain files and chased survivors in code the grade does not ask to mutate.
// A line whose command another line already includes (`web` inside `suite`, because `npm test` runs
// `verify:web`) is not run: it is reported as `covered by <line>`. Measured: running it twice cost 31 min.
// The fast lines go first —lint, tsc, contract, docs, mutation, whatever is not a browser—; the lines that
// drive a browser start only if those passed. Measured: a red lint threw away a 34-minute run.
// A suite that fails with at most 3 failing tests gets only those re-run (`failingTests` and
// `rerunSpec`, which calls the runner itself, no npm and no shell). A test that fails again with the same error in the first
// re-run is `failed` and is not run again; the others are re-run up to 3 times, and a test that fails 3 of 3 keeps the line red;
// otherwise the line is `passed with flaky k/3 <test>`, listed in `.validation/verify/flaky.md` for the closing, never a
// plain `passed`. A `suite:` line whose failing tests are all declared replaced in the Log of card.md
// (`replaces: <file> "<name>" · <why> · by: <file> "<name>"`) with a passing test of the same tag in the new file is
// `passed with replaced k: <tests>`, listed in `.validation/verify/replaced.md`; any other case stays red.
// A line that resolves —through package.json scripts, as far as they go— to a chain `a && b && c` with a part
// that drives a browser and a part that does not is split (`splitLine`): the parts without a browser run beside
// the other lines without one, the parts with a browser in the browser chain, and the line passes only if all its
// parts do. Measured: `npm test` = `tsc && npm run test:api && npm run test:web` held 8.5 minutes of API tests
// in series ahead of the browser. Those parts run in a lane of their own from the start, never in the queue of the
// serial lines and never holding the browser chain back, whether measured or not (a part that already failed when
// the chain starts still keeps it from starting). A chain with `||`, `;`, a pipe or a `cd`, or whose scripts have pre/post hooks, runs whole.
// The logs of the parts are `.validation/verify/<line>.<n>.log`; the line's own log joins them, and its record
// (name and command of the line) is what required.mjs reads.
// A card with a `card.md` takes its commands from its `## Gate` (same lines) instead of the plan's `## Verification`, and
// adds the checks of gate-checks.mjs: every `S#` of `## Specs` has a test tagged `@<ID>-S<n>` (`S3: no test tagged`), and
// a screen card (lens `visual` in risk.json, or screen files touched) has axe, contrast and focus clean in the records
// of `app.mjs probe`. out-of-scope.mjs runs inside required.mjs. The output is then one line per check
// (`<name>: passed | failed: … | could not run: …`) and the fixed final line.
// A line that passed on exactly the same code (same command, same key of its files, `keyOf` in card.mjs) is not run again:
// it prints `passed (cached <date>)`. A failed line or one that could not run always runs again; `--fresh` ignores the cache.
// A command `node --test` with no `--test-timeout` gets one of 30 s (`KIT_TEST_TIMEOUT_MS` changes it; once.mjs adds it
// when it spawns): a hung test fails in 30 s with `timed out after 30 s`, not at the limit of the line. Other runners get
// nothing added: vitest and jest cut a test at 5 s by themselves, and pytest has no timeout without pytest-timeout (`--timeout=<s>`).
// Exits 0 if there are no actions, 1 if there are, 2 if there is no card or the plan does not say what to run.
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { delimiter, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { asOneArg, cardFiles, commandDir, oneRound, originOf, ownBase, currentCard, cardStart, existedAt, fileMapLines, git, keyOf, IS_CODE, IS_TEST, RENAME, RAW_COLOR, RAW_DURATION, RAW_LAYOUT, DECLARES_TOKEN } from './card.mjs';
import { active, addedOf, isPoc } from './kit.mjs';
import { expandScripts, launchesPlaywright, takeLock } from './browser-lock.mjs';
import { endsWithLine } from './final-line.mjs';
import { logPath, readRecord, withTestTimeout, writeRecord } from './once.mjs';
import { QUALITY, missing, mutationRequired, splitPending, writeSessionLines } from './required.mjs';
import { CARD_FILE, cardIdOf, fencedBlocks, readCard, requirementOf, riskOf, sectionOf } from './card-doc.mjs';
import { cardChecks, noLookOf, noVisualCheck, probeRecords, screenChecks, specsCheck, visualInstruments } from './gate-checks.mjs';
import { detectIn } from './signals.mjs';
import { affected } from './affected.mjs';
import { catalogFindings, classesAt, classesDefined, classesIn, MARKUP_FILE, setFindings, setSheets, usesCatalog } from './component-set.mjs';
import { escalate } from './risk.mjs';
import { changedBetween, snapshot } from './tree-snapshot.mjs';
import { IS_TEST_FILE, committedTagged } from './guard-paths.mjs';

const TOOLS = relative(process.cwd(), join(import.meta.dirname)).split('\\').join('/') || '.';
const ONE_AT_A_TIME = /playwright|cypress|attack|server|start|axe|schemathesis|lhci|lighthouse|k6|autocannon|gatling|locust/i;
// A line runs alone when its command, its package.json scripts or the node script it runs write to
// `test-results/` or launch Playwright (or one of ONE_AT_A_TIME): two of them in parallel overwrite
// each other's output. `npm test`, `npm run <x>`, `pnpm/yarn [run] <x>` and `node <file>` are followed
// into the scripts and files they run, up to DEPTH levels; what cannot be resolved (no package.json,
// no such script, a file that cannot be read, too deep) counts as serial: in doubt, alone.
const WRITES_RESULTS = /playwright|test-results/i;
const DEPTH = 4;
const SEGMENTS = /&&|\|\||[;|\n]/;
const NPM = /^(npm|pnpm|yarn)(?:\s+--?\S+)*\s+(run(?:-script)?\s+)?([\w:.-]+)/;
// npm's own subcommands are not package.json scripts; `npm test` and its aliases are.
const NPM_OWN = /^(?:install|i|ci|add|remove|uninstall|update|audit|ls|list|prune|dedupe|outdated|config|cache|pack|publish|version|view|init|exec|dlx|help|info|why)$/;
const NODE_FILE = /^node(?:\s+-\S+)*\s+(\S+\.(?:[cm]?js))\b/;
// `node --test` names its files, often as quoted globs: those are expanded, not read as a file. `npx -y node@22` is node.
const NODE_TEST = /^node(?:\s+\S+)*?\s+--test(?=\s|$)/;
const NPX_NODE = /^npx(?:\s+-\S+)*\s+node@\S+/;
const GLOB_CHARS = /[*?{]/;
const SKIP_DIRS = new Set(['node_modules', '.git']);
const MAX_GLOB_FILES = 5000;
const globRegex = (pattern) => {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*' && pattern[i + 1] === '*') {
      i++;
      if (pattern[i + 1] === '/') { i++; out += '(?:.*/)?'; } else out += '.*';
    } else if (ch === '*') out += '[^/]*';
    else if (ch === '?') out += '[^/]';
    else if (ch === '{') out += '(?:';
    else if (ch === '}') out += ')';
    else if (ch === ',' && /\{[^}]*$/.test(pattern.slice(0, i))) out += '|';
    else out += ch.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
};
// The files a glob names, relative to cwd. The walk starts at the folder before the first wildcard.
export const expandGlob = (cwd, pattern) => {
  const normal = pattern.replace(/\\/g, '/').replace(/^\.\//, '');
  const segments = normal.split('/');
  const firstWild = segments.findIndex((s) => GLOB_CHARS.test(s));
  const base = segments.slice(0, Math.max(0, firstWild)).join('/');
  const re = globRegex(normal);
  const found = [];
  const walk = (rel) => {
    let entries;
    try { entries = readdirSync(join(cwd, rel), { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (found.length >= MAX_GLOB_FILES) return;
      const path = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path); } else if (re.test(path)) found.push(path);
    }
  };
  walk(base);
  return found;
};
export const isSerial = (command, cwd = process.cwd()) => {
  if (ONE_AT_A_TIME.test(command)) return true;
  let scripts;
  try { scripts = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).scripts ?? {}; } catch { scripts = null; }
  const seen = new Set();
  // A file the line runs launches a browser when it writes results or when what it runs in turn does.
  const fileSerial = (path, depth) => {
    if (seen.has(path)) return false;
    seen.add(path);
    let body;
    try { body = readFileSync(path, 'utf8'); } catch { return true; }
    if (WRITES_RESULTS.test(body)) return true;
    const refs = [...body.matchAll(/\b(?:npm|pnpm|yarn)\s+(?:run\s+)?[\w:.-]+|\bnode\s+(?:-\S+\s+)?[\w./\\-]+\.[cm]?js\b/g)].map((m) => m[0]);
    return refs.some((r) => serial(r, depth + 1));
  };
  const serial = (text, depth) => text.split(SEGMENTS).map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean).some((raw) => {
    const part = raw.replace(NPX_NODE, 'node');
    if (WRITES_RESULTS.test(part) || ONE_AT_A_TIME.test(part)) return true;
    const m = part.match(NPM);
    const npm = m && (m[2] || !NPM_OWN.test(m[3])) ? { name: m[3] === 't' && m[1] === 'npm' && !m[2] ? 'test' : m[3] } : null;
    if (!npm && NODE_TEST.test(part)) {
      const named = part.split(/\s+/).slice(1).map((t) => t.replace(/^["']|["']$/g, ''))
        .filter((t) => !t.startsWith('-') && /\.[cm]?js$/.test(t));
      if (!named.length) return false;
      if (depth >= DEPTH) return true;
      // A test file is serial when it launches a browser. What it says about `node server.mjs` is a test of the
      // server on its own port, not a second run of the app: its references are not followed.
      return named.some((t) => (GLOB_CHARS.test(t) ? expandGlob(cwd, t) : [t]).some((f) => {
        try { return WRITES_RESULTS.test(readFileSync(resolve(cwd, f), 'utf8')); } catch { return true; }
      }));
    }
    const file = part.match(NODE_FILE);
    if (!npm && !file) return false;
    if (depth >= DEPTH) return true;
    if (npm) {
      const name = npm.name;
      if (!scripts || typeof scripts[name] !== 'string') return true;
      if (seen.has(`npm:${name}`)) return false;
      seen.add(`npm:${name}`);
      return serial(scripts[name], depth + 1);
    }
    return fileSerial(resolve(cwd, file[1]), depth);
  });
  return serial(command, 0);
};
// The parts of a command written as a chain: split at `&&` outside quotes. null when anything else joins
// the commands (`||`, `;`, a pipe, a line break, a lone `&`, parentheses): those run as one.
const chainParts = (command) => {
  const parts = [];
  let current = '';
  let quote = '';
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) { current += ch; if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
    if (ch === '&' && command[i + 1] === '&') { parts.push(current); current = ''; i++; continue; }
    const redirect = ch === '&' && (command[i - 1] === '>' || command[i - 1] === '<' || command[i + 1] === '>');
    if (!redirect && /[&|;\n()]/.test(ch)) return null;
    current += ch;
  }
  parts.push(current);
  const clean = parts.map((part) => part.replace(/\s+/g, ' ').trim());
  return clean.every(Boolean) ? clean : null;
};
const SHELL_STATE = /^(cd|pushd|popd|export|set|source|\.)\s/;
// `npm test`, `npm run x`: the name of the package.json script a whole command runs, else null.
export const scriptNamed = (part) => {
  const m = part.match(/^(?:npm|pnpm|yarn)\s+(run(?:-script)?\s+)?([\w:.-]+)$/);
  if (!m || (!m[1] && NPM_OWN.test(m[2]))) return null;
  return m[2] === 't' && !m[1] && part.startsWith('npm') ? 'test' : m[2];
};

// The parts of a line that is a top-level `&&` chain, `{ fast, heavy }` as they run (named `<line>.<n>`), or
// null when it is not split: a single command, a chain whose parts all drive a browser or none does, or one
// that cannot be split without changing what it does.
export const splitLine = (name, command, root) => {
  let scripts = {};
  try { scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {}; } catch { return null; }
  const used = new Set();
  const flatten = (part, depth) => {
    const script = scriptNamed(part);
    if (script === null || typeof scripts[script] !== 'string' || depth >= DEPTH) return [part];
    const inner = chainParts(scripts[script]);
    if (!inner || inner.length < 2) return [part];
    used.add(script);
    return inner.flatMap((p) => flatten(p, depth + 1));
  };
  const top = chainParts(command);
  if (!top) return null;
  const all = top.flatMap((p) => flatten(p, 0));
  if (all.length < 2 || all.some((p) => SHELL_STATE.test(p))) return null;
  if ([...used, scriptNamed(command)].filter(Boolean).some((n) => scripts[`pre${n}`] !== undefined || scripts[`post${n}`] !== undefined)) return null;
  const parts = all.map((c, i) => ({ name: `${name}.${i + 1}`, command: c, browser: usesBrowser(c, root) }));
  if (!parts.some((part) => part.browser) || parts.every((part) => part.browser)) return null;
  return { fast: parts.filter((part) => !part.browser), heavy: parts.filter((part) => part.browser) };
};

// The mutation wrapper's own tool is not the suite: what is judged is the command after `--`.
const suiteOf = (command) => command.replace(/^.*mutate\.mjs.*? -- /, '');
// What measures time or load runs alone, one at a time, when everything else has finished: with
// another suite running, the number measures the machine and not the app.
const FINAL_PHASE = /^(p95|budget|vitals|load)/i;
const MUTATOR = /mutate\.mjs/;
// What measures frames —motion, the motion audit— fails when other lines load the machine and passes alone
// (measured: a card's `motion` line failed beside the suites and passed by itself). When one of these lines fails
// with other lines in the run, it is run again alone at the end, and the result is the one of the run alone.
const FRAME_LINE = /^(?:motion|frames?|fps|jank)/i;
const FRAME_COMMAND = /motion-audit\.mjs|\bnpm\s+run\s+\S*motion\b/i;
export const measuresFrames = (line) => FRAME_LINE.test(line.name ?? '') || FRAME_COMMAND.test(line.command ?? '');
const TIMEOUT_TAG = /\s*\[timeout\s+(\d+(?:\.\d+)?)\s*(min|h)\]/i;
// The criteria a line of the plan proves, by the start of its name: the line does not run when the grade
// leaves all of them out.
const LINE_CRITERIA = { cycles: ['D3'], p95: ['O10'], budget: ['O10', 'O15'], vitals: ['O15'], load: ['O22'] };
// Measured: a line that started a server and never ended left verify.mjs silent for 10 minutes and the
// agent gave up on it. Each line has a limit, and a line that exceeds it is reported, not left hanging.
const DEFAULT_TIMEOUT_MIN = 20;
const HEARTBEAT_MS = 60000;
// A line that already ran gets 4 times its measured duration (a line that repeats a suite three times
// plus margin), never less than the floor: `VERIFY_TIMEOUT_MIN`, 20 min without it. What a line
// declares in the plan (`[timeout N min]`) is not touched. The durations are those of verify.mjs's own
// runs, kept in `.validation/verify/durations.json` by command; a run killed at its limit counts as the
// limit, so the next one gets more room instead of timing out again.
const MARGIN = 4;
const SLOW_MIN = 5;
const DURATIONS = 'durations.json';
const floorMin = () => (Number(process.env.VERIFY_TIMEOUT_MIN) > 0 ? Number(process.env.VERIFY_TIMEOUT_MIN) : DEFAULT_TIMEOUT_MIN);
const readDurations = (logsDir) => {
  try { return JSON.parse(readFileSync(join(logsDir, DURATIONS), 'utf8')); } catch { return {}; }
};
const recordDuration = (logsDir, command, minutes) => {
  const all = readDurations(logsDir);
  all[command] = +minutes.toFixed(2);
  writeFileSync(join(logsDir, DURATIONS), JSON.stringify(all, null, 1));
};
// The line's own last run, or that of any command it contains: `stable` loops over the suite's command.
export const measuredMin = (durations, command) => Math.max(0, ...Object.entries(durations)
  .filter(([known]) => known && command.includes(known)).map(([, minutes]) => Number(minutes) || 0));
export const limitMin = (c, durations = {}) => c.timeoutMin ?? Math.max(floorMin(), Math.ceil(MARGIN * measuredMin(durations, c.command ?? '')));
const say = (text) => process.stderr.write(`[verify] ${text}\n`);
const seconds = (ms) => (ms < 10000 ? `${(ms / 1000).toFixed(1)} s` : ms < 120000 ? `${Math.round(ms / 1000)} s` : `${(ms / 60000).toFixed(1)} min`);
const killTree = (p) => {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
  else try { process.kill(-p.pid, 'SIGKILL'); } catch { p.kill('SIGKILL'); }
};

// `app:` and `seed:` tell app.mjs how to start the app the judges share; `no-visual:` is a declaration risk.mjs reads: none is a check.
const ENVIRONMENT_LINE = /^(app|seed|no-visual|no-docs|refactor-tests|public-allow|public-skip):/;
// `heading` is `Verification` in plan.md and `Gate` in card.md: the same block, the same lines.
const HOST_WORDS = /\bHost\b|\b[Vv]irtual[ -][Hh]osts?\b/;
export const wantsStrictHost = (doc) => {
  let grade = 'production';
  try { grade = active(process.cwd()).grade; } catch { /* no manifest: production */ }
  return grade === 'production' || HOST_WORDS.test(`${sectionOf(doc, 'Specs') ?? ''}\n${requirementOf(doc)}`);
};

// os.cpus() costs about 15 ms on Windows, and the hooks parse the gate on every shell command: it is read once.
let coreCount;
const cores = () => (coreCount ??= cpus().length);
export const mutationWorkers = (n = cores()) => Math.max(1, Math.floor(n / 2));

// The tests the card's files can break, plus every test file that carries the card's own tags, quoted for the shell; empty
// only when neither exists. A command that starts with `cd <dir> &&` gets them from that folder, and only those inside it.
export const affectedOf = (base, root = process.cwd(), dir = '', cardDir = null) => {
  const touched = cardFiles(root, base).filter((f) => !f.startsWith('specs/') && existsSync(join(root, f)));
  const id = cardDir ? cardIdOf(cardDir) : null;
  const grep = id ? spawnSync('git', ['grep', '-l', '-I', '-F', '--untracked', '-e', `@${id}-`, '--', ':(exclude)specs', ':(exclude).claude'], { cwd: root, encoding: 'utf8' }) : null;
  const tagged = (grep?.stdout ?? '').split('\n').filter((f) => f && IS_TEST.test(f));
  const tests = [...new Set([...(touched.length ? affected(root, touched) : []), ...tagged])].sort();
  const local = dir ? tests.filter((f) => f.startsWith(`${dir}/`)).map((f) => f.slice(dir.length + 1)) : tests;
  return local.map((f) => `"${f}"`).join(' ');
};

export const planCommands = (plan, { base, cardDir }, heading = 'Verification') => {
  const section = plan.split(/^## /m).find((s) => s.startsWith(heading));
  if (!section) return null;
  const blocks = fencedBlocks(section);
  if (!blocks.length) return null;
  const equivalents = relative(process.cwd(), join(cardDir, 'equivalents.md')).split('\\').join('/');
  return blocks.join('\n').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !ENVIRONMENT_LINE.test(l)).map((l) => {
    const i = l.indexOf(':');
    // `name [timeout 30 min]: command` sets the limit of that line; without it, see limitMin.
    const limit = l.slice(0, i).match(TIMEOUT_TAG);
    const name = l.slice(0, i).replace(TIMEOUT_TAG, '').trim();
    const timeoutMin = limit ? Number(limit[1]) * (/^h/i.test(limit[2]) ? 60 : 1) : undefined;
    let command = l.slice(i + 1).trim();
    // `{affected}` is the tests the card's files can break (affected.mjs over the card's diff): the gate runs those, the CI of the
    // PR runs the whole suite. A card that changes a line does not pay the whole suite on every gate round.
    if (command.includes('{affected}')) {
      const tests = affectedOf(base, process.cwd(), commandDir(command), cardDir);
      // No test to hand it is a line that cannot run, never one that passes by printing why.
      if (!tests) return { name, command, cannotRun: 'no test reaches the files of the card and no test file carries its tags' };
      command = command.replaceAll('{affected}', tests);
    }
    // An `attacks` line asks for a refused foreign Host only in production or when the card speaks of the host.
    if (/^attacks$/i.test(name) && /attack\.mjs\s+\S+/.test(command) && !/--strict-host/.test(command) && wantsStrictHost(plan)) command = command.replace(/(attack\.mjs\s+\S+)/, '$1 --strict-host');
    const mutate = name.match(/^mutate\s+(\S+)$/);
    if (!mutate) return { name, command, ...(timeoutMin ? { timeoutMin } : {}) };
    // A mutation is bounded by default: the lines the card changed (`--since`) and half the cores, unless the suite is one at a time.
    const parallel = isSerial(command) || /--parallel\b/.test(command) ? '' : ` --parallel ${mutationWorkers()}`;
    return {
      name,
      file: mutate[1],
      command: `node ${TOOLS}/mutate.mjs ${mutate[1]} --since ${base} --equivalents ${equivalents}${parallel} -- ${asOneArg(command)}`,
      ...(timeoutMin ? { timeoutMin } : {}),
    };
  });
};

// A command with the package.json scripts it runs written out: `npm test` becomes the body of the
// `test` script, and so on down `npm run <other>` calls.

// The commands a line runs at its top level: its segments split by `&&`, `||` or `;` outside quotes, and
// the body of each npm script it calls, down its sub-scripts. A command inside quotes or given as an
// argument (`mutate.mjs … --test "node --test x"`) is not one the line runs itself.
// A line that chains commands (`&&`, `||`, `;`, a pipe) outside quotes.
export const isCompound = (command) => /&&|\|\||;|\|/.test(String(command).replace(/"(?:\\.|[^"\\])*"|'[^']*'/g, ''));
const topLevel = (command, scripts, depth = 0) => {
  const parts = [];
  let current = '';
  let quote = '';
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) { current += ch; if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
    if (ch === ';' || ch === '\n' || ((ch === '&' || ch === '|') && command[i + 1] === ch)) {
      parts.push(current);
      current = '';
      if (ch !== ';' && ch !== '\n') i++;
      continue;
    }
    current += ch;
  }
  parts.push(current);
  const all = [];
  for (const part of parts.map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean)) {
    all.push(part);
    const m = part.match(/^npm\s+(?:run(?:-script)?\s+)?([\w:.-]+)$/);
    if (m && typeof scripts[m[1]] === 'string' && depth < 5) all.push(...topLevel(scripts[m[1]], scripts, depth + 1));
  }
  return all;
};

// The verification lines whose command another line runs at its top level: the same script run twice.
// Measured: a plan ran the screens suite on its own line although `suite` already included it. In doubt a
// line is not covered and runs. `mutate` lines wrap a unit suite on purpose and are left out.
export const containedCommands = (planned, root) => {
  let scripts = {};
  try { scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {}; } catch {}
  const norm = (c) => c.command.replace(/\s+/g, ' ').trim();
  const lines = planned.filter((c) => c.file === undefined && (c.command ?? '').length >= 8);
  const found = [];
  for (const inner of lines) {
    const own = norm(inner);
    const outer = lines.find((o) => o !== inner && topLevel(o.command, scripts).includes(own) &&
      (norm(o) !== own || lines.indexOf(o) < lines.indexOf(inner)));
    if (outer) found.push({ inner: inner.name, outer: outer.name });
  }
  return found;
};

// What a bare run of the whole of a verification line looks like when it is not spelled as the line: the npm
// script a line reaches (even a part verify.mjs splits), that script's literal body, `playwright test` with the
// config of a line and `node --test` with the globs of a line, the last two with no spec, `--grep`/`-g` or name
// filter. Returns `{ line, what }` or null; a bounded run is null. guard-shell uses it inside subagents.
const WORDS = /"([^"]*)"|'([^']*)'|(\S+)/g;
const wordsOf = (text) => [...text.replace(NPX_NODE, 'node').matchAll(WORDS)].map((m) => m[1] ?? m[2] ?? m[3]);
const PLAYWRIGHT_VALUE_FLAGS = new Set(['-c', '-j', '--workers', '--project', '--reporter', '--retries', '--repeat-each', '--timeout', '--shard', '--grep-invert', '--max-failures', '--output', '--global-timeout', '--trace', '--tsconfig', '--ui-host', '--ui-port']);
const NODE_VALUE_FLAGS = new Set(['--test-name-pattern', '--test-skip-pattern', '--test-concurrency', '--test-timeout', '--test-reporter', '--test-reporter-destination', '--test-shard', '--import', '--require', '-r', '--env-file']);
const parsePlaywright = (text) => {
  const w = wordsOf(text);
  const at = w.findIndex((x, k) => /(^|[\\/])playwright(\.cmd)?$/.test(x) && w[k + 1] === 'test');
  if (at < 0) return null;
  let config = null;
  let filtered = false;
  const files = [];
  for (let k = at + 2; k < w.length; k++) {
    const x = w[k];
    if (x === '-c' || x === '--config') config = w[++k] ?? null;
    else if (x.startsWith('--config=')) config = x.slice('--config='.length);
    else if (x === '-g' || x === '--grep') { filtered = true; k++; } else if (x.startsWith('--grep=')) filtered = true;
    else if (x.startsWith('-')) { if (PLAYWRIGHT_VALUE_FLAGS.has(x)) k++; } else files.push(x);
  }
  return { config: config && config.replace(/\\/g, '/').replace(/^\.\//, ''), bounded: filtered || files.length > 0 };
};
const parseNodeTest = (text) => {
  const w = wordsOf(text);
  const at = w[0] === 'node' ? w.indexOf('--test') : -1;
  if (at < 0) return null;
  let filtered = false;
  const files = [];
  for (let k = at + 1; k < w.length; k++) {
    const x = w[k];
    if (x.startsWith('-')) {
      if (/^--test-name-pattern\b/.test(x)) filtered = true;
      if (!x.includes('=') && NODE_VALUE_FLAGS.has(x)) k++;
    } else files.push(x.replace(/\\/g, '/').replace(/^\.\//, ''));
  }
  return { key: [...new Set(files)].sort().join('\0'), bounded: filtered };
};
export const wholeRunOf = (asked, planned, root) => {
  let scripts = {};
  try { scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {}; } catch {}
  const lines = planned.filter((c) => c.file === undefined);
  const reach = [];
  const names = new Map();
  for (const l of lines) {
    for (const text of topLevel(l.command, scripts)) {
      reach.push({ text, line: l.name });
      const name = scriptNamed(text);
      if (name && typeof scripts[name] === 'string') names.set(name, l.name);
    }
  }
  const bodies = new Map([...names].map(([name, line]) => [scripts[name].replace(/\s+/g, ' ').trim(), { line, name }]));
  const whole = asked.replace(/\s+/g, ' ').trim();
  if (bodies.has(whole)) return { line: bodies.get(whole).line, what: `the body of its script \`${bodies.get(whole).name}\`` };
  for (const part of topLevel(asked, {})) {
    const name = scriptNamed(part);
    if (name && names.has(name)) return { line: names.get(name), what: `its script \`${name}\`` };
    if (bodies.has(part)) return { line: bodies.get(part).line, what: `the body of its script \`${bodies.get(part).name}\`` };
    const pw = parsePlaywright(part);
    if (pw && !pw.bounded) {
      const hit = reach.find((r) => { const o = parsePlaywright(r.text); return o && !o.bounded && o.config === pw.config; });
      if (hit) return { line: hit.line, what: `\`playwright test\` with ${pw.config ? `its config ${pw.config}` : 'the default config'}, no spec and no filter` };
    }
    const nt = parseNodeTest(part);
    if (nt && !nt.bounded) {
      const hit = reach.find((r) => { const o = parseNodeTest(r.text); return o && !o.bounded && o.key === nt.key; });
      if (hit) return { line: hit.line, what: '`node --test` with the same files, no name filter' };
    }
  }
  return null;
};

// A line drives a browser when the scripts it runs name Playwright or Cypress or write test-results/:
// those start after the fast lines pass.
const BROWSER = /playwright|cypress|test-results/i;
export const usesBrowser = (command, root) => {
  let scripts = {};
  try { scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {}; } catch {}
  const text = expandScripts(suiteOf(command), scripts);
  return BROWSER.test(text) && isSerial(suiteOf(command), root);
};

// A test run that exits 0 having run nothing: node:test's summary, and jest or vitest with their pass-with-no-tests switch.
// pytest (exit 5) and Playwright (exit 1) already fail on it.
export const ZERO_RUN = /^(?:ℹ|#) tests 0\s*$|^No tests found, exiting with code 0|^No test files found, exiting with code 0/m;

// The failing tests an output names, for the runners we can re-run by name: node:test (`✖ name`,
// `not ok N - name`), Playwright (`1) [project] › file:line:col › title`) and jest or vitest (`✕|× name`).
export const failingTests = (output, limit = 3) => {
  const found = new Map();
  let at = null;
  for (const line of output.split('\n')) {
    let m;
    if ((m = line.match(/^\s*test at (.+?):\d+:\d+\s*$/))) {
      at = m[1];
    } else if ((m = line.match(/^\s*\d+\) (?:\[([^\]]+)\] › )?(\S+?):(\d+):\d+ › (.+?)\s*$/))) {
      found.set(`${m[2]}:${m[3]} › ${m[4]}`, { name: `${m[2]}:${m[3]} › ${m[4]}`, file: `${m[2]}:${m[3]}`, project: m[1] });
    } else if ((m = line.match(/^\s*✖ (.+?)(?: \(\d+(?:\.\d+)?ms\))?\s*$/)) && !/^failing tests:?$/.test(m[1])) {
      // node:test names, in its summary, the file of each failing test on the line before: `test at <file>:<line>:<col>`.
      found.set(m[1], { ...found.get(m[1]), name: m[1], ...(at ? { nodeFile: at } : {}) });
      at = null;
    } else if ((m = line.match(/^not ok \d+ - (.+?)\s*$/))) {
      found.set(m[1], { name: m[1] });
    } else if ((m = line.match(/^\s*[✕×] (.+?)(?: \(\d+(?:\.\d+)? ?m?s\))?\s*$/))) {
      found.set(m[1], { name: m[1] });
    } else if ((m = line.match(/^\s*\d+:\d+ \+\d+(?: ~\d+)?(?: -\d+)?: (.+?\.dart): (.+?) \[E\]\s*$/))) {
      // flutter test: `00:05 +445 -1: <file>: <group and test name> [E]`.
      found.set(m[2], { name: m[2], file: m[1] });
    } else if ((m = line.match(/^FAILED (\S+?\.py)::(?:\S+::)?(\w+)(?:\[[^\]]*\])?(?: - .*)?\s*$/))) {
      // pytest's short summary: `FAILED tests/x.py::TestC::test_y - AssertionError: ...`.
      found.set(`${m[1]}::${m[2]}`, { name: m[2], file: m[1], pyFunc: true });
    }
  }
  // flutter test counts the failures in its progress prefix (`+445 -1:`); the last one is the total.
  const flutterFailed = [...output.matchAll(/^\s*\d+:\d+ \+\d+(?: ~\d+)? -(\d+):/gm)].at(-1)?.[1];
  const pytestFailed = output.match(/^=+ (?:.*?, )?(\d+) failed\b.*=+\s*$/m)?.[1];
  const total = Number(output.match(/^(?:ℹ|#) fail (\d+)/m)?.[1] ?? output.match(/^\s*(\d+) failed\b/m)?.[1] ?? flutterFailed ?? pytestFailed ?? 0);
  const tests = [...found.values()];
  return total > limit ? [] : tests;
};

// The tests a card's Log declares replaced: `- L<n> · <date> · replaces: <file> "<name>" · <why> · by: <file> "<name>"`.
export const REPLACES = /replaces:\s*(\S+)\s+"([^"]+)"\s*·\s*(.*?)\s*·\s*by:\s*(\S+)\s+"([^"]+)"/;
export const replacementsOf = (doc) => (String(doc).split(/^## Log\b.*$/m)[1] ?? '').split('\n')
  .map((l) => l.match(REPLACES)).filter(Boolean).map((m) => ({ file: m[1], name: m[2], why: m[3], by: m[4], byName: m[5] }));
// A frozen test of a card from kit 3 carries `@<ID>-H<n>[-<n>]` and `@supuesto:<ID>-SUP-<n>`: its replacement repeats them too.
const SPEC_TAG = /@(?:assumption:|supuesto:)?[A-Z][A-Z0-9]*-\d+-(?:S\d+|ASM-\d+|SUP-\d+|H\d+(?:-\d+)?)(?!\d)/g;

// When the failing tests of a suite are all declared replaced and each replacement exists, carries the same tag and is not
// failing, they are what `passed with replaced` lists. Else null: the line stays failed.
export const replacedFailures = (root, output) => {
  const failing = failingTests(output, Infinity);
  if (!failing.length) return null;
  // A replacement declared by an earlier card still holds: the frozen test stays replaced, and copying its line into every
  // later card's Log was work with no information in it.
  const card = currentCard(root);
  const specsDir = join(root, 'specs');
  const cards = existsSync(specsDir) ? readdirSync(specsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(specsDir, e.name)) : [];
  const declared = [...new Set([card, ...cards].filter(Boolean))].flatMap((c) => replacementsOf(readCard(c) ?? ''));
  // A replacement may keep the title of the test it replaces: it is failing only if a test of that name fails in its own
  // file. A failure whose runner does not say the file counts against any file.
  const fileOf = (t) => (t.file ?? t.nodeFile ?? '').replace(/:\d+(?::\d+)?$/, '');
  // pytest names a failure by its function; the title with the tags is in the function's docstring or its body.
  const pyBody = (file, fn) => {
    let text = '';
    try { text = readFileSync(resolve(root, file), 'utf8'); } catch { return ''; }
    // `[ \t]`, not `\s`: with the `m` flag `\s*` crosses the blank line above the `def` and the body comes back empty.
    const at = text.search(new RegExp(`^[ \\t]*(?:async[ \\t]+)?def[ \\t]+${fn}[ \\t]*\\(`, 'm'));
    if (at < 0) return '';
    const rest = text.slice(at).split('\n');
    // A signature formatted over several lines (ruff, black) ends in `) -> None:` at column 0: the body starts after the line
    // where the parentheses close and the `:` comes.
    let depth = 0;
    let sig = 0;
    for (let k = 0; k < rest.length; k++) {
      depth += (rest[k].match(/\(/g) ?? []).length - (rest[k].match(/\)/g) ?? []).length;
      if (depth <= 0 && /:\s*(#.*)?\r?$/.test(rest[k])) { sig = k; break; }
    }
    const end = rest.findIndex((l, k) => k > sig && /^\s*(?:async\s+)?def\s|^\S/.test(l) && l.trim() !== '');
    return rest.slice(0, end < 0 ? undefined : end).join('\n');
  };
  const is = (t, file, title) => {
    // A runner started in a subfolder (`cd apps/api && pytest`) names its files from there: a path that ends the declared one counts.
    const seenAs = fileOf(t).split('\\').join('/').replace(/^\.\//, '');
    const declared = String(file).split('\\').join('/');
    const sameFile = !seenAs || resolve(root, seenAs) === resolve(root, declared) || (!isAbsolute(seenAs) && declared.endsWith(`/${seenAs}`));
    return sameFile && (t.name === title || (t.pyFunc && flat(pyBody(file, t.name)).includes(flat(title))));
  };
  // A docstring may break the title across lines, with the tags alone on the next one: whitespace is compared as one space.
  const flat = (s) => String(s).replace(/\s+/g, ' ').trim();
  // The Python function of `file` whose body carries `title`: there the tags of a two-line docstring are found.
  const pyBlockWith = (file, title) => {
    let text = '';
    try { text = readFileSync(resolve(root, file), 'utf8'); } catch { return ''; }
    for (const m of text.matchAll(/^[ \t]*(?:async[ \t]+)?def[ \t]+(\w+)[ \t]*\(/gm)) {
      const body = pyBody(file, m[1]);
      if (flat(body).includes(flat(title))) return body;
    }
    return '';
  };
  const failsIn = (by, name) => failing.some((t) => is(t, by, name));
  const found = [];
  const holds = (r) => {
    const tags = r.name.match(SPEC_TAG) ?? [];
    let text = '';
    try { text = readFileSync(join(root, r.by), 'utf8'); } catch { return false; }
    if (!tags.length || !flat(text).includes(flat(r.byName))) return false;
    // In Python the replacement's tags may sit on the docstring line after its title: they count from its function's body.
    const carries = /\.py$/.test(r.by) ? `${r.byName} ${pyBlockWith(r.by, r.byName)}` : r.byName;
    return tags.every((g) => new RegExp(`${g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(carries));
  };
  for (const t of failing) {
    // The Log is append-only: a later line corrects an earlier declaration of the same test, so the latest that holds counts.
    const r = declared.filter((d) => is(t, d.file, d.name) && !failsIn(d.by, d.byName)).reverse().find(holds);
    if (!r) return null;
    found.push(r);
  }
  return found;
};

const escapeRegex = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// What runs only the failing tests: `{ cmd, args, env }` for spawn with no shell, or null if this runner cannot be
// filtered. The runner is called itself (node, or the script of the installed Playwright, vitest or jest) with the
// name as one argument: through npm and cmd.exe the quotes of a filter are stripped and a name with spaces became
// «el», which ran nearly the whole suite (measured). A line whose command is compound, a mutation or an unknown
// runner has no triage.
export const rerunSpec = (command, tests, root) => {
  if (!tests.length || /&&|\|\||[;|]/.test(command) || MUTATOR.test(command)) return null;
  let scripts = {};
  try { scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {}; } catch {}
  const text = expandScripts(command, scripts);
  if (/&&|\|\||[;|]/.test(text)) return null;
  const words = wordsOf(text);
  const env = {};
  while (words.length && /^[A-Za-z_]\w*=/.test(words[0])) { const [k, ...v] = words.shift().split('='); env[k] = v.join('='); }
  const installed = (...paths) => paths.map((p) => join(root, 'node_modules', ...p.split('/'))).find((p) => existsSync(p));
  const keep = (flags, valued, drop) => {
    const out = [];
    for (let k = 0; k < flags.length; k++) {
      const x = flags[k];
      const skip = drop.some((d) => x === d || x.startsWith(`${d}=`));
      if (!x.startsWith('-')) continue;
      if (!x.includes('=') && valued.has(x) && k + 1 < flags.length) { if (!skip) out.push(x, flags[k + 1]); k++; } else if (!skip) out.push(x);
    }
    return out;
  };
  if (words[0] === 'node' && words.includes('--test')) {
    const at = words.indexOf('--test');
    const rest = words.slice(at + 1);
    const flags = keep(rest, NODE_VALUE_FLAGS, ['--test-name-pattern', '--test-skip-pattern']);
    // The files that hold the failing tests when the output said which; else the ones the line names. A file that
    // failed as a whole (its name is the failing «test») is re-run whole, with no name filter.
    const wholeFiles = tests.filter((t) => /\.[cm]?[jt]sx?$/.test(t.name)).map((t) => t.name);
    const named = tests.map((t) => t.nodeFile);
    const lineFiles = rest.filter((x, k) => !x.startsWith('-') && !(k > 0 && rest[k - 1].startsWith('-') && !rest[k - 1].includes('=') && NODE_VALUE_FLAGS.has(rest[k - 1])));
    const files = wholeFiles.length ? wholeFiles : named.every(Boolean) ? [...new Set(named)] : lineFiles;
    const filters = wholeFiles.length ? [] : tests.map((t) => `--test-name-pattern=(?:^| )${escapeRegex(t.name)}$`);
    // A re-run of a few tests never waits on a handle the first run left open: it carries `--test-force-exit` as a call of an agent does.
    return { cmd: process.execPath, args: [...words.slice(1, at), '--test', ...(flags.includes('--test-force-exit') ? [] : ['--test-force-exit']), ...flags, ...filters, ...files], env };
  }
  const flagsAfter = (from, valued, drop) => keep(words.slice(from), valued, drop);
  const files = (from, valued) => words.slice(from).filter((x, k, all) => !x.startsWith('-') && !(k > 0 && all[k - 1].startsWith('-') && !all[k - 1].includes('=') && valued.has(all[k - 1])));
  const pwAt = words.findIndex((x, k) => /(^|[\\/])playwright(\.cmd)?$/.test(x) && words[k + 1] === 'test');
  if (pwAt >= 0) {
    const cli = installed('@playwright/test/cli.js', 'playwright/cli.js');
    if (!cli || !tests.every((t) => t.file)) return null;
    const projects = [...new Set(tests.map((t) => t.project).filter(Boolean))];
    const flags = flagsAfter(pwAt + 2, PLAYWRIGHT_VALUE_FLAGS, ['--grep', '-g', '--project']);
    return { cmd: process.execPath, args: [cli, 'test', ...flags, ...new Set(tests.map((t) => t.file)), ...(projects.length === 1 ? [`--project=${projects[0]}`] : [])], env };
  }
  const runnerAt = words.findIndex((x) => /(^|[\\/])(vitest|jest)(\.cmd)?$/.test(x));
  if (runnerAt >= 0) {
    const jest = /jest/.test(words[runnerAt]);
    const script = jest ? installed('jest/bin/jest.js') : installed('vitest/vitest.mjs');
    if (!script) return null;
    const valued = new Set(['-c', '--config', '--root', '-r', '--project', '--reporter', '-t', '--testNamePattern', '--test-name-pattern']);
    const pattern = tests.map((t) => escapeRegex(t.name)).join('|');
    const rest = words.slice(runnerAt + 1);
    const sub = !jest && rest[0] === 'run' ? ['run'] : [];
    return { cmd: process.execPath, args: [script, ...sub, ...keep(rest.slice(sub.length), valued, ['-t', '--testNamePattern', '--test-name-pattern']), '-t', pattern, ...files(runnerAt + 1 + sub.length, valued)], env };
  }
  return null;
};

// Why the grade leaves a line of the plan out, or null if it runs.
export const skippedBy = (line, exempt, map, root = process.cwd()) => {
  const reason = `not required by grade ${exempt.grade}`;
  if (line.file !== undefined) return mutationRequired(exempt, map, line.file, root) ? null : reason;
  if (exempt.procedures?.has('motion-audit') && /motion-audit\.mjs/.test(line.command ?? '')) return reason;
  const key = Object.keys(LINE_CRITERIA).find((k) => line.name.toLowerCase().startsWith(k));
  return key && LINE_CRITERIA[key].every((id) => exempt.criteria.has(id)) ? reason : null;
};

// A card that touches a screen works inside the project's design line: it uses it and extends it,
// it does not invent values; every control has its states, and there is motion with its reduced
// version. Measured: a screen with no motion at all read as old even though it passed every
// validation, and four runs used between 6 and 15 loose font sizes with no scale.
const IS_SCREEN = /\.(css|scss|html?|jsx|tsx|vue|svelte)$/;
// A module that builds HTML or CSS in a string is also a screen: some apps have no other.
const BUILDS_SCREEN = /<(html|style|body|main|button|input|form|table|section)\b|\{[^{}]*\b(color|background|transition|font-size)\s*:/i;
export const LINE = 'design/line.md';
export const SET = 'design/components';
// A hidden input carries a value, it is not a control: nobody sees it, focuses it or presses it.
const HIDDEN_INPUT = /<input\b[^>]*?(?<![\w-])type\s*=\s*["'`{]?hidden\b[^>]*>?/gi;
const withoutHidden = (lines) => lines.join('\n').replace(HIDDEN_INPUT, '');

// A file's diff is asked once per design check: it reads the same file up to five times. `design` empties it.
const diffs = new Map();
const diffText = (root, base, f) => {
  const key = `${root}\n${base}\n${f}`;
  if (!diffs.has(key)) diffs.set(key, spawnSync('git', ['diff', '-U0', base, '--', f], { cwd: root, encoding: 'utf8' }).stdout ?? '');
  return diffs.get(key);
};
// The lines the card added and removed in a file; a file new to git counts as all added.
const diffOf = (root, base, f) => {
  const d = diffText(root, base, f);
  if (!d) return { added: readFileSync(join(root, f), 'utf8').split('\n'), removed: [] };
  const lines = d.split('\n');
  const pick = (sign) => lines.filter((l) => l.startsWith(sign) && !l.startsWith(sign.repeat(3))).map((l) => l.slice(1));
  return { added: pick('+'), removed: pick('-') };
};
const added = (root, base, f) => diffOf(root, base, f).added;
// The added lines with their number in the file, from the hunk headers; a file new to git is all added.
const addedAt = (root, base, f) => {
  const d = diffText(root, base, f);
  if (!d) return readFileSync(join(root, f), 'utf8').split('\n').map((text, i) => ({ n: i + 1, text }));
  const out = [];
  let n = 0;
  for (const l of d.split('\n')) {
    const hunk = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunk) { n = Number(hunk[1]); continue; }
    if (l.startsWith('+') && !l.startsWith('+++')) out.push({ n: n++, text: l.slice(1) });
  }
  return out;
};
// `file:line value` for each hand-written value of the kinds in `patterns` that the card added, to cite in a finding.
const placesOf = (root, base, files, patterns) => files.flatMap((f) => addedAt(root, base, f)
  .filter((l) => !DECLARES_TOKEN.test(l.text))
  .flatMap((l) => patterns.flatMap((re) => (l.text.match(re) ?? []).map((value) => `${f}:${l.n} ${value}`))));
const CONTROL = /<(button|input|select|textarea)\b|\b(button|input|select|textarea)\s*[{:,]|\[role=["']?button/g;
const controls = (lines) => withoutHidden(lines).match(CONTROL)?.length ?? 0;

// `off` are the procedures the grade leaves out (kit.mjs `exemption`): at poc there is no design line
// and no component set to check against.
export const design = (root, cardDir, off = new Set()) => {
  diffs.clear();
  // A card that declared `no-visual:` changes no markup (its gate check verifies the diff): it owes no design line.
  if (riskOf(cardDir)?.declared?.some((d) => d.lens === 'visual')) return [];
  // A remove-only card adds no look (its `remove-only` check fails if it adds any), and a plain one takes the repo's styles:
  // no design line is owed for either.
  if (noLookOf(readCard(cardDir))) return [];
  const base = cardStart(root, cardDir);
  const written = cardFiles(root, base)
    .filter((f) => !/^(specs|test|tests|e2e|\.claude)\//.test(f) && !/\.(test|spec)\./.test(f) && existsSync(join(root, f)))
    // A Dart widget is not a web screen: its `color:` is a named argument, not CSS. Flutter's design bar is its profile's
    // goldens and guidelines, not the design line, tokens.css and CSS transitions checked here.
    .filter((f) => !f.endsWith('.dart'))
    // A file the card only moved is a screen of the card only when the move added markup to it.
    .filter((f) => !originOf(root, base, f) || addedOf(root, base, f).some((l) => BUILDS_SCREEN.test(l.text)));
  const touched = written.filter((f) => IS_SCREEN.test(f) || (IS_CODE.test(f) && BUILDS_SCREEN.test(readFileSync(join(root, f), 'utf8'))));
  if (!touched.length) return [];
  // The component set is checked as a whole in its gallery; the screens, for how they use it.
  // A copy of the set under the served folder (public/design/components/) is the set too.
  const inSet = (f) => f.startsWith(`${SET}/`) || f.includes(`/${SET}/`);
  const screen = touched.filter((f) => !inSet(f) && !/^design\//.test(f));
  const setFiles = existsSync(join(root, SET)) ? readdirSync(join(root, SET), { recursive: true }).map((f) => `${SET}/${String(f).split('\\').join('/')}`).filter((f) => /\.(css|m?js|html?|tsx?|jsx|vue|svelte)$/.test(f)) : [];
  const problems = [];
  const closing = 'per .claude/templates/design-line.md and .claude/reference/modern-interface.md';

  if (!off.has('design-line') && !existsSync(join(root, LINE)))
    problems.push(`I-line · the card touches a screen and the project has no design line (${LINE}) · close: \`cp .claude/templates/design-line.md ${LINE}\`, then write its sections 1 to 5 (references, direction, tokens, component set, state changes) and the values in design/tokens.css, ${closing}`);

  // Only what the card wrote counts: old code is not rewritten because of this.
  const text = (files) => files.map((f) => readFileSync(join(root, f), 'utf8')).join('\n');
  // The set defines the scales: its literal values are its tokens, not values written around them.
  const raw = touched.filter((f) => !inSet(f)).flatMap((f) => {
    const lines = added(root, base, f).filter((l) => !DECLARES_TOKEN.test(l)).join('\n');
    const n = (lines.match(RAW_COLOR)?.length ?? 0) + (lines.match(RAW_DURATION)?.length ?? 0);
    return n ? [`${f} (${n})`] : [];
  });
  if (raw.length && !off.has('design-line'))
    problems.push(`I-tokens · colors or durations written by hand in what the card added: ${raw.join(', ')} · at: ${placesOf(root, base, touched.filter((f) => !inSet(f)), [RAW_COLOR, RAW_DURATION]).join('; ')} · close: in each place write \`var(--<token>)\` instead of the value; a missing token is declared once in design/tokens.css as \`--<name>: <value>;\``);
  // On a screen —not in the set, where the scales are defined— space, radius and shadow come from
  // tokens or primitives too: that is what keeps a new screen in the product's language.
  const rawLayout = screen.flatMap((f) => {
    const lines = added(root, base, f).filter((l) => !DECLARES_TOKEN.test(l)).join('\n');
    const n = lines.match(RAW_LAYOUT)?.length ?? 0;
    return n ? [`${f} (${n})`] : [];
  });
  if (rawLayout.length && !off.has('design-line'))
    problems.push(`I-tokens · space, radius or shadow written by hand on a screen: ${rawLayout.join(', ')} · at: ${placesOf(root, base, screen, [RAW_LAYOUT]).join('; ')} · close: in each place write \`var(--space-<n>)\`, \`var(--radius-<n>)\` or \`var(--shadow-<n>)\`, or use the primitives (stack, inline, grid, surface) of the set`);

  // Composed, not drawn: what the catalog or the set solves is installed or reused, never written again.
  // Code that builds the DOM through a helper (`el('main', { class: … })`) is markup too.
  const markup = written.filter((f) => !/^design\//.test(f) && MARKUP_FILE.test(f));
  const markupAdded = markup.map((f) => ({ file: f, text: added(root, base, f).join('\n') }));
  if (!off.has('component-set') && usesCatalog(root)) problems.push(...catalogFindings(markupAdded, classesAt(root, base)));
  else if (!off.has('component-set')) {
    const used = classesIn(markupAdded.map((m) => m.text).join('\n'));
    const sheets = setSheets(root);
    const names = sheets.map((f) => f.split('/').pop());
    problems.push(...setFindings({
      used,
      files: markupAdded,
      set: classesDefined(text(sheets)),
      before: classesAt(root, base),
      sheets,
      loaded: [...new Set([...screen, ...markup])].some((f) => names.some((n) => readFileSync(join(root, f), 'utf8').includes(n))),
      record: /^## Information\b/m.test(readCard(cardDir) ?? ''),
    }));
  }

  const all = text([...touched, ...setFiles]);
  // States are required when the card adds controls; those that were already missing predate it.
  // Editing a line that already had a control does not add one: removed lines are discounted.
  const addsControls = touched.some((f) => {
    const d = diffOf(root, base, f);
    return controls(d.added) > controls(d.removed);
  });
  if (addsControls) {
    const lacking = [':hover', ':focus-visible', ':active', ':disabled'].filter((e) => !all.includes(e));
    if (lacking.length)
      problems.push(`I-states · there are controls and their states ${lacking.join(', ')} are missing · close: every control with rest, hover, visible focus, press, disabled and loading, ${closing}`);
  }

  // Motion is asked of what the card builds: a new screen or a new control. Changing a text on a
  // screen that already exists does not make the card owe that screen its motion.
  const existed = (f) => spawnSync('git', ['cat-file', '-e', `${base}:${f}`], { cwd: root }).status === 0;
  if (!addsControls && touched.every(existed)) return problems;
  if (!/\b(transition|animation)\s*:|\.animate\(|startViewTransition|animation-timeline/.test(all))
    problems.push(`I-motion · the screen declares no motion (${touched.join(', ')}) · close: hover, press and focus transitions, and the entrance of the main content, ${closing}`);
  else if (!/prefers-reduced-motion/.test(all))
    problems.push(`I-motion · there is motion without a prefers-reduced-motion rule (${touched.join(', ')}) · close: an @media (prefers-reduced-motion: reduce) block that removes shifts and scales`);
  return problems;
};

const defaultRun = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 1 << 28 });
  return { status: r.status, stdout: r.stdout ?? '', stderr: `${r.stderr ?? ''}${r.error ? r.error.message : ''}` };
};
const lastLine = (text) => text.trim().split('\n').filter(Boolean).at(-1) ?? 'no output';

// The code files the card touched, kit and specs left out.
const cardCode = (root, cardDir) => cardFiles(root, cardStart(root, cardDir))
  .filter((f) => IS_CODE.test(f) && !/^(specs|\.claude)\//.test(f) && existsSync(join(root, f)));

// K4 — measured: duplication was never measured in 3 inspections, and apps built with the kit repeated the same logic in several
// places. Blocking for what the card writes: a clone where at least one side is lines this card added or changed. A clone that was
// already there (the card touched the file, not those lines) is a `note:`, never a failure. jscpd matches token by token, so an exact
// copy is found and a copy with renamed identifiers is not (measured): the plan's `reuses:`/`new:` line is what stops that one.
// A clone with a frozen test on either side is a `note:`: the frozen copy cannot import a shared part. Any other clone that
// cannot be extracted is declared in the Log: `declared · K4 · <file>[:<lines>] · <why>`.
// A clone with a declared file on either side is not reported; close.mjs lists the declaration for a person.
// The floor is Sonar's, 10 lines: under it jscpd mostly finds framework boilerplate (measured: 53 of 249 clones in a Flutter
// and FastAPI repo were 6 to 9 lines, 33 of them Dart widget trees), and extracting those costs more than it saves.
export const K4_MIN_LINES = 10;
export const K4_MIN_TOKENS = 50;
export const DECLARED_K4 = /declared\s*·\s*K4\s*·\s*([^\s·:]+)(?::[\d-]+)?\s*·\s*(.+?)\s*$/;
export const declaredClones = (cardDir) => {
  const doc = existsSync(join(cardDir, CARD_FILE)) ? readCard(cardDir) : '';
  return new Map((doc.split(/^## Log\b.*$/m)[1] ?? '').split('\n').map((l) => l.match(DECLARED_K4)).filter(Boolean).map((m) => [m[1], m[2]]));
};

// The lines of each file the card added or changed since its start: [[from, to], …]; a file the card created is `null` (all of it).
const addedLines = (root, base, files) => {
  // A moved file diffs against where it came from: only what changed in the move is the card's.
  const origins = files.map((f) => originOf(root, base, f)).filter(Boolean);
  const from = ownBase(root, base);
  const out = new Map(files.map((f) => [f, existedAt(root, from, f) || originOf(root, base, f) ? [] : null]));
  const diff = git(root, ['diff', '-U0', '--no-color', RENAME, from, '--', ...files, ...origins]).stdout ?? '';
  let file = null;
  for (const l of diff.split(/\r?\n/)) {
    if (l.startsWith('+++ ')) { file = l.slice(4).replace(/^b\//, ''); continue; }
    const m = l.match(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/);
    if (m && file && Array.isArray(out.get(file))) { const n = m[2] === undefined ? 1 : Number(m[2]); if (n) out.get(file).push([Number(m[1]), Number(m[1]) + n - 1]); }
  }
  return out;
};
const isNew = (ranges, start, end) => ranges === null || (ranges ?? []).some(([a, b]) => start <= b && end >= a);

export const duplication = (root, cardDir, run = defaultRun, notes = []) => {
  const files = cardCode(root, cardDir);
  if (!files.length) return [];
  const out = '.validation/jscpd';
  const common = ['--silent', '--gitignore', '--min-lines', String(K4_MIN_LINES), '--min-tokens', String(K4_MIN_TOKENS), '--reporters', 'json', '--output', out,
    '--ignore', '**/node_modules/**,**/.claude/**,**/specs/**,**/.validation/**', '.'];
  const local = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'jscpd.cmd' : 'jscpd');
  rmSync(join(root, out), { recursive: true, force: true });
  // The arguments are jscpd 4's: an installed jscpd of another major would fail on them (measured).
  let major = null;
  try { major = Number(JSON.parse(readFileSync(join(root, 'node_modules', 'jscpd', 'package.json'), 'utf8')).version.split('.')[0]); } catch { /* not installed */ }
  const r = existsSync(local) && major === 4 ? run(local, common, root) : run('npx', ['-y', 'jscpd@4', ...common], root);
  const reportPath = join(root, out, 'jscpd-report.json');
  if (r.status !== 0 || !existsSync(reportPath))
    return [`K4 · jscpd could not run: ${lastLine(r.stderr || r.stdout)} · close: make \`npx -y jscpd@4\` run; duplication is not measured until it does`];
  let report;
  try { report = JSON.parse(readFileSync(reportPath, 'utf8')); } catch (e) {
    return [`K4 · jscpd could not run: unreadable report (${e.message}) · close: make \`npx -y jscpd@4\` run`];
  }
  const norm = (n) => (isAbsolute(n) ? relative(root, n) : n).split('\\').join('/');
  const declared = declaredClones(cardDir);
  const added = addedLines(root, cardStart(root, cardDir), files);
  return (report.duplicates ?? []).flatMap((d) => {
    const a = norm(d.firstFile.name);
    const b = norm(d.secondFile.name);
    if (!files.includes(a) && !files.includes(b)) return [];
    if (declared.has(a) || declared.has(b)) return [];
    const where = `${a}:${d.firstFile.start}-${d.firstFile.end} and ${b}:${d.secondFile.start}-${d.secondFile.end}`;
    const fresh = (f, side) => files.includes(f) && isNew(added.get(f), side.start, side.end);
    if (!fresh(a, d.firstFile) && !fresh(b, d.secondFile)) { notes.push(`note: K4 · clone already in the repo, not from this card: ${d.lines} lines, ${where}`); return []; }
    // A frozen test cannot be edited to import the shared part (guard): with one on either side there is nothing to extract.
    if ([a, b].some((f) => IS_TEST_FILE.test(f) && committedTagged(join(root, f), root).frozen)) { notes.push(`note: K4 · clone with a frozen test, which cannot import a shared part: ${d.lines} lines, ${where}`); return []; }
    return [`K4 · new duplication of ${d.lines} lines: ${where} · close: extract to the owning module or \`shared/\` and import it from both, or add to the Log \`declared · K4 · <file> · <why the two must differ>\``];
  });
};

// K11 — measured: `role="table"aria-labelledby` shipped. An attribute value's closing quote glued to
// the next attribute name, in a string that builds HTML.
const GLUED_ATTRIBUTE = /<[a-zA-Z][^<>]*?\s[\w:-]+=(?:"[^"]*"|'[^']*')[a-zA-Z]/;
export const attributeSyntax = (lines) => lines.flatMap((l, i) => (GLUED_ATTRIBUTE.test(l) ? [i + 1] : []));

export const htmlProblems = (root, cardDir, run = defaultRun) => {
  const base = cardStart(root, cardDir);
  const touched = cardFiles(root, base).filter((f) => !/^(specs|\.claude)\//.test(f) && existsSync(join(root, f)));
  const actions = [];
  const pages = touched.filter((f) => /\.html?$/.test(f));
  if (pages.length) {
    const r = run('npx', ['-y', 'html-validate@8', '--formatter', 'json', ...pages], root);
    let findings = null;
    try { findings = JSON.parse(r.stdout); } catch { /* not json: it did not run */ }
    if (!Array.isArray(findings) || (r.status !== 0 && !findings.length))
      actions.push(`K11 · html-validate could not run: ${lastLine(r.stderr || r.stdout)} · close: make \`npx -y html-validate@8\` run; the HTML is not validated until it does`);
    // Only the lines the card added: a finding on a line that was already there (the base's `<!doctype html>`) is the base's
    // debt, a `R8`, not an action of this card.
    else for (const file of findings) {
      const name = (isAbsolute(file.filePath) ? relative(root, file.filePath) : file.filePath).split('\\').join('/');
      const mine = new Set(addedAt(root, base, name).map((l) => l.n));
      for (const m of (file.messages ?? []).filter((x) => !Number.isInteger(x.line) || mine.has(x.line)))
        actions.push(`K11 · ${name}:${m.line}:${m.column} ${m.ruleId}: ${m.message} · close: fix the markup so \`npx -y html-validate@8 ${name}\` is clean`);
    }
  }
  for (const f of touched.filter((x) => IS_CODE.test(x))) {
    const whole = readFileSync(join(root, f), 'utf8').split('\n');
    const mine = new Set(added(root, base, f));
    for (const n of attributeSyntax(whole).filter((i) => mine.has(whole[i - 1])))
      actions.push(`K11 · ${f}:${n} · attribute quote followed by a letter in a string that builds HTML · close: a space between attributes`);
  }
  return actions;
};

// Each log keeps beside it the key of the code it came from and how that run ended, so that a later
// «already passed» notice is only appended to the log of the run that passed.
const readMeta = (log) => { try { return JSON.parse(readFileSync(`${log}.json`, 'utf8')); } catch { return null; } };
const FLAKY_RUNS = 3;

// The error a node:test summary gives a failing test, without durations or positions, to tell «the same error again»
// from another. Empty when the output has none (other runners).
const errorOf = (text, name) => {
  const lines = text.split('\n');
  const at = lines.findLastIndex((l) => l.replace(/\s*\(\d+(?:\.\d+)?ms\)\s*$/, '').trim() === `✖ ${name}`);
  if (at < 0) return '';
  const body = [];
  for (const l of lines.slice(at + 1)) { if (!l.trim() || /^\S|^\s*(?:✖|ℹ|test at )/.test(l)) break; if (!/^\s+at /.test(l)) body.push(l); }
  return body.join('\n').replace(/\d+(?:\.\d+)?ms/g, '').replace(/:\d+:\d+/g, '').trim();
};

// Re-runs only the failing tests. The first re-run decides the deterministic ones: a test that fails again with the
// same error is `failed` FLAKY_RUNS of FLAKY_RUNS and is not run again. The rest, which passed or failed with another
// error, are re-run until FLAKY_RUNS re-runs are complete. Returns null when it does not apply, or what each test did:
// `failed` runs out of FLAKY_RUNS, and `same` when it repeated its error.
const triage = (command, output, minutes) => {
  const root = process.cwd();
  const timed = withTestTimeout(command);
  const tests = failingTests(output);
  if (!tests.length || !rerunSpec(timed, tests, root)) return null;
  const counts = new Map(tests.map((t) => [t.name, 0]));
  const same = new Set();
  let pending = tests;
  for (let i = 0; i < FLAKY_RUNS && pending.length; i++) {
    const rerun = rerunSpec(timed, pending, root);
    if (!rerun) break;
    say(`flaky triage ${i + 1}/${FLAKY_RUNS}: ${pending.map((t) => t.name).join(' | ')}`);
    // The re-runs write the same `test-results/` as any browser run: they hold the lock while they last.
    const release = launchesPlaywright(command, root) ? takeLock(root, `${rerun.cmd} ${rerun.args.join(' ')}`) : () => {};
    const r = spawnSync(rerun.cmd, rerun.args, { cwd: root, shell: false, env: { ...process.env, ...rerun.env }, encoding: 'utf8', maxBuffer: 1 << 28, timeout: minutes * 60000 });
    release();
    const text = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    const names = new Set(failingTests(text).map((t) => t.name));    for (const t of pending) {
      const failed = r.status !== 0 && (!names.size || names.has(t.name));
      if (failed) counts.set(t.name, counts.get(t.name) + 1);
      if (i === 0 && failed && errorOf(text, t.name) === errorOf(output, t.name)) { same.add(t.name); counts.set(t.name, FLAKY_RUNS); }
    }
    pending = pending.filter((t) => !same.has(t.name));
  }
  return tests.map((t) => ({ test: t.name, failed: counts.get(t.name), same: same.has(t.name) }));
};

const run = (line, logsDir) => new Promise((done) => {
  const { name, command } = line;
  const log = join(logsDir, `${name.replace(/[^\w.-]+/g, '_')}.log`);
  const minutes = limitMin(line, readDurations(logsDir));
  const started = Date.now();
  const key = keyOf(process.cwd(), command);
  say(`start ${name} (limit ${minutes} min)`);
  const p = spawn('node', [join(import.meta.dirname, 'once.mjs'), name, '--', command],
    { shell: false, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', env: line.env ?? process.env });
  let output = '';
  let timedOut = false;
  p.stdout.on('data', (d) => { output += d; });
  p.stderr.on('data', (d) => { output += d; });
  const beat = setInterval(() => say(`still running ${name} (${seconds(Date.now() - started)})`), HEARTBEAT_MS);
  const limit = setTimeout(() => { timedOut = true; killTree(p); }, minutes * 60000);
  p.on('close', (code) => {
    clearInterval(beat);
    clearTimeout(limit);
    let exit = timedOut ? 124 : code ?? 1;
    let flaky = [];
    let replaced = [];
    let cached = null;
    const skippedRun = code === 0 && /: already passed on this same code .* not repeated\./.test(output);
    if (skippedRun) {
      // A skip over code that already passed keeps the log of the real run (its counts are what the
      // close cites): the notice is appended to it. If the log on disk is of another run —one that
      // failed before the fix, say—, it is replaced by the output of the run that passed.
      const meta = readMeta(log);
      if (existsSync(log) && meta?.key === key && meta.exit === 0) appendFileSync(log, `\n${output}`);
      else writeFileSync(log, `${existsSync(logPath(process.cwd(), name, command)) ? `${readFileSync(logPath(process.cwd(), name, command), 'utf8')}\n` : ''}${output}`);
      flaky = readRecord(process.cwd(), name, command)?.flaky ?? [];
      replaced = readRecord(process.cwd(), name, command)?.replaced ?? [];
      cached = readRecord(process.cwd(), name, command)?.when ?? null;
      if (!MUTATOR.test(command) && ZERO_RUN.test(readFileSync(log, 'utf8'))) {
        exit = 1;
        appendFileSync(log, '\n[verify] failed: the runner executed 0 tests, so the line proves nothing (a filter, a glob or a tag that matches no test)\n');
      }
    } else {
      // Any test line, not only `suite`: a scenarios line that runs a frozen test the Log declares replaced counts its swap too.
      // replacedFailures answers only when every failing test it reads has a replacement that holds.
      // Only a single command: in a chain the failing step may have kept the next one from ever running.
      const swapped = exit !== 0 && !timedOut && !/^mutate\b/i.test(name) && !MUTATOR.test(command) && !isCompound(command) ? replacedFailures(process.cwd(), output) : null;
      if (swapped) {
        exit = 0;
        replaced = swapped.map((r) => ({ test: r.name, file: r.file, by: r.by, byName: r.byName, why: r.why }));
        output += `\n[verify] passed with replaced ${replaced.length}: every failing test is declared replaced in the Log and its replacement passed\n`;
        writeRecord(process.cwd(), { name, command, exit: 0, minutes: (Date.now() - started) / 60000, replaced });
        writeFileSync(logPath(process.cwd(), name, command), output);
      }
      if (exit !== 0 && !timedOut && !MUTATOR.test(command)) {
        const found = triage(command, output, minutes);
        if (found) {
          const summary = found.map((f) => `${f.same ? 'failed again with the same error, not re-run further' : 'flaky'} ${f.failed}/${FLAKY_RUNS} ${f.test}`).join('\n');
          output += `\n[verify] flaky triage of the failing tests:\n${summary}\n`;
          if (found.every((f) => f.failed < FLAKY_RUNS)) {
            exit = 0;
            flaky = found;
            output += `[verify] passed with flaky: every failing test passed at least once in the re-run\n`;
            writeRecord(process.cwd(), { name, command, exit: 0, minutes: (Date.now() - started) / 60000, flaky });
            writeFileSync(logPath(process.cwd(), name, command), output);
          }
        }
      }
      if (exit === 0 && !timedOut && !MUTATOR.test(command) && ZERO_RUN.test(output)) {
        exit = 1;
        output += '\n[verify] failed: the runner executed 0 tests, so the line proves nothing (a filter, a glob or a tag that matches no test)\n';
      }
      writeFileSync(log, output);
    }
    writeFileSync(`${log}.json`, JSON.stringify({ key, exit }));
    // A skip lasts seconds: what the line measures is its real run, the one once.mjs recorded.
    const measured = skippedRun ? readRecord(process.cwd(), name, command)?.minutes : timedOut ? minutes : (Date.now() - started) / 60000;
    if (measured > 0 && !(skippedRun && readDurations(logsDir)[command] > 0)) recordDuration(logsDir, command, measured);
    say(`${timedOut ? `could not run: timeout after ${minutes} min` : exit === 0 ? (replaced.length ? 'passed with replaced' : flaky.length ? 'passed with flaky' : cached ? `passed (cached ${cached.slice(0, 16)})` : 'passed') : `exit ${exit}`} ${name} (${seconds(Date.now() - started)})`);
    done({ name, command, exit, timedOut, minutes, log, flaky, replaced, cached, tail: output.trim().split('\n').slice(-4).join(' ⏎ ') });
  });
});

// The parts of a split line that go together, one after the other and stopping at the first that fails, as
// `&&` would. A part that passed earlier on the same code is skipped by its own once record.
const runChain = async (line, logsDir) => {
  const started = Date.now();
  const done = [];
  for (const part of line.parts) {
    const r = await run({ name: part.name, command: part.command, timeoutMin: line.timeoutMin, env: line.env }, logsDir);
    done.push(r);
    if (r.exit !== 0) break;
  }
  const last = done.find((r) => r.exit !== 0) ?? done.at(-1);
  return {
    name: line.name, command: line.command, exit: last.exit, timedOut: last.timedOut, minutes: last.minutes, log: last.log,
    flaky: done.flatMap((r) => r.flaky ?? []), replaced: done.flatMap((r) => r.replaced ?? []), cached: done.every((r) => r.cached) ? done.at(-1).cached : null, tail: last.tail, elapsedMin: (Date.now() - started) / 60000, partLogs: done.map((r) => r.log),
  };
};

// What the parts of a split line did, as the one result of the line: the first part that failed decides it
// (with its own log), else the one not started, else it passed. The line's log joins the logs of the parts that ran.
const mergeChunks = (root, line, parts, mine, logsDir) => {
  const logOf = (part) => join(logsDir, `${part.name.replace(/[^\w.-]+/g, '_')}.log`);
  const ran = new Set(mine.flatMap((r) => r.partLogs ?? []));
  const joined = parts.filter((part) => ran.has(logOf(part)))
    .map((part) => `== ${part.name}: ${part.command} ==\n${readFileSync(logOf(part), 'utf8')}`).join('\n');
  const lineLog = join(logsDir, `${line.name.replace(/[^\w.-]+/g, '_')}.log`);
  const bad = mine.find((r) => r.exit !== 0 && !r.notRun);
  const blocked = mine.find((r) => r.notRun);
  const final = bad ?? blocked ?? {
    name: line.name, command: line.command, exit: 0, timedOut: false, minutes: 0, log: lineLog, flaky: mine.flatMap((r) => r.flaky ?? []), replaced: mine.flatMap((r) => r.replaced ?? []), cached: mine.length && mine.every((r) => r.cached) ? mine[0].cached : null,
    tail: joined.trim().split('\n').slice(-4).join(' ⏎ '),
  };
  if (joined) writeFileSync(lineLog, joined);
  writeFileSync(`${lineLog}.json`, JSON.stringify({ key: keyOf(root, line.command), exit: final.exit }));
  if (final.exit === 0) {
    const minutes = mine.reduce((sum, r) => sum + (r.elapsedMin ?? 0), 0);
    writeRecord(root, { name: line.name, command: line.command, exit: 0, minutes, ...(final.flaky.length ? { flaky: final.flaky } : {}), ...(final.replaced?.length ? { replaced: final.replaced } : {}) });
  }
  return final;
};

export const verify = async (root) => {
  // Run from another folder (the kit's own repo, a subfolder) it would grade nothing or the wrong card: stop with exit 3.
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' }).stdout?.trim();
  const cardDir = currentCard(root);
  if (!cardDir || (top && realpathSync.native(top).toLowerCase() !== realpathSync.native(root).toLowerCase()))
    return { code: 3, error: `Not the root of a project with a card in progress: ${resolve(root)} has ${cardDir ? 'a card but is not the repo root' : 'no card (specs/.current or a frozen card.md under specs/)'}. Run verify.mjs from the root of the project the card belongs to.` };
  // A poc has no Gate: the designer's capture round is its validation.
  if (isPoc(root)) return { code: 0, message: 'poc: no gate, the capture round is the validation' };
  // The gate is the `## Gate` of card.md when the card has one; else the plan's `## Verification`.
  const cardPath = join(cardDir, CARD_FILE);
  const single = existsSync(cardPath);
  const planPath = single ? cardPath : join(cardDir, 'plan.md');
  const planned = existsSync(planPath) && planCommands(readFileSync(planPath, 'utf8'), { base: cardStart(root, cardDir), cardDir }, single ? 'Gate' : 'Verification');
  if (!planned?.length) return { error: single ? 'card.md has no `## Gate` with a block of commands.' : 'The plan has no `## Verification` with a block of commands.' };

  const logsDir = join(root, '.validation', 'verify');
  mkdirSync(logsDir, { recursive: true });
  // With an `app:` line the app is started once, before the lines, and its URL, PORT and DATA_DIR go in the environment of
  // every line (once.mjs also expands them in the text); it is brought down at the end if this run started it.
  const appLine = hasAppLine(readFileSync(planPath, 'utf8'), single ? 'Gate' : 'Verification');
  let startedApp = false;
  const saved = { APP_URL: process.env.APP_URL, PORT: process.env.PORT, DATA_DIR: process.env.DATA_DIR };
  if (appLine) {
    const stateFile = join(root, '.validation', 'app.json');
    const pidBefore = readState(stateFile)?.pid;
    // app.mjs waits KIT_APP_START_TIMEOUT_S (180 s by default) for the app, then up to 120 s for the seed: the cut leaves 30 s beyond both.
    const startS = Number(process.env.KIT_APP_START_TIMEOUT_S) > 0 ? Number(process.env.KIT_APP_START_TIMEOUT_S) : 180;
    const up = spawnSync('node', [join(import.meta.dirname, 'app.mjs'), 'up'], { cwd: root, encoding: 'utf8', timeout: appUpCutMs(startS), maxBuffer: 1 << 26 });
    const state = readState(stateFile);
    if (up.status !== 0 || !state) return { error: `The \`app:\` line could not start the app (exit ${up.status}): ${(up.stderr || up.stdout || '').trim().split('\n').slice(-6).join(' ⏎ ')}` };
    startedApp = state.pid !== pidBefore;
    Object.assign(process.env, { APP_URL: state.url, PORT: String(state.port), DATA_DIR: state.dataDir });
    say(`app up at ${state.url}`);
  }
  try {
    return await verifyLines(root, { cardDir, single, planned, logsDir });
  } finally {
    if (appLine) for (const k of ['APP_URL', 'PORT', 'DATA_DIR']) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    if (startedApp) spawnSync('node', [join(import.meta.dirname, 'app.mjs'), 'down'], { cwd: root, stdio: 'ignore', timeout: 60000 });
  }
};

// The seed's own limit in app.mjs (startApp); app.mjs runs its CLI on import, so the number is repeated here.
const APP_SEED_S = 120;
export const appUpCutMs =(startS) => Math.max(150, startS + APP_SEED_S + 30) * 1000;
const readState = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };
const hasAppLine = (doc, heading) => {
  const section = doc.split(/^## /m).find((s) => s.startsWith(heading));
  return fencedBlocks(section).join('\n').split('\n').some((l) => /^app:/.test(l.trim()));
};

const PROBE_LANES = 3;
const MOTION_AUDIT = /\bmotion-audit\b/;
const probeOut = (command) => command.match(/\bapp\.mjs\s+probe\b.*?--out[ =](\S+)/)?.[1];
// A whole line that is one probe with an --out no other probe line uses and no frame measurement.
export const isParallelProbe =(c, all) => {
  const out = probeOut(c.command);
  return Boolean(out) && !c.parts && c.file === undefined && !/&&|;|\|/.test(c.command) && !MOTION_AUDIT.test(c.command) && !measuresFrames(c)
    && all.filter((x) => x !== c && probeOut(x.command) === out).length === 0;
};
const PENDING_DESIGNER ='pending designer';
const DESIGNER_CHECKS = new Set(['rounds', 'docs']);
// What design-round.mjs leaves: before the designer's first round there is no round.json to read, which is its turn, not a defect.
const ROUND_CHECKS = new Set(['dead-clicks', 'brand']);
export const designerVerdict = (c, waitsDesigner) => (waitsDesigner
  && ((c.state === 'failed' && DESIGNER_CHECKS.has(c.name)) || (c.state === 'could not run' && ROUND_CHECKS.has(c.name) && /^no rondas\//.test(c.detail ?? '')))
  ? { ...c, state: PENDING_DESIGNER } : c);
// A card with the `visual` lens whose designer has left no round yet (rondas.md without a `## Round`). A remove-only or a plain
// card has no designer.
export const designerPending = (cardDir) => {
  if (!riskOf(cardDir)?.lenses?.includes('visual') || noLookOf(readCard(cardDir))) return false;
  const notes = join(cardDir, 'rondas.md');
  return !(existsSync(notes) && /^## Round\b/m.test(readFileSync(notes, 'utf8')));
};

const verifyLines = async (root, { cardDir, single, planned, logsDir }) => {
  // What the grade leaves out is named and not run.
  const { exempt } = active(root);
  const map = fileMapLines(cardDir) ?? [];
  const skipped = planned.flatMap((c) => { const reason = skippedBy(c, exempt, map, root); return reason ? [{ name: c.name, reason }] : []; });
  const gradedAll = planned.filter((c) => !skipped.some((s) => s.name === c.name));
  const unrunnable = gradedAll.filter((c) => c.cannotRun);
  const graded = gradedAll.filter((c) => !c.cannotRun);
  // A line another line already includes is not run twice: `covered by <line>`, and once that line
  // passes the covered one gets its own record, so what looks for evidence of it finds it.
  const covered = containedCommands(graded, root).map(({ inner, outer }) => ({ inner: graded.find((c) => c.name === inner), outer }));
  const commands = graded.filter((c) => !covered.some((v) => v.inner === c));
  for (const v of covered) say(`covered by ${v.outer}: ${v.inner.name} is not run on its own`);
  if (exempt.criteria.has('K11')) skipped.push({ name: 'K11 html', reason: `not required by grade ${exempt.grade}` });
  for (const s of skipped) say(`skipped: ${s.reason} ${s.name}`);

  const last = commands.filter((c) => FINAL_PHASE.test(c.name));
  const rest = commands.filter((c) => !last.includes(c));
  // A line that is a chain of parts with and without a browser goes in both groups, each with its own parts.
  const env = { ...process.env };
  const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
  env[pathKey] = `${join(root, 'node_modules', '.bin')}${delimiter}${env[pathKey] ?? ''}`;
  const durations = readDurations(logsDir);
  const splits = new Map();
  const heavy = [];
  const noBrowser = [];
  // The parts without a browser of a split line run in a lane of their own from the start: they never hold the
  // browser chain back, measured or not, and no other line without a browser waits in a queue behind them.
  const beside = [];
  for (const c of rest) {
    const parts = c.file === undefined && !MUTATOR.test(c.command) ? splitLine(c.name, c.command, root) : null;
    if (parts) {
      splits.set(c, parts);
      say(`split ${c.name}: ${parts.fast.length} parts without a browser run beside the other lines, ${parts.heavy.length} with a browser start with the browser chain`);
      beside.push({ ...c, parts: parts.fast, env });
      heavy.push({ ...c, parts: parts.heavy, env });
    } else (usesBrowser(c.command, root) ? heavy : noBrowser).push(c);
  }
  const exec = (c) => (c.parts ? runChain(c, logsDir) : run(c, logsDir));
  const serialOf = (c) => isSerial(suiteOf(c.command), root);
  const expectedMin = (c) => Math.max(measuredMin(durations, c.command), readRecord(root, c.name, c.command)?.minutes ?? 0);
  // A line without a browser that took more than SLOW_MIN in its last run does not hold the browser chain
  // back: it runs beside it. A line never measured counts as fast.
  const slow = noBrowser.filter((c) => expectedMin(c) > SLOW_MIN);
  const fast = noBrowser.filter((c) => !slow.includes(c));
  const alone = fast.filter(serialOf);
  const together = fast.filter((c) => !alone.includes(c));
  const slowAlone = slow.filter(serialOf);
  const limit = Math.max(2, Math.floor(cores() / 2));
  const results = unrunnable.map((c) => ({ name: c.name, command: c.command, exit: 125, notRun: true, reason: c.cannotRun, flaky: [], tail: '' }));
  for (const c of unrunnable) {
    say(`could not run ${c.name}: ${c.cannotRun}`);
    writeRecord(root, { name: c.name, command: c.command, exit: 125, minutes: 0 });
  }
  const treeBefore = snapshot(root);
  // A mutation that exits 3 found nothing to mutate in the file: required.mjs accepts it as well.
  const failed = (r) => r.exit !== 0 && !(r.exit === 3 && MUTATOR.test(r.command));
  const queue = [...together];
  const sideRuns = Promise.all(beside.map(async (c) => { results.push(await exec(c)); }));
  const slowRuns = Promise.all([
    ...slow.filter((c) => !slowAlone.includes(c)).map(async (c) => { results.push(await exec(c)); }),
    (async () => { for (const c of slowAlone) results.push(await exec(c)); })(),
  ]);
  await Promise.all([
    ...Array.from({ length: limit }, async () => {
      for (let c = queue.shift(); c; c = queue.shift()) results.push(await exec(c));
    }),
    (async () => { for (const c of alone) results.push(await exec(c)); })(),
  ]);
  // The browser lines start only if every fast line passed; the slow ones, and the parts of split lines, keep running
  // beside them (a part that already failed when the chain starts still keeps it from starting).
  const redFast = results.filter((r) => failed(r) && [...fast, ...beside].some((c) => c.name === r.name)).map((r) => r.name);
  const runHeavy = async (c) => {
    if (redFast.length) {
      say(`not started ${c.name}: ${redFast.join(', ')} failed first`);
      results.push({ name: c.name, command: c.command, exit: 125, notRun: true, blockedBy: redFast, flaky: [], tail: '' });
    } else results.push(await exec(c));
  };
  // `app.mjs probe` lines with their own --out only read the running app and write their own folder (probe.mjs: own browser,
  // own out dir), so up to PROBE_LANES run together; a frame measurement or motion-audit needs the machine to itself.
  const lanes = heavy.filter((c) => isParallelProbe(c, heavy));
  const audits = heavy.filter((c) => !lanes.includes(c) && MOTION_AUDIT.test(c.command));
  const waiting = [...lanes];
  await Promise.all(Array.from({ length: Math.min(PROBE_LANES, lanes.length) }, async () => { for (let c = waiting.shift(); c; c = waiting.shift()) await runHeavy(c); }));
  for (const c of heavy.filter((x) => !lanes.includes(x) && !audits.includes(x))) await runHeavy(c);
  for (const c of audits) await runHeavy(c);
  await Promise.all([slowRuns, sideRuns]);
  // A frame line that failed while others ran is measured again with the machine to itself.
  for (const c of rest.filter((x) => x.file === undefined && !splits.has(x) && measuresFrames(x))) {
    const at = results.findIndex((r) => r.name === c.name);
    const first = results[at];
    if (commands.length < 2 || !first || !failed(first) || first.notRun) continue;
    const firstLog = existsSync(first.log) ? readFileSync(first.log, 'utf8') : '';
    say(`${c.name} failed with other lines running: run again alone`);
    const again = await run(c, logsDir);
    const note = `[verify] ${c.name} first run, with other lines running: exit ${first.exit}\n${firstLog}\n[verify] re-run alone: exit ${again.exit}; its result is the one of the run alone\n`;
    writeFileSync(again.log, `${note}${existsSync(again.log) ? readFileSync(again.log, 'utf8') : ''}`);
    results[at] = { ...again, rerunAlone: { first: first.exit, alone: again.exit } };
  }
  for (const c of last) results.push(await run(c, logsDir));
  for (const [line, parts] of splits) {
    const all = [...parts.fast, ...parts.heavy].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const merged = mergeChunks(root, line, all, results.filter((r) => r.name === line.name), logsDir);
    results.splice(0, results.length, ...results.filter((r) => r.name !== line.name), merged);
  }

  // A versioned file whose content changed during the gate (a formatter, a generator) makes the run untrustworthy: the lines
  // ran in parallel, so no line is blamed. New untracked and ignored files (artifacts, logs) do not count.
  const rewritten = changedBetween(treeBefore, snapshot(root));
  if (rewritten.length) {
    for (const r of results.filter((x) => x.exit === 0)) {
      r.exit = 1;
      r.tail = `not counted: ${rewritten.join(', ')} changed during the gate; run the writer before the gate, commit, and run the gate again`;
      writeRecord(root, { name: r.name, command: r.command, exit: 1, minutes: r.minutes ?? 0 });
    }
  }
  for (const v of covered) {
    const by = results.find((r) => r.name === v.outer);
    if (by && by.exit === 0) writeRecord(root, { name: v.inner.name, command: v.inner.command, exit: 0, coveredBy: v.outer });
  }

  const actions = results.filter(failed)
    .map((r) => (r.notRun && r.reason
      ? `${r.name} · could not run: ${r.reason} · close: tag the card's tests with its spec tags, or name the tests in the line instead of \`{affected}\``
      : r.notRun
      ? `${r.name} · could not run: not started because ${r.blockedBy.join(', ')} failed first, and the lines that drive a browser start only after the fast ones pass · close: fix those, then \`node ${TOOLS}/verify.mjs\` again`
      : r.timedOut
      ? `${r.name} · could not run: timeout after ${r.minutes} min, killed: ${r.tail} · log: ${relative(root, r.log)} · close: \`${r.command}\` ends by itself within the limit (a server is started and stopped by the command). To raise the limit of this line write \`${r.name} [timeout <N> min]: …\` in the plan's \`## Verification\` (the name, then the tag), or set \`VERIFY_TIMEOUT_MIN\` for every line; without either, the limit is the greater of 20 min and 4 times the last measured run of the command, and a killed run counts as its limit, so the next run gets more room`
      : `${r.name} · fails (exit ${r.exit}): ${r.tail} · log: ${relative(root, r.log)} · close: \`${r.command}\` exits 0`));
  if (rewritten.length) actions.unshift(`gate: ${rewritten.join(', ')} changed during the gate; run the writer before the gate and commit`);
  writeSessionLines(root, cardDir);
  // Its findings go to a record that required.mjs and close.mjs read: the three tools say the same.
  const duplicationNotes = [];
  const quality = [...design(root, cardDir, exempt.procedures),
    ...(exempt.criteria.has('K4') ? [] : duplication(root, cardDir, defaultRun, duplicationNotes)),
    ...(exempt.criteria.has('K11') ? [] : htmlProblems(root, cardDir))];
  for (const n of duplicationNotes) say(n);
  writeRecord(root, { ...QUALITY, exit: quality.length ? 1 : 0, findings: quality });
  // The diff can raise risk.json (never lower it); required.mjs below reads it already raised.
  if (single && existsSync(join(cardDir, 'risk.json'))) {
    try { const raised = escalate(root, cardDir); if (raised.code === 0 && raised.escalated) say(raised.line); } catch (e) { say(`risk --diff could not run: ${e.message}`); }
  }
  const required = missing(root);
  const { actions: lacking, pending } = splitPending(required ?? quality);
  // The designer owns the look: until it leaves its rounds, what it writes (design line, tokens, rounds, docs) is not the builder's to fix.
  // Only this verdict changes: required.mjs and the close still ask for all of it.
  const waitsDesigner = single && designerPending(cardDir);
  const DESIGNER_OWNS = /^I-(line|tokens) ·/;
  for (const f of lacking) {
    if (waitsDesigner && DESIGNER_OWNS.test(f)) { say(`${f.split(' · ')[0]}: pending designer`); continue; }
    actions.push(quality.includes(f) ? f : `${f} · close: \`node ${TOOLS}/required.mjs\` exits 0`);
  }
  // The checks that read what the card and the probe left on disk: out-of-scope.mjs runs inside required.mjs above.
  const checks = (single ? gateChecks(root, cardDir) : []).map((c) => designerVerdict(c, waitsDesigner));
  for (const c of checks) for (const n of c.notes ?? []) say(n);
  for (const c of checks.filter((x) => x.state !== 'passed' && x.state !== PENDING_DESIGNER))
    actions.push(`${c.name} · ${c.state === 'failed' ? c.detail : `could not run: ${c.detail}`} · close: \`node ${TOOLS}/verify.mjs\` shows ${c.name} passed`);
  const flaky = results.flatMap((r) => (r.flaky ?? []).map((f) => ({ line: r.name, ...f })));
  if (flaky.length) writeFileSync(join(logsDir, 'flaky.md'), `# Passed with flaky\n\n${flaky.map((f) => `- ${f.line}: ${f.test} — failed ${f.failed}/${FLAKY_RUNS} in the re-run`).join('\n')}\n`);
  else rmSync(join(logsDir, 'flaky.md'), { force: true });
  const replaced = results.flatMap((r) => (r.replaced ?? []).map((f) => ({ line: r.name, ...f })));
  if (replaced.length) writeFileSync(join(logsDir, 'replaced.md'), `# Passed with replaced\n\n${replaced.map((f) => `- ${f.line}: ${f.file} "${f.test}" — replaced by ${f.by} "${f.byName}" · ${f.why}`).join('\n')}\n`);
  else rmSync(join(logsDir, 'replaced.md'), { force: true });
  return { results, actions, pending, failed, skipped, covered: covered.map((v) => ({ name: v.inner.name, by: v.outer })), flaky, replaced, checks, single };
};

// A card is a screen card when its risk.json has the `visual` lens or the files it touched are a screen.
const isScreenCard = (root, cardDir) => {
  if (riskOf(cardDir)?.lenses?.includes('visual')) return true;
  // A declared `no-visual` that the gate verified (its check passed) leaves the card as not a screen.
  if (noVisualCheck(root, cardDir).some((c) => c.state === 'passed')) return false;
  return Boolean(detectIn({ files: cardFiles(root, cardStart(root, cardDir)) }).screen);
};

// The gate's own checks: every spec has a tagged test, and a screen passes axe, contrast and focus.
export const gateChecks = (root, cardDir) => oneRound(() => [specsCheck(root, cardDir), ...cardChecks(cardDir, root), ...(isScreenCard(root, cardDir) && visualInstruments(root, readCard(cardDir)).probe ? screenChecks(probeRecords(root)) : [])]);

// One line per check: `<name>: passed`, `<name>: failed: <why>` or `<name>: could not run: <why>`.
const lineOf = (name, state, detail) => `${name}: ${state === 'passed' || state === PENDING_DESIGNER ? state : `${state}: ${detail}`}`;

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`usage: node verify.mjs [--fresh]
Runs the gate of the card in progress: every line of its \`## Gate\` (or the plan's \`## Verification\`) in parallel, then required.mjs.
  --fresh   ignores the cache: every line runs again. Without it, a line that passed on the same command and the same code
            is not run and prints \`passed (cached <date>)\`; a failed line or one that could not run always runs again.
A \`node --test\` with no \`--test-timeout\` gets 30 s per test (KIT_TEST_TIMEOUT_MS, in ms, changes it): a hung test fails with
\`timed out after 30 s\`. Other runners are left as they are (vitest and jest cut at 5 s; pytest only with pytest-timeout and \`--timeout=<s>\`).
A failing test is re-run once, alone: if it fails again with the same error the line is failed and nothing more runs; otherwise it is
re-run up to 3 times and, if it passes at least once, the line is \`passed with flaky k/3\`.
With a visual card whose designer has left no round yet (rondas.md), \`rounds\`, \`docs\`, \`I-line\` and \`I-tokens\`, and \`dead-clicks\` and
\`brand\` with no round.json, print \`pending designer\`
and do not count for the exit code; required.mjs and the close still ask for them.
Exit: 0 nothing to fix, 1 actions, 2 no commands in the gate, 3 not run from the root of a repo with a card in progress.`);
    process.exit(0);
  }
  if (process.argv.includes('--fresh')) process.env.ONCE_FRESH = '1';
  endsWithLine('verify');
  const r = await verify(process.cwd());
  if (r.error) {
    console.error(r.error);
    process.exit(r.code ?? 2);
  }
  if (r.message) {
    console.log(r.message);
    process.exit(r.code ?? 0);
  }
  if (r.single) {
    // card.md: one line per check, and the fixed final line (endsWithLine) at the end.
    for (const x of r.results.sort((a, b) => a.name.localeCompare(b.name))) {
      const state = x.exit === 0 ? (x.replaced?.length ? 'passed with replaced' : x.flaky?.length ? 'passed with flaky' : 'passed') : x.notRun ? 'could not run' : x.timedOut ? 'could not run' : r.failed(x) ? 'failed' : 'passed';
      const why = x.notRun && x.reason ? x.reason : x.notRun ? `not started, ${x.blockedBy.join(', ')} failed first` : x.timedOut ? `timeout after ${x.minutes} min` : x.tail;
      console.log(state === 'passed with replaced' ? `${x.name}: passed with replaced ${x.replaced.length}: ${x.replaced.map((f) => f.test).join(' | ')}`
        : state === 'passed with flaky' ? `${x.name}: passed with flaky` : state === 'passed' && x.cached ? `${x.name}: passed (cached ${x.cached.slice(0, 16)})` : lineOf(x.name, state, why));
    }
    for (const s of r.skipped) console.log(`${s.name}: skipped: ${s.reason}`);
    for (const c of r.covered) console.log(`${c.name}: covered by ${c.by}`);
    for (const c of r.checks) console.log(lineOf(c.name, c.state, c.detail));
    const rest = r.actions.filter((a) => !r.results.some((x) => a.startsWith(`${x.name} · `)) && !r.checks.some((c) => c.state !== 'passed' && a.startsWith(`${c.name} · `)));
    for (const a of rest) console.log(`required: failed: ${a}`);
    if (!rest.length) console.log('required: passed');
    process.exit(r.actions.length === 0 && r.pending.length === 0 ? 0 : 1);
  }
  for (const x of r.results.sort((a, b) => a.name.localeCompare(b.name))) console.log(`${x.exit === 0 ? (x.replaced?.length ? 'passed with replaced' : x.flaky?.length ? 'passed with flaky' : x.cached ? `passed (cached ${x.cached.slice(0, 16)})` : 'passed') : x.notRun ? 'COULD NOT RUN: not started' : x.timedOut ? 'COULD NOT RUN: timeout' : r.failed(x) ? 'FAILED' : 'nothing to mutate'}  ${x.name}`);
  for (const x of r.results.filter((y) => y.rerunAlone)) console.log(`re-run alone  ${x.name}  (first exit ${x.rerunAlone.first} with other lines running, alone exit ${x.rerunAlone.alone}: the result is the one alone)`);
  for (const s of r.skipped) console.log(`skipped: ${s.reason}  ${s.name}`);
  for (const c of r.covered) console.log(`covered by ${c.by}  ${c.name}`);
  for (const f of r.flaky) console.log(`flaky ${f.failed}/${FLAKY_RUNS}  ${f.line}: ${f.test}  (list it in closing.md under ## Passed as «passed with flaky»; \`.validation/verify/flaky.md\`)`);
  for (const f of r.replaced) console.log(`replaced  ${f.line}: ${f.file} "${f.test}" by ${f.by} "${f.byName}"  (a person reviews it: closing.md ## Needs a person; \`.validation/verify/replaced.md\`)`);
  if (r.actions.length === 0 && r.pending.length === 0) {
    console.log('Nothing to fix: everything mechanical passed on the code as it is now.');
    process.exit(0);
  }
  console.log(`\n${r.actions.length} actions:`);
  r.actions.forEach((a, i) => console.log(`ACT-${String(i + 1).padStart(2, '0')} · ${a}`));
  if (r.pending.length) {
    console.log(`\n${r.pending.length} pending, not actions (their agent still runs; wait for it with wait.mjs --agent, then run required.mjs):`);
    r.pending.forEach((p) => console.log(`  - ${p}`));
  }
  process.exit(1);
}
