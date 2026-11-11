// Reduced-motion judgement from computed transform snapshots. Reduced motion means gentler, not
// zero: a small press scale is fine, a translate, a rotation or a large scale is not.
import { REDUCED_SCALE_DELTA, REDUCED_TRANSLATE_PX } from './constants.mjs';
import { round } from './series.mjs';

const numbers = (s) => String(s ?? '').match(/-?\d*\.?\d+(?:e-?\d+)?/gi)?.map(Number) ?? [];

// { tx, ty, sx, sy, rot } from the computed `transform`, `translate`, `scale` and `rotate` values.
export const transformState = (snap) => {
  const state = { tx: 0, ty: 0, sx: 1, sy: 1, rot: 0 };
  const t = String(snap.transform ?? 'none');
  const m = /^matrix(3d)?\(([^)]*)\)$/.exec(t);
  if (m) {
    const v = m[2].split(',').map(Number);
    const [a, b, c, d, tx, ty] = m[1] ? [v[0], v[1], v[4], v[5], v[12], v[13]] : v;
    Object.assign(state, { tx, ty, sx: Math.hypot(a, b), sy: Math.hypot(c, d), rot: (Math.atan2(b, a) * 180) / Math.PI });
  }
  if (snap.translate && snap.translate !== 'none') { const [x = 0, y = 0] = numbers(snap.translate); state.tx += x; state.ty += y; }
  if (snap.scale && snap.scale !== 'none') { const [x = 1, y = x] = numbers(snap.scale); state.sx *= x; state.sy *= y; }
  if (snap.rotate && snap.rotate !== 'none') state.rot += numbers(snap.rotate)[0] ?? 0;
  return state;
};

const describeDelta = (a, b, { translate, scale, rotate }) => {
  const parts = [];
  const move = Math.hypot(b.tx - a.tx, b.ty - a.ty);
  if (move > translate) parts.push(`translate ${round(move)} px`);
  const grow = Math.max(Math.abs(b.sx - a.sx), Math.abs(b.sy - a.sy));
  if (grow > scale) parts.push(`scale by ${round(grow, 2)}`);
  const turn = Math.abs(b.rot - a.rot);
  if (turn > rotate) parts.push(`rotate ${round(turn)} deg`);
  return parts.join(', ');
};

// What a press still does under reduced motion beyond a small scale change.
export const reducedMoves = (rest, pressed) => describeDelta(transformState(rest), transformState(pressed), { translate: REDUCED_TRANSLATE_PX, scale: REDUCED_SCALE_DELTA, rotate: 1 });

// Any transform left after release.
export const reducedResidue = (rest, released) => describeDelta(transformState(rest), transformState(released), { translate: 0.5, scale: 0.01, rotate: 0.5 });
