// An `OUT-NN` is a code defect the card did not touch. If it points at something the card modified
// —a changed line, a function with some changed line, or a call to a function the card changed—, or
// at a file the card created, it is not out of scope: it belongs to the card. Measured: two runs
// modified the function that builds the header of every screen and left as OUT what that function
// did wrong. The rule was written and was not enough.
// An OUT describes a defect that was already there: its `file:line` —or `file:from-to`— refers to
// the code as it was when the card started.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { git } from './card.mjs';

const FUNCTION_START = /^(\s*)(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function\s*\*?\s*([\w$]+)\s*\(|(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[\w$]+\s*=>)|def\s+(\w+)|func\s+(?:\([^)]*\)\s*)?(\w+))/;

// Where a function ends: in Python, at the next line with its indentation or less; elsewhere, where
// the brace it opened closes. Strings and comments are ignored roughly, which is enough not to cut a
// function short because of a brace inside a text.
const endOf = (lines, i, indent, isPython) => {
  if (isPython) {
    let j = i + 1;
    while (j < lines.length && (!lines[j].trim() || lines[j].match(/^\s*/)[0].length > indent)) j++;
    return j;
  }
  let depth = 0;
  let opened = false;
  for (let j = i; j < lines.length; j++) {
    const clean = lines[j].replace(/\/\/.*$/, '').replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '');
    for (const c of clean) {
      if (c === '{') { depth++; opened = true; }
      if (c === '}') depth--;
    }
    if (opened && depth <= 0) return j + 1;
  }
  return lines.length;
};

const functionsOf = (lines) => lines.flatMap((l, i) => {
  const m = l.match(FUNCTION_START);
  if (!m) return [];
  const isPython = Boolean(m[4]);
  return [{ from: i + 1, to: endOf(lines, i, m[1].length, isPython), name: m[2] ?? m[3] ?? m[4] ?? m[5] }];
});

// The lines of the earlier code that the card changed or deleted, and those next to which it inserted.
const touchedLines = (root, base, file) => {
  const r = git(root, ['diff', '-U0', base, '--', file]);
  // A diff that failed says nothing about the lines: null, never an empty set that clears every OUT.
  if (r.status !== 0) return null;
  const d = r.stdout ?? '';
  const touched = new Set();
  for (const [, start, count] of d.matchAll(/^@@ -(\d+)(?:,(\d+))? \+\S+ @@/gm)) {
    if (count === '0') { touched.add(+start); touched.add(+start + 1); continue; }
    for (let i = 0; i < (count === undefined ? 1 : +count); i++) touched.add(+start + i);
  }
  return touched;
};

export const outOfScopeThatBelongToTheCard = (root, base, cardDir, touchedFiles) => {
  // The OUT lines live in ambiguities.md and in the `## Log` of card.md: both are read.
  const logs = [join(cardDir, 'ambiguities.md'), join(cardDir, 'card.md')].filter((p) => existsSync(p));
  if (!logs.length) return [];
  const problems = [];
  const seen = new Set();
  const lines = logs.flatMap((p) => readFileSync(p, 'utf8').split('\n'));
  // The log is append-only: an OUT that stopped being one is not deleted, it is withdrawn with an
  // event `<ID>-OUT-NN · <date> · withdrawn · <reason>`.
  const withdrawn = new Set(lines.map((l) => l.match(/\b([A-Z]+-\d+-OUT-\d+)\s*·[^·]*·\s*withdrawn\b/i)?.[1]).filter(Boolean));
  for (const line of lines) {
    const m = line.match(/\b([A-Z]+-\d+-OUT-\d+)\b.*?\s([\w./\\-]+\.\w+):(\d+)(?:\s*[-–]\s*(\d+))?/);
    if (!m || withdrawn.has(m[1]) || seen.has(m[1])) continue;
    seen.add(m[1]);
    const [, id, raw, from, to] = m;
    const file = raw.replaceAll('\\', '/').replace(/^\.\//, '');
    if (!touchedFiles.includes(file)) continue;
    const label = `${id} (${file}:${from}${to ? `-${to}` : ''})`;
    const before = git(root, ['show', `${base}:${file}`]);
    if (before.status !== 0) {
      problems.push(`${label} is not out of scope: the card created the file · write in ambiguities.md \`${id} · ${new Date().toISOString().slice(0, 10)} · withdrawn · the card created ${file}: the defect is fixed in this card\` and fix it`);
      continue;
    }
    const oldLines = before.stdout.split('\n');
    const range = [+from, +(to ?? from)];
    const touched = touchedLines(root, base, file);
    if (!touched) {
      problems.push(`${label} could not run: \`git diff ${base} -- ${file}\` failed, so whether the card touched it is unknown · close: make the diff run`);
      continue;
    }
    const functions = functionsOf(oldLines);
    const modified = (f) => [...touched].some((n) => n >= f.from && n <= f.to);

    const changed = [...touched].find((n) => n >= range[0] && n <= range[1]);
    const containing = functions.filter((f) => f.from <= range[0] && f.to >= range[1] && modified(f))
      .sort((a, b) => (a.to - a.from) - (b.to - b.from))[0];
    const text = oldLines.slice(range[0] - 1, range[1]).join('\n');
    const call = functions.find((f) => f.name && modified(f) && new RegExp(`\\b${f.name}\\s*\\(`).test(text));
    const reason = changed ? `the card changed line ${changed}`
      : containing ? `it is inside ${containing.name ?? 'a function'}(), which the card modified`
      : call ? `it uses ${call.name}(), which the card modified` : null;
    if (reason) problems.push(`${label} is not out of scope: ${reason} · write in ambiguities.md \`${id} · ${new Date().toISOString().slice(0, 10)} · withdrawn · the card now changes ${file}:${from}: the defect is fixed in this card\` and fix it`);
  }
  return problems;
};
