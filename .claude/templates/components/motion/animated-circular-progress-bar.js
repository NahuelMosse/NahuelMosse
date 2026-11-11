// Animated circular progress bar, ported from Magic UI (registry/magicui/animated-circular-progress-bar.tsx).
// Two arcs of a circle of radius 45 in a 100 × 100 box: the value, from the top clockwise, and the rest of
// the track, which stops 5 % short of both ends of the value (so there is a gap), both with round caps and
// a 1 s `ease` transition on their dash length. The number in the middle is the rounded percentage.
// The value is `data-value` (between `data-min` and `data-max`) or `opts.value`; `set(value)` moves it.
// The arc draws from the minimum when the gauge comes into view.
import { reduced } from '../core.js';
import { bezier, define, gate, node, numberOf } from './mu-shared.js';

const NS = 'http://www.w3.org/2000/svg';
const ease = bezier(0.25, 0.1, 0.25, 1);
const TRANSITION = 1000;

const circle = (className) => {
  const c = document.createElementNS(NS, 'circle');
  for (const [k, v] of Object.entries({ cx: 50, cy: 50, r: 45, 'stroke-width': 10, 'stroke-dashoffset': 0, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: className })) c.setAttribute(k, v);
  return c;
};

export const mount = define('animated-circular-progress-bar', (el, opts) => {
  const min = numberOf(opts, el, 'min', 0);
  const max = numberOf(opts, el, 'max', 100);
  if (!(max > min)) throw new RangeError('animated-circular-progress-bar: max has to be greater than min');
  const percentOf = (value) => Math.min(100, Math.max(0, Math.round(((value - min) / (max - min)) * 100)));
  let target = numberOf(opts, el, 'value', min);
  let shown = percentOf(min);

  el.classList.add('mu-gauge');
  if (opts.primary) el.style.setProperty('--mu-gauge-primary', opts.primary);
  if (opts.secondary) el.style.setProperty('--mu-gauge-secondary', opts.secondary);
  const label = el.getAttribute('aria-label') ?? el.dataset.label;
  el.setAttribute('role', 'progressbar');
  if (label) el.setAttribute('aria-label', label);
  el.setAttribute('aria-valuemin', min);
  el.setAttribute('aria-valuemax', max);

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'mu-gauge__svg');
  const rest = circle('mu-gauge__rest');
  const arc = circle('mu-gauge__arc');
  svg.append(rest, arc);
  const text = node('span', 'mu-gauge__value', { decorative: true });
  const digits = node('span', 'mu-gauge__digits');
  const unit = node('small', 'mu-gauge__unit', { html: '%' });
  text.append(digits, unit);
  el.append(svg, text);

  const draw = (percent) => {
    arc.style.setProperty('--stroke-percent', percent);
    rest.style.setProperty('--stroke-percent', 90 - percent);
    rest.style.display = percent <= 90 && percent >= 0 ? '' : 'none';
  };
  let raf = 0;
  const count = (to) => {
    cancelAnimationFrame(raf);
    const from = shown;
    shown = to;
    if (from === to || reduced()) { digits.textContent = to; return; }
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / TRANSITION);
      digits.textContent = Math.round(from + (to - from) * ease(p));
      if (p < 1) raf = requestAnimationFrame(step); else digits.textContent = to;
    };
    raf = requestAnimationFrame(step);
  };
  const update = () => {
    const percent = percentOf(target);
    el.setAttribute('aria-valuenow', Math.min(max, Math.max(min, target)));
    el.dataset.currentValue = percent;
    if (reduced() && percent !== shown) svg.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' });
    draw(percent);
    count(percent);
  };

  draw(shown);
  digits.textContent = shown;
  el.setAttribute('aria-valuenow', min);
  el.dataset.currentValue = shown;
  let begun = false;
  const watcher = gate(el, (on) => { if (on && !begun) { begun = true; update(); } });

  return {
    set(value) { target = value; if (begun) update(); },
    get percent() { return shown; },
    destroy() {
      cancelAnimationFrame(raf);
      watcher.destroy();
      svg.remove();
      text.remove();
      el.classList.remove('mu-gauge');
      for (const a of ['role', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'data-current-value']) el.removeAttribute(a);
      el.style.removeProperty('--mu-gauge-primary');
      el.style.removeProperty('--mu-gauge-secondary');
    },
  };
});
