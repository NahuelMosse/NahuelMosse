#!/usr/bin/env node
// bar.mjs [ID…] | --lens <lens> — run from the repo root.
//
// The criteria of reference/criteria.md, without reading the whole table:
// - `bar.mjs <ID…>` prints the complete rows of those criteria;
// - `bar.mjs --lens <visual|contract|integrity|interpretation|security>` prints the complete rows of the judgment (J) and
//   running-app (A) criteria of that lens, the ones the judge answers: visual → I, V · contract → C, W · integrity → P ·
//   interpretation → R, A · security → S. A criterion of a module that is off, or that the grade leaves out, is not printed;
// - with no arguments, the grade, then one line per criterion —ID, how it is checked (T C A J) and the criterion cut at its
//   first clause—, grouped by area.
// How: T test · C command · A against the running app · J judgment. The gate (verify.mjs) answers T and C; the judge, J and A.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { active, gradeLines, ownerOf, recordedGrade } from './kit.mjs';

// ID | criterion | how | minimum grade | today | source. A table without the grade column is read as production.
const ROW = /^\| ([A-Z]\d+) \| (.+?) \| ([TCAJ](?: \+ [TCAJ])*) \| (?:(poc|mvp|production) \| )?(.*?) \| (.*?) \|$/;

export const LENS_AREAS = {
  visual: ['I', 'V'], contract: ['C', 'W'], integrity: ['P'], interpretation: ['R', 'A'], security: ['S'],
};

export const criteria = (root) => {
  const file = join(root, '.claude', 'reference', 'criteria.md');
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.match(ROW)).filter(Boolean)
    .map(([, id, text, how, grade, today, source]) => ({ id, text, how, grade: grade ?? 'production', today, source }));
};

const short = (text) => {
  const plain = text.replace(/\*\*/g, '').replace(/`/g, '');
  const cut = plain.split(/: | — |; /)[0].trim();
  return cut.length > 120 ? `${cut.slice(0, 117)}…` : cut;
};

export const compact = (list) => {
  const lines = [];
  let area = '';
  for (const c of list) {
    if (c.id[0] !== area) { area = c.id[0]; lines.push(`\n${area}`); }
    lines.push(`${c.id} ${c.how.replace(/ \+ /g, '+')} ${short(c.text)}`);
  }
  return lines.join('\n').trim();
};

// The criteria a lens answers: judgment or running-app ones in its areas, minus what a module or the grade leaves out.
export const lensCriteria = (list, lens, skipped) => {
  const areas = LENS_AREAS[lens];
  if (!areas) return null;
  return list.filter((c) => areas.includes(c.id[0]) && /[JA]/.test(c.how) && !skipped.has(c.id));
};

const row = (c, owner, exempt, grade) =>
  `${c.id} · ${c.how} · ${c.text}\n  today: ${c.today} · source: ${c.source} · module: ${owner.get(c.id) ?? 'core'} · min grade: ${c.grade}${exempt.criteria.has(c.id) ? ` (off by grade: ${grade})` : ''}`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const list = criteria(process.cwd());
  if (!list) {
    console.error('No .claude/reference/criteria.md under the current folder: run it from the repo root.');
    process.exit(2);
  }
  const args = process.argv.slice(2);
  if (args.map((a) => a.toUpperCase()).includes('--HELP')) {
    console.log('bar.mjs                 the grade and one line per criterion\nbar.mjs E3 S2           the complete rows of those criteria\nbar.mjs --lens visual   the rows the judge answers for a lens (visual, contract, integrity, interpretation, security)');
    process.exit(0);
  }
  // The criteria of a module that is off, or that the grade leaves out, are not listed.
  const { off, map, manifest, grade, exempt } = active(process.cwd());
  const owner = ownerOf(map);
  const skipped = new Set([...off.keys()].flatMap((name) => map.modules[name].criteria).concat([...exempt.criteria]));
  const lensAt = args.indexOf('--lens');
  if (lensAt >= 0) {
    const lens = args[lensAt + 1];
    const rows = lensCriteria(list, lens, skipped);
    if (!rows) {
      console.error(`Unknown lens ${lens ?? ''}: ${Object.keys(LENS_AREAS).join(', ')}`);
      process.exit(1);
    }
    console.log(rows.map((c) => row(c, owner, exempt, grade)).join('\n') || `(no criterion of the lens ${lens} applies at grade ${grade})`);
    process.exit(0);
  }
  const ids = args.map((a) => a.toUpperCase());
  if (!ids.length) {
    const lines = [...off].map(([name, o]) => `${name} · off by decision · ${o.reason}`);
    const byGrade = gradeLines(exempt);
    const set = recordedGrade(manifest) ? manifest.grade : null;
    const applicable = list.filter((c) => !skipped.has(c.id));
    console.log([
      `${applicable.length} criteria apply. Grade: ${grade}${set ? ` — ${set.reason}` : ' (default)'}`,
      '',
      compact(applicable),
      ...(lines.length ? ['', `Modules that are off:\n${lines.join('\n')}`] : []),
      ...(byGrade.length ? ['', `Off by grade:\n${byGrade.join('\n')}`] : []),
      '',
      'How: T test · C command · A against the running app · J judgment. Full row: node .claude/tools/bar.mjs <ID>…',
    ].join('\n'));
    process.exit(0);
  }
  const unknown = ids.filter((id) => !list.some((c) => c.id === id));
  for (const c of list.filter((x) => ids.includes(x.id))) console.log(row(c, owner, exempt, grade));
  if (unknown.length) {
    console.error(`Unknown: ${unknown.join(', ')}`);
    process.exit(1);
  }
}
