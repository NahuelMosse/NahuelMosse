// What the Aceternity ports share: the mount contract, the piecewise-linear map of `useTransform`,
// a cubic-bezier solver and a node helper.

// `define(name, build)` makes a component: `mount(el, opts)` returns `{ destroy, ...api }`, mounting
// the same element twice returns the first handle, and every `[data-motion="<name>"]` already in the
// page is mounted when the module is imported.
const registry = new WeakMap();
export const define = (name, build) => {
  const mount = (el, opts = {}) => {
    const mine = registry.get(el) ?? registry.set(el, new Map()).get(el);
    if (mine.has(name)) return mine.get(name);
    const api = build(el, opts);
    const handle = { ...api, destroy() { api.destroy(); mine.delete(name); } };
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

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// A value mapped through breakpoints and clamped at both ends, as Motion's `useTransform(v, input, output)`.
export const mapRange = (v, input, output) => {
  if (v <= input[0]) return output[0];
  for (let i = 0; i < input.length - 1; i++) {
    if (v <= input[i + 1]) return output[i] + ((v - input[i]) / (input[i + 1] - input[i])) * (output[i + 1] - output[i]);
  }
  return output[output.length - 1];
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

// A node with a class, hidden from assistive technology when it only decorates.
export const node = (tag, className, { decorative = false, text } = {}) => {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (decorative) n.setAttribute('aria-hidden', 'true');
  if (text !== undefined) n.textContent = text;
  return n;
};

// Listeners that one call removes: `const on = listeners(); on(el, 'click', fn); on.off()`.
export const listeners = () => {
  const list = [];
  const on = (target, type, fn, options) => { target.addEventListener(type, fn, options); list.push([target, type, fn, options]); };
  on.off = () => { for (const [t, type, fn, o] of list.splice(0)) t.removeEventListener(type, fn, o); };
  return on;
};

// A number from an option, else from a `data-*` attribute, else the default.
export const numberOf = (opts, el, key, fallback) => {
  const v = opts[key] ?? el.dataset[key];
  const n = v === undefined || v === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
