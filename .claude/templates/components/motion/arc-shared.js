// What the Arc ports share (slot-text, text-morph, morph-select, toast-stack, usage-meter, activity-heatmap, stepper): the
// motion tokens of Arc written as numbers, springs stated as stiffness and damping, an animated value that a spring or a
// tween drives on one shared frame loop, and the swap of a changing text (it rises from a soft blur, the old one leaves
// faster than the new one arrives). No component lives here.
import { SPRING_STEP, reduced, stepSpring } from '../core.js';
import { bezier, springRun } from './mu-shared.js';

export const TOKENS = {
  duration: { instant: 0.12, fast: 0.16, exit: 0.18, standard: 0.24, considered: 0.48 },
  ease: { enter: [0.16, 1, 0.3, 1], standard: [0.22, 1, 0.36, 1], exit: [0.7, 0, 0.84, 0], inOut: [0.65, 0, 0.35, 1] },
  stagger: { char: 0.016, word: 0.04, line: 0.08, item: 0.035 },
  blur: { subtle: 2, soft: 4, text: 8 },
};
export const css = (curve) => `cubic-bezier(${curve.join(', ')})`;
export const EASE = { enter: css(TOKENS.ease.enter), standard: css(TOKENS.ease.standard), exit: css(TOKENS.ease.exit), inOut: css(TOKENS.ease.inOut) };
const curves = Object.fromEntries(Object.entries(TOKENS.ease).map(([name, c]) => [name, bezier(...c)]));
export const curve = (name) => curves[name];

// A spring defined by how long it looks like it takes and how much it bounces, restated as the physical constants
// so a retarget in flight keeps the speed it already has.
export const physical = (visualDuration, bounce) => {
  const root = (2 * Math.PI) / (visualDuration * 1.2);
  return { stiffness: root * root, damping: 2 * (1 - bounce) * root, mass: 1 };
};
export const SPRINGS = {
  responsive: { stiffness: 520, damping: 38, mass: 1 },
  gentle: { stiffness: 340, damping: 34, mass: 1 },
  snappy: physical(0.26, 0.12),
  smooth: physical(0.4, 0),
  morph: physical(0.42, 0.16),
};
// A spring as a CSS `linear()` curve and the time it takes, for what the compositor can run by itself.
export const springCurve = (s) => springRun(s.stiffness, s.damping, s.mass);

// ── An animated number. `apply(value, speed)` is called on every change. A spring keeps its speed when it is retargeted;
// a tween eases from where the value is. One frame loop drives every value in the page. ──
const live = new Set();
let raf = 0;
let before = 0;
const tick = (now) => {
  const dt = Math.min(0.05, (now - before) / 1000);
  before = now;
  for (const step of [...live]) step(dt);
  raf = live.size ? requestAnimationFrame(tick) : 0;
};
const run = (step) => {
  live.add(step);
  if (!raf) { before = performance.now(); raf = requestAnimationFrame(tick); }
  return () => live.delete(step);
};

export const value = (initial = 0, apply = () => {}) => {
  let x = initial;
  let v = 0;
  let halt = null;
  const put = (n) => { x = n; apply(x, v); };
  const stop = () => { if (halt) { halt(); halt = null; } };
  return {
    get: () => x,
    speed: () => v,
    get running() { return halt !== null; },
    jump(n) { stop(); v = 0; put(n); },
    stop,
    // `spring` is {stiffness, damping, mass}; otherwise `duration` seconds with an `ease`: a name of TOKENS.ease or four
    // bezier numbers (linear when absent).
    to(target, { spring, duration = 0.24, ease, delay = 0, velocity, rest = 0.005, done } = {}) {
      stop();
      if (velocity !== undefined) v = velocity;
      const shape = Array.isArray(ease) ? bezier(...ease) : ease ? curves[ease] : null;
      let wait = delay;
      const from = x;
      let t = 0;
      const finish = () => { stop(); v = 0; put(target); done?.(); };
      halt = run((dt) => {
        if (wait > 0) { wait -= dt; if (wait > 0) return; dt = -wait; wait = 0; }
        if (spring) {
          let left = dt;
          let pos = x;
          let vel = v;
          for (; left > 0; left -= SPRING_STEP) [pos, vel] = stepSpring(spring, pos, vel, target, Math.min(left, SPRING_STEP));
          v = vel;
          if (Math.abs(pos - target) < rest && Math.abs(vel) < rest * 20) { finish(); return; }
          put(pos);
          return;
        }
        t += dt;
        const p = Math.min(1, t / duration);
        const next = from + (target - from) * (shape ? shape(p) : p);
        v = dt > 0 ? (next - x) / dt : 0;
        if (p >= 1) { finish(); return; }
        put(next);
      });
    },
  };
};

export const px = (em, el) => em * parseFloat(getComputedStyle(el).fontSize);

