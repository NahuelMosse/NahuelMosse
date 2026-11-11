// Pure trajectory analysis: one property sampled over time, curve classification, jump detection.
import { LONG_FRAME_STEP_SLACK_MS, FRAME_MS, DENSE_MAX_MS, SERIES_JUMP_MAX_DT_MS, SERIES_PEAK_SLOPE, SERIES_NEIGHBOUR_RATIO, JUMP_MIN_SHARE, OVERSHOOT_SPRING_PCT, REMOUNT_GAP_FRAMES } from './constants.mjs';

export const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
export const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  if (!s.length) return 0;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export const COLS = ['left', 'top', 'width', 'height', 'opacity', 'tx', 'ty', 'sx', 'sy', 'rot', 'ow', 'oh'];
export const PROP_OF = { left: 'left', top: 'top', width: 'width', height: 'height', opacity: 'opacity', tx: 'translateX', ty: 'translateY', sx: 'scaleX', sy: 'scaleY', rot: 'rotate', ow: 'layoutWidth', oh: 'layoutHeight' };
export const EPS = { left: 1, top: 1, width: 1, height: 1, translateX: 1, translateY: 1, scaleX: 0.01, scaleY: 0.01, rotate: 1, opacity: 0.02, layoutWidth: 1, layoutHeight: 1 };

const SHAPES = [
  ['linear', (u) => u],
  ['ease-out', (u) => 1 - (1 - u) ** 2], ['ease-out', (u) => 1 - (1 - u) ** 3], ['ease-out', (u) => 1 - (1 - u) ** 5],
  ['ease-in', (u) => u ** 2], ['ease-in', (u) => u ** 3],
  ['ease-in-out', (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) ** 2)], ['ease-in-out', (u) => (u < 0.5 ? 4 * u ** 3 : 1 - 4 * (1 - u) ** 3)],
];

// The curve family that fits a settled motion best. The animation began somewhere after the last unmoved
// sample and ended somewhere before the first settled one: on a machine that drops frames those intervals
// are long, so the start and the end are searched inside them (FIT_GRID steps each) rather than taken at the
// sample times, which would read a late-starting or late-seen ease-in as an ease-in-out.
const FIT_GRID = 6;
const EASE_IN_TIE_RATIO = 1.5;
const EASE_IN_TIE_ERROR = 0.02;
const bestShape = (t, v, start, settle) => {
  const v0 = v[start - 1];
  const span = v[settle] - v0;
  const best = new Map();
  for (let a = 0; a < FIT_GRID; a++) {
    const ts = t[start - 1] + ((t[start] - t[start - 1]) * a) / FIT_GRID;
    for (let b = 1; b <= FIT_GRID; b++) {
      const te = t[settle - 1] + ((t[settle] - t[settle - 1]) * b) / FIT_GRID;
      for (const [name, f] of SHAPES) {
        let err = 0;
        for (let j = start - 1; j <= settle; j++) err += ((v[j] - v0) / span - f(Math.min(1, Math.max(0, (t[j] - ts) / (te - ts))))) ** 2;
        if (err < (best.get(name) ?? Infinity)) best.set(name, err);
      }
    }
  }
  const [[shape, least]] = [...best.entries()].sort((x, y) => x[1] - y[1]);
  // Sparse samples cannot always tell an ease-in from the other curves: it is a tie when the best ease-in fit
  // is nearly as good as the winner.
  const easeIn = best.get('ease-in');
  return { shape, easeInTie: shape !== 'ease-in' && easeIn <= Math.max(EASE_IN_TIE_RATIO * least, least + EASE_IN_TIE_ERROR) };
};

// Angles read from a matrix wrap at +-180 degrees: unwrap so a spinning element is a smooth series.
export const unwrap = (v) => v.reduce((out, x, i) => {
  if (!i) return [x];
  let y = x;
  while (y - out[i - 1] > 180) y -= 360;
  while (y - out[i - 1] < -180) y += 360;
  return [...out, y];
}, []);

