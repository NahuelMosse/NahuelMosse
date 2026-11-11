// Interruption analysis: after a second gesture (the mark) the motion must continue from where it
// was. A CSS transition reverses from its live value, so a step after the mark is only a defect
// when an Animation object says the animation restarted, or when the sampling is fine enough to
// show the value teleporting faster than any easing curve allows.
import { COLS, EPS, PROP_OF, median, round, unwrap } from './series.mjs';
import { FINE_SAMPLING_MS, JUMP_MAX_DT_MS, JUMP_MIN_STEP, LONG_FRAME_STEP_SLACK_MS, JUMP_PEAK_SLOPE, RESTART_EVENT_SLACK_MS, RESTART_MIN_SHARE, RESTART_WINDOW, SMALL_MIN_SHARE, SMALL_STEP_EPS_FACTOR } from './constants.mjs';

const ancestorsOf = (el, byId) => {
  const chain = new Set([el.id]);
  for (let p = el.parent, guard = 0; p && guard < 64; p = byId.get(p)?.parent, guard++) chain.add(p);
  return chain;
};

// Animation events from the tracer: { t, nodeId, type: 'transition' | 'animation' | 'waapi' | 'cancel',
// props, explicitFrom }. A restart is a new keyframe/WAAPI animation with an explicit `from`
// keyframe, or a keyframe animation cancelled before it finished.
const isRestart = (e) => e.type === 'cancel' || ((e.type === 'animation' || e.type === 'waapi') && e.explicitFrom);

// Position steps in the window after `markT`. `durationMs` is the measured duration of the motion
// (estimated from the series when absent). `small` is for micro-interactions (hover, a second click
// on a trigger): steps are judged against the property's epsilon and 20 % of its range instead of
// the absolute 24 px / 0.4 opacity of a toggle's panel.
// `longFrames`: [[startMs, durationMs]] of the long frames of the recording. A step in a frame that
// overlaps one is the long frame (the page's animation clock kept running while its thread was
// blocked), reported as `long-frame`; only an Animation object that restarted is still a jump there.
export const interruptionJumps = (rec, markT, { durationMs, small = false, longFrames = [] } = {}) => {
  const found = [];
  const anims = rec.anims ?? [];
  const byId = new Map(rec.elems.map((e) => [e.id, e]));
  for (const el of rec.elems) {
    const scope = ancestorsOf(el, byId);
    const own = anims.filter((a) => scope.has(a.nodeId));
    const transitionOnly = own.some((a) => a.type === 'transition') && !own.some(isRestart);
    for (const c of COLS) {
      const min = small ? SMALL_STEP_EPS_FACTOR * EPS[PROP_OF[c]] : JUMP_MIN_STEP[c];
      if (min === undefined) continue;
      const { t } = el;
      // When each sample was read (`t` is the start of its frame, which a slow frame leaves far behind): marks and
      // animation events share this clock.
      const r = el.r ?? t;
      const v = c === 'rot' ? unwrap(el[c]) : el[c];
      const i = r.findIndex((x) => x >= markT);
      if (i < 3 || i >= v.length - 1) continue;
      const range = Math.max(...v) - Math.min(...v);
      if (range < EPS[PROP_OF[c]]) continue;
      const before = t.slice(1, i).map((x, k) => x - t[k]);
      const fine = median(before) <= FINE_SAMPLING_MS;
      const dur = durationMs ?? Math.max(1, t.at(-1) - t[0]);
      let worst = null;
      for (let k = i; k <= Math.min(v.length - 1, i + RESTART_WINDOW); k++) {
        const d = Math.abs(v[k] - v[k - 1]);
        const dt = t[k] - t[k - 1];
        // An Animation object that restarted is strong evidence, so a smaller step suffices than
        // for a position-only teleport judged in small mode.
        const restarted = own.some((a) => isRestart(a) && a.t >= markT - RESTART_EVENT_SLACK_MS && a.t <= r[k] + Math.max(RESTART_EVENT_SLACK_MS, 2 * dt));
        if (d < Math.max(min, (small && !restarted ? SMALL_MIN_SHARE : RESTART_MIN_SHARE) * range)) continue;
        if (!restarted && longFrames.some(([s, len]) => s <= t[k] + LONG_FRAME_STEP_SLACK_MS && s + len >= t[k - 1] - LONG_FRAME_STEP_SLACK_MS)) continue;
        const teleports = !transitionOnly && fine && dt > 0 && dt <= JUMP_MAX_DT_MS && d / dt > (JUMP_PEAK_SLOPE * range) / dur;
        if ((restarted || teleports) && (!worst || d > worst.delta)) worst = { delta: d, from: v[k - 1], to: v[k], atMs: t[k] - markT, evidence: restarted ? 'animation' : 'position' };
      }
      if (worst) found.push({ label: el.label, prop: PROP_OF[c], delta: round(worst.delta, 2), from: round(worst.from, 2), to: round(worst.to, 2), atMs: round(worst.atMs, 0), evidence: worst.evidence });
    }
  }
  return found.sort((a, b) => b.delta - a.delta);
};

// An animation restart was seen after the mark but the samples around it are too far apart to follow the
// value: { median, max } of the intervals there, or null when nothing restarted or the frames were fine.
const dtsAround = (rec, markT) => rec.elems.flatMap((el) => (el.r ?? el.t).slice(1).map((x, k) => [x, x - (el.r ?? el.t)[k]]).filter(([x]) => Math.abs(x - markT) <= 300).map(([, d]) => d));

// { median, max } of the intervals between the samples within 300 ms of the mark, or null without samples.
export const markCadence = (rec, markT) => {
  const dts = dtsAround(rec, markT);
  return dts.length ? { median: round(median(dts), 0), max: round(Math.max(...dts), 0) } : null;
};

export const restartUnfollowed = (rec, markT) => {
  if (!(rec.anims ?? []).some((a) => isRestart(a) && a.t >= markT - RESTART_EVENT_SLACK_MS)) return null;
  const cadence = markCadence(rec, markT);
  return cadence && cadence.max > JUMP_MAX_DT_MS ? cadence : null;
};
