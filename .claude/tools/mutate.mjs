#!/usr/bin/env node
// mutate.mjs <file> [--since <ref>] [--equivalents <file>] [--parallel N] -- <suite command>
// Run from the project root.
//
// Breaks the file on purpose, one break at a time, and runs the suite against each. A break the
// suite does not detect is behavior no test verifies, even if coverage says the line was executed.
// No dependencies: works in any Node project.
//
// It works on a copy of the project, never on the original: mutating in place makes anything else
// that runs in the directory meanwhile —the suite, the running app— see broken code, and a
// cut-off run leaves a live mutant in the repo.
//
// The operators are only those that cannot break the syntax: a break that does not compile makes the
// suite fail for another reason and would count as detected without being so. That is why the
// comparison and arithmetic ones require spaces around them —so they do not touch generics, arrows
// or comments— and nothing is mutated inside a string.
//
// Python: a `.py` file gets its own operators (== != · and or · not · None → 0 · is None · True False · < <= · > >= ·
// `return x` → `return None`), described above `PY_OPERATORS`, and nothing in a string or a `#` comment is touched. The suite
// is `pytest <the file's tests>`: `-x` is added if the command has no `-x`, `--exitfirst` or `--maxfail`, and
// `PYTHONDONTWRITEBYTECODE` is set. Give it the file's own tests, never the whole suite: the 10-minute budget below
// refuses a suite that is slow times the number of mutants (`node .claude/tools/affected.mjs <file>` lists them).
//
// Dart: a `.dart` file gets `DART_OPERATORS`, against `flutter test <the file's tests>`. Use `--since` so only the lines the card
// changed are mutated: each mutant reruns `flutter test`.
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { syncTree, unlinkDependencies } from './copy-tree.mjs';
import { endsWithLine } from './final-line.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

endsWithLine('mutate');
const sep = process.argv.indexOf('--');
const file = process.argv[2];
const given = sep > 0 ? process.argv.slice(sep + 1) : [];
// A failing assertion can leave a server of the test open, and `node --test` then waits for it: every
// detected mutant would wait the whole deadline. Measured in a card: 664 s against 137 s for the same 41
// mutants, same score. `--test-force-exit` is added after `--test` to a `node --test` command that lacks it.
const NODE_TEST = /(^|\s)(node(?:\.exe)?\s[^|;&]*?--test)(?=\s|$)/;
const forced = given.length > 0 && !given.join(' ').includes('--test-force-exit') && NODE_TEST.test(given.join(' '));
const forcedCommand = forced ? [given.join(' ').replace(NODE_TEST, '$1$2 --test-force-exit')] : given;
// A Python file is mutated against `pytest <its tests>`: the suite stops at the first failure (`-x`) because a detected
// mutant needs only one failing test, and the run ends there instead of walking the rest of the file's tests.
const isPy = /\.py$/.test(file ?? '');
const PYTEST = /(^|\s)((?:python3?(?:\.exe)?\s+-m\s+)?pytest)(?=\s|$)/;
const joined = forcedCommand.join(' ');
const exitFirst = isPy && PYTEST.test(joined) && !/(^|\s)(-x|--exitfirst|--maxfail)(?=[\s=]|$)/.test(joined);
const command = exitFirst ? [joined.replace(PYTEST, '$1$2 -x')] : forcedCommand;
// Forcing the exit must never turn a green suite into a failure: node's own failure exits with 1, so any other
// status from the forced command (an abort of the runtime at exit) is run again as the command was written.
const option = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 && (sep < 0 || i < sep) ? process.argv[i + 1] : null;
};
const fromRef = option('--since');
const equivalentsFile = option('--equivalents');
if (!file || command.length === 0) {
  console.error('usage: node mutate.mjs <file> -- <unit suite command>');
  process.exit(2);
}

const isDart = /\.dart$/.test(file);

