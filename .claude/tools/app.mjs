#!/usr/bin/env node
// app.mjs up|down|status|probe — one running app for the gate and the judge, and a shared probe of it.
//
// Measured: six agents of one verdict lap each started their own app, their own browser and their own data, and the
// setup errors of each cost more than the judgment. Now the app is started once and `APP_URL` is shared.
//
// The `## Gate` block of card.md says how, one line each (verify.mjs does not run them as checks):
//   app:  <command that starts the app>   it receives PORT (a free one) and DATA_DIR (a new folder
//                                         under .validation/app/) in its environment
//   seed: <command>                       optional; runs once after the app answers, with APP_URL, PORT
//                                         and DATA_DIR
// up:     nothing to do if the app of `.validation/app.json` lives, answers and was started from the
//         same code (the key of once.mjs); otherwise it brings the old one down by PID, starts a new one and
//         writes its pid and port to app.json at once (`starting: true`), waits up to 180 s for the port, seeds,
//         rewrites app.json without `starting` and prints `APP_URL=<url>`.
// down:   brings the app down by PID and removes app.json (the data folder stays).
// status: app.json, and whether the app lives and is up to date. Exit 0 only if both.
// probe <steps.json> [--widths 320,390,1280] [--route "POST /x=201|500|hold"] [--axe] [--watch <locator>] [--contrast "<sel>,<sel>"]
//         drives the app of app.json (Playwright from the repo or KIT_PLAYWRIGHT_ROOT) through the steps —a JSON list of
//         {goto|fill|click|press|select|wait|scroll|enter-each|type-markup} with Playwright selectors; `goto` stays inside the app— at each width, and
//         writes `.validation/probe/w<width>-step<NN>.png` and `.json`: the focused element and its aria attributes, the
//         role=status/alert texts, scrollWidth against clientWidth, the animations running, axe violations with --axe,
//         and the count of each --watch locator at t=0 and +500 ms. --route answers requests of that method and path with
//         the status, or never (`hold`); repeat it per route. `--contrast` adds, per selector, the text color, the effective
//         background, size, weight, ratio and AA yes or no. `help.mjs judge` lists every flag. `--url <app url>` probes another app than the shared one and
//         `--out <folder>` writes there; `--quiet` prints nothing. It serves the gate (a `probe:` line)
//         and the judge, who uses it before writing a script of their own.
//         steps.json, one action per object (a selector is a Playwright one: css, `text=Save`, `role=button[name="Save"]`):
//           [ { "goto": "/" },
//             { "fill": "input[name=title]", "value": "Buy milk" },
//             { "click": "role=button[name=\"Add\"]" },
//             { "press": "Enter", "on": "input[name=title]" },
//             { "select": "select#status", "value": "done" },
//             { "wait": 300 } ]
//         `fill` and `select` take their text in `value`; `press` a key, to the page or to the locator in `on`; `wait`
//         milliseconds or a locator to wait for.
// Exit codes: 0 ok; 1 the app or the seed could not start (probe: no app, or a step failed); 3 the plan has no `app:` line
// (probe: 2 for a bad steps file or arguments, or no Playwright).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createServer, connect } from 'node:net';
import { join } from 'node:path';
import { currentCard, keyOf } from './card.mjs';
import { endsWithLine } from './final-line.mjs';
import { fencedBlocks } from './card-doc.mjs';

// KIT_APP_START_TIMEOUT_S raises it on a loaded machine, where a cold Python import alone can pass 60 s.
const START_TIMEOUT_MS = (Number(process.env.KIT_APP_START_TIMEOUT_S) > 0 ? Number(process.env.KIT_APP_START_TIMEOUT_S) : 180) * 1000;
const POLL_MS = 250;
const root = process.cwd();
const stateFile = join(root, '.validation', 'app.json');
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

const readState = () => { try { return JSON.parse(readFileSync(stateFile, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const answers = (port) => new Promise((done) => {
  const s = connect({ host: '127.0.0.1', port, timeout: 1000 });
  s.on('connect', () => { s.destroy(); done(true); });
  s.on('timeout', () => { s.destroy(); done(false); });
  s.on('error', () => done(false));
});
const freePort = () => new Promise((done, fail) => {
  const s = createServer();
  s.on('error', fail);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => done(port)); });
});
// The process tree, by PID: never by name, other agents run node too.
const killTree = (pid) => {
  if (!alive(pid)) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch {} } }
};