// Jumps of a settled motion. Velocity is taken per millisecond, so irregular sampling does not
// change it; only intervals short enough to bound the instantaneous velocity count. A jump is a
// step that is a sizeable share of the amplitude and moves several times faster than the average
// speed of the whole motion (no easing curve peaks that high after its first interval) and than
// both short neighbours. The first interval is skipped: an ease-out legitimately starts fastest.
// `unresolved` counts steps that pass every test but the speed one, in a motion some interval of which is longer
// than DENSE_MAX_MS (or in an interval too long to bound the velocity): the speed test cannot decide them.
const findJumps = (t, v, start, settle, amp, t0, shape, reads = t) => {
  const jumps = [];
  let unresolved = 0;
  if (settle - start < 4) return { jumps, unresolved };
  const avgVelocity = amp / Math.max(1, t[settle] - t0);
  const dense = t.slice(start, settle + 1).every((x, i) => x - t[start + i - 1] <= DENSE_MAX_MS);
  const peak = SERIES_PEAK_SLOPE * (shape === 'spring' ? 2 : 1);
  const velocity = (k) => {
    const dt = t[k] - t[k - 1];
    // The interval counts by the frame times and by when the values were read: a value read long after its frame started (a long
    // task in between) says nothing about the frame-to-frame step.
    const read = reads[k] - reads[k - 1];
    return dt > 0 && dt <= SERIES_JUMP_MAX_DT_MS && read <= SERIES_JUMP_MAX_DT_MS ? Math.abs(v[k] - v[k - 1]) / dt : null;
  };
  const fast = (k) => { const x = velocity(k); return x !== null && x >= peak * avgVelocity; };
  for (let k = start + 1; k <= settle; k++) {
    // Chromium can sample a frame in the middle of a teleport: the step spreads over consecutive intervals that are each
    // faster than any curve peaks. They are one jump, compared with the intervals on both sides of the run.
    if (k < settle && fast(k) && fast(k + 1)) {
      let end = k + 1;
      while (end < settle && fast(end + 1)) end++;
      const total = Math.abs(v[end] - v[k - 1]);
      if (total >= JUMP_MIN_SHARE * amp) {
        const before = velocity(k - 1);
        const after = velocity(end + 1);
        const run = total / (t[end] - t[k - 1]);
        if (before === null || after === null) unresolved++;
        else if (run >= SERIES_NEIGHBOUR_RATIO * before && run >= SERIES_NEIGHBOUR_RATIO * after) jumps.push({ atMs: round(t[k] - t0, 0), size: round(total, 2) });
      }
      k = end;
      continue;
    }
    const step = Math.abs(v[k] - v[k - 1]);
    if (step < JUMP_MIN_SHARE * amp) continue;
    const vel = velocity(k);
    if (vel === null) { unresolved++; continue; }
    // Both neighbours must be judged too: a step between long intervals is not told from a steep easing.
    const neighbours = [velocity(k - 1), velocity(k + 1)];
    if (neighbours.includes(null)) { unresolved++; continue; }
    if (neighbours.some((x) => vel < SERIES_NEIGHBOUR_RATIO * x)) continue;
    // Sampled frame by frame (60 Hz) all along, a step slower than a jump is settled: it is no jump. With any longer
    // interval in the motion (a 30 fps machine, a stall) the question stays open.
    if (vel < peak * avgVelocity) { if (!dense) unresolved++; continue; }
    jumps.push({ atMs: round(t[k] - t0, 0), size: round(step, 2) });
  }
  return { jumps, unresolved };
};

// A round trip (a toast in and out) is judged leg by leg, each against its own amplitude and speed:
// the average speed of the whole series says nothing about any one leg. Returns jumps with `atMs`
// relative to `t0`, the start of the whole series.
const legJumps = (t, v, eps, t0, reads = t) => {
  const first = v[0];
  let peak = 0;
  v.forEach((x, i) => { if (Math.abs(x - first) > Math.abs(v[peak] - first)) peak = i; });
  const tol = Math.abs(v[peak] - first) * 0.005;
  let arrive = peak;
  while (arrive > 0 && Math.abs(v[arrive - 1] - v[peak]) <= tol) arrive--;
  let depart = peak;
  while (depart < v.length - 1 && Math.abs(v[depart + 1] - v[peak]) <= tol) depart++;
  const out = [];
  let unresolved = 0;
  for (const [a, b] of [[0, arrive], [depart, v.length - 1]]) {
    const leg = analyzeSeries(t.slice(a, b + 1), v.slice(a, b + 1), eps, [], [], reads.slice(a, b + 1));
    for (const j of leg?.jumps ?? []) out.push({ atMs: round(leg.startT + j.atMs - t0, 0), size: j.size });
    unresolved += leg?.unresolved ?? 0;
  }
  return { jumps: out, unresolved };
};

