#!/usr/bin/env node
// once.mjs <name> -- <command>
// Run from the repo root.
//
// Runs the command, unless it already passed on exactly this same code. “The same code” is the
// content of the repo's tracked files and of its untracked source files (`keyOf`, in card.mjs).
// If it passed, it is not repeated: it says when it passed and returns 0. If it failed, or if
// something changed, it runs again. A failure is never remembered as a result: it always runs again.
//
// It exists because the screen suite was run a dozen times per card on the same code —the
// validation, the fix, the close—, and in a real project every round is hours.
// Each record is its own file in `.validation/once/`: several running at once do not overwrite each
// other. Measured: with a single file for all of them, verify.mjs ran them in parallel and the last
// to finish erased what the others had noted. With the command saved, required.mjs checks at close
// what ran on the code being delivered.
// The output of the last real run is kept next to the record (`<record>.log`): verify.mjs shows the
// log of the run that passed, not that of an earlier one that failed. A record may carry `flaky`
// (tests that failed and then passed on re-run) or `coveredBy` (a line that another line includes):
// the run is still a pass, and the note travels with it.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchesPlaywright, takeLock } from './browser-lock.mjs';
import { keyOf, shellJoin } from './card.mjs';

export const DIR = join('.validation', 'once');

// A `node --test` with no `--test-timeout` hangs until the line's own limit when one test never ends: a hung
// test is cut at this many ms (KIT_TEST_TIMEOUT_MS) and fails with its name. A command that sets its own
// is left as it is. Only the text that is spawned changes: the record keeps the command as written.
// A test cut by its timeout leaves its open handles alive and the file never ends: the runner is asked to exit when the tests do.
const FORCE_EXIT = Number(process.versions.node.split('.')[0]) >= 22;
export const FORCE_EXIT_ABORT = /Assertion failed: !\(handle->flags & UV_HANDLE_CLOSING\)/;
export const testTimeoutMs =() => (Number(process.env.KIT_TEST_TIMEOUT_MS) > 0 ? Number(process.env.KIT_TEST_TIMEOUT_MS) : 30000);
export const withTestTimeout = (command, ms = testTimeoutMs()) => (/--test-timeout\b/.test(command) ? command
  : command.replace(/\bnode((?:\s+--?[\w-]+(?:=\S+|\s+(?!--test(?:\s|$))[^\s-]\S*)?)*?)\s+--test(?=\s|$)/g, `node$1 --test --test-timeout=${ms}${FORCE_EXIT && !/--test-force-exit/.test(command) ? ' --test-force-exit' : ''}`));

// `$APP_URL`, `${APP_URL}` and `%APP_URL%` (and the same for PORT and DATA_DIR) are replaced by their value in the
// environment before the shell sees the line: cmd.exe does not expand `$X` and sh does not expand `%X%`, so the same
// line works in both. A variable that is not set is left as written. Only the text that is spawned changes: the record
// keeps the command as written, and the port of each run does not change its key.
const APP_VARS = /\$\{(APP_URL|PORT|DATA_DIR)\}|\$(APP_URL|PORT|DATA_DIR)(?![\w])|%(APP_URL|PORT|DATA_DIR)%/g;
export const expandVars = (command, env = process.env) => command.replace(APP_VARS, (all, a, b, c) => env[a ?? b ?? c] ?? all);

