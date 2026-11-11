// Shared by the Motion Primitives ports (morphing dialog, morphing popover, animated background,
// transition panel, toolbars): Motion's duration/bounce springs, their curve as a WAAPI `linear()`,
// and the shared-layout morph a trigger makes into its panel.
import { follower, stepSpring, SPRING_STEP } from '../core.js';

// Motion's `{ type: 'spring', bounce, duration }`: `duration` is the time the spring takes to settle
// (its envelope falls under 0.001), `bounce` is 1 - damping ratio. Mass is 1.
export const bounceSpring = (bounce, duration) => {
  const zeta = Math.min(1, Math.max(0.05, 1 - bounce));
  const x = zeta >= 1 ? 9.2335 : Math.log((1000 * zeta) / Math.sqrt(1 - zeta * zeta));
  const omega = zeta >= 1 ? x / duration : x / (zeta * duration);
  return { stiffness: omega * omega, damping: 2 * zeta * omega, mass: 1 };
};

// A spring run once from rest to 1: the `linear()` easing and the milliseconds it lasts.
export const springCurve = (spring, points = 48) => {
  let x = 0;
  let v = 0;
  const run = [0];
  while (run.length < 240 * 4 && (run.length < 3 || Math.abs(x - 1) > 0.0008 || Math.abs(v) > 0.004)) { [x, v] = stepSpring(spring, x, v, 1, SPRING_STEP); run.push(x); }
  const at = (i) => (i === points ? 1 : run[Math.round((i * (run.length - 1)) / points)]);
  return { easing: `linear(${Array.from({ length: points + 1 }, (_, i) => +at(i).toFixed(4)).join(', ')})`, duration: Math.round((run.length - 1) * SPRING_STEP * 1000) };
};

export const clamp01 = (n) => Math.min(1, Math.max(0, n));
const circOut = (t) => Math.sqrt(1 - (1 - t) ** 2);
const rectOf = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; };
const radiusOf = (el) => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
const fontOf = (el) => parseFloat(getComputedStyle(el).fontSize) || 16;

// The morph of a shared layout: `box` travels from the rect of `source` to its own place and back, one
// spring `p` (0 = at the source, 1 = in place) drives all of it with transform, opacity and a corrected
// radius. `inner` is counter-scaled, so the content is revealed by the clip of `box`, never squashed.
// Each pair {from, to, text} makes `to` fly from where `from` is: a text keeps its proportion (it scales
// by the ratio of font sizes), anything else follows the rect. The new layer fades in over the first
// half of the way and the old one fades out over the second half, as Motion's shared layouts do.
export const createMorph = ({ source, box, inner, pairs = [], spring, onFrame }) => {
  let S;
  let F;
  let radii = [0, 0];
  let measured = [];
  let goal = 0;
  let moving = false;
  let waiting = [];
  const origin = (el) => { el.style.transformOrigin = '0 0'; };
  origin(box); origin(inner);
  for (const pair of pairs) origin(pair.to);

  const settle = () => { const done = waiting; waiting = []; for (const resolve of done) resolve(); };
  const frame = (p) => {
    const mix = (a, b) => a + (b - a) * p;
    const c = { left: mix(S.left, F.left), top: mix(S.top, F.top), width: mix(S.width, F.width), height: mix(S.height, F.height) };
    const sx = Math.max(0.001, c.width / F.width);
    const sy = Math.max(0.001, c.height / F.height);
    const r = Math.max(0, mix(radii[0], radii[1]));
    box.style.transform = `translate(${c.left - F.left}px, ${c.top - F.top}px) scale(${sx}, ${sy})`;
    box.style.borderRadius = `${r / sx}px / ${r / sy}px`;
    inner.style.transform = `scale(${1 / sx}, ${1 / sy})`;
    pairs.forEach((pair, i) => {
      const m = measured[i];
      const d = { left: mix(m.S.left, m.F.left), top: mix(m.S.top, m.F.top), width: mix(m.S.width, m.F.width), height: mix(m.S.height, m.F.height) };
      const kx = pair.text ? mix(m.ratio, 1) : d.width / m.F.width;
      const ky = pair.text ? kx : d.height / m.F.height;
      pair.to.style.transform = `translate(${d.left - c.left - (m.F.left - F.left)}px, ${d.top - c.top - (m.F.top - F.top)}px) scale(${kx}, ${ky})`;
    });
    const q = goal === 1 ? p : 1 - p;
    const arriving = circOut(clamp01(q / 0.5));
    const leaving = 1 - clamp01((q - 0.5) / 0.45);
    box.style.opacity = goal === 1 ? arriving : leaving;
    source.style.opacity = goal === 1 ? leaving : arriving;
    onFrame?.(clamp01(p), p);
    if (p === goal && !moving) settle();
  };
  const body = follower(spring, ([p]) => {
    if (p === goal) {
      moving = false;
      if (goal === 1) { box.style.transform = ''; box.style.borderRadius = ''; inner.style.transform = ''; box.style.opacity = ''; for (const pair of pairs) pair.to.style.transform = ''; source.style.opacity = '0'; }
      else { source.style.opacity = ''; }
      onFrame?.(clamp01(p), p);
      settle();
      return;
    }
    frame(p);
  }, 0.0008);
  body.to([0], true);

  return {
    // Reads where everything is at rest; called with the box laid out in its final place.
    measure() {
      box.style.transform = 'none'; box.style.borderRadius = ''; inner.style.transform = 'none';
      for (const pair of pairs) pair.to.style.transform = 'none';
      S = rectOf(source);
      F = rectOf(box);
      radii = [radiusOf(source), radiusOf(box)];
      measured = pairs.map((pair) => ({ S: rectOf(pair.from), F: rectOf(pair.to), ratio: fontOf(pair.from) / fontOf(pair.to) }));
    },
    jump(p) { goal = p; moving = false; body.to([p], true); frame(p); },
    go(target) {
      return new Promise((resolve) => {
        waiting.push(resolve);
        goal = target;
        moving = true;
        body.to([target]);
      });
    },
    get moving() { return moving; },
    destroy() { body.stop(); moving = false; settle(); },
  };
};
