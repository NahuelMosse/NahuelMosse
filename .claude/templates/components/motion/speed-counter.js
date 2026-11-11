// Speed counter. Written from scratch for this set (no third-party code): a figure counts to its value with a directional
// motion blur proportional to the speed at which the number is changing, so the digits smear while they race and sharpen
// as they settle. The blur is one SVG Gaussian blur whose deviation runs along a single axis (`y` by default, the way a
// reel rolls; `x` smears sideways): deviation = maxBlur * clamp(speed / reference), where the reference is twice the
// average speed of the run, so the peak of the curve reaches the full blur. The count eases on the in-out curve of the
// set, so the blur builds, peaks mid-run and clears. A new value (`update`) retargets from where the figure is. The page
// locale formats it (`data-locale`), `currency` writes it as money and `format(value)` replaces both. It counts once when
// it first comes into view and the tab is showing; a screen reader gets the final figure once; with reduced motion the
// figure appears with a fade and never blurs.
import { format, reduced, uid } from '../core.js';
import { svgNode, value } from './arc-shared.js';
import { define, gate, node, numberOf } from './mu-shared.js';

const EASES = ['standard', 'enter', 'inOut'];

export const mount = define('speed-counter', (el, opts) => {
  const target0 = numberOf(opts, el, 'value', NaN);
  if (!Number.isFinite(target0)) throw new RangeError('speed-counter: value is not a number');
  const from = numberOf(opts, el, 'from', 0);
  const duration = numberOf(opts, el, 'duration', 1.6);
  const delay = numberOf(opts, el, 'delay', 0);
  const maxBlur = numberOf(opts, el, 'maxBlur', 6);
  const decimals = numberOf(opts, el, 'decimalPlaces', 0);
  const axis = opts.axis ?? el.dataset.axis ?? 'y';
  const ease = opts.ease ?? el.dataset.ease ?? 'inOut';
  if (!(duration > 0)) throw new RangeError('speed-counter: duration is above zero');
  if (!(maxBlur >= 0)) throw new RangeError('speed-counter: maxBlur is zero or more');
  if (axis !== 'x' && axis !== 'y') throw new RangeError(`speed-counter: unknown axis "${axis}"`);
  if (!EASES.includes(ease)) throw new RangeError(`speed-counter: unknown ease "${ease}"`);
  const currency = opts.currency ?? el.dataset.currency;
  const write = opts.format ?? ((v) => (currency
    ? format.currency(v, currency, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }, el)
    : format.number(v, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }, el)));
  const text = (v) => write(Number(v.toFixed(decimals)));

  const previous = el.innerHTML;
  const id = uid('spd');
  el.classList.add('speed-counter');
  const spoken = node('span', 'speed-counter__spoken');
  const digits = node('span', 'speed-counter__digits', { decorative: true });
  const defs = svgNode('svg', { class: 'speed-counter__filter', width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false' });
  defs.innerHTML = `<filter id="${id}" x="-30%" y="-150%" width="160%" height="400%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="0 0"/></filter>`;
  const blur = defs.querySelector('feGaussianBlur');
  el.replaceChildren(spoken, digits, defs);

  let target = target0;
  let reference = 1;
  let begun = false;
  let timer = 0;
  const paint = (v, speed) => {
    digits.textContent = text(v);
    const level = reference > 0 ? Math.min(1, Math.abs(speed) / reference) : 0;
    const std = maxBlur * level;
    if (std < 0.15) { digits.style.filter = ''; return; }
    blur.setAttribute('stdDeviation', axis === 'y' ? `0 ${std.toFixed(2)}` : `${std.toFixed(2)} 0`);
    digits.style.filter = `url(#${id})`;
  };
  const v = value(from, paint);
  spoken.textContent = text(target);
  paint(from, 0);

  const run = (to) => {
    // Twice the average speed of the run: the peak of the curve reaches the full blur.
    reference = (Math.abs(to - v.get()) / duration) * 2;
    v.to(to, { duration, ease, done: () => { digits.style.filter = ''; } });
  };
  const begin = () => {
    begun = true;
    if (reduced()) {
      v.jump(target);
      digits.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' });
      return;
    }
    timer = setTimeout(() => run(target), delay * 1000);
  };
  const watcher = gate(el, (on) => { if (on && !begun) { begin(); watcher.destroy(); } });

  return {
    // Retarget the figure: it counts from where it is to the new value, blurring by its own speed.
    update(next) {
      if (!Number.isFinite(next)) throw new RangeError('speed-counter: value is not a number');
      target = next;
      spoken.textContent = text(target);
      if (!begun) return;
      if (reduced()) { v.jump(target); return; }
      run(target);
    },
    // Count again from the start value.
    replay() {
      clearTimeout(timer);
      v.jump(from);
      spoken.textContent = text(target);
      if (reduced()) { v.jump(target); return; }
      run(target);
      begun = true;
    },
    get text() { return digits.textContent; },
    get blur() { return Number(blur.getAttribute('stdDeviation').split(' ')[axis === 'y' ? 1 : 0]); },
    destroy() {
      clearTimeout(timer);
      v.stop();
      watcher.destroy();
      el.innerHTML = previous;
      el.classList.remove('speed-counter');
    },
  };
});
