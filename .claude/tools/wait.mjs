#!/usr/bin/env node
// wait.mjs <log> [--until <regex>] [--fail <regex>] [--max 570] [--ignore-case]
// wait.mjs --agent <agentId> [--agent <agentId> ...] [--max 570]
// wait.mjs <log> --until <regex> --agent <agentId> [--agent <agentId> ...] [--any | --all] [--max 570]
//
// Waits in ONE process for a log to show a line, or for background subagents to finish, and ends with the state.
// It is how to wait for something running in the background (verify.mjs, mutate.mjs, a suite, a subagent) without
// polling: every poll is a turn, and each wake-up past the prompt cache rewrites the whole context (the main
// thread, builder, runner and executor keep it an hour). Measured: 949 polling turns, USD 85 of one card.
// Give the call `timeout: 600000` (--max 570 plus a margin); the shell guard allows the wait.
// In an interactive session the main thread does not hold its turn: it runs wait.mjs as the command of a `Monitor`
// with `--monitor --max 1790` (a Monitor lives 30 minutes at most; `timeout_ms: 1800000`, re-armed when it expires), ends the
// turn, and the person can talk meanwhile. Every stdout line is an event, so by default only the line that ends it
// wakes the agent: each wake-up rereads the whole context. `--every <min>` adds a heartbeat line per period
// (`[HB hh:mm] <N> min · <last line of the log>`) when someone asked to follow it.
//
// <log>      the file to read; it may not exist yet, but if nothing writes it within 15 s it is not a wait (exit 3).
//            An agent's output file (`tasks/<id>.output`, or any file with `--agent-output`) that is still at 0 bytes
//            after 15 s is exit 3 too. An ordinary log that is empty is a normal wait: a suite may write only at the end.
//            A log last written more than 60 s before the wait began whose lines already decide the wait is an earlier
//            run's: they decide nothing until something writes it again, and if nothing does within 15 s it is exit 3,
//            with its last line. An old log with no deciding line is a quiet live run, and is waited on.
// --until    regex (multiline: ^ and $ match at lines) whose first match means “done, as expected”. Optional for the
//            log of a kit tool (verify, mutate, once, attack, repeat, probe, pairs, showreel): each ends with the fixed
//            line `<tool>: exit <N> in <X> min` (final-line.mjs), and the wait ENDS ON IT whatever --until says:
//            exit 0 → wait exits 0 (and says so when --until never matched: read the log); any other exit → 1.
//            --fail and --until are checked first, so a regex that matches earlier decides. A log that is not a kit
//            tool's has no such line: give it --until.
// --fail     regex whose match means “done, and bad”; checked before --until, so a failure is never masked.
//            Both repeat as alternatives (`--until PASS --until FAIL`): a `|` in an argument is cut by cmd where `node` is
//            a Volta shim on Windows (measured: two waits that ran the second half of their regex as a command).
// --agent    the id of a subagent launched in the background (the `agentId` its launch returns); repeat it to wait on
//            several. An agent is done when
//            `<claude home>/projects/*/*/subagents/agent-<id>.meta.json` has `"finished": true`. A subagent's
//            `tasks/<id>.output` stays at 0 bytes, so it cannot be waited on through its output. The claude home is
//            `$KIT_CLAUDE_HOME`, else `$CLAUDE_CONFIG_DIR`, else `~/.claude`. No such meta: exit 3.
// --any      with several things to wait on (agents, or a log and agents), end when the FIRST is done, and print which
//            one (the default). The rest keep running: wait again for them with the ids that were not printed.
// --all      end when EVERY one is done, and print one line for each; a log that matched --fail is exit 1.
// --max      seconds to wait, at most 570 (10 minutes, one turn); default 570. An agent without a one-hour cache
//            (no `cacheTtl: 1h` in its frontmatter) waits at most 270: wait.mjs cannot tell, guard-shell enforces it.
//            A finished agent can leave work running that it launched in the background (nohup, a render writing a log):
//            then the line is `agent <id> finished after N s, background work still running: <pid cmd>; ...`. It sees live
//            processes whose command line holds a path or file name from a background command (run_in_background, nohup,
//            Start-Process, a trailing `&`) in the agent's transcript, `agent-<id>.jsonl`. It cannot see: a remote job or a
//            container, a process whose command line shares nothing with the command that launched it, and anything the
//            agent started without the Bash or PowerShell tool. No such line is not proof that nothing runs.
// Exit 0: --until matched, or the agent(s) finished; 1: --fail matched; 2: --max seconds passed with neither;
// 3: wrong usage, a log that did not appear or an agent output file empty for 15 s, or an agent with no meta.json.
// It prints the line that decided, or the last lines of the log when time ran out.
import { existsSync, openSync, readSync, closeSync, statSync, readFileSync, readdirSync, writeSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { finalLineOf } from './final-line.mjs';
import { linesOf } from './transcript.mjs';
import { STALE_MINUTES, agentDead } from './agents-running.mjs';

const MAX_S = 570;
const MONITOR_S = 1790;
// Past this a missing or empty log is a wait on something nobody runs: blind sleeping, not waiting.
const APPEARS_S = 15;
// A log older than this when the wait starts is not the one the waited command is writing.
const STALE_S = 60;
const usage = (why) => {
  console.error(`${why}\nusage: node wait.mjs <log> [--until <regex>] [--fail <regex>] [--max ${MAX_S} | --monitor [--every <min>] --max ${MONITOR_S}] [--ignore-case]\n       node wait.mjs --agent <agentId> [--agent <agentId> ...] [--any | --all] [--max ${MAX_S}]`);
  process.exit(3);
};

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const [, value] = args.splice(i, 2);
  return value ?? usage(`${name} needs a value`);
};
const bare = (name) => {
  const present = args.includes(name);
  while (args.includes(name)) args.splice(args.indexOf(name), 1);
  return present;
};
const ignoreCase = bare('--ignore-case');
const withAgentOutput = bare('--agent-output');
const wantAny = bare('--any');
const wantAll = bare('--all');
if (wantAny && wantAll) usage('--any and --all exclude each other');
const agents = [];
for (let a = flag('--agent'); a !== null; a = flag('--agent')) agents.push(a);
// --until and --fail repeat as alternatives: a `|` inside quotes is cut by cmd when `node` is a Volta shim on Windows.
const alternatives = (name) => {
  const all = [];
  for (let v = flag(name); v !== null; v = flag(name)) all.push(v);
  return all.length ? all.map((v) => (all.length > 1 ? `(?:${v})` : v)).join('|') : null;
};
const untilText = alternatives('--until');
const failText = alternatives('--fail');
const monitored = bare('--monitor');
const everyText = flag('--every');
const every = everyText === null ? 0 : Number(everyText);
if (everyText !== null && !(every > 0)) usage('--every is a number of minutes');
// In a Monitor nothing wakes the agent until the end, so a hang would go unseen until the Monitor expires: a log that
// stops growing for --quiet minutes (10 by default there, 0 turns it off) prints one warning line, and --pid ends the
// wait as failed when that process is gone without the expected line. The pid is the operating system's: in Git Bash,
// `cat /proc/$!/winpid` gives it for the last background command.
const quietText = flag('--quiet');
const quiet = quietText === null ? (monitored || every ? 10 : 0) : Number(quietText);
if (!(quiet >= 0)) usage('--quiet is a number of minutes');
const pidText = flag('--pid');
const pid = pidText === null ? null : Number(pidText);
if (pidText !== null && !(pid > 0)) usage('--pid is a process id');
const alive = (p) => { try { process.kill(p, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const clock = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const maxText = flag('--max');
const max = maxText === null ? MAX_S : Number(maxText);
if (!(max > 0)) usage('--max is a number of seconds');
if (max > MONITOR_S) usage(`--max ${max} is over ${MONITOR_S} s: a Monitor lives 30 minutes at most; re-arm it when it expires`);
if (!(monitored || every) && max > MAX_S) usage(`--max ${max} is over ${MAX_S} s: a longer wait holds the turn until the prompt cache can lapse, and the context is rewritten at every wake-up; wait ${MAX_S} s and ask again, or launch the work in the background and let it notify`);
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const start = Date.now();
const elapsed = () => ((Date.now() - start) / 1000).toFixed(0);
const pause = () => sleep(Math.min(500, Math.max(10, max * 1000 - (Date.now() - start))));
const timedOut = () => Date.now() - start >= max * 1000;

const home = process.env.KIT_CLAUDE_HOME || process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
// The meta sits in `projects/<project>/<session>/subagents/`; the session of the agent is not known here. Found once, it
// stays: the search walks every session of the machine, and the wait polls twice a second.
const metas = new Map();
const metaOf = (id) => {
  if (!metas.has(id)) metas.set(id, findMeta(id));
  return metas.get(id);
};
const findMeta = (id) => {
  const projects = join(home, 'projects');
  let found = null;
  try {
    for (const project of readdirSync(projects)) {
      let sessions = [];
      try { sessions = readdirSync(join(projects, project)); } catch { continue; }
      for (const session of sessions) {
        const file = join(projects, project, session, 'subagents', `agent-${id}.meta.json`);
        if (existsSync(file)) found = file;
      }
    }
  } catch { /* no projects folder: no meta */ }
  return found;
};
// Live processes of this machine: [{ pid, cmd }].
const liveProcesses = () => {
  try {
    if (process.platform === 'win32') {
      const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId)`t$($_.CommandLine)" }'], { encoding: 'utf8', timeout: 20000 });
      return (r.stdout || '').split(/\r?\n/).map((l) => l.split('\t')).filter((x) => /^\d+$/.test(x[0]) && x[1]).map(([pid, ...c]) => ({ pid: Number(pid), cmd: c.join(' ').trim() }));
    }
    const r = spawnSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8', timeout: 20000 });
    return (r.stdout || '').split('\n').map((l) => /^\s*(\d+)\s+(.*)$/.exec(l)).filter(Boolean).map((m) => ({ pid: Number(m[1]), cmd: m[2] }));
  } catch { return []; }
};
const slashed = (s) => s.replaceAll('\\', '/').toLowerCase();
// A kit tool's name is shared by every session's waiters and gates, so it never identifies one agent's work.
const KIT_TOOLS = new Set((() => { try { return readdirSync(new URL('.', import.meta.url)); } catch { return []; } })().map((f) => f.toLowerCase()));
const kitTool = (t) => KIT_TOOLS.has(t.split('/').pop());
// Paths and file names inside the commands the agent launched in the background, from its transcript.
const backgroundNeedles = (metaFile) => {
  const file = metaFile.replace(/\.meta\.json$/, '.jsonl');
  const needles = new Set();
  for (const line of linesOf(file)) {
    if (!line.includes('"Bash"') && !line.includes('"PowerShell"')) continue;
    let entry; try { entry = JSON.parse(line); } catch { continue; }
    for (const part of Array.isArray(entry?.message?.content) ? entry.message.content : []) {
      const cmd = part?.input?.command;
      if (part?.type !== 'tool_use' || typeof cmd !== 'string') continue;
      if (!(part.input.run_in_background === true || /\bnohup\b|\bstart\s+\/b\b|\bStart-Process\b|\s&\s*(\)|$)/m.test(cmd))) continue;
      for (const t of slashed(cmd).match(/[\w.:~@%+-]*\/[\w.:~@%+\/-]{3,}|[\w-]{3,}\.(?:py|mjs|js|cjs|sh|ps1|blend|exe|log)\b/g) ?? []) {
        if (t.length >= 8 && t !== '/dev/null' && !kitTool(t)) needles.add(t);
      }
    }
  }
  return [...needles];
};
const backgroundWork = (metaFile) => {
  let needles;
  try { needles = backgroundNeedles(metaFile); } catch { return []; }
  if (!needles.length) return [];
  const mine = new Set([process.pid, process.ppid]);
  return liveProcesses().filter((p) => !mine.has(p.pid) && needles.some((n) => slashed(p.cmd).includes(n)));
};
const finished = (file) => {
  try { return JSON.parse(readFileSync(file, 'utf8')).finished === true; } catch { return false; }
};

// Each thing waited on: `poll()` returns null while it runs, or `{ code, line }` when it is done (0 as expected, 1 bad).
const targets = [];

for (const raw of agents) {
  const id = raw.replace(/^agent-/, '');
  if (!/^[\w.-]+$/.test(id)) usage(`${raw} is not an agent id`);
  targets.push({
    name: `agent ${id}`,
    poll: () => {
      const file = metaOf(id);
      if (!file) {
        console.error(`no meta.json for agent ${id} under ${join(home, 'projects')}: the id is not a background subagent of this machine (check the agentId its launch returned)`);
        process.exit(3);
      }
      if (!finished(file)) return null;
      const work = backgroundWork(file);
      if (!work.length) return { code: 0, line: `agent ${id} finished after ${elapsed()} s` };
      const brief = (cmd) => {
        const short = cmd.replace(/^"?[^"]*[\\/]([^\\/"]+)"?(\s|$)/, '$1$2');
        return short.length > 120 ? `${short.slice(0, 40)}...${short.slice(-75)}` : short;
      };
      const shown = work.slice(0, 5).map((p) => `${p.pid} ${brief(p.cmd)}`).join('; ');
      return { code: 0, line: `agent ${id} finished after ${elapsed()} s, background work still running: ${shown}${work.length > 5 ? `; and ${work.length - 5} more` : ''} (matched by the paths of its background commands; remote jobs, containers and children that share nothing with their launcher are not visible)` };
    },
    over: () => `agent ${id} has not finished`,
    dead: () => { const file = metaOf(id); return file ? agentDead(file) : false; },
  });
}

if (agents.length && !args.length && (untilText !== null || failText !== null)) usage('--until and --fail need a log');
if (args.length || !agents.length) {
  const [log, ...extra] = args;
  if (!log || extra.length) usage('exactly one log file is expected');
  // Only an agent's output file is known to stay at 0 bytes whatever happens; a suite or a build may write its log at the end.
  const agentOutput = withAgentOutput || /(^|[\\/])tasks[\\/][^\\/]+\.output$/.test(log);
  const compile = (text, name) => {
    try { return new RegExp(text, `m${ignoreCase ? 'i' : ''}`); } catch (e) { return usage(`${name} is not a regular expression (${e.message}). On Windows cmd cuts a \`|\` even inside quotes and leaves half of it: repeat the flag for each alternative, \`${name} PASS ${name} FAIL\``); }
  };
  const until = untilText === null ? null : compile(untilText, '--until');
  const fail = failText === null ? null : compile(failText, '--fail');
  // The last 4 MB of the log: a build log can be large, and what decides is at its end.
  const TAIL = 4 << 20;
  const read = () => {
    if (!existsSync(log)) return '';
    const size = statSync(log).size;
    const fd = openSync(log, 'r');
    try {
      const length = Math.min(size, TAIL);
      const buffer = Buffer.alloc(length);
      readSync(fd, buffer, 0, length, size - length);
      return buffer.toString('utf8');
    } finally {
      closeSync(fd);
    }
  };
  const lineAt = (text, match) => {
    const from = text.lastIndexOf('\n', match.index) + 1;
    const end = text.indexOf('\n', match.index + match[0].length);
    return text.slice(from, end < 0 ? text.length : end).trim();
  };
  let text = '';
  let size = -1;
  let grew = Date.now();
  let warned = false;
  // A log last written well before the wait began, whose lines already decide the wait, holds an earlier run's result:
  // a wait launched beside the command can start before the command truncates it. Its lines decide nothing until the
  // file is written again. A quiet log with no deciding line is a live run between outputs, and is waited on.
  const before = existsSync(log) ? statSync(log).mtimeMs : null;
  const decides = (t) => Boolean(fail?.test(t) || until?.test(t) || finalLineOf(t));
  let stale = before !== null && start - before > STALE_S * 1000 && decides(read()) ? before : null;
  targets.push({
    name: log,
    poll: () => {
      // Read after checking the process, so a line it wrote just before ending is seen.
      const dead = pid !== null && !alive(pid);
      if (stale !== null) {
        if (existsSync(log) && statSync(log).mtimeMs === stale) {
          if (Date.now() - start < APPEARS_S * 1000 || max <= APPEARS_S) return null;
          const last = read().trimEnd().split('\n').at(-1)?.slice(0, 160) || '(empty)';
          console.error(`${log} was last written ${Math.round((start - stale) / 60000)} min before this wait and nothing has written it since: it is an earlier run's result, not this one's. Its last line: ${last}`);
          process.exit(3);
        }
        stale = null;
      }
      text = read();
      const bad = fail?.exec(text);
      if (bad) return { code: 1, line: `failed after ${elapsed()} s: ${lineAt(text, bad)}` };
      const found = until?.exec(text);
      if (found) return { code: 0, line: `found after ${elapsed()} s: ${lineAt(text, found)}` };
      if (dead && !finalLineOf(text)) {
        return { code: 1, line: `process ${pid} ended after ${elapsed()} s without the expected line; last line of ${log}: ${text.trimEnd().split('\n').at(-1) || '(empty)'}` };
      }
      if (quiet) {
        const now = existsSync(log) ? statSync(log).size : 0;
        if (now !== size) { size = now; grew = Date.now(); warned = false; }
        else if (!warned && Date.now() - grew >= quiet * 60000) {
          warned = true;
          writeSync(1, `[QUIET ${clock()}] ${log} has not grown for ${quiet} min: it may be hung. Last line: ${text.trimEnd().split('\n').at(-1)?.slice(0, 160) || '(empty)'}\n`);
        }
      }
      const ended = finalLineOf(text);
      if (ended) {
        if (ended.exit !== 0) return { code: 1, line: `the tool finished with an error after ${elapsed()} s: ${ended.line}` };
        return { code: 0, line: `the tool finished (${ended.line}) after ${elapsed()} s${until ? ' but --until never matched: read the log' : ''}` };
      }
      const idle = Date.now() - start >= APPEARS_S * 1000 && max > APPEARS_S;
      if (idle && !existsSync(log)) {
        console.error(`nothing writes ${log}: to wait for a subagent launched in the background use \`node .claude/tools/wait.mjs --agent <agentId>\`; a log is for what a command writes to it`);
        process.exit(3);
      }
      if (idle && agentOutput && statSync(log).size === 0) {
        console.error(`${log} is still empty after ${APPEARS_S} s: nothing writes it. A subagent's output file stays at 0 bytes whatever it does; to wait for one use \`node .claude/tools/wait.mjs --agent <agentId>\``);
        process.exit(3);
      }
      return null;
    },
    beat: () => `${log}: ${text.trimEnd().split('\n').at(-1)?.slice(0, 160) || 'empty'}`,
    over: () => {
      const last = text.trimEnd().split('\n').slice(-5).join('\n');
      return `without ${existsSync(log) ? 'a match' : 'the file'}${last ? `; last lines of ${log}:\n${last}` : ` (${log} is empty or does not exist)`}`;
    },
  });
}

const several = targets.length > 1;
let nextBeat = start + every * 60000;
const done = new Map();
for (;;) {
  for (const t of targets) {
    if (done.has(t)) continue;
    const r = t.poll();
    if (r) done.set(t, r);
  }
  if (done.size && (!several || !wantAll || done.size === targets.length)) {
    if (!several) {
      const [r] = done.values();
      console.log(r.line);
      process.exit(r.code);
    }
    const lines = [...done].map(([t, r]) => `${t.name}: ${r.line}`);
    if (wantAll) {
      console.log(lines.join('\n'));
      process.exit(Math.max(...[...done.values()].map((r) => r.code)));
    }
    const [[first, r]] = done;
    console.log(`${first.name} ended first: ${r.line}\nstill waiting: ${targets.filter((t) => !done.has(t)).map((t) => t.name).join(', ')}`);
    process.exit(r.code);
  }
  if (timedOut()) break;
  if (every && Date.now() >= nextBeat) {
    nextBeat += every * 60000;
    const where = targets.filter((t) => !done.has(t)).map((t) => t.beat?.() ?? `${t.name} running`).join(' · ');
    writeSync(1, `[HB ${clock()}] ${Math.round((Date.now() - start) / 60000)} min · ${where}\n`);
  }
  pause();
}
// A dead agent will never report: waiting again is not the advice.
const gone = targets.filter((t) => !done.has(t) && t.dead?.());
if (gone.length) {
  console.log(`timed out after ${max} s: ${gone.map((t) => t.name).join(', ')} ended without a result (it never finished and wrote nothing for ${STALE_MINUTES} min). Do not wait again: read what it wrote and relaunch it if the work is missing.`);
  process.exit(1);
}
if (!several) {
  const [t] = targets;
  console.log(`timed out after ${max} s${t.name.startsWith('agent ') ? `: ${t.over()}` : ` ${t.over()}`}\n` +
    'Not a failure: what you wait for is still running. Run the same wait again; nothing needs fixing.');
  process.exit(2);
}
const pending = targets.filter((t) => !done.has(t)).map((t) => t.name);
console.log(`timed out after ${max} s: ${done.size ? `ended: ${[...done].map(([t, r]) => `${t.name} (${r.line})`).join('; ')}; ` : ''}still running: ${pending.join(', ')}\n` +
  'Not a failure: wait again for what is still running; nothing needs fixing.');
process.exit(2);
