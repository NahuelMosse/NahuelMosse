// Report-to-report comparison: `compare <ref.json> <mine.json>` and the `--baseline` filter.
import { readFileSync } from 'node:fs';

const SIGNIFICANT_MS = 50;
const SIGNIFICANT_RATIO = 1.25;
const SIGNIFICANT_OVERSHOOT = 5;

export const readReport = (file) => {
  let report;
  try { report = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`cannot read report ${file}: ${e instanceof SyntaxError ? 'not valid JSON (content not shown)' : e.code ?? 'unreadable'}`); }
  if (report.schemaVersion !== 1) throw new Error(`${file}: unsupported schemaVersion ${report.schemaVersion} (expected 1)`);
  return report;
};

// Strongest measured move of an element at a gesture, or null.
const primary = (el, moment) => {
  const moves = (el.moments?.[moment]?.motion ?? []).flatMap((e) => e.moves.map((m) => ({ ...m, label: e.label })));
  return moves.sort((a, b) => b.durationMs - a.durationMs)[0] ?? null;
};

const declared = (el, moment) => {
  const tr = el.moments?.[moment]?.transition ?? el.transition;
  const changed = el.moments?.[moment]?.changed ?? [];
  if (!changed.length) return null;
  const i = tr?.properties?.findIndex((p) => p === 'all' || changed.some((c) => c === p || c.startsWith(`${p}-`)));
  return i >= 0 ? { duration: tr.durations[i % tr.durations.length], easing: tr.easings[i % tr.easings.length] } : null;
};

const describe = (m, d) => {
  if (m) return `${m.durationMs} ms ${m.shape}${m.overshootPct > 3 ? ` (+${m.overshootPct} % overshoot)` : ''}`;
  if (d) return `${d.duration} ms declared (${d.easing})`;
  return 'no motion';
};

const differences = (am, ad, bm, bd) => {
  if (!am && !ad && !bm && !bd) return null;
  const out = [];
  const da = am?.durationMs ?? ad?.duration ?? 0;
  const db = bm?.durationMs ?? bd?.duration ?? 0;
  if (Math.abs(db - da) >= SIGNIFICANT_MS || Math.max(da, db) / Math.max(1, Math.min(da, db)) > SIGNIFICANT_RATIO) out.push(`duration ${db - da > 0 ? '+' : ''}${db - da} ms`);
  if (am && bm && am.shape !== bm.shape) out.push(`curve ${am.shape} -> ${bm.shape}`);
  if (am && bm && Math.abs(am.overshootPct - bm.overshootPct) >= SIGNIFICANT_OVERSHOOT) out.push(`overshoot ${am.overshootPct} -> ${bm.overshootPct} %`);
  return out;
};

// One line per control present in both reports and gesture; controls are paired by label.
export const compareReports = (ref, mine) => {
  const lines = [];
  let differ = 0;
  const byLabel = new Map(mine.elements.map((e) => [e.label, e]));
  for (const a of ref.elements) {
    const b = byLabel.get(a.label);
    if (!b) continue;
    for (const moment of ['hover', 'press', 'focus']) {
      const am = primary(a, moment);
      const bm = primary(b, moment);
      const diff = differences(am, declared(a, moment), bm, declared(b, moment));
      if (!diff) continue;
      if (diff.length) differ++;
      lines.push(`${a.label} ${moment}: ref ${describe(am, declared(a, moment))} · mine ${describe(bm, declared(b, moment))} · ${diff.length ? `diff: ${diff.join(', ')}` : 'matches'}`);
    }
  }
  const refIds = new Set(ref.findings.map((f) => f.id));
  const mineIds = new Set(mine.findings.map((f) => f.id));
  const added = mine.findings.filter((f) => !refIds.has(f.id));
  const gone = ref.findings.filter((f) => !mineIds.has(f.id));
  return { lines, differ, total: lines.length, added, gone };
};

export const baselineIds = (report) => new Set([...report.findings.map((f) => f.id), ...(report.baselined ?? []).map((f) => f.id)]);