// A browser suite is not a mutation suite: every mutant would rerun the whole screen suite.
// Measured: a card mutated two screen files against 370 Playwright tests and spent five hours
// waiting. The logic of a screen goes to pure functions with unit tests, and is mutated against those.
const BROWSER = /\b(playwright|cypress|webdriver|puppeteer|wdio|testcafe)\b/i;
if (BROWSER.test(command.join(' '))) {
  console.error(`${file}: a browser suite is not a mutation suite (every mutant reruns it). Move the logic to pure functions with unit tests and mutate against those; what is left is wiring, covered by the scenarios.`);
  process.exit(4);
}

// A number is bumped one step in its last digit: 10 → 11, 0.05 → 0.06. That way it lands right on
// the other side of a threshold, which is where edge errors hide.
const bumpNumber = (n) => {
  const decimals = (n.split('.')[1] ?? '').length;
  return (Number(n) + 10 ** -decimals).toFixed(decimals);
};

const OPERATORS = [
  [/===/, '!=='], [/!==/, '==='],
  [/>=/, '>'], [/<=/, '<'],
  [/ > /, ' >= '], [/ < /, ' <= '],
  [/&&/, '||'], [/\|\|/, '&&'],
  [/ \+ /, ' - '], [/ - /, ' + '], [/ \* /, ' / '], [/ \/ /, ' * '],
  [/\btrue\b/, 'false'], [/\bfalse\b/, 'true'],
  [/(?<![!=])!(?!=)/, ''],
  [/(?<![\w.!])[\w$]+(?:\.[\w$]+)*\.test\(/, (m) => `!${m}`],
  [/\.includes\(/, '.startsWith('], [/\.startsWith\(/, '.endsWith('], [/\.endsWith\(/, '.startsWith('],
  [/\.toLowerCase\(\)/, '.toUpperCase()'], [/\.toUpperCase\(\)/, '.toLowerCase()'],
  [/\.trim\(\)/, '.trimEnd()'], [/\.some\(/, '.every('], [/\.every\(/, '.some('],
  [/\bMath\.min\(/, 'Math.max('], [/\bMath\.max\(/, 'Math.min('],
  [/(?<![\w.$])\d+(?:\.\d+)?(?![\w.])/, bumpNumber],
];

// Dart (.dart): those of JavaScript where Dart has them, with `==`/`!=` for equality, `contains`/`any`/`every` and
// `min`/`max` of dart:math. `!` is mutated only as a prefix negation: the postfix null assertion (`x!`) would give a
// mutant that does not compile, and a compile error would count as a detected mutant.
const DART_OPERATORS = [
  [/(?<![=!<>])==(?!=)/, '!='], [/!=(?!=)/, '=='],
  [/>=/, '>'], [/<=/, '<'],
  [/ > /, ' >= '], [/ < /, ' <= '],
  [/&&/, '||'], [/\|\|/, '&&'],
  [/ \+ /, ' - '], [/ - /, ' + '], [/ \* /, ' / '], [/ \/ /, ' * '],
  [/\btrue\b/, 'false'], [/\bfalse\b/, 'true'],
  [/(?<![\w)\]!=])!(?=[\w(])/, ''],
  [/\.contains\(/, '.startsWith('], [/\.startsWith\(/, '.endsWith('], [/\.endsWith\(/, '.startsWith('],
  [/\.toLowerCase\(\)/, '.toUpperCase()'], [/\.toUpperCase\(\)/, '.toLowerCase()'],
  [/\.trim\(\)/, '.trimRight()'], [/\.any\(/, '.every('], [/\.every\(/, '.any('],
  [/\bmin\(/, 'max('], [/\bmax\(/, 'min('],
  [/(?<![\w.$])\d+(?:\.\d+)?(?![\w.])/, bumpNumber],
];

// Python (.py). The matching runs on a masked copy of the source —strings and comments, triple-quoted ones across lines
// included, replaced by `S` and blanks— so nothing inside them is touched and no quote tracking is needed. Each operator
// keeps the syntax valid: `not x` → `x` skips `is not` and `not in`; `None` → `0` skips what is a type or an identity
// check (`-> None`, `X | None`, `Optional[None]`-style `, None]`, `is None`, `is not None`), since the identity check has
// its own mutant. `0` was chosen because it is falsy like `None` but is not `None`: a test that checks `is None` or
// `== None` notices it, one that only checks truthiness does not, and that is what the mutant measures.
// `return x` → `return None` only when the expression ends on the same line (balanced brackets, no `\`).
const balanced = (s) => {
  let depth = 0;
  for (const c of s) { if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--; }
  return depth === 0 && !/\\\s*$/.test(s);
};
const PY_OPERATORS = [
  [/(?<![=!<>])==(?!=)/, '!='], [/!=/, '=='],
  [/\band\b/, 'or'], [/\bor\b/, 'and'],
  [/(?<!\bis )\bnot\s+(?!in\b)/, ''],
  [/\bis not None\b/, 'is None'], [/\bis None\b/, 'is not None'],
  [/(?<!\bis )(?<!\bis not )(?<!->\s*)(?<!\|\s*)\bNone\b(?!\s*[|\]])/, '0'],
  [/\bTrue\b/, 'False'], [/\bFalse\b/, 'True'],
  [/(?<![<>=!-])<=(?!=)/, '<'], [/(?<![<>=!-])>=(?!=)/, '>'],
  [/ < /, ' <= '], [/ > /, ' >= '],
  [/(?<=^\s*return )(?!None\s*$)\S.*?(?=\s*$)/, 'None', balanced],
];
const PY_NOISE = /^\s*(import\b|from\s+\S+\s+import\b|@)/;
const maskPython = (src) => {
  const out = src.split('');
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '#') { while (i < src.length && src[i] !== '\n') out[i++] = ' '; continue; }
    if (c !== '"' && c !== "'") { i++; continue; }
    const q = src.startsWith(c.repeat(3), i) ? c.repeat(3) : c;
    const start = i;
    i += q.length;
    while (i < src.length) {
      if (src[i] === '\\') { i += 2; continue; }
      if (src.startsWith(q, i)) { i += q.length; break; }
      if (q.length === 1 && src[i] === '\n') break;
      i++;
    }
    for (let j = start; j < Math.min(i, src.length); j++) if (src[j] !== '\n' && src[j] !== '\r') out[j] = 'S';
  }
  return out.join('');
};

const root = process.cwd();
const rel = relative(root, resolve(file));
if (rel.startsWith('..')) {
  console.error('The file has to be inside the directory the tool is run from.');
  process.exit(2);
}

const original = readFileSync(file, 'utf8');
const lines = original.split('\n');
const isNoise = (l) => /^\s*(import|export\s+type|type |interface |\/\/|\*|\/\*)/.test(l);

// Quote state on reaching position i; `from` is the quote open at the start of the line, because a
// template literal —the CSS or HTML of a view— crosses lines.
const quoteAt = (line, i, from = null) => {
  let open = from;
  for (let j = 0; j < i; j++) {
    const c = line[j];
    if (c === '\\') { j++; continue; }
    if (open) { if (c === open) open = null; } else if (c === "'" || c === '"' || c === '`') open = c;
  }
  return open;
};
const atStart = [];
lines.reduce((open, line, n) => {
  atStart[n] = open;
  return quoteAt(line, line.length, open) === '`' ? '`' : null;
}, null);

const mutants = [];
// With --since only the lines that changed since that reference are mutated: what the card wrote.
// That is how Google does it on the diff under review; mutating the whole file in a card that
// touched ten lines multiplies the time by what the card did not write.
let changed = null;
// A file git does not track yet is all new: git diff shows none of it, and it would come out as
// “nothing to mutate”. Measured: a new file passed the mutation that way, and the close sent a second
// agent to mutate it again.
const untracked = fromRef && spawnSync('git', ['ls-files', '--error-unmatch', '--', file], { encoding: 'utf8' }).status !== 0;
if (fromRef && !untracked) {
  const d = spawnSync('git', ['diff', '-U0', fromRef, '--', file], { encoding: 'utf8' });
  if (d.status !== 0) { console.error(`Could not read the diff from ${fromRef}.`); process.exit(2); }
  changed = new Set();
  for (const [, start, count] of d.stdout.matchAll(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm))
    for (let i = 0; i < (count === undefined ? 1 : +count); i++) changed.add(+start + i);
}
// What surrounds a mutation, with the whitespace taken out: an equivalent mutant is declared by this
// context and not by its line number, so splitting or joining lines for formatting does not turn it
// into a failure.
const CONTEXT = 20;
const squeeze = (s) => s.replace(/\s+/g, '');
const lineStart = [];
lines.reduce((offset, line, n) => { lineStart[n] = offset; return offset + line.length + 1; }, 0);
const contextAt = (offset, length) => ({
  before: squeeze(original.slice(Math.max(0, offset - 6 * CONTEXT), offset)).slice(-CONTEXT),
  after: squeeze(original.slice(offset + length, offset + length + 6 * CONTEXT)).slice(0, CONTEXT),
});
const masked = isPy ? maskPython(original).split('\n') : null;
lines.forEach((line, n) => {
  if (changed && !changed.has(n + 1)) return;
  if (isPy ? PY_NOISE.test(masked[n]) : !atStart[n] && isNoise(line)) return;
  const code = isPy ? masked[n] : line.replace(/\s\/\/.*$/, '');
  for (const [from, to, applies] of isPy ? PY_OPERATORS : isDart ? DART_OPERATORS : OPERATORS) {
    for (const m of code.matchAll(new RegExp(from.source, 'g'))) {
      if (isPy ? applies && !applies(m[0]) : quoteAt(line, m.index, atStart[n])) continue;
      const replacement = typeof to === 'function' ? to(m[0]) : to;
      const mutated = line.slice(0, m.index) + replacement + line.slice(m.index + m[0].length);
      mutants.push({ n: n + 1, from: m[0].trim(), to: replacement.trim(), ...contextAt(lineStart[n] + m.index, m[0].length), text: lines.map((l, i) => (i === n ? mutated : l)).join('\n') });
    }
  }
});

// Without mutants there is no measurement: a 100 % over zero breaks would say the suite is perfect
// without having tested it.
if (mutants.length === 0) {
  console.error(changed
    ? `${file}: the lines changed since ${fromRef} carry no operator (names, comments or text only) — nothing to mutate. Run through once.mjs, this exit 3 counts as the file's mutation: nothing to declare.`
    : `${file}: no operator applies to this file — could not measure.`);
  process.exit(3);
}

// The whole run has a budget: mutants × the unmutated suite over 10 minutes is refused before starting.
const BUDGET_MS = 10 * 60_000;

// With --parallel N, N copies run mutants at the same time. Only for suites that share nothing
// outside their folder —unit tests—: two screen suites on the same port take each other down, and
// every crash would count as a detected mutant.
const parallel = Math.max(1, Number(option('--parallel') ?? 1) || 1);

// The copy carries everything except git, the tools' output folders and what a build regenerates; the dependencies are linked
// (copy-tree.mjs). It is kept between runs, one per project and slot, and only brought up to date: copying the whole project
// for every file cost minutes on a slow disk, and a Flutter or Gradle build started from zero each time. A slot another run holds
// (its lock is younger than two hours) is not shared: that run gets a throwaway copy, deleted at the end.
const KEEP = join(tmpdir(), `mutate-${createHash('sha1').update(resolve(root).toLowerCase()).digest('hex').slice(0, 10)}`);
const lockOf = (dir) => `${dir}.lock`;
// The lock holds its owner's pid: a lock whose process is dead is free at once (an orphan used to force full copies for 2 h).
const claim = (dir) => { mkdirSync(lockOf(dir)); try { writeFileSync(join(lockOf(dir), 'pid'), String(process.pid)); } catch {} return true; };
const ownerAlive = (dir) => {
  let pid;
  try { pid = Number(readFileSync(join(lockOf(dir), 'pid'), 'utf8')); } catch { return null; }
  if (!(pid > 0)) return null;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
};
const takeSlot = (dir) => {
  try { return claim(dir); } catch {}
  try {
    const stale = ownerAlive(dir) === false || (ownerAlive(dir) === null && Date.now() - statSync(lockOf(dir)).mtimeMs > 2 * 3600_000);
    if (stale) { rmSync(lockOf(dir), { recursive: true, force: true }); return claim(dir); }
  } catch {}
  return false;
};
// A project that itself lives in the temporary folder (a test's throwaway repo) gets throwaway copies: keeping them would pile up.
const keepable = !resolve(root).toLowerCase().startsWith(resolve(tmpdir()).toLowerCase());
const copies = Array.from({ length: parallel }, (_, i) => {
  const dir = `${KEEP}-${i}`;
  return keepable && takeSlot(dir) ? { dir, kept: true } : { dir: mkdtempSync(join(tmpdir(), 'mutate-')), kept: false };
});
// A mutant can hang the suite. When the deadline passes the whole process tree is brought down:
// cutting only the shell leaves the suite alive, occupying the copy and a port. Hanging counts as
// detected.
// If the mutator runs inside another node --test suite, the variable that suite hands to its
// children makes the nested suite exit fine without running anything: every mutant would look alive.
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
// Python caches bytecode by the source's mtime (in seconds) and size: two mutants of the same size written in the same
// second would run the first one's bytecode, and the score would be of the wrong mutant.
if (isPy) env.PYTHONDONTWRITEBYTECODE = '1';
const run = async (copy, timeout) => {
  const result = await exec(copy, timeout, command);
  return forced && !result.timedOut && result.status !== 0 && result.status !== 1 ? exec(copy, timeout, given) : result;
};
const exec = (copy, timeout, cmd) => new Promise((done) => {
  const p = spawn(cmd.join(' '), { cwd: copy, env, shell: true, stdio: 'ignore', detached: process.platform !== 'win32' });
  const start = Date.now();
  let timedOut = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F']);
    else try { process.kill(-p.pid, 'SIGKILL'); } catch {}
  }, timeout);
  p.on('exit', (code) => { clearTimeout(deadline); done({ status: code ?? 1, timedOut, ms: Date.now() - start }); });
});
let alive;
let timedOut = 0;
let baseMs = 0;
try {
  for (const copy of copies) syncTree(root, copy.dir, { fresh: !copy.kept });

  // The suite has to pass unmutated; if it does not, every number below is garbage.
  const base = await run(copies[0].dir, 600_000);
  if (base.status !== 0) {
    console.error(base.timedOut
      ? 'The unmutated suite did not finish in 10 minutes: nothing can be measured.'
      : 'The suite does not pass unmutated: nothing can be measured. Fix it first.');
    process.exitCode = 2;
  } else if ((mutants.length * base.ms) / parallel > BUDGET_MS) {
    console.error(`${file}: ${mutants.length} mutants × ${Math.round(base.ms / 1000)} s of suite = ${Math.round((mutants.length * base.ms) / parallel / 60_000)} min, over the 10-minute budget. Mutate against the unit tests of this file, not the whole suite.`);
    process.exitCode = 4;
  } else {
    // The per-mutant deadline comes from how long the suite takes: a fixed one makes every mutant
    // time out on a slow suite, and every timeout counts as detected — the score comes out inflated.
    // 3 times the base run, never under 10 s: a mutant that passes it hung the suite and counts as detected (timeout).
    baseMs = base.ms;
    const deadline = Math.max(10_000, 3 * base.ms);
    alive = [];
    timedOut = 0;
    const queue = [...mutants];
    await Promise.all(copies.map(async ({ dir: copy }) => {
      const target = join(copy, rel);
      for (let m = queue.shift(); m; m = queue.shift()) {
        writeFileSync(target, m.text);
        const r = await run(copy, deadline);
        if (r.timedOut) timedOut++;
        if (r.status === 0) alive.push(m);
      }
    }));
    alive.sort((a, b) => a.n - b.n);
  }
} finally {
  // A kept copy gets the mutated file back and its slot released, for the next run. A throwaway one loses its links first, so
  // the deletion cannot follow them into the project's dependencies; if Windows does not let it be deleted —a suite process
  // that still has it open—, it warns and the result comes out anyway.
  for (const { dir: copy, kept } of copies) {
    if (kept) {
      try { writeFileSync(join(copy, rel), readFileSync(join(root, rel))); } catch {}
      rmSync(lockOf(copy), { recursive: true, force: true });
      continue;
    }
    unlinkDependencies(copy);
    try { rmSync(copy, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); }
    catch (e) { console.error(`Could not delete the temporary copy ${copy} (${e.code}); it can be deleted by hand.`); }
  }
}
if (!alive) process.exit();

// An equivalent mutant —one that does not change behavior— cannot be detected by any test. It is
// declared in a file, one line per mutant with its reason, and stays visible in the output:
// `path:line · “from” → “to” · “before@@after” · why it changes nothing`.
// The mutant is identified by its file, its operator (from → to) and its context, the code before
// and after it with the whitespace out; the line number is a hint that may go stale. A declaration
// without context (`path:line · “from” → “to” · why`) matches by its line, or, if the line moved,
// when it is the only live mutant of that file with that operator. Without declaring it, the run
// does not pass.
const LINE = /^\s*-?\s*(\S+):(\d+)\s*·\s*[«“](.*?)[»”]\s*→\s*[«“](.*?)[»”]\s*·\s*(?:[«“](.*?)@@(.*?)[»”]\s*·\s*)?(.+)$/;
const declared = equivalentsFile && existsSync(equivalentsFile)
  ? readFileSync(equivalentsFile, 'utf8').split('\n').map((l) => l.match(LINE)).filter(Boolean)
    .map(([, path, n, from, to, before, after, reason]) => ({
      path: path.replaceAll('\\', '/'), n: +n, from, to, reason: reason.trim(),
      context: before === undefined ? null : { before: squeeze(before), after: squeeze(after) },
    }))
  : [];
const here = rel.replaceAll('\\', '/');
const declaration = (v) => declared.find((d) => d.path === here && d.from === v.from && d.to === v.to && (d.context
  ? v.before.endsWith(d.context.before) && v.after.startsWith(d.context.after)
  : d.n === v.n || alive.filter((o) => o.from === v.from && o.to === v.to).length === 1));
const unexplained = alive.filter((v) => !declaration(v));

const killed = mutants.length - alive.length;
const score = Math.round((killed / mutants.length) * 100);
console.log(`${file}: ${killed}/${mutants.length} detected (${score} %)`);
if (timedOut) console.log(`  ${timedOut} of them timed out (over ${Math.round(Math.max(10_000, 3 * baseMs) / 1000)} s) and count as detected`);
for (const v of alive) {
  const d = declaration(v);
  console.log(d
    ? `  EQUIVALENT  line ${v.n}: “${v.from}” → “${v.to}” — ${d.reason}`
    : `  ALIVE  line ${v.n}: “${v.from}” → “${v.to}” — no test notices it\n` +
      `    if it changes nothing, declare: ${here}:${v.n} · “${v.from}” → “${v.to}” · “${v.before}@@${v.after}” · <why>`);
}
// No mutant detected with live ones left unexplained is almost never a weak suite: it is a suite that ran no test. When every
// mutant left alive is a declared equivalent, there is nothing a test could have caught, and the run passes.
const equivalents = alive.length - unexplained.length;
if (killed === 0 && unexplained.length > 0) console.log('  No mutant detected: check that the suite command runs some test.');
if (killed === 0 && unexplained.length === 0) console.log(`  ${equivalents}/${mutants.length} equivalent, each declared with its reason`);
process.exit(unexplained.length === 0 ? 0 : 1);
