// Runs one hook inside a worker thread of hook-dispatch.mjs: gives it the call it would have read from
// its own stdin and imports it. The hook's `process.exit` ends this thread with its code, and what it
// writes to stdout and stderr is collected by the dispatcher.
// A thread blocked in a spawnSync cannot be stopped from outside, so every child process the hook starts gets the time
// left before the hook's deadline as its own `timeout`; a child killed by it ends the hook with exit 2, naming the deadline.
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { workerData } from 'node:worker_threads';
import { feedStdin } from './card.mjs';

const { name, seconds, deadlineAt } = workerData;
if (Number.isFinite(deadlineAt)) {
  const expired = () => {
    process.stderr.write(`The hook ${name} did not finish in ${seconds} s (deadline): a process it started was killed. It blocks when in doubt: retry.\n`);
    process.exit(2);
  };
  const timeoutOf = (args) => {
    const left = Math.max(1, deadlineAt - Date.now());
    const at = args.findLastIndex((a) => a && typeof a === 'object' && !Array.isArray(a));
    if (at < 0) return [...args, { timeout: left, killSignal: 'SIGKILL' }];
    const own = Number(args[at].timeout);
    args[at] = { ...args[at], timeout: own > 0 ? Math.min(own, left) : left, killSignal: args[at].killSignal ?? 'SIGKILL' };
    return args;
  };
  const original = { spawnSync: childProcess.spawnSync, execFileSync: childProcess.execFileSync, execSync: childProcess.execSync };
  childProcess.spawnSync = (...args) => {
    const r = original.spawnSync(...timeoutOf(args));
    if (r.error?.code === 'ETIMEDOUT' && Date.now() >= deadlineAt - 50) expired();
    return r;
  };
  for (const fn of ['execFileSync', 'execSync']) {
    childProcess[fn] = (...args) => {
      try { return original[fn](...timeoutOf(args)); } catch (e) {
        if (e?.code === 'ETIMEDOUT' && Date.now() >= deadlineAt - 50) expired();
        throw e;
      }
    };
  }
  syncBuiltinESMExports();
}

feedStdin(workerData.raw);
await import(workerData.hook);
