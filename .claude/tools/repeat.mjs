#!/usr/bin/env node
// repeat.mjs <n> -- <command…> — runs a command n times in a row and fails if any run fails.
//
// It is the `stable:` line of a stack whose runner has no repeat flag: `node --test a.test.mjs a.test.mjs
// a.test.mjs` runs the file once, because the runner de-duplicates its arguments. Playwright has
// `--repeat-each=3`; with `node --test` the plan writes
// `stable: node .claude/tools/repeat.mjs 3 -- node --test --test-concurrency=1 <files>`.
// Each run prints `repeat: run i/n`; it stops at the first one that fails and exits with that command's code
// (1 if it died on a signal); when all pass it prints `repeat: n/n passed` and exits 0. Usage errors: 2.
import { spawnSync } from 'node:child_process';
import { endsWithLine } from './final-line.mjs';

endsWithLine('repeat');
const MAX = 50;
const args = process.argv.slice(2);
const n = Number(args[0]);
if (args[1] !== '--' || !Number.isInteger(n) || n < 1 || n > MAX || args.length < 3) {
  console.error(`usage: node repeat.mjs <n, 1 to ${MAX}> -- <command…>`);
  process.exit(2);
}
const [program, ...rest] = args.slice(2);
for (let i = 1; i <= n; i++) {
  console.log(`repeat: run ${i}/${n}`);
  // On Windows npx, npm and the like are .cmd files, which only a shell starts; anything else is started directly.
  const r = spawnSync(program, rest, { stdio: 'inherit', shell: process.platform === 'win32' && /^(npx|npm|pnpm|yarn)$/i.test(program) });
  if (r.error) {
    console.error(`repeat: could not start ${program}: ${r.error.message}`);
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(`repeat: run ${i}/${n} failed (${r.status === null ? `signal ${r.signal}` : `exit ${r.status}`}); ${i - 1} of ${n} passed before it`);
    process.exit(r.status || 1);
  }
}
console.log(`repeat: ${n}/${n} passed`);
