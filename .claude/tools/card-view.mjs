#!/usr/bin/env node
// card-view.mjs <card-dir> [S<n> T<n> ASM-NN …] [--l1] — card.md as a builder reads it: every section, with `L1` of the Log
// (the verbatim requirement) folded to its size unless `--l1`, and, given IDs, only those specs, assumptions and tasks (an
// assumption that names a given spec comes with it). The Gate, the Look and the rest of the Log are always whole.
// Measured: L1 was 50k of the 90k characters of a real card, and builders read card.md whole 125 times (1M characters).
// Exits 0 with the view, 2 with no card.md.
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readCard } from './card-doc.mjs';

const ITEM = /^\s*[-*]\s+/;
const idOf = (line) => line.replace(ITEM, '').match(/^(?:[A-Z][A-Z0-9]*-\d+[A-Za-z0-9]*-)?(S\d+|T\d+|ASM-\d+)\b/)?.[1];

// The items of a section (a `- ` line and the indented lines under it), kept when `keep` says so; prose lines stay.
const filterItems = (body, keep) => {
  const out = [];
  let keeping = true;
  for (const line of body.split('\n')) {
    if (ITEM.test(line) && !/^\s{2,}/.test(line)) keeping = keep(line);
    else if (!/^\s/.test(line)) keeping = true;
    if (keeping) out.push(line);
  }
  return out.join('\n');
};

export const cardView = (doc, ids = [], { l1 = false } = {}) => {
  const [head, ...rest] = doc.split(/^(?=## Log\b)/m);
  let top = head;
  if (ids.length) {
    const wanted = new Set(ids.map((id) => id.match(/(S\d+|T\d+|ASM-\d+)$/)?.[1] ?? id));
    const keep = (line) => {
      const id = idOf(line);
      if (!id) return true;
      if (wanted.has(id)) return true;
      return id.startsWith('ASM-') && [...line.matchAll(/\bS\d+\b/g)].some((m) => wanted.has(m[0]));
    };
    top = head.split(/^(?=## )/m).map((section) => {
      const name = section.match(/^## (\S+)/)?.[1];
      if (name !== 'Specs' && name !== 'Tasks') return section;
      const [title, ...body] = section.split('\n');
      return `${title}\n${filterItems(body.join('\n'), keep)}`;
    }).join('');
  }
  if (!rest.length) return top;
  const log = rest.join('');
  if (l1) return top + log;
  const start = log.search(/^\s*[-*]?\s*L1\b/m);
  if (start < 0) return top + log;
  const after = log.slice(start);
  const next = after.slice(1).search(/^\s*[-*]?\s*L(?!1\b)\d+\b/m);
  const requirement = next < 0 ? after : after.slice(0, next + 1);
  const folded = `- L1 · (the verbatim requirement, ${requirement.length} characters: \`--l1\` prints it)\n`;
  return top + log.slice(0, start) + folded + after.slice(requirement.length);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const l1 = args.includes('--l1');
  const [dir, ...ids] = args.filter((a) => a !== '--l1');
  const doc = dir && readCard(isAbsolute(dir) ? dir : resolve(process.cwd(), dir));
  if (!doc) {
    console.error('usage: node .claude/tools/card-view.mjs specs/<card> [S<n> T<n> ASM-NN …] [--l1] — run where specs/<card>/card.md is');
    process.exit(2);
  }
  process.stdout.write(cardView(doc, ids.flatMap((i) => i.split(',')).filter(Boolean), { l1 }));
}
