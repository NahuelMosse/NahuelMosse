// What becomes of a sighting (a jump seen in one recording) that the re-measures do not reproduce: it is dropped only
// when a re-measure that could see that very motion did not see it; otherwise it stays visible as undecided. Pure.
import { FINE_SAMPLING_MS, JUMP_MAX_DT_MS, DENSE_MAX_MS, DENSE_MEDIAN_MS, SERIES_JUMP_MAX_DT_MS, SIGHTING_MIN_SAMPLES } from './constants.mjs';

// The sampling a recording gave each motion in it. `moved`: [{ label, moves: [{ prop, samples, unresolved, cadence }] }].
// `mark`: { median, max } of the intervals around the second gesture, for the checks that depend on one; null when
// there was none. `ran` is false when the probe did not run (it threw, the control left the page).
export const coverageOf = (moved, { ran = true, mark = null, moment = '' } = {}) => ({
  ran,
  mark,
  moves: moved.flatMap((e) => e.moves.map((m) => ({ moment, label: e.label, prop: m.prop, samples: m.samples, unresolved: m.unresolved, maxDt: m.cadence.max }))),
});
export const NO_COVERAGE = { ran: false, mark: null, moves: [] };

// The worst of two coverages of the same motion (fewest samples, any unresolved step, longest interval).
export const mergeCoverage = (a, b) => {
  const moves = [...a.moves];
  for (const m of b.moves) {
    const i = moves.findIndex((x) => sameMotion(x, m));
    if (i < 0) moves.push(m);
    else moves[i] = { ...moves[i], samples: Math.min(moves[i].samples, m.samples), unresolved: moves[i].unresolved || m.unresolved, maxDt: Math.max(moves[i].maxDt, m.maxDt) };
  }
  const mark = a.mark && b.mark ? { median: Math.max(a.mark.median, b.mark.median), max: Math.max(a.mark.max, b.mark.max) } : a.mark ?? b.mark;
  return { ran: a.ran && b.ran, mark, moves };
};

export const sameMotion = (a, b) => a.label === b.label && a.prop === b.prop && (a.moment ?? '') === (b.moment ?? '');

// Whether a recording could have shown the sighting's jump: the very motion is in it (same element label, property and
// gesture), judged on enough samples, with no step left unresolved and no interval too long to bound a velocity.
// For a check that depends on a second gesture (`mark`) the probe must have run, and the frames around that gesture
// must follow a value frame by frame.
export const canSee = (coverage, sighting, { mark = false } = {}) => {
  if (!coverage?.ran) return false;
  const m = coverage.moves.find((x) => sameMotion(x, sighting));
  if (!m || m.samples < SIGHTING_MIN_SAMPLES || m.unresolved || m.maxDt > SERIES_JUMP_MAX_DT_MS) return false;
  if (!mark) return true;
  return Boolean(coverage.mark) && coverage.mark.median <= FINE_SAMPLING_MS && coverage.mark.max <= JUMP_MAX_DT_MS;
};

export const isDense = (cadence) => Boolean(cadence) && cadence.median <= DENSE_MEDIAN_MS && cadence.max <= DENSE_MAX_MS;

// The sightings a re-measure did not rule out, each with why: 'flake' (a clear step in frame-by-frame sampling that the
// re-measures did not reproduce) or 'unseen' (no re-measure could judge that motion). `sightings`: [{ label, prop, moment?, dense,
// cadence? }] (the cadence is that of the intervals around the sighting); `reruns`: [{ saw: [{ label, prop, moment? }], coverage }].
export const undecidedSightings = (sightings, reruns, opts = {}) => sightings.flatMap((s) => {
  if (s.dense) return [{ sighting: s, cause: 'flake' }];
  const ruledOut = reruns.some((r) => !(r.saw ?? []).some((x) => sameMotion(x, s)) && canSee(r.coverage, s, opts));
  return ruledOut ? [] : [{ sighting: s, cause: 'unseen' }];
});

// 'drop' when every sighting was ruled out; otherwise the cause of the first that was not ('flake' before 'unseen').
export const unconfirmedVerdict = (sightings, reruns, opts = {}) => {
  const left = undecidedSightings(sightings, reruns, opts);
  return left.find((x) => x.cause === 'flake')?.cause ?? left[0]?.cause ?? 'drop';
};

// The reason an undecided row gives, by cause.
export const undecidedReason = (cause, runs) => (cause === 'flake'
  ? `seen in 1 of ${runs} recordings, not reproduced`
  : `seen in 1 of ${runs} recordings; the others could not judge that motion (frames too sparse, or it was not there)`);

// The CSS properties whose declared transition shows up as a measured property (a transform moves the box, so it also
// moves the measured position and size).
const TRANSFORM = ['transform', 'translate', 'scale', 'rotate'];
const MEASURED_BY = {
  translateX: TRANSFORM, translateY: TRANSFORM, scaleX: TRANSFORM, scaleY: TRANSFORM, rotate: TRANSFORM, opacity: ['opacity'],
  left: [...TRANSFORM, 'left', 'right', 'inset', 'marginLeft', 'marginRight'], top: [...TRANSFORM, 'top', 'bottom', 'inset', 'marginTop', 'marginBottom'],
  width: [...TRANSFORM, 'width', 'minWidth', 'maxWidth', 'flex', 'padding', 'paddingLeft', 'paddingRight'], height: [...TRANSFORM, 'height', 'minHeight', 'maxHeight', 'flex', 'padding', 'paddingTop', 'paddingBottom'],
  layoutWidth: ['width', 'minWidth', 'maxWidth', 'flex', 'padding', 'paddingLeft', 'paddingRight'], layoutHeight: ['height', 'minHeight', 'maxHeight', 'flex', 'padding', 'paddingTop', 'paddingBottom'],
};


// The measured properties a CSS property moves (a declared `width` shows as width and layoutWidth; a `transform` as its parts).
const camel = (name) => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
export const measuredFor = (cssProp) => Object.keys(MEASURED_BY).filter((m) => MEASURED_BY[m].includes(camel(cssProp)));