// On Windows a Git-sh `exec` does not replace the shell: it starts the program and the chain loses its parent, so
// `taskkill /T` on the cmd.exe never reaches it. Measured: about 20 uvicorn trees left after the verify runs of one card.
// What still listens on the app's port after its tree is killed is followed up its parents, while each was started
// after the app and is a shell or a runtime, and that top one's tree is killed: by PID, never by name.
const STRAY_SCRIPT = `
$names = 'sh.exe','bash.exe','dash.exe','cmd.exe','python.exe','pythonw.exe','py.exe','node.exe','uv.exe','uvicorn.exe','java.exe','dotnet.exe','go.exe'
$since = [datetime]::Parse($env:SDD_APP_SINCE).ToLocalTime().AddSeconds(-2)
$owner = Get-NetTCPConnection -LocalPort ([int]$env:SDD_APP_PORT) -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess
if (-not $owner) { exit 0 }
$top = Get-CimInstance Win32_Process -Filter "ProcessId=$owner"
if (-not $top -or $top.CreationDate -lt $since) { exit 0 }
while ($true) {
  $up = Get-CimInstance Win32_Process -Filter "ProcessId=$($top.ParentProcessId)"
  if (-not $up -or $names -notcontains $up.Name.ToLower() -or $up.CreationDate -lt $since) { break }
  $top = $up
}
$top.ProcessId`;
const killStray = (state) => {
  if (process.platform !== 'win32' || !state?.port || !state.startedAt) return;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', STRAY_SCRIPT], {
    encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], timeout: 30_000,
    env: { ...process.env, SDD_APP_PORT: String(state.port), SDD_APP_SINCE: state.startedAt },
  });
  const pid = Number(r.stdout?.trim());
  if (pid > 0 && pid !== process.pid) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
};

// The `app:` and `seed:` lines of the `## Gate` block of card.md (or the `## Verification` of a plan.md a repo still has).
const environmentOf = () => {
  const cardDir = currentCard(root);
  const [file, heading] = cardDir && existsSync(join(cardDir, 'card.md')) ? [join(cardDir, 'card.md'), 'Gate'] : [cardDir && join(cardDir, 'plan.md'), 'Verification'];
  const plan = file && existsSync(file) ? readFileSync(file, 'utf8') : '';
  const section = plan.split(/^## /m).find((s) => s.startsWith(heading)) ?? '';
  const block = fencedBlocks(section).join('\n');
  const line = (name) => block.split('\n').map((l) => l.trim()).find((l) => l.startsWith(`${name}:`))?.slice(name.length + 1).trim();
  return { app: line('app'), seed: line('seed') };
};
const keyFor = ({ app, seed }) => keyOf(root, [app, seed].filter(Boolean).join(' && '));

const needAppLine = (env) => {
  if (env.app) return;
  console.error('card.md has no `app:` line in its `## Gate` block. Add `app: <command>` with the command that starts the app (e.g. `app: node src/main.mjs`): it receives PORT and DATA_DIR in its environment. Optionally `seed: <command>` loads data once.');
  process.exit(3);
};

const stop = () => {
  const s = readState();
  if (s) { killTree(s.pid); killStray(s); }
  rmSync(stateFile, { force: true });
  return s;
};

// Starts the app detached, its output in `logPath`, and returns its PID. On Windows a child inherits every
// inheritable handle of its parent, including the pipe of `app.mjs up | tail`: the pipe stays open while the app
// lives and the command does not return. PowerShell's Start-Process goes through ShellExecute, which inherits
// none: the app is started from there, by PID of its shell.
const launch = (command, vars, logPath, cwd = root) => {
  const environment = { ...process.env, ...vars };
  if (process.platform !== 'win32') {
    const log = openSync(logPath, 'w');
    const child = spawn(command, { cwd, shell: true, detached: true, stdio: ['ignore', log, log], env: environment });
    closeSync(log);
    child.unref();
    return { pid: child.pid };
  }
  const script = "$p = Start-Process -FilePath cmd.exe -ArgumentList ('/d /s /c \"' + $env:SDD_APP_COMMAND + '\"') -WindowStyle Hidden -PassThru; $p.Id";
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000,
    env: { ...environment, SDD_APP_COMMAND: `${command} > "${logPath}" 2>&1` },
  });
  const pid = Number(r.stdout?.trim().split(/\s+/).pop());
  if (!pid) {
    console.error(`The app could not be started (${r.stderr?.trim() || `exit ${r.status}`}): ${command}`);
    process.exit(1);
  }
  return { pid };
};

