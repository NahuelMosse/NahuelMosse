// Command-line entry: argument handling, output, exit codes.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { USAGE, UsageError, parseArgs } from './args.mjs';
import { audit, exitCode } from './audit.mjs';
import { compareReports, readReport } from './compare.mjs';
import { ConfigError } from './config.mjs';
import { AuditError } from './browser.mjs';
import { DEFAULT_MAX_ELEMENTS } from './constants.mjs';

const toUrl = (target) => (/^[a-z][a-z0-9+.-]*:\/\//i.test(target) ? target : existsSync(target) ? pathToFileURL(resolve(target)).href : target);

const summary = (r) => {
  const n = (m) => r.elements.filter((e) => e.moments[m]?.changed.length || e.moments[m]?.pixels).length;
  const c = r.coverage;
  const skipped = Object.entries(c.skipped).map(([reason, s]) => `${s.count} ${reason}`);
  const lines = [`audited ${c.audited} of ${c.candidates} controls${skipped.length ? ` (not audited: ${skipped.join(', ')})` : ''} · mode ${r.mode}`];
  lines.push(`respond on hover ${n('hover')} · press ${n('press')} · focus ${n('focus')} · sections with entrance ${r.sections.filter((s) => s.animated).length}/${r.sections.length}${r.loafSupported ? '' : ' · long frames: not supported by this browser'}${r.cssUnreadable ? ` · ${r.cssUnreadable} stylesheets not read` : ''}`);
  if (c.inconclusive) lines.push(`inconclusive: ${c.inconclusive} check(s) could not be decided because frames were too sparse; rerun on a quieter machine, without --cpu`);
  const t = c.toggles;
  const togglesSkipped = Object.entries(t.skipped).filter(([, v]) => v > 0);
  lines.push(`toggles: ${t.probed} probed of ${t.candidates}${togglesSkipped.length ? ` (not probed: ${togglesSkipped.map(([k, v]) => `${v} ${k}`).join(', ')})` : ''}`);
  for (const [reason, s] of Object.entries(c.skipped)) if (s.examples.length) lines.push(`  NOT RUN ${reason}: ${s.examples.join('; ')}`);
  for (const note of r.notes) lines.push(`note: ${note}`);
  return lines;
};

const printText = (r, code, opts) => {
  for (const line of summary(r)) console.log(line);
  for (const f of r.findings) console.log(`${f.level.padEnd(7)} ${f.kind}${f.check ? ` (${f.check})` : ''}: ${f.element}: ${f.detail} [${f.id}]`);
  if (r.baselined.length) console.log(`${r.baselined.length} finding(s) already in the baseline`);
  for (const s of r.suppressed) console.log(`suppressed ${s.kind}: ${s.element} [${s.id}]: ${s.reason}`);
  if (r.sheets.length) console.log(`contact sheets: ${r.sheets.join(', ')}`);
  console.log(`report: ${join(r.out, 'report.json')}`);
  const failing = r.findings.filter((f) => f.kind !== 'inconclusive' && (f.level === 'error' || (opts.strict && f.level === 'warning')));
  if (r.coverage.audited === 0) console.log('NOT AUDITED: no control was audited, so there is no result (exit 2)');
  else if (r.coverage.late > 0) console.log(`INCOMPLETE: ${r.coverage.late} controls appeared after the audit started, so they were not audited; re-run with --wait-for <selector> (exit 2)`);
  else if (code === 2) console.log(`coverage ${r.coverage.audited}/${r.coverage.candidates} is below --min-coverage ${opts.minCoverage} (exit 2)`);
  else console.log(failing.length ? `${failing.length} to fix, or suppress in the config with a reason (${r.findings.length - failing.length} others do not fail)` : `clean: ${r.findings.length} non-failing finding(s)`);
};

const runCompare = (argv) => {
  if (argv.length !== 2) throw new UsageError('compare needs <ref.json> <mine.json>');
  const c = compareReports(readReport(argv[0]), readReport(argv[1]));
  for (const l of c.lines) console.log(l);
  for (const f of c.added) console.log(`new in mine: ${f.kind}: ${f.element} [${f.id}]`);
  for (const f of c.gone) console.log(`gone from mine: ${f.kind}: ${f.element} [${f.id}]`);
  console.log(`${c.differ} of ${c.total} differ`);
  return 0;
};

// Returns the exit code.
export const main = async (argv) => {
  try {
    if (argv[0] === 'compare') return runCompare(argv.slice(1));
    const { opts, positional } = parseArgs(argv);
    if (opts.help) { console.log(USAGE); return 0; }
    if (positional.length !== 1) throw new UsageError(positional.length ? `expected one url or file, got ${positional.length}` : 'missing <url|file> (see --help)');
    const report = await audit(toUrl(positional[0]), { ...opts, max: opts.max ?? DEFAULT_MAX_ELEMENTS });
    const code = exitCode(report, { strict: opts.strict, minCoverage: opts.minCoverage });
    if (opts.json) console.log(JSON.stringify(report, null, 1));
    else printText(report, code, opts);
    return code;
  } catch (e) {
    if (e instanceof UsageError) { console.error(`${e.message}\n\n${USAGE}`); return 2; }
    if (e instanceof ConfigError || e instanceof AuditError) { console.error(`could not run: ${e.message}`); return 2; }
    console.error(`could not run: ${e.stack ?? e.message}`);
    return 2;
  }
};
