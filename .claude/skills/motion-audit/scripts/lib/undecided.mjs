// The rows a sighting leaves when the re-measures do not reproduce it (see sightings.mjs): a jump seen in one recording is
// dropped only when a re-measure that could see that motion did not see it. Pure: no browser.
import { CONFIRM_MAJORITY, CONFIRM_RUNS } from './constants.mjs';
import { NO_COVERAGE, coverageOf, isDense, undecidedReason, undecidedSightings, unconfirmedVerdict } from './sightings.mjs';

const sparseText = (c) => `frames too sparse: median Δt ${c.median} ms, max ${c.max} ms`;

// What a gesture's recording could see of each of its motions, and the jumps seen in it.
const elementCoverage = (el) => ({ ran: true, mark: null, moves: Object.entries(el.moments ?? {}).flatMap(([moment, d]) => coverageOf(d.motion, { moment }).moves) });
const elementSaw = (el) => Object.entries(el.moments ?? {}).flatMap(([moment, d]) => d.motion.flatMap((e) => e.moves.filter((m) => m.jumps.length).map((m) => ({ moment, label: e.label, prop: m.prop }))));

// Undecided rows of a gesture's flaky aspects (`el.unconfirmed`): [{ check, key, detail }], one per sighting. `later`: the
// re-measures of the element (null where the probe did not run).
export const undecidedOf = (el, later) => {
  const out = [];
  const unconfirmed = el.unconfirmed ?? [];
  if (unconfirmed.includes('interrupt')) {
    const verdict = unconfirmedVerdict(el.interruptSightings ?? [], later.map((x) => ({ saw: x?.interrupt ?? [], coverage: x?.interruptCoverage ?? NO_COVERAGE })), { mark: true });
    if (verdict !== 'drop') out.push({ check: 'interrupt-jump', key: 'hover', detail: `hover left mid-way: ${undecidedReason(verdict, CONFIRM_RUNS)}`, cadence: el.interruptCadence });
  }
  if (unconfirmed.includes('jump')) {
    const reruns = later.map((x) => ({ saw: x ? elementSaw(x) : [], coverage: x ? elementCoverage(x) : NO_COVERAGE }));
    for (const [moment, d] of Object.entries(el.moments)) for (const e of d.motion) for (const m of e.moves) {
      if (!m.jumps.length) continue;
      const verdict = unconfirmedVerdict([{ moment, label: e.label, prop: m.prop, dense: isDense(m.cadence) }], reruns);
      if (verdict !== 'drop') out.push({ check: 'jump', key: `${moment} ${e.label} ${m.prop}`, detail: `${moment}: ${e.label} ${m.prop} ${undecidedReason(verdict, CONFIRM_RUNS)}`, cadence: m.cadence });
    }
  }
  // A step too coarse to judge (unresolved) in a gesture: ruled out only by a re-measure that could see that motion and saw no jump.
  const reruns = later.map((x) => ({ saw: x ? elementSaw(x) : [], coverage: x ? elementCoverage(x) : NO_COVERAGE }));
  for (const [moment, d] of Object.entries(el.moments)) for (const e of d.motion) for (const m of e.moves) {
    if (!(m.unresolved > 0) || m.jumps.length) continue;
    const verdict = unconfirmedVerdict([{ moment, label: e.label, prop: m.prop, dense: false }], reruns);
    const key = `${moment} ${e.label} ${m.prop}`;
    if (verdict !== 'drop' && !out.some((o) => o.key === key)) out.push({ check: 'jump', key, detail: `${moment}: ${e.label} ${m.prop} has a step the frames were too coarse to judge: ${undecidedReason(verdict, CONFIRM_RUNS)}`, cadence: m.cadence });
  }
  return out;
};

// Inconclusive rows of the --click check. `first`: the first measurement (before any flaky aspect was dropped);
// `unconfirmed`: the aspects the majority vote dropped; `reruns`: the re-measures (a missing target counts as none).
export const clickRows = (label, first, unconfirmed, reruns) => {
  const rows = [];
  const row = (check, detail, cadence) => rows.push({ kind: 'inconclusive', check, element: label, key: 'click', detail, cadence });
  const asReruns = (pick) => reruns.map((x) => ({ saw: x[pick] ?? [], coverage: x.coverage ?? NO_COVERAGE }));
  const dropped = (name, list) => list.length > 0 && unconfirmed.includes(name);
  if (!(first.jumps.length > 0 && !dropped('jump', first.jumps))) {
    if (first.unsure) row('jump', `a step in the transition could be a jump: ${sparseText(first.unsure)}`, first.unsure);
    else if (dropped('jump', first.jumps) && first.jumpSightings.length) {
      const left = undecidedSightings(first.jumpSightings, asReruns('jumps'));
      const cause = left.find((x) => x.cause === 'flake') ?? left[0];
      if (cause) row('jump', `a step in the transition could be a jump: ${undecidedReason(cause.cause, CONFIRM_RUNS)}`, cause.sighting.cadence);
    }
  }
  if (!(first.interrupt.length > 0 && !dropped('interrupt', first.interrupt))) {
    if (first.interruptUnsure) row('interrupt-jump', `second click: the animation restarted but the value cannot be followed: ${sparseText(first.interruptUnsure)}`, first.interruptUnsure);
    else if (dropped('interrupt', first.interrupt)) {
      const left = undecidedSightings(first.interruptSightings, asReruns('interrupt'), { mark: true });
      const cause = left.find((x) => x.cause === 'flake') ?? left[0];
      if (cause) row('interrupt-jump', `second click: ${undecidedReason(cause.cause, CONFIRM_RUNS)}`, cause.sighting.cadence);
    }
  }
  return rows;
};

// The re-measure the majority vote asks of the --click check: the measurement again with its retries off (two presses, four with
// --interrupt), recorded in `reruns` as what the sighting rules read.
export const clickRerun = (measure, reruns) => async () => {
  const again = await measure(0);
  reruns.push(again.missing ? { jumps: [], interrupt: [] } : again);
  return again.missing ? null : again;
};

// A toggle whose reversal showed a restart in one probe: kept when most probes agree, otherwise dropped (`undecided` is
// null) or left undecided ('flake' | 'unseen'). `again`: the other probes; one that did not run has no jumps and no coverage.
export const confirmToggle = (r, again) => {
  if (1 + again.filter((x) => x.jumps?.length).length >= CONFIRM_MAJORITY) return r;
  const verdict = unconfirmedVerdict(r.sightings ?? [], again.map((x) => ({ saw: x.jumps ?? [], coverage: x.coverage ?? NO_COVERAGE })), { mark: true });
  return { ...r, jumps: [], undecided: verdict === 'drop' ? null : verdict };
};

export const toggleRow = (r) => {
  if (r.jumps.length || !(r.undecided || r.unsure)) return null;
  const why = r.unsure ? `an animation restart cannot be followed: ${sparseText(r.unsure)}` : undecidedReason(r.undecided, CONFIRM_RUNS);
  return { kind: 'inconclusive', check: 'not-interruptible', element: r.label, key: 'toggle', detail: `reversed part-way through its motion: ${why}`, cadence: r.unsure ?? r.sightings?.[0]?.cadence ?? r.cadence };
};