// Sets `to` (style properties in camelCase) on `el` and animates there from what the element shows now.
export const glide = (el, to, timing) => {
  const cs = getComputedStyle(el);
  const from = Object.fromEntries(Object.keys(to).map((k) => [k, cs[k]]));
  Object.assign(el.style, to);
  return el.animate([from, to], { fill: 'backwards', ...timing });
};

// A short fade for whoever has reduced motion on: never nothing.
export const fadeIn = (el, ms = 140) => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: 'ease-out' });

// ── The swap of a changing text inside `host` (positioned): the new one rises in from a blur, the old one is taken out
// of the flow where it stands and leaves a little faster than the new one arrives. `dir` is 1 when the thing moved
// up or forward (the new text comes from below) and -1 the other way. With reduced motion it is a short crossfade. ──
export const swapper = (host, { className = '', delay = 0, tag = 'span' } = {}) => {
  let current = null;
  let shown = null;
  const leave = (old, dir) => {
    old.setAttribute('aria-hidden', 'true');
    const box = { left: old.offsetLeft, top: old.offsetTop, width: old.offsetWidth };
    Object.assign(old.style, { position: 'absolute', left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, pointerEvents: 'none' });
    const gone = () => old.remove();
    const motion = reduced()
      ? old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'ease-out', fill: 'forwards' })
      : old.animate([{ opacity: 1, transform: 'none', filter: 'blur(0px)' }, { opacity: 0, transform: `translateY(${-0.3 * dir}em)`, filter: `blur(${TOKENS.blur.subtle}px)` }], { duration: TOKENS.duration.instant * 1000, easing: EASE.standard, fill: 'forwards' });
    motion.onfinish = gone;
    motion.oncancel = gone;
  };
  return {
    get text() { return shown; },
    get node() { return current; },
    set(next, dir = 1, { instant = false, wait = delay } = {}) {
      const text = next ? String(next) : null;
      if (text === shown) return;
      shown = text;
      const old = current;
      current = null;
      if (old) leave(old, dir);
      if (!text) return;
      current = document.createElement(tag);
      current.className = className;
      current.textContent = text;
      host.append(current);
      if (instant) return;
      if (reduced()) { fadeIn(current); return; }
      current.animate([{ opacity: 0, transform: `translateY(${0.3 * dir}em)`, filter: `blur(${TOKENS.blur.soft}px)` }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], { duration: TOKENS.duration.standard * 1000, easing: EASE.enter, delay: wait * 1000, fill: 'backwards' });
    },
    destroy() { for (const n of host.querySelectorAll(`:scope > ${tag}`)) n.remove(); current = null; shown = null; },
  };
};

// Puts `ordered` in `parent` in that order; `leaving` elements stay right after the surviving sibling that preceded them.
export const settle = (parent, ordered, leaving = []) => {
  const before = [...parent.children];
  const keep = new Set(ordered);
  const after = new Map();
  for (const g of leaving) {
    let anchor = null;
    for (let i = before.indexOf(g) - 1; i >= 0 && !anchor; i--) if (keep.has(before[i])) anchor = before[i];
    after.set(anchor, [...(after.get(anchor) ?? []), g]);
  }
  const final = [...(after.get(null) ?? [])];
  for (const e of ordered) final.push(e, ...(after.get(e) ?? []));
  final.forEach((e, i) => { if (parent.children[i] !== e) parent.insertBefore(e, parent.children[i] ?? null); });
};

// A mark that changes in place (an icon): the new one pops in on the `snappy` spring from scale .6 and a small blur,
// the old one leaves in 120 ms. `host` shows one mark at a time; `make` builds it.
export const popper = (host, { blur = TOKENS.blur.subtle + 1 } = {}) => {
  let current = null;
  let key = null;
  const snappy = springCurve(SPRINGS.snappy);
  return {
    get key() { return key; },
    set(next, make, { instant = false } = {}) {
      if (next === key) return;
      key = next;
      const old = current;
      current = null;
      if (old) {
        old.setAttribute('aria-hidden', 'true');
        Object.assign(old.style, { position: 'absolute', left: `${old.offsetLeft}px`, top: `${old.offsetTop}px` });
        const gone = () => old.remove();
        const out = reduced()
          ? old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' })
          : old.animate([{ opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' }, { opacity: 0, transform: 'scale(.6)', filter: `blur(${blur}px)` }], { duration: TOKENS.duration.instant * 1000, easing: EASE.standard, fill: 'forwards' });
        out.onfinish = gone;
        out.oncancel = gone;
      }
      if (next === null) return;
      current = make();
      host.append(current);
      if (instant) return;
      if (reduced()) { fadeIn(current); return; }
      current.animate([{ opacity: 0, transform: 'scale(.6)', filter: `blur(${blur}px)` }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' }], { duration: snappy.duration, easing: snappy.easing });
    },
  };
};

export const svgNode = (name, attrs = {}) => {
  const n = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