// Starts the plan's app from `cwd` on a free port with a new data folder, waits for the port and seeds it. Returns
// `{ ok: true, url, port, pid, dataDir, stamp }`, or `{ ok: false, why, tail, logPath }` with the app already brought down.
const writeState = (state) => {
  mkdirSync(join(root, '.validation'), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state, null, 1));
};
const startApp = async ({ app, seed }, key, cwd = root) => {
  const port = await freePort();
  const stamp = Date.now();
  const dataDir = join(root, '.validation', 'app', String(stamp));
  mkdirSync(dataDir, { recursive: true });
  const logPath = `${dataDir}.log`;
  const url = `http://127.0.0.1:${port}`;
  const child = launch(app, { PORT: String(port), DATA_DIR: dataDir }, logPath, cwd);
  // The app lives detached from here on: whoever cuts `up` before it ends still finds the pid and port for `down`.
  writeState({ url, port, pid: child.pid, dataDir, key, startedAt: new Date(stamp).toISOString(), starting: true });
  const failed = (why) => {
    killTree(child.pid);
    killStray({ port, startedAt: new Date(stamp).toISOString() });
    rmSync(stateFile, { force: true });
    const tail = existsSync(logPath) ? readFileSync(logPath, 'utf8').trim().split('\n').slice(-8).join('\n') : '';
    return { ok: false, why, tail, logPath };
  };
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (!await answers(port)) {
    if (!alive(child.pid)) return failed(`The app exited before answering on port ${port}: ${app}`);
    if (Date.now() > deadline) return failed(`The app did not answer on port ${port} within ${START_TIMEOUT_MS / 1000} s (KIT_APP_START_TIMEOUT_S raises it): ${app}`);
    await pause(POLL_MS);
  }
  if (seed) {
    const r = spawnSync(seed, { cwd, shell: true, stdio: ['ignore', 2, 2], timeout: 120_000,
      env: { ...process.env, APP_URL: url, PORT: String(port), DATA_DIR: dataDir } });
    if (r.status !== 0) return failed(`The seed failed (exit ${r.status ?? r.signal}): ${seed}`);
  }
  return { ok: true, url, port, pid: child.pid, dataDir, stamp };
};

const up = async () => {
  const env = environmentOf();
  needAppLine(env);
  const key = keyFor(env);
  const current = readState();
  if (current && !current.starting && alive(current.pid) && await answers(current.port) && current.key === key) {
    console.log(`APP_URL=${current.url}`);
    return;
  }
  stop();
  const started = await startApp(env, key);
  if (!started.ok) {
    console.error(`${started.why}\n${started.tail}\nlog: ${started.logPath}`);
    process.exit(1);
  }
  const { url, port, pid, dataDir, stamp } = started;
  writeState({ url, port, pid, dataDir, key, startedAt: new Date(stamp).toISOString() });
  console.log(`APP_URL=${url}`);
};

const status = async () => {
  const s = readState();
  if (!s) { console.log('No app running: `node .claude/tools/app.mjs up` starts it.'); process.exit(1); }
  const lives = alive(s.pid) && await answers(s.port);
  const env = environmentOf();
  const fresh = env.app ? s.key === keyFor(env) : false;
  console.log(JSON.stringify(s, null, 1));
  console.log(`${lives ? 'alive' : 'not alive'}, ${fresh ? 'up to date' : 'out of date'}`);
  process.exit(lives && fresh ? 0 : 1);
};

const command = process.argv[2];
if (command === 'up') await up();
else if (command === 'down') { const s = stop(); console.log(s ? `Brought down ${s.url} (pid ${s.pid}).` : 'No app was running.'); }
else if (command === 'status') await status();
else if (command === 'probe' && !existsSync(new URL('./probe.mjs', import.meta.url))) { console.error('probe: not installed (profile web off)'); process.exit(2); }
else if (command === 'probe') { endsWithLine('probe'); process.exit(await (await import('./probe.mjs')).probe(process.argv.slice(3), root)); }
else { console.error('usage: node app.mjs up|down|status|probe'); process.exit(2); }
// The app lives on its own: the CLI must not wait for its pipes or timers.
process.exit(0);