// All the records, of any command, for whoever needs to know what ran.
export const records = (root) => {
  const dir = join(root, DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json'))
    .flatMap((f) => { try { return [JSON.parse(readFileSync(join(dir, f), 'utf8'))]; } catch { return []; } });
};

// One record per name and command: the same name with another command does not overwrite what
// already ran.
const stem = (name, command) => createHash('sha256').update(`${name} · ${command}`).digest('hex').slice(0, 16);
export const recordPath = (root, name, command) => join(root, DIR, `${stem(name, command)}.json`);
export const logPath = (root, name, command) => join(root, DIR, `${stem(name, command)}.log`);

export const readRecord = (root, name, command) => {
  try { return JSON.parse(readFileSync(recordPath(root, name, command), 'utf8')); } catch { return null; }
};

export const writeRecord = (root, { name, command, exit, minutes = 0, ...extra }) => {
  mkdirSync(join(root, DIR), { recursive: true });
  const record = { name, command, key: keyOf(root, command), exit, when: new Date().toISOString(), minutes: +minutes.toFixed(1), ...extra };
  writeFileSync(recordPath(root, name, command), JSON.stringify(record, null, 1));
  return record;
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sep = process.argv.indexOf('--');
  const name = process.argv[2];
  const command = sep > 0 ? shellJoin(process.argv.slice(sep + 1)) : '';
  if (!name || !command) {
    console.error('usage: node once.mjs <name> -- <command>');
    process.exit(2);
  }

  const root = process.cwd();
  const previous = readRecord(root, name, command);
  if (!process.env.ONCE_FRESH && previous?.key === keyOf(root, command) && previous.exit === 0) {
    const note = previous.flaky?.length ? ` — passed with flaky: ${previous.flaky.map((f) => `${f.test} (${f.failed}/3)`).join(', ')}` : '';
    console.log(`${name}: already passed on this same code (${previous.when}) — not repeated.${note}`);
    process.exit(0);
  }

  // A browser run marks itself while it lasts (browser-lock.mjs): another one would erase its `test-results/`.
  const releaseLock = launchesPlaywright(command, root) ? takeLock(root, command) : () => {};
  const start = Date.now();
  mkdirSync(join(root, DIR), { recursive: true });
  const log = createWriteStream(logPath(root, name, command));
  const spawned = expandVars(withTestTimeout(command));
  let seen = '';
  const p = spawn(spawned, { shell: true, stdio: ['inherit', 'pipe', 'pipe'] });
  p.stdout.on('data', (d) => { process.stdout.write(d); log.write(d); seen += d; });
  p.stderr.on('data', (d) => { process.stderr.write(d); log.write(d); seen += d; });
  let exit = await new Promise((done) => { p.on('close', (c) => done(c ?? 1)); p.on('error', () => done(1)); });
  if (exit !== 0 && FORCE_EXIT_ABORT.test(seen)) {
    // Node 24 on Windows aborts at the forced exit while fetch keeps a connection alive (UV_HANDLE_CLOSING), after
    // the tests passed: the runtime's failure, not the code's. The same run without the forced exit decides; the
    // test timeout still cuts a hung test, and the line's own limit the rest.
    const again = expandVars(withTestTimeout(command).replace(/\s--test-force-exit(?=\s|$)/g, ''));
    const note = `\n[once] the runtime aborted at the forced exit (UV_HANDLE_CLOSING: a connection fetch keeps alive, on Windows); run again without --test-force-exit; the test that leaves it open closes its server with server.closeAllConnections() before server.close()\n`;
    process.stdout.write(note); log.write(note); seen += note;
    const q = spawn(again, { shell: true, stdio: ['inherit', 'pipe', 'pipe'] });
    q.stdout.on('data', (d) => { process.stdout.write(d); log.write(d); seen += d; });
    q.stderr.on('data', (d) => { process.stderr.write(d); log.write(d); seen += d; });
    exit = await new Promise((done) => { q.on('close', (c) => done(c ?? 1)); q.on('error', () => done(1)); });
  }
  releaseLock();
  const minutes = (Date.now() - start) / 60000;
  const record = writeRecord(root, { name, command, exit, minutes });
  const hung = withTestTimeout(command) !== command && /timed out after \d+ms/.test(seen);
  const summary = `${hung ? `${name}: a test timed out after ${testTimeoutMs() / 1000} s (--test-timeout, KIT_TEST_TIMEOUT_MS)\n` : ''}${name}: exit ${exit} in ${record.minutes} min\n`;
  process.stdout.write(summary);
  log.end(summary);
  await new Promise((done) => log.on('close', done));
  process.exit(exit);
}