// Steps where one node was replaced by another (`cuts`: indices of the first sample of the new node):
// a node removed while still moving and a new one that starts elsewhere is a teleport.
// A join is a jump only if the interval across it and both the intervals beside it were judged: within the limit by frame time and
// by the time the values were read. A longer interval (a motion that continues across a 300 ms gap) leaves it unresolved.
const cutJumps = (t, v, cuts, eps, range, t0, reads = t) => {
  const jumps = [];
  let unresolved = 0;
  const judged = (k) => k >= 1 && k < t.length && t[k] - t[k - 1] <= SERIES_JUMP_MAX_DT_MS && reads[k] - reads[k - 1] <= SERIES_JUMP_MAX_DT_MS;
  for (const c of cuts) {
    if (c < 2 || c >= v.length) continue;
    const step = Math.abs(v[c] - v[c - 1]);
    const moving = Math.abs(v[c - 1] - v[c - 2]) > eps;
    if (!(moving && step >= Math.max(JUMP_MIN_SHARE * range, 3 * eps))) continue;
    if (![c - 1, c, c + 1].every(judged)) { unresolved++; continue; }
    jumps.push({ atMs: round(t[c] - t0, 0), size: round(step, 2) });
  }
  return { jumps, unresolved };
};

// One property over time (`t` ms, `v` values): duration, overshoot, curve shape and jumps.
// Median and longest interval (ms) between samples.
const cadenceOf = (t) => {
  const dts = t.slice(1).map((x, i) => x - t[i]);
  return { median: round(median(dts), 0), max: round(Math.max(0, ...dts), 0) };
};

export const analyzeSeries = (t, v, eps, cuts = [], longFrames = [], reads = t) => {
  const n = v.length;
  if (n < 4) return null;
  const first = v[0];
  const final = v[n - 1];
  const range = Math.max(...v) - Math.min(...v);
  if (range < eps) return null;
  const returns = Math.abs(final - first) < eps;
  const amp = returns ? range : Math.abs(final - first);
  const dir = returns ? 1 : Math.sign(final - first);
  const tol = amp * 0.005;
  const start = v.findIndex((x) => Math.abs(x - first) > tol);
  if (start < 1) return null;
  const tail = v.slice(-2);
  const settled = tail.every((x, i) => i === 0 || Math.abs(x - tail[i - 1]) <= tol);
  let settle = n - 1;
  if (settled) while (settle > start && Math.abs(v[settle - 1] - final) <= tol) settle--;
  const t0 = t[start - 1];
  let over = 0;
  if (!returns && settled) for (let j = start; j < n; j++) over = Math.max(over, (v[j] - final) * dir);
  const overshootPct = round((over / amp) * 100);
  let shape;
  let easeInTie = false;
  if (returns) shape = 'round-trip';
  else if (settle - start < 2) shape = 'step';
  else if (overshootPct > OVERSHOOT_SPRING_PCT) shape = 'spring';
  else {
    ({ shape, easeInTie } = bestShape(t, v, start, settle));
  }
  let jumps;
  let unresolved = 0;
  if (cuts.length) {
    // Joined nodes are separate motions: each is judged on its own, the joins by cutJumps.
    const bounds = [0, ...cuts, n];
    const legs = bounds.slice(1).flatMap((end, i) => {
      const leg = analyzeSeries(t.slice(bounds[i], end), v.slice(bounds[i], end), eps, [], [], reads.slice(bounds[i], end));
      unresolved += leg?.unresolved ?? 0;
      return (leg?.jumps ?? []).map((j) => ({ atMs: round(leg.startT + j.atMs - t0, 0), size: j.size }));
    });
    const joins = cutJumps(t, v, cuts, eps, range, t0, reads);
    unresolved += joins.unresolved;
    jumps = legs.concat(joins.jumps);
  } else ({ jumps, unresolved } = shape === 'round-trip' ? legJumps(t, v, eps, t0, reads) : findJumps(t, v, start, settle, amp, t0, shape, reads));
  // A step in a frame that overlaps a long frame is that frame: the animation's clock ran on while the thread was blocked.
  if (longFrames.length) {
    jumps = jumps.filter((j) => {
      const k = t.findIndex((x) => Math.abs(x - (t0 + j.atMs)) < 1.5);
      const [from, to] = k > 0 ? [t[k - 1], t[k]] : [t0 + j.atMs, t0 + j.atMs];
      return !longFrames.some(([s, len]) => s <= to + LONG_FRAME_STEP_SLACK_MS && s + len >= from - LONG_FRAME_STEP_SLACK_MS);
    });
  }
  return { from: round(v[start - 1], 2), to: round(final, 2), startT: t0, firstT: t[start], durationMs: round(t[settle] - t0, 0), samples: settle - start + 1, easeInTie, cadence: cadenceOf(t.slice(start - 1, settle + 1)), overshootPct, shape, settled, jumps, unresolved };
};

