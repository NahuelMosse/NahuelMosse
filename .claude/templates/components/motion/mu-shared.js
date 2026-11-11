// What the Magic UI ports share: the mount contract, the spring written as a CSS curve with its
// duration, a cubic-bezier solver and the gate that tells a loop whether it is on screen.
import { SPRING_STEP, stepSpring } from '../core.js';

// `define(name, build)` makes a component: `mount(el, opts)` returns `{ destroy, ...api }`, mounting
// the same element twice returns the first handle, and every `[data-motion="<name>"]` already in the
// page is mounted when the module is imported.
const registry = new WeakMap();
export const define = (name, build) => {
  const mount = (el, opts = {}) => {
    const mine = registry.get(el) ?? registry.set(el, new Map()).get(el);
    if (mine.has(name)) return mine.get(name);
    const api = build(el, opts);
    // Getters stay live: the handle is a copy of the descriptors, not of the values.
    const handle = Object.defineProperties({}, Object.getOwnPropertyDescriptors(api));
    handle.destroy = () => { api.destroy(); mine.delete(name); };
    mine.set(name, handle);
    return handle;
  };
  const auto = () => document.querySelectorAll(`[data-motion="${name}"]`).forEach((el) => mount(el));
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto, { once: true });
    else auto();
  }
  return mount;
};

// A number from an option, else from a `data-*` attribute, else the default.
export const numberOf = (opts, el, key, fallback) => {
  const v = opts[key] ?? el.dataset[key];
  const n = v === undefined || v === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// A spring from rest to 1 as a CSS `linear()` curve and the time it takes to settle, in ms.
const runs = new Map();
export const springRun = (stiffness, damping, mass = 1) => {
  const key = `${stiffness}/${damping}/${mass}`;
  if (runs.has(key)) return runs.get(key);
  const spring = { stiffness, damping, mass };
  let x = 0;
  let v = 0;
  let steps = 0;
  const run = [0];
  while (steps < 240 * 6 && (steps < 3 || Math.abs(x - 1) > 0.0005 || Math.abs(v) > 0.005)) { [x, v] = stepSpring(spring, x, v, 1, SPRING_STEP); run.push(x); steps++; }
  const points = 40;
  const at = (i) => (i === points ? 1 : run[Math.round((i * (run.length - 1)) / points)]);
  const out = { easing: `linear(${Array.from({ length: points + 1 }, (_, i) => +at(i).toFixed(4)).join(', ')})`, duration: Math.round((steps * SPRING_STEP) * 1000) };
  runs.set(key, out);
  return out;
};

// cubic-bezier(x1, y1, x2, y2) as a function of time in [0, 1], solved by bisection.
export const bezier = (x1, y1, x2, y2) => {
  const axis = (a, b, t) => 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t ** 2 + t ** 3;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (axis(x1, x2, mid) < x) lo = mid; else hi = mid; }
    return axis(y1, y2, (lo + hi) / 2);
  };
};

// `change(true | false)` whenever the element is on screen and the tab is showing, or stops being.
// It does not look at reduced motion: each component decides what that means for it.
export const gate = (el, change) => {
  let seen = false;
  let on = null;
  const sync = () => { const next = seen && !document.hidden; if (next !== on) { on = next; change(next); } };
  const io = new IntersectionObserver((entries) => { seen = entries[entries.length - 1].isIntersecting; sync(); });
  io.observe(el);
  document.addEventListener('visibilitychange', sync);
  return { destroy() { io.disconnect(); document.removeEventListener('visibilitychange', sync); } };
};

// A node with a class, hidden from assistive technology when it only decorates.
export const node = (tag, className, { decorative = false, html } = {}) => {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (decorative) n.setAttribute('aria-hidden', 'true');
  if (html !== undefined) n.innerHTML = html;
  return n;
};
