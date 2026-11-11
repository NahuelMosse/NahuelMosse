// A number that slides digit by digit, ported from Animate UI (primitives/texts/sliding-number) and
// Motion Primitives (core/sliding-number). Each digit is a column with the ten digits stacked; a spring
// moves the column to the digit it has to show, always along the shortest way round the ring 0–9 (a
// column that goes from 9 to 0 travels back through 8, 7 … like an odometer). The ring is drawn with
// translateY in percent of the column, so no height is measured. A place that did not exist (99 → 100)
// starts from 0. Currency, grouping and separators come from Intl, so $ 1.284.500,00 slides only in
// its digits. Reduced motion: no travel; the digits that change fade in 140 ms.
//
//   <span data-motion="sliding-number" data-value="1284500" data-currency="ARS"></span>
//
// mount(el, { value, from, delay, inView, decimals, format, locale, preset, spring, onChange })
//   → { set(value, { instant }), value, destroy }
// `preset` is 'animate' (Animate UI: 50 / 10 / 0.4, soft, about 500 ms) or 'primitives' (Motion Primitives:
// 280 / 18 / 0.3, quicker); `spring` overrides it as { stiffness, damping, mass }. `from` shows that
// number first and then slides to `value` (once in view with `inView`).
import { reduced, follower, springOf, locale } from '../core.js';
import { make, REDUCED_FADE } from './au-util.js';

const instances = new WeakMap();
const PRESETS = { animate: { token: '--sliding-number-spring', fallback: '50 10 0.4' }, primitives: { token: '--sliding-number-spring-primitives', fallback: '280 18 0.3' } };

const springFor = (opts) => {
  if (opts.spring) return opts.spring;
  const preset = PRESETS[opts.preset ?? 'animate'];
  if (!preset) throw new Error(`motion/sliding-number: no preset "${opts.preset}" (${Object.keys(PRESETS).join(', ')})`);
  return springOf(preset.token, preset.fallback);
};

const finite = (value, what) => {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`motion/sliding-number: ${what} is not a finite number (${String(value)})`);
  return n;
};

// The ring of ten digits of one place.
const roller = (spring, start) => {
  const root = make('span', { class: 'sn__roll' });
  const digits = Array.from({ length: 10 }, (_, i) => make('span', { class: 'sn__d', text: String(i) }));
  root.append(make('span', { class: 'sn__ghost', text: '0' }), ...digits);
  const follow = follower(spring, ([cur]) => {
    const at = ((cur % 10) + 10) % 10;
    for (let i = 0; i < 10; i++) {
      const offset = (10 + i - at) % 10;
      digits[i].style.transform = `translateY(${(offset > 5 ? offset - 10 : offset) * 100}%)`;
    }
  }, 0.004, digits);
  let digit = start;
  follow.to([start], true);
  return {
    root,
    get digit() { return digit; },
    to(next, instant) {
      if (next === digit && !instant) return;
      digit = next;
      if (instant || reduced()) {
        follow.to([next], true);
        if (!instant) root.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: REDUCED_FADE, easing: 'ease-out' });
      } else follow.to([next]);
    },
    stop: () => follow.stop(),
  };
};

export const mount = (el, opts = {}) => {
  if (instances.has(el)) return instances.get(el);
  const spring = springFor({ ...opts, preset: opts.preset ?? el.dataset.preset });
  const decimals = opts.decimals ?? (el.dataset.decimals === undefined ? undefined : Number(el.dataset.decimals));
  const currency = opts.currency ?? el.dataset.currency;
  const format = { ...(currency ? { style: 'currency', currency } : {}), ...(decimals === undefined ? {} : { minimumFractionDigits: decimals, maximumFractionDigits: decimals }), ...opts.format };
  const target = finite(opts.value ?? el.dataset.value, 'value');
  const from = opts.from ?? (el.dataset.from === undefined ? undefined : Number(el.dataset.from));
  const original = [...el.childNodes];

  const spoken = make('span', { class: 'sn__spoken visually-hidden' });
  const visual = make('span', { class: 'sn__digits', 'aria-hidden': 'true' });
  el.replaceChildren(spoken, visual);
  el.classList.add('sn');

  const rollers = new Map();
  let current = null;
  let timer = 0;

  const parts = (value) => new Intl.NumberFormat(opts.locale ?? locale(el), format).formatToParts(value);
  const render = (value, instant) => {
    const tokens = parts(value);
    const integerDigits = tokens.filter((t) => t.type === 'integer').join('').length;
    let seen = 0;
    let fractionAt = 0;
    const children = [];
    const used = new Set();
    const text = [];
    for (const part of tokens) {
      text.push(part.value);
      if (part.type !== 'integer' && part.type !== 'fraction') { children.push(make('span', { class: 'sn__s', text: part.value })); continue; }
      for (const ch of part.value) {
        const key = part.type === 'integer' ? `i${integerDigits - 1 - seen++}` : `f${fractionAt++}`;
        const digit = Number(ch);
        let r = rollers.get(key);
        if (!r) { r = roller(spring, 0); rollers.set(key, r); r.to(digit, instant); } else r.to(digit, instant);
        used.add(key);
        children.push(r.root);
      }
    }
    for (const [key, r] of rollers) if (!used.has(key)) { r.stop(); rollers.delete(key); }
    visual.replaceChildren(...children);
    spoken.textContent = text.join('');
  };

  const set = (value, { instant = false } = {}) => {
    const n = finite(value, 'value');
    if (n === current && !instant) return;
    current = n;
    render(n, instant);
    opts.onChange?.(n);
  };

  const start = () => { timer = setTimeout(() => set(target), opts.delay ?? Number(el.dataset.delay ?? 0)); };
  let io = null;
  if (from === undefined) { current = target; render(target, true); } else {
    current = finite(from, 'from');
    render(current, true);
    // A figure that is about to count says where it is going from the first moment, whatever the digits show.
    spoken.textContent = parts(target).map((t) => t.value).join('');
    if (opts.inView ?? el.hasAttribute('data-inview')) {
      io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { io.disconnect(); io = null; start(); } });
      io.observe(el);
    } else start();
  }

  const api = {
    get value() { return current; },
    set,
    destroy() {
      clearTimeout(timer);
      io?.disconnect();
      for (const r of rollers.values()) r.stop();
      rollers.clear();
      el.classList.remove('sn');
      el.replaceChildren(...original);
      instances.delete(el);
    },
  };
  instances.set(el, api);
  return api;
};

if (typeof document !== 'undefined') for (const el of document.querySelectorAll('[data-motion="sliding-number"]')) mount(el);