// Whether a move is an animation: seen in more than one frame and longer than two 60 Hz frames. A change seen in a
// single frame is a step however long that frame lasted (a machine that drops frames has 100 ms frames).
export const animatedMove = (m) => m.samples > 1 && m.durationMs > 2 * FRAME_MS;

export const analyzeElement = (el, longFrames = []) => {
  const moves = [];
  for (const c of COLS) {
    const r = analyzeSeries(el.t, c === 'rot' ? unwrap(el[c]) : el[c], EPS[PROP_OF[c]], el.cuts, longFrames, el.r ?? el.t);
    if (r) moves.push({ prop: PROP_OF[c], ...r });
  }
  return moves.length ? { label: el.label, root: el.root, moves } : null;
};

const kindOf = (e) => `${e.tag ?? e.label.replace(/[#.].*$/, '').toUpperCase()}|${e.role ?? ''}`;

// A node removed mid-recording and a node of the same tag and role mounted in the same parent within
// REMOUNT_GAP_FRAMES is one component re-mounted (a changed React `key`): their samples form one series,
// with `cuts` at the joins, so the animation that starts over shows as a jump.
export const joinRemounts = (elems) => {
  if (elems.length < 2) return elems;
  // Every tracked node is sampled in the same frames: gaps are counted in those frames, whatever they lasted.
  const frames = [...new Set(elems.flatMap((e) => e.t))].sort((x, y) => x - y);
  const frameOf = new Map(frames.map((x, i) => [x, i]));
  const taken = new Set();
  const next = new Map();
  for (const a of [...elems].sort((x, y) => x.t.at(-1) - y.t.at(-1))) {
    if (a.root || frameOf.get(a.t.at(-1)) >= frames.length - 2) continue;
    const gap = (b) => frameOf.get(b.t[0]) - frameOf.get(a.t.at(-1));
    const b = elems.filter((x) => x !== a && !x.root && !taken.has(x) && x.parent === a.parent && kindOf(x) === kindOf(a) && gap(x) > 0 && gap(x) <= REMOUNT_GAP_FRAMES).sort((x, y) => x.t[0] - y.t[0])[0];
    if (b) { next.set(a, b); taken.add(b); }
  }
  return elems.filter((e) => !taken.has(e)).map((head) => {
    if (!next.has(head)) return head;
    const joined = { ...head, cuts: [] };
    for (const c of COLS) joined[c] = [...head[c]];
    joined.t = [...head.t];
    joined.r = [...(head.r ?? head.t)];
    for (let e = next.get(head); e; e = next.get(e)) {
      joined.cuts.push(joined.t.length);
      joined.t.push(...e.t);
      joined.r.push(...(e.r ?? e.t));
      for (const c of COLS) joined[c].push(...e[c]);
    }
    return joined;
  });
};

// `longFrames`: [[startMs, durationMs]] of the recording's long frames: jumps they explain are not reported.
export const analyzeRecording = (rec, { longFrames = [] } = {}) => joinRemounts(rec?.elems ?? []).map((e) => analyzeElement(e, longFrames)).filter(Boolean);

// 'ease-in' when the curve starts slower than it ends; 'linear'; otherwise 'ok'.
export const easingKind = (e) => {
  if (e === 'linear' || /^linear\(\s*0(?:\s+0%)?\s*,\s*1(?:\s+100%)?\s*\)$/.test(e)) return 'linear';
  if (e === 'ease-in') return 'ease-in';
  const m = e.match(/^cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/);
  if (!m) return 'ok';
  const [x1, y1, x2, y2] = m.slice(1).map(Number);
  if (x1 === y1 && x2 === y2) return 'linear';
  const startSlope = x1 > 0 ? y1 / x1 : Infinity;
  const endSlope = x2 < 1 ? (1 - y2) / (1 - x2) : Infinity;
  return startSlope < 0.5 && endSlope > 1 ? 'ease-in' : 'ok';
};
