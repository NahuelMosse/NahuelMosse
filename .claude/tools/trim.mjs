#!/usr/bin/env node
// trim.mjs <log> [exit] — what of a long output enters the context.
//
// Prints the lines that report a failure, the last lines —where runners write the summary— and the
// path of the complete log. The whole output stays in the log, to be read with Grep if something is
// missing. Short output is printed whole.
// Measured: between 26 and 42 commands per card brought 6 to 20 thousand tokens into the main thread,
// re-read on every request that followed.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHORT = 60;
const TAIL = 15;
const FAILURE = /\b(fail(ed|ing|s)?|error|errors|exception|traceback|panic|assert(ion)?|expected|received|timeout|timed out|not ok|survived|vulnerab)/i;
const MARK = /✖|✘|×|❌|FAIL|ERR!/;

export const trim = (text) => {
  const lines = text.replace(/\r/g, '').split('\n');
  while (lines.length && lines.at(-1) === '') lines.pop();
  if (lines.length <= SHORT) return { lines, omitted: 0 };
  const tailFrom = lines.length - TAIL;
  const keep = new Set();
  lines.forEach((l, i) => {
    if (i >= tailFrom) keep.add(i);
    else if (FAILURE.test(l) || MARK.test(l)) for (let j = Math.max(0, i - 1); j <= Math.min(tailFrom - 1, i + 2); j++) keep.add(j);
  });
  const picked = [...keep].sort((a, b) => a - b);
  const capped = picked.length > SHORT + TAIL ? [...picked.slice(0, SHORT), ...picked.slice(-TAIL)] : picked;
  const out = [];
  let last = -1;
  for (const i of capped) {
    if (i !== last + 1) out.push(`… (${i - last - 1} lines)`);
    out.push(lines[i]);
    last = i;
  }
  return { lines: out, omitted: lines.length - capped.length };
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [log, exit] = process.argv.slice(2);
  let text = '';
  try { text = readFileSync(log, 'utf8'); } catch { console.log(`(no output: ${log} does not exist)`); process.exit(0); }
  const { lines, omitted } = trim(text);
  console.log(lines.join('\n'));
  if (omitted) console.log(`\n[${omitted} lines left out · exit ${exit ?? '?'} · complete output: ${log}]`);
}
